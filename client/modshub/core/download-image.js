import { zipSync } from 'fflate';
import { downloadBlob, fileStem } from './filenames.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Attached images of a post (older posts only have `image`). */
export function postImages(post) {
  if (Array.isArray(post.images) && post.images.length) return post.images;
  return post.image && post.image.src ? [post.image] : [];
}

function extensionOf(blob, src) {
  if (EXT[blob.type]) return EXT[blob.type];
  const m = /\.([A-Za-z0-9]{2,4})(?:[?#]|$)/.exec(src || '');
  return m ? m[1].toLowerCase() : 'png';
}

async function fetchImage(src, env) {
  const res = await env.fetch(src, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('not an image');
  return blob;
}

/**
 * One click download of one attached image.
 * Uploaded images (and CORS enabled hosts) are saved as a file; a host that
 * forbids cross-site reads is opened in a new tab, where the browser's own
 * "Save image as…" works.
 * @returns {Promise<{ok: boolean, opened?: boolean}>}
 */
export async function downloadPostImage(post, index = 0, env = globalThis) {
  const images = postImages(post);
  const image = images[index];
  if (!image) return { ok: false };
  try {
    const blob = await fetchImage(image.src, env);
    const stem = fileStem(post.title, 'post');
    const n = images.length > 1 ? `-${index + 1}` : '';
    downloadBlob(blob, `${stem}-image${n}.${extensionOf(blob, image.src)}`, env);
    return { ok: true };
  } catch (_) {
    env.open(image.src, '_blank', 'noopener');
    return { ok: false, opened: true };
  }
}

/**
 * Every attached image in one ZIP (browsers often block several separate
 * downloads). Images that cannot be read are reported, not silently dropped.
 * @returns {Promise<{ok: boolean, count: number, failed: number}>}
 */
export async function downloadAllPostImages(post, env = globalThis) {
  const images = postImages(post);
  const stem = fileStem(post.title, 'post');
  const files = {};
  let failed = 0;
  for (let i = 0; i < images.length; i += 1) {
    try {
      const blob = await fetchImage(images[i].src, env);
      const name = `${stem}-${String(i + 1).padStart(2, '0')}.${extensionOf(blob, images[i].src)}`;
      files[name] = new Uint8Array(await blob.arrayBuffer());
    } catch (_) {
      failed += 1;
    }
  }
  const count = Object.keys(files).length;
  if (count === 0) return { ok: false, count: 0, failed };
  const zip = zipSync(files, { level: 0 });
  downloadBlob(new env.Blob([zip], { type: 'application/zip' }), `${stem}-images.zip`, env);
  return { ok: true, count, failed };
}

/**
 * What the buttons call: a single image, or all of them as a ZIP when the post
 * has several and no index is given. Reports the outcome through `toast`.
 */
export async function runImageDownload(post, toast, { index = null } = {}) {
  const images = postImages(post);
  if (images.length === 0) return;
  if (index === null && images.length > 1) {
    const r = await downloadAllPostImages(post);
    if (!r.ok) toast('None of the images could be downloaded (the host blocks it). Open them individually.', 'error');
    else if (r.failed) toast(`Downloaded ${r.count} images; ${r.failed} could not be read from their host.`, 'info');
    else toast(`${r.count} images downloaded as a ZIP`);
    return;
  }
  const r = await downloadPostImage(post, index ?? 0);
  if (r.ok) toast('Image downloaded');
  else if (r.opened) toast('Opened the image in a new tab — use “Save image as…” there', 'info');
}
