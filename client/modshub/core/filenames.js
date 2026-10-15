/** Unicode-friendly file name stem: keeps letters (incl. Cyrillic) and digits. */
export function fileStem(title, fallback = 'post') {
  const stem = String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || fallback;
}

/**
 * Triggers a browser download and releases the object URL afterwards.
 * `env` is injectable for tests.
 */
export function downloadBlob(blob, filename, env = globalThis) {
  const url = env.URL.createObjectURL(blob);
  const link = env.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  env.document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start reading the blob before revoking.
  env.setTimeout(() => env.URL.revokeObjectURL(url), 10000);
  return url;
}

export function downloadText(text, filename, mime = 'text/plain;charset=utf-8', env = globalThis) {
  return downloadBlob(new env.Blob([text], { type: mime }), filename, env);
}
