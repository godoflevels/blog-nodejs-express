import { renderMarkdown } from './markdown.js';
import { sanitizeHtml } from './sanitize.js';
import { toPlainText } from './plaintext.js';

/**
 * Clipboard payloads and writing.
 *
 *   Copy Markdown   -> exactly the source, text/plain
 *   Copy Plain Text -> readable text without markup, text/plain
 *   Copy Rich Text  -> text/html (sanitized, with a few inline styles so
 *                      quotes/tables survive) + a plain text rendition
 *   Copy JSON       -> structured post, text/plain
 *
 * The four actions are intentionally never substituted for one another.
 */

/** Sanitized HTML intended for pasting into other editors. */
export function buildRichHtml(src, mdOptions = {}) {
  const raw = renderMarkdown(src, { ...mdOptions, inlineStyles: true });
  return sanitizeHtml(raw, { allowStyle: true });
}

export function buildPayloads(markdown, mdOptions = {}) {
  return {
    markdown,
    plain: toPlainText(markdown, mdOptions),
    html: buildRichHtml(markdown, mdOptions),
  };
}

function copyViaCopyEvent(doc, { text, html }) {
  // Lets us set both flavours without the Async Clipboard API.
  const holder = doc.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;';
  holder.textContent = ' ';
  doc.body.appendChild(holder);
  let handled = false;
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    handled = true;
  };
  let ok = false;
  try {
    const selection = doc.getSelection ? doc.getSelection() : null;
    if (selection && doc.createRange) {
      const range = doc.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    doc.addEventListener('copy', onCopy, { once: true });
    ok = doc.execCommand('copy');
  } catch (_) {
    ok = false;
  } finally {
    doc.removeEventListener('copy', onCopy);
    if (doc.getSelection) doc.getSelection()?.removeAllRanges();
    holder.remove();
  }
  return ok && handled;
}

function copyTextViaTextarea(doc, text) {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  doc.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    ok = doc.execCommand('copy');
  } catch (_) {
    ok = false;
  } finally {
    area.remove();
  }
  return ok;
}

/**
 * @param {{text: string, html?: string}} payload  pass `html` for a rich copy
 * @param {object} [env]                            injectable globals (tests)
 * @returns {Promise<{ok: boolean, method?: string, rich: boolean, degraded: boolean, error?: Error}>}
 *   `degraded` is true when HTML was requested but only text could be written.
 */
export async function writeToClipboard({ text, html }, env = globalThis) {
  const wantsRich = typeof html === 'string';
  const nav = env.navigator;
  const doc = env.document;
  let lastError;

  if (wantsRich) {
    if (env.ClipboardItem && nav && nav.clipboard && typeof nav.clipboard.write === 'function') {
      try {
        const Blob_ = env.Blob || Blob;
        const item = new env.ClipboardItem({
          'text/html': new Blob_([html], { type: 'text/html' }),
          'text/plain': new Blob_([text], { type: 'text/plain' }),
        });
        await nav.clipboard.write([item]);
        return { ok: true, method: 'clipboard-item', rich: true, degraded: false };
      } catch (error) {
        lastError = error;
      }
    }
    if (doc && typeof doc.execCommand === 'function' && copyViaCopyEvent(doc, { text, html })) {
      return { ok: true, method: 'copy-event', rich: true, degraded: false };
    }
  }

  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return { ok: true, method: 'write-text', rich: false, degraded: wantsRich };
    } catch (error) {
      lastError = error;
    }
  }
  if (doc && typeof doc.execCommand === 'function' && copyTextViaTextarea(doc, text)) {
    return { ok: true, method: 'textarea', rich: false, degraded: wantsRich };
  }
  return { ok: false, rich: false, degraded: false, error: lastError || new Error('Clipboard is not available') };
}
