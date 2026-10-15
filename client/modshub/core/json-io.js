import schema from '../../../server/modshub/schema.js';
import { toOffsetIso, parseOffsetIso, isValidZone, wallParts } from './time.js';

const { validatePost } = schema;

export const EXPORT_VERSION = 1;
export const APP_NAME = 'modshub-post-studio';

/** One post as it appears in an export file. */
export function postToExport(post) {
  return {
    id: post.id,
    title: post.title,
    scheduledAt: toOffsetIso(post.scheduledAt, post.timezone),
    timezone: post.timezone,
    status: post.status,
    category: post.category,
    tags: [...post.tags],
    content: post.content,
    image: post.image ? { src: post.image.src, alt: post.image.alt || '' } : null,
    notes: post.notes,
    discord: post.discord || null,
    createdAt: post.createdAt || null,
    updatedAt: post.updatedAt || null,
  };
}

export function buildExport(posts, { now = new Date() } = {}) {
  return {
    version: EXPORT_VERSION,
    app: APP_NAME,
    exportedAt: now.toISOString(),
    posts: posts.map(postToExport),
  };
}

export function stringifyExport(exportObject) {
  return `${JSON.stringify(exportObject, null, 2)}\n`;
}

export const JSON_TEMPLATE = {
  version: EXPORT_VERSION,
  app: APP_NAME,
  posts: [
    {
      id: 'post-001',
      title: 'New Graphics Update',
      scheduledAt: '2026-10-20T18:00:00+03:00',
      timezone: 'Europe/Moscow',
      status: 'planned',
      category: 'graphics',
      tags: ['graphics', 'release'],
      content: '# New update\n\nExplore **new graphics** for GTA 5.\n\n***Available now***',
      image: null,
      notes: '',
    },
  ],
};

// ---- locating values in the source text ------------------------------------

/**
 * Maps dotted JSON paths ("posts.2.status") to the offset where the value
 * starts. Only called on text that JSON.parse already accepted, so it can be a
 * small, forgiving scanner rather than a second validator.
 */
function indexJsonPaths(text) {
  const map = new Map();
  let i = 0;
  const skipWs = () => {
    while (i < text.length && ' \t\r\n'.includes(text[i])) i += 1;
  };
  const readString = () => {
    const begin = i;
    i += 1;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i += 1;
    try {
      return JSON.parse(text.slice(begin, i));
    } catch (_) {
      return text.slice(begin + 1, i - 1);
    }
  };
  const readValue = (path) => {
    skipWs();
    map.set(path, i);
    const c = text[i];
    if (c === '{') {
      i += 1;
      skipWs();
      if (text[i] === '}') {
        i += 1;
        return;
      }
      for (;;) {
        skipWs();
        const key = readString();
        skipWs();
        i += 1; // :
        readValue(path ? `${path}.${key}` : key);
        skipWs();
        if (text[i] === ',') {
          i += 1;
        } else {
          i += 1; // }
          return;
        }
      }
    } else if (c === '[') {
      i += 1;
      skipWs();
      if (text[i] === ']') {
        i += 1;
        return;
      }
      for (let n = 0; ; n += 1) {
        readValue(path ? `${path}.${n}` : String(n));
        skipWs();
        if (text[i] === ',') {
          i += 1;
        } else {
          i += 1; // ]
          return;
        }
      }
    } else if (c === '"') {
      readString();
    } else {
      while (i < text.length && !',}] \t\r\n'.includes(text[i])) i += 1;
    }
  };
  readValue('');
  return map;
}

function lineLocator(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function syntaxErrorLine(message, text) {
  const lc = /line (\d+) column (\d+)/i.exec(message);
  if (lc) return Number(lc[1]);
  const pos = /position (\d+)/i.exec(message);
  if (pos) return lineLocator(text)(Number(pos[1]));
  return null;
}

function toDotted(path) {
  return path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
}

/**
 * When a post has no timezone, try to keep its wall clock: reuse the default
 * zone when it has the same offset at that instant, otherwise a fixed
 * Etc/GMT±N zone, otherwise fall back to the default zone (instant is kept).
 */
export function inferZone(scheduledAt, defaultZone) {
  const parsed = parseOffsetIso(scheduledAt);
  if (!parsed) return defaultZone;
  const offsetOf = (zone) => {
    const { offset } = wallParts(parsed.iso, zone);
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
  };
  if (isValidZone(defaultZone) && offsetOf(defaultZone) === parsed.offsetMinutes) return defaultZone;
  const minutes = parsed.offsetMinutes;
  if (minutes === 0) return 'UTC';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    // IANA's Etc/GMT zones have the sign inverted.
    const name = `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
    if (Math.abs(hours) <= 14 && isValidZone(name)) return name;
  }
  return defaultZone;
}

/**
 * @typedef {{path: string, message: string, line: number|null}} Issue
 * @typedef {{
 *   index: number, line: number|null, value: object|null, errors: Issue[], warnings: Issue[],
 *   existsInStudio: boolean, duplicateOf: number|null
 * }} ImportedPost
 */

/**
 * Parses and validates an export file.
 *
 * @param {string} text
 * @param {{existingIds?: Set<string>|string[], defaultTimezone?: string, maxPosts?: number}} [opts]
 * @returns {{ok: boolean, fatal: Array<{message: string, line: number|null}>, version: number|null, posts: ImportedPost[]}}
 */
export function parseImport(text, { existingIds = new Set(), defaultTimezone = 'UTC', maxPosts = 1000 } = {}) {
  const fatal = [];
  const result = { ok: false, fatal, version: null, posts: [] };
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const source = String(text ?? '').replace(/^﻿/, '');

  if (!source.trim()) {
    fatal.push({ message: 'The file is empty.', line: null });
    return result;
  }

  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    fatal.push({ message: `Invalid JSON: ${error.message}`, line: syntaxErrorLine(error.message, source) });
    return result;
  }

  const paths = indexJsonPaths(source);
  const lineAt = lineLocator(source);
  const lineOf = (path) => {
    const offset = paths.get(toDotted(path));
    return offset === undefined ? null : lineAt(offset);
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fatal.push({ message: 'Expected an object like { "version": 1, "posts": [...] }.', line: 1 });
    return result;
  }
  if (data.version === undefined) {
    fatal.push({ message: 'Missing "version". Expected "version": 1.', line: 1 });
  } else if (data.version !== EXPORT_VERSION) {
    fatal.push({
      message:
        typeof data.version === 'number' && data.version > EXPORT_VERSION
          ? `File version ${data.version} is newer than this Studio supports (${EXPORT_VERSION}).`
          : `Unsupported version ${JSON.stringify(data.version)}. Expected ${EXPORT_VERSION}.`,
      line: lineOf('version'),
    });
  }
  result.version = typeof data.version === 'number' ? data.version : null;
  if (!Array.isArray(data.posts)) {
    fatal.push({ message: '"posts" must be an array.', line: lineOf('posts') });
  } else if (data.posts.length > maxPosts) {
    fatal.push({ message: `Too many posts (${data.posts.length}). The limit is ${maxPosts} per file.`, line: lineOf('posts') });
  }
  if (fatal.length) return result;

  const firstSeen = new Map();
  data.posts.forEach((raw, index) => {
    const base = `posts[${index}]`;
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : raw;
    if (input && typeof input === 'object' && (input.timezone === undefined || input.timezone === null || input.timezone === '')) {
      if (typeof input.scheduledAt === 'string') input.timezone = inferZone(input.scheduledAt, defaultTimezone);
    }
    const res = validatePost(input, { path: base, defaultTimezone, allowDataUrl: true });
    const withLine = (list) => list.map((issue) => ({ ...issue, line: lineOf(issue.path) ?? lineOf(base) }));
    const errors = withLine(res.errors);
    const warnings = withLine(res.warnings);

    let duplicateOf = null;
    if (res.ok) {
      if (firstSeen.has(res.value.id)) {
        duplicateOf = firstSeen.get(res.value.id);
        errors.push({
          path: `${base}.id`,
          message: `duplicate id "${res.value.id}" (first used by post ${duplicateOf + 1})`,
          line: lineOf(`${base}.id`),
        });
      } else {
        firstSeen.set(res.value.id, index);
      }
    }
    result.posts.push({
      index,
      line: lineOf(base),
      value: errors.length ? null : res.value,
      errors,
      warnings,
      existsInStudio: Boolean(res.ok && existing.has(res.value.id)),
      duplicateOf,
    });
  });

  result.ok = true;
  return result;
}

export function formatIssue(issue) {
  const where = issue.line ? `line ${issue.line}: ` : '';
  return `${where}${issue.path} ${issue.message}`;
}
