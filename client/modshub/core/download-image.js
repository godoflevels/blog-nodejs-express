import { downloadBlob, fileStem } from './filenames.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function extensionOf(blob, src) {
  if (EXT[blob.type]) return EXT[blob.type];
  const m = /\.([A-Za-z0-9]{2,4})(?:[?#]|$)/.exec(src || '');
  return m ? m[1].toLowerCase() : 'png';
}

/**
 * One click download of the post's attached image.
 * Uploaded images (and CORS enabled hosts) are fetched and saved as a file; a
 * host that forbids cross-site reads is opened in a new tab instead, where the
 * browser's own "Save image" works.
 * @returns {Promise<{ok: boolean, opened?: boolean}>}
 */
export async function downloadPostImage(post, env = globalThis) {
  const src = post.image && post.image.src;
  if (!src) return { ok: false };
  try {
    const res = await env.fetch(src, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith('image/')) throw new Error('not an image');
    downloadBlob(blob, `${fileStem(post.title, 'post')}-image.${extensionOf(blob, src)}`, env);
    return { ok: true };
  } catch (_) {
    env.open(src, '_blank', 'noopener');
    return { ok: false, opened: true };
  }
}
