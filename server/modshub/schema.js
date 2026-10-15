'use strict';

/**
 * Post / settings schema shared by the API (server) and the import wizard
 * (browser bundle). Plain CommonJS with no dependencies so esbuild can inline
 * it into the client and Node can require it directly.
 *
 * Validation never mutates `content`: Markdown must round-trip byte for byte.
 */

const STATUSES = ['draft', 'planned', 'ready', 'published', 'archived'];

const LIMITS = Object.freeze({
  title: 200,
  content: 50000,
  notes: 5000,
  tags: 30,
  tag: 40,
  category: 48,
  alt: 300,
  imageUrl: 2048,
  dataUrl: 4 * 1024 * 1024,
  postsPerRequest: 200,
  categories: 40,
  templates: 40,
  categoryName: 40,
  templateName: 60,
  // Discord message limits (webhook messages)
  dcUsername: 80,
  dcEmbeds: 10,
  dcEmbedTitle: 256,
  dcEmbedDescription: 4096,
  dcFields: 25,
  dcFieldName: 256,
  dcFieldValue: 1024,
  dcFooter: 2048,
  dcAuthor: 256,
  dcEmbedTotal: 6000,
  dcContent: 2000,
  slotNote: 200,
});

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ASSET_ID_RE = /^[a-f0-9]{24,48}$/;
const ISO_WITH_OFFSET_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const ASSET_PATH_RE = /^\/modshub\/api\/assets\/([a-f0-9]{24,48})$/;

const DEFAULT_CATEGORIES = [
  { id: 'updates', name: 'Updates', color: '#0087da' },
  { id: 'new-mods', name: 'New Mods', color: '#00a170' },
  { id: 'graphics', name: 'Graphics', color: '#9878f5' },
  { id: 'cars', name: 'Cars', color: '#f2cb71' },
  { id: 'improvements', name: 'Improvements', color: '#32d3a2' },
  { id: 'community', name: 'Community', color: '#f48fb1' },
  { id: 'promotions', name: 'Promotions', color: '#f84c54' },
  { id: 'announcements', name: 'Announcements', color: '#8fb4ff' },
];

const TARGET_PROFILES = ['gfm', 'telegram', 'discord', 'plain'];

/** Timezone names are validated through Intl so the list always matches the runtime. */
function isValidTimezone(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (_) {
    return false;
  }
}

function isValidIsoWithOffset(value) {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Keeps unicode letters/digits, lowercases, joins words with "-". */
function slugify(input) {
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.category);
}

function str(value, max, path, errors, { required = false, trim = false, allowEmpty = true } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push({ path, message: 'is required' });
    return '';
  }
  if (typeof value !== 'string') {
    errors.push({ path, message: 'must be a string' });
    return '';
  }
  const out = trim ? value.trim() : value;
  if (!allowEmpty && out.length === 0) errors.push({ path, message: 'must not be empty' });
  if (out.length > max) {
    errors.push({ path, message: `is too long (${out.length} > ${max} characters)` });
    return out.slice(0, max);
  }
  return out;
}

function normalizeImage(value, path, errors, warnings, { allowDataUrl = false } = {}) {
  if (value === undefined || value === null) return null;
  // Accept a bare string as shorthand for { src }.
  const input = typeof value === 'string' ? { src: value } : value;
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ path, message: 'must be null or an object { src, alt }' });
    return null;
  }
  const src = typeof input.src === 'string' ? input.src.trim() : '';
  if (!src) {
    errors.push({ path: `${path}.src`, message: 'is required when image is set' });
    return null;
  }
  const alt = str(input.alt, LIMITS.alt, `${path}.alt`, errors);
  if (src.length > LIMITS.imageUrl && !(allowDataUrl && src.startsWith('data:'))) {
    errors.push({ path: `${path}.src`, message: 'is too long' });
    return null;
  }
  if (src.startsWith('data:')) {
    if (!allowDataUrl) {
      errors.push({ path: `${path}.src`, message: 'data: URLs are not accepted here, upload the image first' });
      return null;
    }
    if (!DATA_IMAGE_RE.test(src) || src.length > LIMITS.dataUrl) {
      errors.push({ path: `${path}.src`, message: 'must be a png/jpeg/webp/gif data URL under 4 MB' });
      return null;
    }
    return { src, alt };
  }
  if (ASSET_PATH_RE.test(src)) return { src, alt };
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    if (url.protocol === 'http:') {
      warnings.push({ path: `${path}.src`, message: 'uses http://, https:// is recommended' });
    }
    return { src: url.href, alt };
  } catch (_) {
    errors.push({ path: `${path}.src`, message: 'must be an https:// URL or an uploaded asset' });
    return null;
  }
}

function httpUrl(value, path, errors, { allowEmpty = true } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > LIMITS.imageUrl) {
    errors.push({ path, message: 'must be an https:// URL' });
    return '';
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return url.href;
  } catch (_) {
    errors.push({ path, message: 'must be an https:// URL' });
    return '';
  }
}

function embedText(value, max, path, errors) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    errors.push({ path, message: 'must be a string' });
    return '';
  }
  if (value.length > max) {
    errors.push({ path, message: `is too long (${value.length} > ${max} characters)` });
    return value.slice(0, max);
  }
  return value;
}

/** Discord webhook style extras of a post: identity + up to 10 embeds. */
function normalizeDiscord(input, path, errors, warnings) {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ path, message: 'must be an object or null' });
    return null;
  }
  const out = {
    username: embedText(input.username, LIMITS.dcUsername, `${path}.username`, errors),
    avatarUrl: httpUrl(input.avatarUrl, `${path}.avatarUrl`, errors),
    embeds: [],
  };
  if (input.embeds !== undefined && input.embeds !== null) {
    if (!Array.isArray(input.embeds)) {
      errors.push({ path: `${path}.embeds`, message: 'must be an array' });
    } else {
      if (input.embeds.length > LIMITS.dcEmbeds) {
        errors.push({ path: `${path}.embeds`, message: `has too many embeds (max ${LIMITS.dcEmbeds})` });
      }
      let total = 0;
      input.embeds.slice(0, LIMITS.dcEmbeds).forEach((e, i) => {
        const p = `${path}.embeds[${i}]`;
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
          errors.push({ path: p, message: 'must be an object' });
          return;
        }
        let color = null;
        if (e.color !== undefined && e.color !== null && e.color !== '') {
          if (typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color)) color = e.color.toLowerCase();
          else errors.push({ path: `${p}.color`, message: 'must be a #rrggbb colour' });
        }
        const fields = [];
        if (e.fields !== undefined && e.fields !== null) {
          if (!Array.isArray(e.fields)) {
            errors.push({ path: `${p}.fields`, message: 'must be an array' });
          } else {
            if (e.fields.length > LIMITS.dcFields) {
              errors.push({ path: `${p}.fields`, message: `has too many fields (max ${LIMITS.dcFields})` });
            }
            e.fields.slice(0, LIMITS.dcFields).forEach((f, j) => {
              const fp = `${p}.fields[${j}]`;
              if (!f || typeof f !== 'object') {
                errors.push({ path: fp, message: 'must be an object' });
                return;
              }
              fields.push({
                name: embedText(f.name, LIMITS.dcFieldName, `${fp}.name`, errors),
                value: embedText(f.value, LIMITS.dcFieldValue, `${fp}.value`, errors),
                inline: Boolean(f.inline),
              });
            });
          }
        }
        let timestamp = '';
        if (e.timestamp) {
          if (isValidIsoWithOffset(e.timestamp)) timestamp = new Date(e.timestamp).toISOString();
          else errors.push({ path: `${p}.timestamp`, message: 'must be an ISO 8601 date-time' });
        }
        const embed = {
          color,
          authorName: embedText(e.authorName, LIMITS.dcAuthor, `${p}.authorName`, errors),
          authorUrl: httpUrl(e.authorUrl, `${p}.authorUrl`, errors),
          authorIconUrl: httpUrl(e.authorIconUrl, `${p}.authorIconUrl`, errors),
          title: embedText(e.title, LIMITS.dcEmbedTitle, `${p}.title`, errors),
          url: httpUrl(e.url, `${p}.url`, errors),
          description: embedText(e.description, LIMITS.dcEmbedDescription, `${p}.description`, errors),
          fields,
          thumbnailUrl: httpUrl(e.thumbnailUrl, `${p}.thumbnailUrl`, errors),
          imageUrl: httpUrl(e.imageUrl, `${p}.imageUrl`, errors),
          footerText: embedText(e.footerText, LIMITS.dcFooter, `${p}.footerText`, errors),
          footerIconUrl: httpUrl(e.footerIconUrl, `${p}.footerIconUrl`, errors),
          timestamp,
        };
        total += embed.title.length + embed.description.length + embed.footerText.length + embed.authorName.length;
        embed.fields.forEach((f) => { total += f.name.length + f.value.length; });
        out.embeds.push(embed);
      });
      if (total > LIMITS.dcEmbedTotal) {
        warnings.push({ path: `${path}.embeds`, message: `embeds total ${total} characters, Discord allows ${LIMITS.dcEmbedTotal} per message` });
      }
    }
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A "free place" marker on the shared calendar: a day, optionally a time. */
function validateSlot(input, opts = {}) {
  const path = opts.path || 'slot';
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, errors: [{ path, message: 'must be an object' }] };
  }
  let id = '';
  if (typeof input.id !== 'string' || !ID_RE.test(input.id)) errors.push({ path: `${path}.id`, message: 'is required' });
  else id = input.id;
  let date = '';
  if (typeof input.date === 'string' && DATE_RE.test(input.date) && !Number.isNaN(Date.parse(`${input.date}T00:00:00Z`))) {
    date = input.date;
  } else {
    errors.push({ path: `${path}.date`, message: 'must be YYYY-MM-DD' });
  }
  let time = '';
  if (input.time !== undefined && input.time !== null && input.time !== '') {
    if (typeof input.time === 'string' && TIME_RE.test(input.time)) time = input.time;
    else errors.push({ path: `${path}.time`, message: 'must be HH:mm or empty' });
  }
  let timezone = opts.defaultTimezone || 'UTC';
  if (input.timezone !== undefined && input.timezone !== null && input.timezone !== '') {
    if (isValidTimezone(input.timezone)) timezone = input.timezone;
    else errors.push({ path: `${path}.timezone`, message: 'must be a valid IANA timezone' });
  }
  const note = embedText(input.note, LIMITS.slotNote, `${path}.note`, errors);
  return {
    ok: errors.length === 0,
    value: errors.length ? null : { id, date, time, timezone, note },
    errors,
  };
}

/**
 * Validates and normalises one post.
 *
 * @param {unknown} input
 * @param {{path?: string, defaultTimezone?: string, allowDataUrl?: boolean, now?: Date}} [opts]
 * @returns {{ok: boolean, value: object|null, errors: Array<{path:string,message:string}>, warnings: Array<{path:string,message:string}>}}
 */
function validatePost(input, opts = {}) {
  const path = opts.path || 'post';
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, errors: [{ path, message: 'must be an object' }], warnings };
  }

  const known = new Set([
    'id', 'title', 'scheduledAt', 'timezone', 'status', 'category', 'tags',
    'content', 'image', 'notes', 'createdAt', 'updatedAt', 'revision', 'discord',
    'createdBy', 'updatedBy',
  ]);
  for (const key of Object.keys(input)) {
    if (!known.has(key)) warnings.push({ path: `${path}.${key}`, message: 'unknown field, ignored' });
  }

  let id = '';
  if (typeof input.id !== 'string' || !ID_RE.test(input.id)) {
    errors.push({ path: `${path}.id`, message: 'is required: 1-64 chars of letters, digits, "-" or "_"' });
  } else {
    id = input.id;
  }

  const title = str(input.title, LIMITS.title, `${path}.title`, errors, { required: true, trim: true, allowEmpty: false });

  let scheduledAt = null;
  if (input.scheduledAt === undefined || input.scheduledAt === null || input.scheduledAt === '') {
    errors.push({ path: `${path}.scheduledAt`, message: 'is required (ISO 8601 with offset, e.g. 2026-10-20T18:00:00+03:00)' });
  } else if (!isValidIsoWithOffset(input.scheduledAt)) {
    errors.push({ path: `${path}.scheduledAt`, message: 'must be an ISO 8601 date-time with Z or ±hh:mm offset' });
  } else {
    scheduledAt = new Date(input.scheduledAt).toISOString();
  }

  let timezone = opts.defaultTimezone || 'UTC';
  if (input.timezone !== undefined && input.timezone !== null && input.timezone !== '') {
    if (isValidTimezone(input.timezone)) timezone = input.timezone;
    else errors.push({ path: `${path}.timezone`, message: 'must be a valid IANA timezone like Europe/Berlin' });
  } else {
    warnings.push({ path: `${path}.timezone`, message: `missing, using ${timezone}` });
  }

  let status = 'draft';
  if (input.status === undefined || input.status === null) {
    errors.push({ path: `${path}.status`, message: `is required (${STATUSES.join(', ')})` });
  } else if (typeof input.status !== 'string' || !STATUSES.includes(input.status.toLowerCase())) {
    errors.push({ path: `${path}.status`, message: `must be one of: ${STATUSES.join(', ')}` });
  } else {
    status = input.status.toLowerCase();
  }

  const category = str(input.category, LIMITS.category, `${path}.category`, errors, { trim: true });

  const tags = [];
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      errors.push({ path: `${path}.tags`, message: 'must be an array of strings' });
    } else {
      if (input.tags.length > LIMITS.tags) {
        errors.push({ path: `${path}.tags`, message: `has too many tags (max ${LIMITS.tags})` });
      }
      input.tags.slice(0, LIMITS.tags).forEach((raw, i) => {
        if (typeof raw !== 'string') {
          errors.push({ path: `${path}.tags[${i}]`, message: 'must be a string' });
          return;
        }
        const tag = raw.trim().replace(/^#+/, '').trim();
        if (!tag) return;
        if (tag.length > LIMITS.tag) {
          errors.push({ path: `${path}.tags[${i}]`, message: `is too long (max ${LIMITS.tag})` });
          return;
        }
        if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
      });
    }
  }

  if (input.content !== undefined && typeof input.content !== 'string') {
    errors.push({ path: `${path}.content`, message: 'must be a string' });
  }
  const content = str(input.content, LIMITS.content, `${path}.content`, errors);

  const image = normalizeImage(input.image, `${path}.image`, errors, warnings, opts);
  const notes = str(input.notes, LIMITS.notes, `${path}.notes`, errors);

  const dateOrNull = (v, key) => {
    if (v === undefined || v === null || v === '') return null;
    if (!isValidIsoWithOffset(v)) {
      warnings.push({ path: `${path}.${key}`, message: 'is not a valid date, ignored' });
      return null;
    }
    return new Date(v).toISOString();
  };
  const discord = normalizeDiscord(input.discord, `${path}.discord`, errors, warnings);
  const createdAt = dateOrNull(input.createdAt, 'createdAt');
  const updatedAt = dateOrNull(input.updatedAt, 'updatedAt');

  const ok = errors.length === 0;
  return {
    ok,
    value: ok
      ? {
          id,
          title,
          scheduledAt,
          timezone,
          status,
          category,
          tags,
          content,
          image,
          notes,
          discord,
          createdAt,
          updatedAt,
        }
      : null,
    errors,
    warnings,
  };
}

function validateSettings(input) {
  const errors = [];
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, errors: [{ path: 'settings', message: 'must be an object' }] };
  }

  if (input.categories !== undefined) {
    if (!Array.isArray(input.categories) || input.categories.length === 0 || input.categories.length > LIMITS.categories) {
      errors.push({ path: 'categories', message: `must be a list of 1-${LIMITS.categories} categories` });
    } else {
      const seen = new Set();
      out.categories = [];
      input.categories.forEach((c, i) => {
        const name = typeof c?.name === 'string' ? c.name.trim().slice(0, LIMITS.categoryName) : '';
        const id = typeof c?.id === 'string' && c.id ? slugify(c.id) : slugify(name);
        const color = typeof c?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#0087da';
        if (!name || !id) {
          errors.push({ path: `categories[${i}]`, message: 'needs a name' });
        } else if (seen.has(id)) {
          errors.push({ path: `categories[${i}]`, message: `duplicate category "${name}"` });
        } else {
          seen.add(id);
          out.categories.push({ id, name, color });
        }
      });
    }
  }

  if (input.defaultTimezone !== undefined) {
    if (input.defaultTimezone === 'auto' || isValidTimezone(input.defaultTimezone)) out.defaultTimezone = input.defaultTimezone;
    else errors.push({ path: 'defaultTimezone', message: 'must be "auto" or a valid IANA timezone' });
  }
  if (input.weekStart !== undefined) {
    if (input.weekStart === 0 || input.weekStart === 1) out.weekStart = input.weekStart;
    else errors.push({ path: 'weekStart', message: 'must be 0 (Sunday) or 1 (Monday)' });
  }
  if (input.defaultTime !== undefined) {
    if (typeof input.defaultTime === 'string' && TIME_RE.test(input.defaultTime)) out.defaultTime = input.defaultTime;
    else errors.push({ path: 'defaultTime', message: 'must be HH:mm' });
  }
  if (input.targetProfile !== undefined) {
    if (TARGET_PROFILES.includes(input.targetProfile)) out.targetProfile = input.targetProfile;
    else errors.push({ path: 'targetProfile', message: `must be one of ${TARGET_PROFILES.join(', ')}` });
  }
  for (const key of ['preserveLineBreaks', 'preserveBlankLines']) {
    if (input[key] !== undefined) {
      if (typeof input[key] === 'boolean') out[key] = input[key];
      else errors.push({ path: key, message: 'must be a boolean' });
    }
  }

  if (input.templates !== undefined) {
    if (!Array.isArray(input.templates) || input.templates.length > LIMITS.templates) {
      errors.push({ path: 'templates', message: `must be a list of up to ${LIMITS.templates} templates` });
    } else {
      out.templates = [];
      input.templates.forEach((t, i) => {
        const errs = [];
        const name = str(t?.name, LIMITS.templateName, `templates[${i}].name`, errs, { trim: true, allowEmpty: false, required: true });
        const title = str(t?.title, LIMITS.title, `templates[${i}].title`, errs, { trim: true });
        const content = str(t?.content, LIMITS.content, `templates[${i}].content`, errs);
        const category = str(t?.category, LIMITS.category, `templates[${i}].category`, errs, { trim: true });
        const id = typeof t?.id === 'string' && ID_RE.test(t.id) ? t.id : null;
        if (!id) errs.push({ path: `templates[${i}].id`, message: 'is required' });
        const tags = Array.isArray(t?.tags)
          ? t.tags.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, LIMITS.tags)
          : [];
        if (errs.length) errors.push(...errs);
        else out.templates.push({ id, name, title, content, category, tags });
      });
    }
  }

  if (input.imageExport !== undefined) {
    if (input.imageExport && typeof input.imageExport === 'object' && !Array.isArray(input.imageExport)) {
      // Opaque UI preferences; bounded to keep the document small.
      const json = JSON.stringify(input.imageExport);
      if (json.length <= 2000) out.imageExport = input.imageExport;
      else errors.push({ path: 'imageExport', message: 'is too large' });
    } else {
      errors.push({ path: 'imageExport', message: 'must be an object' });
    }
  }

  return { ok: errors.length === 0, value: errors.length ? null : out, errors };
}

function defaultSettings() {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    defaultTimezone: 'auto',
    weekStart: 1,
    defaultTime: '18:00',
    targetProfile: 'discord',
    preserveLineBreaks: true,
    preserveBlankLines: true,
    templates: [],
    imageExport: {},
  };
}

module.exports = {
  STATUSES,
  LIMITS,
  ID_RE,
  ASSET_ID_RE,
  ASSET_PATH_RE,
  TIME_RE,
  TARGET_PROFILES,
  DEFAULT_CATEGORIES,
  isValidTimezone,
  isValidIsoWithOffset,
  slugify,
  validatePost,
  validateSlot,
  validateSettings,
  defaultSettings,
};
