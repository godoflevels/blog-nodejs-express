const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomString(length) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function newPostId() {
  return `post-${randomString(8)}`;
}

export function newSlotId() {
  return `slot-${randomString(8)}`;
}

export function newTemplateId() {
  return `tpl-${randomString(8)}`;
}

/** "post-001" taken -> "post-001-copy", then "post-001-copy-2" ... (max 64 chars) */
export function uniqueId(base, taken) {
  const root = base.slice(0, 52);
  let candidate = `${root}-copy`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-copy-${n}`;
    n += 1;
  }
  return candidate;
}
