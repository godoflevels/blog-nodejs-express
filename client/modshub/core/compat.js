import { analyzeMarkdown } from './markdown.js';

/**
 * Target-format compatibility.
 *
 * Post Studio only prepares content, it does not publish it. These profiles
 * describe, in broad strokes, what common destinations do with Markdown so the
 * preview can say "this will not look like this over there" instead of
 * letting the author find out after posting. They are guidance, not a spec.
 */

export const TARGET_PROFILES = {
  gfm: {
    label: 'Full GitHub Markdown',
    description: 'Everything is supported. Use this when the destination renders GitHub-flavoured Markdown.',
    supports: null,
  },
  telegram: {
    label: 'Telegram',
    description: 'Bold, italic, strike, code, links and quotes. No headings, tables or task lists.',
    supports: ['bold', 'italic', 'strike', 'inlineCode', 'codeBlock', 'blockquote', 'link', 'bulletList', 'orderedList'],
  },
  discord: {
    label: 'Discord',
    description: 'Bold, italic, strike, code, quotes, lists and headings up to ###. No tables, rules or images.',
    supports: ['bold', 'italic', 'strike', 'inlineCode', 'codeBlock', 'blockquote', 'link', 'bulletList', 'orderedList', 'nestedList', 'headings'],
  },
  plain: {
    label: 'Plain text only',
    description: 'No formatting survives. Use Copy Plain Text.',
    supports: [],
  },
};

const FEATURE_LABELS = {
  headings: 'Headings',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  inlineCode: 'Inline code',
  codeBlock: 'Code blocks',
  blockquote: 'Quotes',
  bulletList: 'Bulleted lists',
  orderedList: 'Numbered lists',
  nestedList: 'Nested lists',
  taskList: 'Task lists',
  table: 'Tables',
  hr: 'Horizontal rules',
  link: 'Links',
  image: 'Images',
  rawHtml: 'Raw HTML',
};

/**
 * @param {string} src markdown
 * @param {keyof typeof TARGET_PROFILES} profile
 * @returns {Array<{feature: string, level: 'warning'|'info', message: string}>}
 */
export function checkCompatibility(src, profile = 'gfm') {
  const features = analyzeMarkdown(src);
  const out = [];

  if (features.rawHtml) {
    out.push({
      feature: 'rawHtml',
      level: 'warning',
      message: 'Raw HTML is shown as plain text. Studio never runs HTML from posts.',
    });
  }

  const def = TARGET_PROFILES[profile] || TARGET_PROFILES.gfm;
  if (!def.supports) return out;

  const used = [];
  if (features.headings.length) used.push('headings');
  for (const key of ['bold', 'italic', 'strike', 'inlineCode', 'codeBlock', 'blockquote', 'bulletList', 'orderedList', 'nestedList', 'taskList', 'table', 'hr', 'link', 'image']) {
    if (features[key]) used.push(key);
  }

  for (const feature of used) {
    if (def.supports.includes(feature)) continue;
    // A heading level above ### is also unsupported on Discord.
    out.push({
      feature,
      level: 'warning',
      message: `${FEATURE_LABELS[feature]} are not supported in ${def.label} and will appear as plain text.`,
    });
  }
  if (profile === 'discord' && features.headings.some((h) => h > 3)) {
    out.push({
      feature: 'headings',
      level: 'warning',
      message: 'Discord only renders headings up to ### - deeper levels appear as plain text.',
    });
  }
  return out;
}
