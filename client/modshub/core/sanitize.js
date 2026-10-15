import DOMPurify from 'dompurify';

/**
 * HTML sanitisation (defence in depth - the Markdown renderer already has raw
 * HTML switched off). Every string that reaches innerHTML /
 * dangerouslySetInnerHTML or the clipboard goes through here.
 */

const TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span',
  'strong', 'b', 'em', 'i', 'del', 's', 'u', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'input', 'sup', 'sub',
];
const ATTRS = [
  'href', 'src', 'alt', 'title', 'class', 'type', 'checked', 'disabled', 'start',
  'align', 'target', 'rel', 'colspan', 'rowspan', 'data-lang', 'aria-hidden',
];
// With a custom ALLOWED_URI_REGEXP DOMPurify validates every attribute that is
// not "URI safe" against it, so plain-value attributes must be listed here.
const URI_SAFE_ATTRS = ['target', 'rel', 'data-lang', 'type', 'align', 'start', 'colspan', 'rowspan', 'aria-hidden', 'checked', 'disabled'];
const URI = /^(?:https?:|mailto:|tel:|\/(?!\/)|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i;

let purifier = null;

function configure(instance) {
  instance.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
      else node.removeAttribute('target');
    }
    if (node.tagName === 'INPUT') {
      // Task-list checkboxes are display only.
      node.setAttribute('type', 'checkbox');
      node.setAttribute('disabled', '');
    }
  });
}

/** Tests run in Node: hand over a DOMPurify instance bound to a jsdom window. */
export function setPurifier(instance) {
  purifier = instance;
  configure(purifier);
}

function getPurifier() {
  if (purifier) return purifier;
  if (DOMPurify && typeof DOMPurify.sanitize === 'function' && DOMPurify.isSupported) {
    setPurifier(DOMPurify);
    return purifier;
  }
  throw new Error('DOMPurify needs a DOM: call setPurifier() first');
}

/**
 * @param {string} html
 * @param {{allowStyle?: boolean}} [opts] inline styles are only allowed for HTML we generated ourselves
 */
export function sanitizeHtml(html, { allowStyle = false } = {}) {
  return getPurifier().sanitize(String(html ?? ''), {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: allowStyle ? [...ATTRS, 'style'] : ATTRS,
    ALLOWED_URI_REGEXP: URI,
    ADD_URI_SAFE_ATTR: URI_SAFE_ATTRS,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
}
