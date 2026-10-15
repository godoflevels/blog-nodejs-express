import { toBlob, getFontEmbedCSS } from 'html-to-image';
import { zipSync } from 'fflate';
import { paginate, largestFitting } from './slides.js';

/**
 * Image export.
 *
 * `layoutSlides()` builds the real DOM slides (the same ones shown in the
 * Export Preview) and `renderSlideBlob()` rasterises exactly that DOM to a PNG
 * with html-to-image, so what the user previews is what they download.
 */

export const IMAGE_PRESETS = {
  square: { label: 'Square', width: 1080, height: 1080 },
  portrait: { label: 'Portrait', width: 1080, height: 1350 },
  landscape: { label: 'Landscape', width: 1200, height: 630 },
  story: { label: 'Story', width: 1080, height: 1920 },
  custom: { label: 'Custom', width: 1080, height: 1080 },
};

export const BACKGROUNDS = {
  dark: { label: 'Dark', css: 'radial-gradient(120% 90% at 0% 0%, #12202e 0%, #060a0f 55%)', text: '#ffffff', muted: '#8a9099', rule: '#24282d', card: '#101419' },
  blue: { label: 'Blue', css: 'linear-gradient(135deg, #065ced 0%, #033487 100%)', text: '#ffffff', muted: '#c7d6f5', rule: 'rgba(255,255,255,.25)', card: 'rgba(6,10,15,.35)' },
  light: { label: 'Light', css: '#f4f4f4', text: '#101419', muted: '#565a5f', rule: '#d9dbde', card: '#ffffff' },
  solid: { label: 'Solid', css: '#101419', text: '#ffffff', muted: '#8a9099', rule: '#24282d', card: '#1a1e23' },
};

export const DEFAULT_IMAGE_OPTIONS = Object.freeze({
  preset: 'square',
  customWidth: 1080,
  customHeight: 1350,
  layout: 'slides', // 'slides' | 'long'
  background: 'dark',
  solidColor: '#101419',
  logo: true,
  padding: 0.07,
  textScale: 1,
  imageMode: 'design', // 'none' | 'design' | 'background'
});

export const MAX_SIDE = 4096;
export const MAX_LONG_HEIGHT = 16000;

export function normalizeOptions(input = {}) {
  const o = { ...DEFAULT_IMAGE_OPTIONS, ...input };
  const clamp = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);
  o.preset = IMAGE_PRESETS[o.preset] ? o.preset : 'square';
  o.customWidth = Math.round(clamp(o.customWidth, 320, MAX_SIDE, 1080));
  o.customHeight = Math.round(clamp(o.customHeight, 320, MAX_SIDE, 1350));
  o.padding = clamp(o.padding, 0.02, 0.15, 0.07);
  o.textScale = clamp(o.textScale, 0.6, 2, 1);
  o.layout = o.layout === 'long' ? 'long' : 'slides';
  o.background = BACKGROUNDS[o.background] ? o.background : 'dark';
  o.imageMode = ['none', 'design', 'background'].includes(o.imageMode) ? o.imageMode : 'design';
  o.logo = Boolean(o.logo);
  if (!/^#[0-9a-fA-F]{6}$/.test(o.solidColor)) o.solidColor = '#101419';
  return o;
}

export function resolveSize(options) {
  const o = normalizeOptions(options);
  if (o.preset === 'custom') return { width: o.customWidth, height: o.customHeight };
  const p = IMAGE_PRESETS[o.preset];
  return { width: p.width, height: p.height };
}

// ---- image loading ---------------------------------------------------------

const imageCache = new Map();

/**
 * Resolves an image URL to a data URL so rasterisation can never be blocked
 * by CORS tainting. Resolves to null when the image cannot be embedded.
 */
export function loadImageData(src) {
  if (!src) return Promise.resolve(null);
  if (src.startsWith('data:')) return Promise.resolve(src);
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      (async () => {
        try {
          const res = await fetch(src, { mode: 'cors', credentials: 'same-origin' });
          if (!res.ok) return null;
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) return null;
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        } catch (_) {
          return null;
        }
      })()
    );
  }
  return imageCache.get(src);
}

// ---- layout ----------------------------------------------------------------

const HEADING = /^H[1-6]$/;

function marginBottom(el) {
  return parseFloat(getComputedStyle(el).marginBottom) || 0;
}

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function slideShell({ width, height, options, category, hero, bgImage, pageLabel, title }) {
  const bg = BACKGROUNDS[options.background];
  const unit = Math.sqrt(width * height);
  const base = unit * 0.032 * options.textScale;
  const pad = Math.round(width * options.padding);

  const slide = el('div', 'ms-slide');
  slide.style.width = `${width}px`;
  slide.style.height = `${height}px`;
  slide.style.setProperty('--ms-base', `${base}px`);
  slide.style.setProperty('--ms-pad', `${pad}px`);
  slide.style.setProperty('--ms-fg', bg.text);
  slide.style.setProperty('--ms-muted', bg.muted);
  slide.style.setProperty('--ms-rule', bg.rule);
  slide.style.setProperty('--ms-card', bg.card);
  slide.style.background = options.background === 'solid' ? options.solidColor : bg.css;
  slide.setAttribute('role', 'img');
  slide.setAttribute('aria-label', title ? `Post image: ${title}` : 'Post image');

  if (bgImage) {
    const layer = el('div', 'ms-slide__bg');
    layer.style.backgroundImage = `url("${bgImage}")`;
    slide.appendChild(layer);
    const shade = el('div', 'ms-slide__shade');
    shade.style.background =
      options.background === 'light'
        ? 'linear-gradient(180deg, rgba(244,244,244,.9), rgba(244,244,244,.94))'
        : 'linear-gradient(180deg, rgba(6,10,15,.78), rgba(6,10,15,.9))';
    slide.appendChild(shade);
  }

  const inner = el('div', 'ms-slide__inner');
  const head = el('header', 'ms-slide__head');
  if (options.logo) {
    const logo = el('div', 'ms-slide__logo');
    logo.innerHTML = '<span>Mods</span>Hub';
    head.appendChild(logo);
  } else {
    head.appendChild(el('span'));
  }
  if (category && category.name) {
    const pill = el('div', 'ms-slide__cat');
    pill.textContent = category.name;
    pill.style.setProperty('--cat', category.color || '#0087da');
    head.appendChild(pill);
  }
  inner.appendChild(head);

  if (hero) {
    const wrap = el('div', 'ms-slide__hero');
    const img = el('img');
    img.src = hero.src;
    img.alt = hero.alt || '';
    wrap.appendChild(img);
    inner.appendChild(wrap);
  }

  const body = el('div', 'ms-slide__body ms-prose ms-prose--slide');
  inner.appendChild(body);

  const foot = el('footer', 'ms-slide__foot');
  const site = el('span');
  site.textContent = 'modshub.io';
  const page = el('span', 'ms-slide__page');
  page.textContent = pageLabel || '';
  foot.append(site, page);
  inner.appendChild(foot);

  slide.appendChild(inner);
  return { slide, body, hero: inner.querySelector('.ms-slide__hero'), pageEl: page };
}

/**
 * @param {object} args
 * @param {string} args.html        sanitized post HTML
 * @param {{name: string, color?: string}|null} args.category
 * @param {{src: string, alt?: string}|null} args.image
 * @param {string} args.title
 * @param {object} args.options     image export options
 * @returns {Promise<{slides: HTMLElement[], width: number, height: number, warnings: string[], options: object}>}
 */
export async function layoutSlides({ html, category, image, title, options: rawOptions }) {
  const options = normalizeOptions(rawOptions);
  const warnings = [];
  const { width, height: presetHeight } = resolveSize(options);

  // Resolve every image up front so layout measures the real size.
  let heroSrc = null;
  let bgSrc = null;
  if (image && image.src && options.imageMode !== 'none') {
    const data = await loadImageData(image.src);
    if (data) {
      if (options.imageMode === 'background') bgSrc = data;
      else heroSrc = { src: data, alt: image.alt || '' };
    } else {
      warnings.push('The post image could not be embedded (the host blocks cross-site use). Upload it instead.');
    }
  }

  const host = el('div', 'ms-measure');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);

  const shell = slideShell({ width, height: presetHeight, options, category, hero: heroSrc, bgImage: bgSrc, pageLabel: '1 / 1', title });
  host.appendChild(shell.slide);
  shell.body.innerHTML = html;

  // Inline markdown images too.
  const inlineImages = [...shell.body.querySelectorAll('img')];
  await Promise.all(
    inlineImages.map(async (img) => {
      const src = img.getAttribute('src');
      const data = await loadImageData(src);
      if (data) {
        img.src = data;
        try {
          await img.decode();
        } catch (_) {
          /* decode errors surface as a broken image below */
        }
      } else {
        const note = el('em');
        note.textContent = `[image: ${img.alt || 'unavailable'}]`;
        img.replaceWith(note);
        warnings.push(`An image in the text could not be embedded: ${src}`);
      }
    })
  );
  if (shell.slide.querySelector('.ms-slide__hero img')) {
    try {
      await shell.slide.querySelector('.ms-slide__hero img').decode();
    } catch (_) {
      /* ignore */
    }
  }
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const body = shell.body;
  const heroHeight = shell.hero ? shell.hero.getBoundingClientRect().height + marginBottom(shell.hero) : 0;
  // Capacity is what the body gets when it is empty (flex: 1).
  const measured = [...body.children];
  measured.forEach((n) => n.remove());
  const capacityBase = body.clientHeight;
  measured.forEach((n) => body.appendChild(n));

  const heightOf = (node) => node.getBoundingClientRect().height + marginBottom(node);

  // Measures `node` inside the real body CSS, attaching it temporarily.
  const measureNode = (node) => {
    const attached = node.isConnected;
    if (!attached) body.appendChild(node);
    const h = heightOf(node);
    if (!attached) node.remove();
    return h;
  };

  const makeBlock = (node) => {
    const block = { node, height: measureNode(node) };
    if (HEADING.test(node.tagName)) {
      block.keepWithNext = true;
      block.minHeight = block.height;
      return block;
    }
    block.minHeight = block.height;
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const items = [...node.children];
      if (items.length > 1) {
        block.split = (room) => splitContainer(node, items, room, (clone, k) => {
          if (node.tagName === 'OL') clone.setAttribute('start', String((Number(node.getAttribute('start')) || 1) + k));
        });
        block.minHeight = Math.min(block.height, heightOf(items[0]) + 4);
      }
    } else if (node.tagName === 'TABLE') {
      const bodyEl = node.tBodies[0];
      const rows = bodyEl ? [...bodyEl.rows] : [];
      if (rows.length > 1) {
        block.split = (room) => splitTable(node, rows, room);
        block.minHeight = Math.min(block.height, 120);
      }
    } else if (node.tagName === 'PRE') {
      const code = node.querySelector('code');
      const lines = (code ? code.textContent : node.textContent).replace(/\n$/, '').split('\n');
      if (lines.length > 3) {
        block.split = (room) => splitCode(node, lines, room);
        block.minHeight = Math.min(block.height, 100);
      }
    }
    return block;
  };

  function splitContainer(node, items, room, fixTail) {
    const probe = node.cloneNode(false);
    body.appendChild(probe);
    const fits = (k) => {
      probe.replaceChildren(...items.slice(0, k).map((n) => n.cloneNode(true)));
      return heightOf(probe) <= room;
    };
    const k = largestFitting(items.length - 1, fits);
    probe.remove();
    if (k < 1) return null;
    const head = node.cloneNode(false);
    head.replaceChildren(...items.slice(0, k).map((n) => n.cloneNode(true)));
    const tail = node.cloneNode(false);
    tail.replaceChildren(...items.slice(k).map((n) => n.cloneNode(true)));
    if (fixTail) fixTail(tail, k);
    return { head: makeBlock(head), tail: makeBlock(tail) };
  }

  function splitTable(table, rows, room) {
    const build = (subset) => {
      const t = table.cloneNode(false);
      if (table.tHead) t.appendChild(table.tHead.cloneNode(true));
      const tb = document.createElement('tbody');
      subset.forEach((r) => tb.appendChild(r.cloneNode(true)));
      t.appendChild(tb);
      return t;
    };
    const probe = build([]);
    body.appendChild(probe);
    const fits = (k) => {
      const next = build(rows.slice(0, k));
      probe.replaceChildren(...next.childNodes);
      return heightOf(probe) <= room;
    };
    const k = largestFitting(rows.length - 1, fits);
    probe.remove();
    if (k < 1) return null;
    return { head: makeBlock(build(rows.slice(0, k))), tail: makeBlock(build(rows.slice(k))) };
  }

  function splitCode(pre, lines, room) {
    const build = (subset) => {
      const p = pre.cloneNode(false);
      const c = document.createElement('code');
      const original = pre.querySelector('code');
      if (original && original.className) c.className = original.className;
      c.textContent = `${subset.join('\n')}\n`;
      p.appendChild(c);
      return p;
    };
    const probe = build(['x']);
    body.appendChild(probe);
    const fits = (k) => {
      probe.replaceChildren(...build(lines.slice(0, k)).childNodes);
      return heightOf(probe) <= room;
    };
    const k = largestFitting(lines.length - 1, fits);
    probe.remove();
    if (k < 1) return null;
    return { head: makeBlock(build(lines.slice(0, k))), tail: makeBlock(build(lines.slice(k))) };
  }

  const blocks = [...body.children].map(makeBlock);
  // Detach blocks; each slide re-attaches the ones it owns.
  blocks.forEach((b) => b.node.remove());

  const slides = [];
  let height = presetHeight;

  if (options.layout === 'long') {
    const total = blocks.reduce((sum, b) => sum + b.height, 0);
    const overhead = presetHeight - capacityBase;
    height = Math.min(MAX_LONG_HEIGHT, Math.max(presetHeight, Math.ceil(overhead + heroHeight + total + 2)));
    if (overhead + heroHeight + total > MAX_LONG_HEIGHT) {
      warnings.push(`The text is longer than ${MAX_LONG_HEIGHT}px; the end was cut. Use "Several slides" instead.`);
    }
    const s = slideShell({ width, height, options, category, hero: heroSrc, bgImage: bgSrc, pageLabel: '', title });
    blocks.forEach((b) => s.body.appendChild(b.node));
    slides.push(s.slide);
  } else {
    const capacityFirst = Math.max(40, capacityBase - heroHeight);
    const { pages } = paginate(blocks, { capacityFirst, capacity: Math.max(40, capacityBase) });
    pages.forEach((page, i) => {
      const s = slideShell({
        width,
        height: presetHeight,
        options,
        category,
        hero: i === 0 ? heroSrc : null,
        bgImage: bgSrc,
        pageLabel: pages.length > 1 ? `${i + 1} / ${pages.length}` : '',
        title,
      });
      page.blocks.forEach((b) => s.body.appendChild(b.node));
      if (page.overflow) s.slide.dataset.overflow = '1';
      slides.push(s.slide);
    });
    if (pages.some((p) => p.overflow)) {
      warnings.push('One block is taller than a slide and was scaled down to fit. Consider the "Long image" layout.');
    }
  }

  // Slides that still overflow (one oversized unsplittable block) are scaled down.
  host.replaceChildren(...slides);
  if (options.layout === 'slides') {
    for (const slide of slides) {
      const slideBody = slide.querySelector('.ms-slide__body');
      const baseSize = parseFloat(slide.style.getPropertyValue('--ms-base'));
      let factor = 1;
      while (slideBody.scrollHeight > slideBody.clientHeight + 1 && factor > 0.5) {
        factor -= 0.05;
        slide.style.setProperty('--ms-base', `${baseSize * factor}px`);
      }
    }
  }
  slides.forEach((s) => s.remove());
  host.remove();
  return { slides, width, height, warnings, options };
}

// ---- rasterisation ---------------------------------------------------------

let fontCssPromise = null;

/** Embeds the Studio fonts once so every PNG uses them without network access. */
export function getFonts(node) {
  if (!fontCssPromise) {
    fontCssPromise = getFontEmbedCSS(node).catch(() => '');
  }
  return fontCssPromise;
}

const isSafari = () => /^((?!chrome|android).)*safari/i.test(globalThis.navigator ? navigator.userAgent : '');

/**
 * Rasterises one laid-out slide. The node is mounted off-screen at 1:1 for the
 * duration of the capture and removed afterwards.
 * @returns {Promise<Blob>} image/png
 */
export async function renderSlideBlob(slide, { width, height }) {
  const host = el('div', 'ms-render-host');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  const clone = slide.cloneNode(true);
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.transform = 'none';
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const fontEmbedCSS = await getFonts(clone);
    const opts = { width, height, pixelRatio: 1, cacheBust: false, fontEmbedCSS, style: { margin: '0' } };
    // Safari paints embedded images only on a second pass.
    if (isSafari()) await toBlob(clone, opts);
    const blob = await toBlob(clone, opts);
    if (!blob) throw new Error('The browser returned an empty image');
    return blob;
  } finally {
    host.remove();
  }
}

/** Bundles several PNGs into one stored ZIP. */
export async function zipBlobs(entries) {
  const files = {};
  for (const { name, blob } of entries) files[name] = new Uint8Array(await blob.arrayBuffer());
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped], { type: 'application/zip' });
}

/** Reads width/height from a PNG header; null when the bytes are not a PNG. */
export function readPngSize(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!bytes || bytes.length < 24) return null;
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== sig[i]) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
