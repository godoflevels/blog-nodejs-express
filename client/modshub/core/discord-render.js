import { getDiscordMarkdown, renderDiscord } from './discord.js';
import { sanitizeHtml } from './sanitize.js';
import { wallParts } from './time.js';

/**
 * HTML for a Discord message (content + embeds), the way Discord shows it.
 * Used by the live preview and, without the message chrome, by the PNG export.
 * Everything user-controlled goes through the sanitizer.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '');

export function contentHtml(src, env) {
  return sanitizeHtml(renderDiscord(src, env));
}

function inlineHtml(src, env) {
  return sanitizeHtml(getDiscordMarkdown().renderInline(String(src ?? ''), env));
}

function formatEmbedTime(iso, env) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(env.locale || 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: env.timeZone || undefined,
    }).format(d);
  } catch (_) {
    return iso;
  }
}

export function embedHtml(e, env = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#202225';
  const parts = [];
  if (e.authorName) {
    const icon = safeUrl(e.authorIconUrl);
    const name = inlineHtml(e.authorName, env);
    const url = safeUrl(e.authorUrl);
    parts.push(
      `<div class="dc-embed__author">${icon ? `<img src="${icon}" alt="">` : ''}${
        url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>` : `<span>${name}</span>`
      }</div>`
    );
  }
  if (e.title) {
    const title = inlineHtml(e.title, env);
    const url = safeUrl(e.url);
    parts.push(
      `<div class="dc-embed__title">${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</div>`
    );
  }
  if (e.description) parts.push(`<div class="dc-embed__desc">${contentHtml(e.description, env)}</div>`);
  if (e.fields && e.fields.length) {
    const fields = e.fields
      .map(
        (f) =>
          `<div class="dc-field${f.inline ? ' dc-field--inline' : ''}"><div class="dc-field__name">${inlineHtml(f.name || '​', env)}</div><div class="dc-field__value">${contentHtml(f.value || '​', env)}</div></div>`
      )
      .join('');
    parts.push(`<div class="dc-embed__fields">${fields}</div>`);
  }
  const image = safeUrl(e.imageUrl);
  if (image) parts.push(`<img class="dc-embed__image" src="${image}" alt="">`);
  if (e.footerText || e.timestamp) {
    const icon = safeUrl(e.footerIconUrl);
    const time = e.timestamp ? formatEmbedTime(e.timestamp, env) : '';
    parts.push(
      `<div class="dc-embed__footer">${icon ? `<img src="${icon}" alt="">` : ''}<span>${esc(e.footerText || '')}${
        e.footerText && time ? ' • ' : ''
      }${esc(time)}</span></div>`
    );
  }
  const thumb = safeUrl(e.thumbnailUrl);
  const html = `<div class="dc-embed" style="border-left-color:${color}"><div class="dc-embed__grid"><div class="dc-embed__main">${parts.join('')}</div>${
    thumb ? `<img class="dc-embed__thumb" src="${thumb}" alt="">` : ''
  }</div></div>`;
  return sanitizeHtml(html, { allowStyle: true });
}

/** Content + embeds, no message chrome (used inside PNG slides). */
export function bodyHtml(post, env = {}) {
  const content = post.content ? contentHtml(post.content, env) : '';
  const embeds = ((post.discord && post.discord.embeds) || []).map((e) => embedHtml(e, env)).join('');
  return content + embeds;
}

/** The whole message as Discord draws it (avatar, name, time, text, embeds). */
export function messageHtml(post, env = {}) {
  const d = post.discord || {};
  const name = d.username || 'ModsHub';
  const avatar = safeUrl(d.avatarUrl);
  const when = (() => {
    try {
      const w = wallParts(post.scheduledAt, post.timezone || 'UTC');
      return `${w.date} ${w.time}`;
    } catch (_) {
      return '';
    }
  })();
  const initial = esc([...name][0] || 'M').toUpperCase();
  const content = post.content ? `<div class="dc-content">${contentHtml(post.content, env)}</div>` : '';
  const embeds = ((d.embeds || []).map((e) => embedHtml(e, env))).join('');
  const gallerySources = (Array.isArray(post.images) && post.images.length ? post.images : post.image ? [post.image] : [])
    .filter((i) => i && /^(https?:\/\/|\/modshub\/)/i.test(i.src || ''));
  const attachment = gallerySources.length
    ? `<div class="dc-gallery dc-gallery--${Math.min(gallerySources.length, 5)}">${gallerySources
        .map(
          (img, i) =>
            `<div class="dc-attachment"><img src="${esc(img.src)}" alt="${esc(img.alt || `Attached image ${i + 1}`)}"><button type="button" class="dc-attachment__dl" data-dl="${i}" aria-label="Download image ${i + 1}" title="Download image ${i + 1}">Download</button></div>`
        )
        .join('')}</div>`
    : '';
  const html = `<div class="dc-message"><div class="dc-avatar">${
    avatar ? `<img src="${avatar}" alt="">` : `<span>${initial}</span>`
  }</div><div class="dc-body"><div class="dc-head"><span class="dc-username">${esc(name)}</span><span class="dc-app">APP</span><span class="dc-time">${esc(when)}</span></div>${content}${attachment}${embeds}</div></div>`;
  return sanitizeHtml(html, { allowStyle: true });
}
