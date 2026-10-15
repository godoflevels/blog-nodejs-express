import MarkdownIt from 'markdown-it';

/**
 * Discord flavoured Markdown.
 *
 * Discord's dialect is not CommonMark/GFM: `__x__` is underline, `||x||` is a
 * spoiler, `-# x` is small text, `>>> ` quotes the rest of the message, only
 * `#`..`###` are headings, there are no tables/images/rules/HTML, and there are
 * mentions, custom emoji and `<t:…>` timestamps. The base grammar (emphasis,
 * lists, code, links) is still markdown-it; Discord's differences are added as
 * real markdown-it rules so nesting and priority stay correct.
 */

export const DISCORD_LIMITS = Object.freeze({
  content: 2000,
  username: 80,
  embeds: 10,
  embedTitle: 256,
  embedDescription: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  embedTotal: 6000,
});

const SAFE_URL = /^(?:https?:|mailto:)/i;

// markdown-it's text rule, plus `|` so `||spoiler||` can start mid-line.
function isTerminator(ch) {
  switch (ch) {
    case 0x0a: case 0x21: case 0x23: case 0x24: case 0x25: case 0x26: case 0x2a: case 0x2b:
    case 0x2d: case 0x3a: case 0x3c: case 0x3d: case 0x3e: case 0x40: case 0x5b: case 0x5c:
    case 0x5d: case 0x5e: case 0x5f: case 0x60: case 0x7b: case 0x7c: case 0x7d: case 0x7e:
      return true;
    default:
      return false;
  }
}

function textRule(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !isTerminator(state.src.charCodeAt(pos))) pos += 1;
  if (pos === state.pos) return false;
  if (!silent) state.pending += state.src.slice(state.pos, pos);
  state.pos = pos;
  return true;
}

function spoilerRule(state, silent) {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x7c || src.charCodeAt(pos + 1) !== 0x7c) return false;
  const end = src.indexOf('||', pos + 2);
  if (end === -1 || end === pos + 2 || end > state.posMax) return false;
  if (!silent) {
    const open = state.push('spoiler_open', 'span', 1);
    open.markup = '||';
    const oldMax = state.posMax;
    state.pos = pos + 2;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.pos = end + 2;
    state.posMax = oldMax;
    const close = state.push('spoiler_close', 'span', -1);
    close.markup = '||';
  } else {
    state.pos = end + 2;
  }
  return true;
}

const TAG_RE = /<(?:(@[!&]?)(\d{1,25})|(#)(\d{1,25})|(a?):([A-Za-z0-9_]{2,32}):(\d{1,25})|t:(-?\d{1,13})(?::([tTdDfFR]))?)>/y;

function tagRule(state, silent) {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x3c) return false;
  TAG_RE.lastIndex = pos;
  const m = TAG_RE.exec(src);
  if (!m || pos + m[0].length > state.posMax) return false;
  if (!silent) {
    if (m[1]) {
      const token = state.push('discord_mention', '', 0);
      token.meta = { kind: m[1] === '@&' ? 'role' : 'user', id: m[2] };
      token.content = m[0];
    } else if (m[3]) {
      const token = state.push('discord_mention', '', 0);
      token.meta = { kind: 'channel', id: m[4] };
      token.content = m[0];
    } else if (m[6]) {
      const token = state.push('discord_emoji', '', 0);
      token.meta = { animated: m[5] === 'a', name: m[6], id: m[7] };
      token.content = m[0];
    } else {
      const token = state.push('discord_timestamp', '', 0);
      token.meta = { ts: Number(m[8]), style: m[9] || 'f' };
      token.content = m[0];
    }
  }
  state.pos = pos + m[0].length;
  return true;
}

function broadcastRule(state, silent) {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x40) return false;
  const word = src.startsWith('@everyone', pos) ? '@everyone' : src.startsWith('@here', pos) ? '@here' : '';
  if (!word) return false;
  const after = src.charCodeAt(pos + word.length);
  if (after && /[A-Za-z0-9_]/.test(String.fromCharCode(after))) return false;
  if (!silent) {
    const token = state.push('discord_mention', '', 0);
    token.meta = { kind: 'broadcast' };
    token.content = word;
  }
  state.pos = pos + word.length;
  return true;
}

function subtextRule(state, startLine, endLine, silent) {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.src.charCodeAt(pos) !== 0x2d || state.src.charCodeAt(pos + 1) !== 0x23 || state.src.charCodeAt(pos + 2) !== 0x20) {
    return false;
  }
  if (silent) return true;
  state.line = startLine + 1;
  const open = state.push('subtext_open', 'small', 1);
  open.markup = '-#';
  open.map = [startLine, state.line];
  const inline = state.push('inline', '', 0);
  inline.content = state.src.slice(pos + 3, max).trim();
  inline.map = [startLine, state.line];
  inline.children = [];
  state.push('subtext_close', 'small', -1).markup = '-#';
  return true;
}

/** `>>> text` quotes everything that follows; rewrite it to per-line `> `. */
function multilineQuoteRule(state) {
  const lines = state.src.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && (line.startsWith('>>> ') || line === '>>>')) {
      const out = lines.slice(0, i);
      out.push(`> ${line.slice(4)}`.trimEnd());
      let inner = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        const l = lines[j];
        if (/^\s{0,3}(```|~~~)/.test(l)) inner = !inner;
        out.push(inner || /^\s{0,3}(```|~~~)/.test(l) ? `> ${l}` : `> ${l}`.trimEnd());
      }
      state.src = out.join('\n');
      return;
    }
  }
}

function headingLimitRule(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'heading_open' && Number(t.tag.slice(1)) > 3) {
      const level = Number(t.tag.slice(1));
      t.type = 'paragraph_open';
      t.tag = 'p';
      t.markup = '';
      tokens[i + 1].content = `${'#'.repeat(level)} ${tokens[i + 1].content}`;
      tokens[i + 2].type = 'paragraph_close';
      tokens[i + 2].tag = 'p';
      tokens[i + 2].markup = '';
    }
  }
}

function formatTimestamp(ts, style, env = {}) {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return '<invalid time>';
  const locale = env.locale || 'en-US';
  const timeZone = env.timeZone || undefined;
  try {
    if (style === 'R') {
      const now = env.now ? new Date(env.now) : new Date();
      const diff = (date.getTime() - now.getTime()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
      for (const [unit, secs] of units) {
        if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
      }
      return rtf.format(Math.round(diff), 'second');
    }
    const options = {
      t: { timeStyle: 'short' },
      T: { timeStyle: 'medium' },
      d: { dateStyle: 'short' },
      D: { dateStyle: 'long' },
      f: { dateStyle: 'long', timeStyle: 'short' },
      F: { dateStyle: 'full', timeStyle: 'short' },
    }[style] || { dateStyle: 'long', timeStyle: 'short' };
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch (_) {
    return date.toISOString();
  }
}

let instance = null;

export function getDiscordMarkdown() {
  if (instance) return instance;
  const md = new MarkdownIt('zero', { html: false, linkify: true, breaks: true, typographer: false });
  md.enable(['normalize', 'block', 'inline', 'text_join', 'linkify']);
  md.enable(['fence', 'blockquote', 'list', 'heading', 'paragraph']);
  md.enable(['newline', 'escape', 'backticks', 'strikethrough', 'emphasis', 'link', 'autolink']);
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
  md.validateLink = (url) => SAFE_URL.test(String(url).trim());

  md.inline.ruler.at('text', textRule);
  md.inline.ruler.before('escape', 'discord_tag', tagRule);
  md.inline.ruler.before('escape', 'discord_broadcast', broadcastRule);
  md.inline.ruler.before('emphasis', 'discord_spoiler', spoilerRule);
  md.block.ruler.before('paragraph', 'discord_subtext', subtextRule, { alt: ['paragraph', 'blockquote'] });
  md.core.ruler.before('block', 'discord_multiline_quote', multilineQuoteRule);
  md.core.ruler.after('block', 'discord_headings', headingLimitRule);

  const r = md.renderer.rules;
  const esc = md.utils.escapeHtml;
  r.strong_open = (tokens, idx) => (tokens[idx].markup === '__' ? '<u>' : '<strong>');
  r.strong_close = (tokens, idx) => (tokens[idx].markup === '__' ? '</u>' : '</strong>');
  r.spoiler_open = () => '<span class="dc-spoiler">';
  r.spoiler_close = () => '</span>';
  r.subtext_open = () => '<small class="dc-subtext">';
  r.subtext_close = () => '</small>\n';
  r.discord_mention = (tokens, idx) => {
    const { meta, content } = tokens[idx];
    if (meta.kind === 'broadcast') return `<span class="dc-mention dc-mention--broadcast">${esc(content)}</span>`;
    if (meta.kind === 'channel') return '<span class="dc-mention dc-mention--channel">#channel</span>';
    return `<span class="dc-mention dc-mention--${meta.kind}">@${meta.kind}</span>`;
  };
  r.discord_emoji = (tokens, idx) => {
    const { meta } = tokens[idx];
    const ext = meta.animated ? 'gif' : 'webp';
    return `<img class="dc-emoji" src="https://cdn.discordapp.com/emojis/${meta.id}.${ext}?size=48" alt=":${esc(meta.name)}:" title=":${esc(meta.name)}:">`;
  };
  r.discord_timestamp = (tokens, idx, _o, env) => {
    const { meta } = tokens[idx];
    return `<span class="dc-timestamp">${esc(formatTimestamp(meta.ts, meta.style, env))}</span>`;
  };
  const defaultFence = r.fence;
  r.fence = (tokens, idx, o, env, self) => {
    const t = tokens[idx];
    const lang = (t.info || '').trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}_+#.-]/gu, '').slice(0, 24);
    const cls = lang ? ` class="language-${esc(lang)}"` : '';
    return `<pre class="dc-codeblock"><code${cls}>${esc(t.content)}</code></pre>\n`;
  };
  void defaultFence;
  const linkOpen = r.link_open || ((tokens, idx, o, env, self) => self.renderToken(tokens, idx, o));
  r.link_open = (tokens, idx, o, env, self) => {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return linkOpen(tokens, idx, o, env, self);
  };
  instance = md;
  return md;
}

/**
 * @param {string} src
 * @param {{timeZone?: string, locale?: string, now?: number}} [env]
 * @returns {string} HTML. Not sanitised yet: pass through sanitizeHtml().
 */
export function renderDiscord(src, env = {}) {
  return getDiscordMarkdown().render(String(src ?? ''), env);
}

export function parseDiscord(src) {
  return getDiscordMarkdown().parse(String(src ?? ''), {});
}

// ---- webhook payload (what Discohook calls the JSON of a message) ----------

const colorToInt = (hex) => (hex ? parseInt(hex.replace('#', ''), 16) : undefined);
const intToColor = (n) => (Number.isInteger(n) && n >= 0 && n <= 0xffffff ? `#${n.toString(16).padStart(6, '0')}` : null);
const nonEmpty = (v) => (v === '' || v === undefined || v === null ? undefined : v);

export function emptyEmbed() {
  return {
    color: '#5865f2',
    authorName: '',
    authorUrl: '',
    authorIconUrl: '',
    title: '',
    url: '',
    description: '',
    fields: [],
    thumbnailUrl: '',
    imageUrl: '',
    footerText: '',
    footerIconUrl: '',
    timestamp: '',
  };
}

export function embedToWebhook(e) {
  const out = {};
  if (nonEmpty(e.title)) out.title = e.title;
  if (nonEmpty(e.description)) out.description = e.description;
  if (nonEmpty(e.url)) out.url = e.url;
  if (e.color) out.color = colorToInt(e.color);
  if (nonEmpty(e.timestamp)) out.timestamp = e.timestamp;
  if (e.footerText || e.footerIconUrl) {
    out.footer = { text: e.footerText || '​', ...(e.footerIconUrl ? { icon_url: e.footerIconUrl } : {}) };
  }
  if (e.imageUrl) out.image = { url: e.imageUrl };
  if (e.thumbnailUrl) out.thumbnail = { url: e.thumbnailUrl };
  if (e.authorName || e.authorIconUrl) {
    out.author = {
      name: e.authorName || '​',
      ...(e.authorUrl ? { url: e.authorUrl } : {}),
      ...(e.authorIconUrl ? { icon_url: e.authorIconUrl } : {}),
    };
  }
  if (e.fields && e.fields.length) {
    out.fields = e.fields.map((f) => ({ name: f.name || '​', value: f.value || '​', ...(f.inline ? { inline: true } : {}) }));
  }
  return out;
}

/** The JSON Discord's webhook endpoint (and Discohook) understands. */
export function toWebhookPayload(post) {
  const d = post.discord || {};
  const payload = {};
  if (post.content) payload.content = post.content;
  if (d.username) payload.username = d.username;
  if (d.avatarUrl) payload.avatar_url = d.avatarUrl;
  const embeds = (d.embeds || []).map(embedToWebhook).filter((e) => Object.keys(e).length);
  if (embeds.length) payload.embeds = embeds;
  return payload;
}

function embedFromWebhook(raw) {
  const e = emptyEmbed();
  e.color = intToColor(raw.color);
  e.title = String(raw.title || '');
  e.description = String(raw.description || '');
  e.url = String(raw.url || '');
  e.timestamp = String(raw.timestamp || '');
  e.footerText = String((raw.footer && raw.footer.text) || '');
  e.footerIconUrl = String((raw.footer && (raw.footer.icon_url || raw.footer.iconUrl)) || '');
  e.imageUrl = String((raw.image && raw.image.url) || '');
  e.thumbnailUrl = String((raw.thumbnail && raw.thumbnail.url) || '');
  e.authorName = String((raw.author && raw.author.name) || '');
  e.authorUrl = String((raw.author && raw.author.url) || '');
  e.authorIconUrl = String((raw.author && (raw.author.icon_url || raw.author.iconUrl)) || '');
  e.fields = Array.isArray(raw.fields)
    ? raw.fields.map((f) => ({ name: String(f.name || ''), value: String(f.value || ''), inline: Boolean(f.inline) }))
    : [];
  return e;
}

/**
 * Parses a webhook payload or a Discohook backup/share JSON.
 * @returns {{content: string, discord: {username: string, avatarUrl: string, embeds: object[]}, notes: string[]}}
 */
export function fromWebhookPayload(input) {
  const notes = [];
  let data = input;
  if (data && Array.isArray(data.messages)) {
    if (data.messages.length > 1) notes.push(`The file has ${data.messages.length} messages; only the first one was loaded.`);
    data = data.messages[0] && (data.messages[0].data || data.messages[0]);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON object with content and/or embeds.');
  const embeds = Array.isArray(data.embeds) ? data.embeds.filter((e) => e && typeof e === 'object') : [];
  if (embeds.length > DISCORD_LIMITS.embeds) notes.push(`Only the first ${DISCORD_LIMITS.embeds} embeds were loaded.`);
  return {
    content: typeof data.content === 'string' ? data.content : '',
    discord: {
      username: typeof data.username === 'string' ? data.username : '',
      avatarUrl: typeof (data.avatar_url ?? data.avatarUrl) === 'string' ? data.avatar_url ?? data.avatarUrl : '',
      embeds: embeds.slice(0, DISCORD_LIMITS.embeds).map(embedFromWebhook),
    },
    notes,
  };
}

/** The text a person pastes into Discord: the message, or the embed text if there is none. */
export function messageText(post) {
  if (post.content) return post.content;
  const embeds = (post.discord && post.discord.embeds) || [];
  return embeds
    .map((e) => [e.title, e.description].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

/** Limits Discord enforces when the message is actually sent. */
export function discordIssues(post) {
  const issues = [];
  const d = post.discord || {};
  const embeds = d.embeds || [];
  const len = (s) => (s || '').length;
  if (len(post.content) > DISCORD_LIMITS.content) {
    issues.push({ level: 'error', message: `Message text is ${len(post.content)} characters; Discord allows ${DISCORD_LIMITS.content} (webhooks and bots cannot use the Nitro limit).` });
  }
  if (len(d.username) > DISCORD_LIMITS.username) issues.push({ level: 'error', message: `Username is longer than ${DISCORD_LIMITS.username} characters.` });
  if (embeds.length > DISCORD_LIMITS.embeds) issues.push({ level: 'error', message: `At most ${DISCORD_LIMITS.embeds} embeds per message.` });
  let total = 0;
  embeds.forEach((e, i) => {
    const n = `Embed ${i + 1}`;
    if (len(e.title) > DISCORD_LIMITS.embedTitle) issues.push({ level: 'error', message: `${n}: title is over ${DISCORD_LIMITS.embedTitle} characters.` });
    if (len(e.description) > DISCORD_LIMITS.embedDescription) issues.push({ level: 'error', message: `${n}: description is over ${DISCORD_LIMITS.embedDescription} characters.` });
    if (len(e.footerText) > DISCORD_LIMITS.footer) issues.push({ level: 'error', message: `${n}: footer is over ${DISCORD_LIMITS.footer} characters.` });
    if (len(e.authorName) > DISCORD_LIMITS.author) issues.push({ level: 'error', message: `${n}: author is over ${DISCORD_LIMITS.author} characters.` });
    if ((e.fields || []).length > DISCORD_LIMITS.fields) issues.push({ level: 'error', message: `${n}: more than ${DISCORD_LIMITS.fields} fields.` });
    (e.fields || []).forEach((f, j) => {
      if (len(f.name) > DISCORD_LIMITS.fieldName) issues.push({ level: 'error', message: `${n}, field ${j + 1}: name is over ${DISCORD_LIMITS.fieldName} characters.` });
      if (len(f.value) > DISCORD_LIMITS.fieldValue) issues.push({ level: 'error', message: `${n}, field ${j + 1}: value is over ${DISCORD_LIMITS.fieldValue} characters.` });
      if (!f.name || !f.value) issues.push({ level: 'warning', message: `${n}, field ${j + 1}: Discord needs both a name and a value.` });
      total += len(f.name) + len(f.value);
    });
    total += len(e.title) + len(e.description) + len(e.footerText) + len(e.authorName);
  });
  if (total > DISCORD_LIMITS.embedTotal) {
    issues.push({ level: 'error', message: `Embeds contain ${total} characters in total; Discord allows ${DISCORD_LIMITS.embedTotal}.` });
  }
  const hasEmbedContent = embeds.some((e) => Object.keys(embedToWebhook(e)).length > 0);
  if (len(post.content) === 0 && !hasEmbedContent) {
    issues.push({ level: 'warning', message: 'The message is empty: Discord needs text or at least one embed.' });
  }
  return issues;
}
