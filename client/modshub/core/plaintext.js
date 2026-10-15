import { parseMarkdown } from './markdown.js';

/**
 * Markdown -> readable plain text.
 *
 * The text is produced by walking the markdown-it token stream, so every
 * construct (including `***x***`, nested lists and tables) is handled by the
 * parser rather than by pattern matching.
 */

const BULLET = '•';
const RULE = '────────────';
const QUOTE = '│ ';

function buildTree(tokens) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (token.nesting === 1) {
      const node = { type: token.type.replace(/_open$/, ''), token, children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
    } else {
      top.children.push({
        type: token.type,
        token,
        children: token.children ? buildTree(token.children).children : [],
      });
    }
  }
  return root;
}

function inlineText(nodes) {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'text_special':
      case 'code_inline':
        out += node.token.content;
        break;
      case 'softbreak':
      case 'hardbreak':
        out += '\n';
        break;
      case 'image': {
        const alt = node.token.content || '';
        const src = node.token.attrGet('src') || '';
        const shown = src.startsWith('data:') ? '' : src;
        out += alt && shown ? `${alt} (${shown})` : alt || shown;
        break;
      }
      case 'link': {
        const text = inlineText(node.children);
        const href = node.token.attrGet('href') || '';
        const same = href === text || href === `mailto:${text}` || href === `tel:${text}`;
        out += same || !href ? text : `${text} (${href})`;
        break;
      }
      case 'html_inline': {
        if (/task-list-item-checkbox/.test(node.token.content)) {
          out += /checked/.test(node.token.content) ? '☑' : '☐';
        }
        break;
      }
      default:
        out += inlineText(node.children);
    }
  }
  return out;
}

function indentLines(text, first, rest) {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? first : rest) + line)
    .join('\n');
}

function renderList(node, ordered) {
  const start = ordered ? Number(node.token.attrGet('start') || 1) : 1;
  const items = node.children.filter((c) => c.type === 'list_item');
  return items
    .map((item, i) => {
      const marker = ordered ? `${start + i}.` : BULLET;
      const body = renderBlocks(item.children, true);
      return indentLines(body, `${marker} `, ' '.repeat(marker.length + 1));
    })
    .join('\n');
}

function renderTable(node) {
  const rows = [];
  const walk = (n) => {
    for (const child of n.children) {
      if (child.type === 'tr') {
        rows.push(child.children.map((cell) => inlineText(cell.children.flatMap((c) => c.children || [c])).replace(/\n/g, ' ')));
      } else if (child.children) walk(child);
    }
  };
  walk(node);
  return rows.map((cells) => cells.join(' | ')).join('\n');
}

function renderBlock(node) {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(node.children.flatMap((c) => (c.type === 'inline' ? c.children : [c])));
    case 'bullet_list':
      return renderList(node, false);
    case 'ordered_list':
      return renderList(node, true);
    case 'blockquote':
      return indentLines(renderBlocks(node.children, false), QUOTE, QUOTE);
    case 'fence':
    case 'code_block':
      return node.token.content.replace(/\n+$/, '');
    case 'hr':
      return RULE;
    case 'table':
      return renderTable(node);
    case 'blank_gap':
      return '';
    default:
      return '';
  }
}

function renderBlocks(children, tight) {
  let out = '';
  let first = true;
  let extraBlank = 0;
  for (const child of children) {
    if (child.type === 'blank_gap') {
      extraBlank += 1;
      continue;
    }
    const text = renderBlock(child);
    if (!first) out += (tight ? '\n' : '\n\n') + '\n'.repeat(extraBlank);
    out += text;
    first = false;
    extraBlank = 0;
  }
  return out;
}

/**
 * @param {string} src markdown
 * @param {object} [opts] same options as getMarkdown() (breaks / preserveBlankLines)
 */
export function toPlainText(src, opts) {
  const tree = buildTree(parseMarkdown(src, opts));
  return renderBlocks(tree.children, false).replace(/\s+$/g, '');
}
