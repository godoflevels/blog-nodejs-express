import TurndownService from 'turndown';
import { tables, taskListItems } from 'turndown-plugin-gfm';
import { analyzeMarkdown, renderMarkdown } from './markdown.js';
import { sanitizeHtml } from './sanitize.js';

/**
 * Rich Text mode support.
 *
 * Markdown -> HTML uses the same renderer as the preview. HTML -> Markdown is
 * done by Turndown (a proven converter) and then *verified*: the resulting
 * Markdown is rendered again and compared with what the editor showed. If the
 * two differ the document is not safely representable, and Rich Text opens
 * read-only instead of rewriting the author's Markdown.
 */

const GAP = '@@MD_GAP@@';

function createService({ breaks }) {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    hr: '---',
    br: breaks ? '' : '\\',
    // Turndown treats empty blocks as "blank" before custom rules run.
    blankReplacement: (_content, node) => {
      if (node.nodeName === 'DIV' && /\bmd-gap\b/.test(node.getAttribute('class') || '')) return `\n\n${GAP}\n\n`;
      return node.isBlock ? '\n\n' : '';
    },
  });
  td.use([tables, taskListItems]);

  // The GFM plugin writes ~x~; the app (and the spec) use ~~x~~.
  td.addRule('strikethroughDouble', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`,
  });
  td.addRule('blankGap', {
    filter: (node) => node.nodeName === 'DIV' && /\bmd-gap\b/.test(node.getAttribute('class') || ''),
    replacement: () => `\n\n${GAP}\n\n`,
  });
  // Keep the language of fenced blocks from <pre data-lang>.
  td.addRule('fencedWithLang', {
    filter: (node) => node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
    replacement: (_content, node) => {
      const code = node.firstChild;
      const cls = code.getAttribute('class') || '';
      const lang = (cls.match(/language-(\S+)/) || [null, node.getAttribute('data-lang') || ''])[1] || '';
      const text = code.textContent.replace(/\n$/, '');
      // Use a longer fence when the code itself contains ```.
      let fence = '```';
      while (text.includes(fence)) fence += '`';
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  });
  return td;
}

const services = new Map();
function service(opts) {
  const key = String(Boolean(opts.breaks));
  if (!services.has(key)) services.set(key, createService({ breaks: opts.breaks !== false }));
  return services.get(key);
}

/** @param {string} html */
export function htmlToMarkdown(html, opts = {}) {
  let md = service(opts).turndown(html);
  // Each spacer adds one extra blank line between its neighbours.
  md = md.replace(new RegExp(`\\n\\n${GAP}(?=\\n\\n)`, 'g'), '\n');
  md = md.split(GAP).join('');
  return md.replace(/\n+$/, '');
}

const normalizeHtml = (html) => html.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

/**
 * HTML shown in the Rich Text editor for a given Markdown source.
 * `mdOptions` is the same object used by the preview.
 */
export function markdownToEditorHtml(src, mdOptions = {}) {
  return sanitizeHtml(renderMarkdown(src, mdOptions));
}

/**
 * Can this Markdown be edited visually without changing its meaning?
 * @returns {{lossless: boolean, html: string, markdown: string, reasons: string[]}}
 */
export function checkRichRoundTrip(src, mdOptions = {}) {
  const html = markdownToEditorHtml(src, mdOptions);
  const markdown = htmlToMarkdown(html, mdOptions);
  const again = markdownToEditorHtml(markdown, mdOptions);
  const lossless = normalizeHtml(html) === normalizeHtml(again);
  const reasons = [];
  if (!lossless) {
    if (analyzeMarkdown(src).rawHtml) reasons.push('The text contains raw HTML, which Rich Text cannot represent.');
    if (reasons.length === 0) reasons.push('Some constructs would be rewritten differently by the visual editor.');
  }
  return { lossless, html, markdown, reasons };
}
