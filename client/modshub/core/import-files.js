import { unzipSync } from 'fflate';
import { parseImport } from './json-io.js';
import { fromWebhookPayload } from './discord.js';

/**
 * File import (.json, .md, .txt, .zip).
 *
 * Files are treated as untrusted: size limits are enforced before decoding,
 * ZIP entries are filtered before inflating, and nothing is ever executed or
 * rendered as HTML.
 */

export const IMPORT_LIMITS = Object.freeze({
  textBytes: 1024 * 1024,
  jsonBytes: 5 * 1024 * 1024,
  zipBytes: 10 * 1024 * 1024,
  zipEntries: 200,
  zipUnpackedBytes: 20 * 1024 * 1024,
  files: 50,
});

export function extensionOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** "new_graphics-pack.md" -> "new graphics pack" */
export function titleFromFilename(name) {
  const base = String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, '');
  return base.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Imported post';
}

/**
 * Decodes bytes to text. UTF-8 first (BOM stripped), UTF-16 by BOM, then
 * Windows-1251 as a last resort because legacy Russian .txt files are common.
 */
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(u8.subarray(2)), encoding: 'utf-16le', warning: null };
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(u8.subarray(2)), encoding: 'utf-16be', warning: null };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8', warning: null };
  } catch (_) {
    const text = new TextDecoder('windows-1251').decode(u8);
    return {
      text,
      encoding: 'windows-1251',
      warning: 'The file is not valid UTF-8; it was read as Windows-1251. Check that the text looks right.',
    };
  }
}

export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

function tryWebhook(text) {
  try {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!data || typeof data !== 'object' || Array.isArray(data) || 'posts' in data) return null;
    if (!('content' in data || 'embeds' in data || 'messages' in data)) return null;
    return fromWebhookPayload(data);
  } catch (_) {
    return null;
  }
}

const SKIP_ENTRY = /(^|\/)(__MACOSX\/|\.[^/]*$|Thumbs\.db$)/;

/**
 * @param {Array<{name: string, bytes: Uint8Array}>} files
 * @param {{existingIds?: Set<string>, defaultTimezone?: string}} [ctx]
 * @returns {{
 *   texts: Array<{source: string, title: string, content: string, warning: string|null}>,
 *   jsons: Array<{source: string, parsed: ReturnType<typeof parseImport>}>,
 *   problems: Array<{source: string, message: string}>
 * }}
 */
export function parseImportFiles(files, ctx = {}) {
  const out = { texts: [], jsons: [], problems: [] };
  if (files.length > IMPORT_LIMITS.files) {
    out.problems.push({ source: '', message: `Too many files (${files.length}). Select up to ${IMPORT_LIMITS.files}.` });
    return out;
  }

  const handleEntry = (source, bytes) => {
    const ext = extensionOf(source);
    if (ext === 'json') {
      if (bytes.length > IMPORT_LIMITS.jsonBytes) {
        out.problems.push({ source, message: `JSON is larger than ${IMPORT_LIMITS.jsonBytes / 1024 / 1024} MB.` });
        return;
      }
      const { text } = decodeText(bytes);
      const parsed = parseImport(text, ctx);
      if (!parsed.ok) {
        // A plain Discord webhook / Discohook message is not our export format
        // but is worth importing as one draft.
        const webhook = tryWebhook(text);
        if (webhook) {
          out.texts.push({
            source,
            title: titleFromFilename(source),
            content: webhook.content,
            discord: webhook.discord,
            warning: webhook.notes.length ? webhook.notes.join(' ') : null,
          });
          return;
        }
      }
      out.jsons.push({ source, parsed });
    } else if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
      if (bytes.length > IMPORT_LIMITS.textBytes) {
        out.problems.push({ source, message: `Text file is larger than ${IMPORT_LIMITS.textBytes / 1024} KB.` });
        return;
      }
      const decoded = decodeText(bytes);
      const content = normalizeNewlines(decoded.text);
      out.texts.push({ source, title: titleFromFilename(source), content, warning: decoded.warning });
    } else {
      out.problems.push({ source, message: 'Unsupported file type. Use .json, .md, .txt or .zip.' });
    }
  };

  for (const file of files) {
    const ext = extensionOf(file.name);
    if (ext === 'zip') {
      if (file.bytes.length > IMPORT_LIMITS.zipBytes) {
        out.problems.push({ source: file.name, message: `ZIP is larger than ${IMPORT_LIMITS.zipBytes / 1024 / 1024} MB.` });
        continue;
      }
      let total = 0;
      let count = 0;
      let entries;
      try {
        entries = unzipSync(file.bytes, {
          filter: (entry) => {
            if (entry.name.endsWith('/') || SKIP_ENTRY.test(entry.name)) return false;
            if (!['json', 'md', 'markdown', 'txt'].includes(extensionOf(entry.name))) return false;
            count += 1;
            total += entry.originalSize;
            if (count > IMPORT_LIMITS.zipEntries) return false;
            if (total > IMPORT_LIMITS.zipUnpackedBytes) return false;
            return entry.originalSize <= IMPORT_LIMITS.jsonBytes;
          },
        });
      } catch (error) {
        out.problems.push({ source: file.name, message: `Cannot read ZIP: ${error.message || error}` });
        continue;
      }
      if (count > IMPORT_LIMITS.zipEntries) {
        out.problems.push({ source: file.name, message: `ZIP has more than ${IMPORT_LIMITS.zipEntries} importable files.` });
        continue;
      }
      if (total > IMPORT_LIMITS.zipUnpackedBytes) {
        out.problems.push({ source: file.name, message: 'ZIP expands to more than the allowed size.' });
        continue;
      }
      const names = Object.keys(entries).sort();
      if (names.length === 0) out.problems.push({ source: file.name, message: 'ZIP has no .json, .md or .txt files.' });
      for (const name of names) handleEntry(`${file.name}/${name}`, entries[name]);
    } else {
      handleEntry(file.name, file.bytes);
    }
  }
  return out;
}
