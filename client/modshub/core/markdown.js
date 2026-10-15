import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';

/**
 * Markdown pipeline.
 *
 * All parsing is done by markdown-it (CommonMark + GFM tables, strike-through
 * and autolinks) with markdown-it-task-lists. Nothing in this app parses
 * Markdown with hand written regular expressions.
 *
 * Security: raw HTML is disabled, so author text can never become a tag or an
 * attribute. URLs are additionally restricted to a small allow-list, and the
 * final HTML is still passed through DOMPurify (see sanitize.js).
 */

const SAFE_URL = /^(?:https?:|mailto:|tel:|\/(?!\/)|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i;

export const DEFAULT_MD_OPTIONS = Object.freeze({
  breaks: true,
  preserveBlankLines: true,
  inlineStyles: false,
});

const INLINE_STYLES = {
  blockquote_open: 'margin:0 0 1em 0;padding:0.2em 1em;border-left:4px solid #9aa0a6;color:#555',
  code_inline: 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f3f4;padding:0.1em 0.35em;border-radius:4px',
  table_open: 'border-collapse:collapse;margin:0 0 1em 0',
  th_open: 'border:1px solid #c4c7c5;padding:6px 10px;text-align:left;background:#f1f3f4',
  td_open: 'border:1px solid #c4c7c5;padding:6px 10px',
  hr: 'border:0;border-top:1px solid #c4c7c5;margin:1.2em 0',
  fence_pre: 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f3f4;padding:12px 14px;border-radius:6px;white-space:pre-wrap',
};

function blankGapsPlugin(md) {
  // Markdown collapses several blank lines into one paragraph break. For
  // social posts that is surprising, so every extra blank line between two
  // top-level blocks becomes an explicit spacer token (source stays untouched).
  md.core.ruler.push('blank_gaps', (state) => {
    const out = [];
    let prevEnd = null;
    for (const token of state.tokens) {
      const opensBlock = token.level === 0 && token.map && token.nesting >= 0;
      if (opensBlock) {
        if (prevEnd !== null) {
          const gap = token.map[0] - prevEnd;
          for (let i = 1; i < gap; i += 1) {
            const spacer = new state.Token('blank_gap', '', 0);
            spacer.block = true;
            out.push(spacer);
          }
        }
        prevEnd = token.map[1];
      }
      out.push(token);
    }
    state.tokens = out;
  });
  md.renderer.rules.blank_gap = () => '<div class="md-gap" aria-hidden="true"></div>\n';
}

function build(options) {
  const { breaks, preserveBlankLines, inlineStyles } = options;
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks });
  md.validateLink = (url) => SAFE_URL.test(String(url).trim());
  md.use(taskLists, { enabled: false, label: false });
  if (preserveBlankLines) md.use(blankGapsPlugin);

  const rules = md.renderer.rules;
  const passthrough = (tokens, idx, opts, env, self) => self.renderToken(tokens, idx, opts);

  const linkOpen = rules.link_open || passthrough;
  rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') || '';
    if (/^data:/i.test(href)) {
      token.attrs = token.attrs.filter(([k]) => k !== 'href');
    } else if (/^https?:/i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return linkOpen(tokens, idx, opts, env, self);
  };

  const escape = md.utils.escapeHtml;
  rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = (token.info || '').trim().split(/\s+/)[0] || '';
    const safeLang = lang.replace(/[^\p{L}\p{N}_+#.-]/gu, '').slice(0, 24);
    const style = inlineStyles ? ` style="${INLINE_STYLES.fence_pre}"` : '';
    const dataLang = safeLang ? ` data-lang="${escape(safeLang)}"` : '';
    const cls = safeLang ? ` class="language-${escape(safeLang)}"` : '';
    return `<pre${style}${dataLang}><code${cls}>${escape(token.content)}</code></pre>\n`;
  };

  if (inlineStyles) {
    for (const type of ['blockquote_open', 'table_open', 'th_open', 'td_open', 'code_inline', 'hr']) {
      const original = rules[type] || passthrough;
      rules[type] = (tokens, idx, opts, env, self) => {
        tokens[idx].attrSet('style', INLINE_STYLES[type]);
        return original(tokens, idx, opts, env, self);
      };
    }
  }
  return md;
}

const cache = new Map();

/** @returns {MarkdownIt} a memoised instance for the option combination */
export function getMarkdown(opts = {}) {
  const options = { ...DEFAULT_MD_OPTIONS, ...opts };
  const key = `${options.breaks}|${options.preserveBlankLines}|${options.inlineStyles}`;
  if (!cache.has(key)) cache.set(key, build(options));
  return cache.get(key);
}

/** Raw (not yet sanitized) HTML. Always pass through sanitizeHtml() before using it in the DOM. */
export function renderMarkdown(src, opts) {
  return getMarkdown(opts).render(String(src ?? ''));
}

export function parseMarkdown(src, opts) {
  return getMarkdown(opts).parse(String(src ?? ''), {});
}

let analysisInstance = null;
function analysisMd() {
  if (!analysisInstance) {
    analysisInstance = new MarkdownIt({ html: true, linkify: true }).use(taskLists, { enabled: false, label: false });
  }
  return analysisInstance;
}

/**
 * Inventory of the syntax used by a document. Drives the target-format
 * compatibility warnings and the Rich Text "can this be edited safely" check.
 * @returns {{
 *  headings: number[], bold: boolean, italic: boolean, strike: boolean, inlineCode: boolean,
 *  codeBlock: boolean, blockquote: boolean, bulletList: boolean, orderedList: boolean,
 *  nestedList: boolean, taskList: boolean, table: boolean, hr: boolean, link: boolean,
 *  image: boolean, rawHtml: boolean, hardBreak: boolean
 * }}
 */
export function analyzeMarkdown(src) {
  const features = {
    headings: [],
    bold: false,
    italic: false,
    strike: false,
    inlineCode: false,
    codeBlock: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    nestedList: false,
    taskList: false,
    table: false,
    hr: false,
    link: false,
    image: false,
    rawHtml: false,
    hardBreak: false,
  };
  const tokens = analysisMd().parse(String(src ?? ''), {});
  let listDepth = 0;
  const visit = (list) => {
    for (const t of list) {
      switch (t.type) {
        case 'heading_open': {
          const level = Number(t.tag.slice(1));
          if (!features.headings.includes(level)) features.headings.push(level);
          break;
        }
        case 'strong_open': features.bold = true; break;
        case 'em_open': features.italic = true; break;
        case 's_open': features.strike = true; break;
        case 'code_inline': features.inlineCode = true; break;
        case 'fence':
        case 'code_block': features.codeBlock = true; break;
        case 'blockquote_open': features.blockquote = true; break;
        case 'bullet_list_open':
          features.bulletList = true;
          listDepth += 1;
          if (listDepth > 1) features.nestedList = true;
          break;
        case 'ordered_list_open':
          features.orderedList = true;
          listDepth += 1;
          if (listDepth > 1) features.nestedList = true;
          break;
        case 'bullet_list_close':
        case 'ordered_list_close':
          listDepth -= 1;
          break;
        case 'list_item_open':
          if ((t.attrGet('class') || '').includes('task-list-item')) features.taskList = true;
          break;
        case 'table_open': features.table = true; break;
        case 'hr': features.hr = true; break;
        case 'link_open': features.link = true; break;
        case 'image': features.image = true; break;
        case 'html_block':
        case 'html_inline':
          if (!/task-list-item-checkbox/.test(t.content)) features.rawHtml = true;
          break;
        case 'hardbreak': features.hardBreak = true; break;
        default:
      }
      if (t.children) visit(t.children);
    }
  };
  visit(tokens);
  features.headings.sort();
  return features;
}
