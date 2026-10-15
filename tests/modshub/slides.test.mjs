import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, largestFitting } from '../../client/modshub/core/slides.js';
import { readPngSize, normalizeOptions, resolveSize, IMAGE_PRESETS } from '../../client/modshub/core/image-export.js';

const para = (id, height) => ({ id, height, minHeight: height });
const heading = (id, height) => ({ id, height, minHeight: height, keepWithNext: true });

/** A list of `n` items of `itemH` each, splittable between items. */
function list(id, n, itemH, startIndex = 0) {
  return {
    id,
    height: n * itemH,
    minHeight: itemH,
    items: n,
    start: startIndex,
    split(room) {
      const k = Math.min(n - 1, Math.floor(room / itemH));
      if (k < 1) return null;
      return { head: list(`${id}-a`, k, itemH, startIndex), tail: list(`${id}-b`, n - k, itemH, startIndex + k) };
    },
  };
}

const ids = (pages) => pages.map((p) => p.blocks.map((b) => b.id));

test('short post fits on one slide', () => {
  const { pages } = paginate([heading('h', 60), para('p1', 100), para('p2', 100)], { capacityFirst: 600, capacity: 600 });
  assert.equal(pages.length, 1);
  assert.deepEqual(ids(pages), [['h', 'p1', 'p2']]);
});

test('a heading is never stranded at the bottom of a slide', () => {
  const blocks = [para('p1', 500), heading('h', 60), para('p2', 200)];
  const { pages } = paginate(blocks, { capacityFirst: 600, capacity: 600 });
  assert.deepEqual(ids(pages), [['p1'], ['h', 'p2']]);
});

test('a paragraph that fits on the next slide is moved, not split', () => {
  const { pages } = paginate([para('p1', 400), para('p2', 300)], { capacityFirst: 600, capacity: 600 });
  assert.deepEqual(ids(pages), [['p1'], ['p2']]);
});

test('list items stay together when the list fits on a fresh slide', () => {
  const { pages } = paginate([para('p', 450), list('l', 4, 60)], { capacityFirst: 600, capacity: 600 });
  assert.deepEqual(ids(pages), [['p'], ['l']]);
});

test('a list taller than a slide is split between items and nothing is lost', () => {
  const { pages } = paginate([heading('h', 60), list('l', 25, 60)], { capacityFirst: 600, capacity: 600 });
  assert.ok(pages.length >= 3);
  assert.equal(pages[0].blocks[0].id, 'h');
  const total = pages.flatMap((p) => p.blocks).filter((b) => b.items).reduce((n, b) => n + b.items, 0);
  assert.equal(total, 25);
  for (const page of pages) assert.ok(page.used <= 600 + 0.5, `page overflow: ${page.used}`);
  // the heading shares its slide with the first list chunk
  assert.ok(pages[0].blocks.length >= 2);
});

test('first slide can have less room (hero image)', () => {
  const { pages } = paginate([para('p1', 300), para('p2', 300)], { capacityFirst: 350, capacity: 600 });
  assert.deepEqual(ids(pages), [['p1'], ['p2']]);
});

test('an unsplittable block taller than a slide is isolated and flagged', () => {
  const { pages } = paginate([para('a', 100), para('huge', 900), para('b', 100)], { capacityFirst: 600, capacity: 600 });
  assert.deepEqual(ids(pages), [['a'], ['huge'], ['b']]);
  assert.equal(pages[1].overflow, true);
  assert.equal(pages[0].overflow, false);
});

test('empty input yields one empty slide', () => {
  const { pages } = paginate([], { capacityFirst: 600, capacity: 600 });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].blocks.length, 0);
});

test('every block of a long post is placed exactly once and in order', () => {
  const blocks = [];
  for (let i = 0; i < 40; i += 1) {
    blocks.push(heading(`h${i}`, 50), para(`p${i}`, 90 + (i % 5) * 40));
  }
  const { pages } = paginate(blocks, { capacityFirst: 620, capacity: 700 });
  const flat = pages.flatMap((p) => p.blocks.map((b) => b.id));
  assert.deepEqual(flat, blocks.map((b) => b.id));
  for (const page of pages) {
    assert.ok(page.used <= 700 + 0.5);
    // never a lone heading at the end of a slide
    const last = page.blocks[page.blocks.length - 1];
    assert.ok(!last.keepWithNext || page.blocks.length === 1 || last === blocks[blocks.length - 1]);
  }
});

test('largestFitting is a binary search over a monotone predicate', () => {
  assert.equal(largestFitting(10, (k) => k <= 6), 6);
  assert.equal(largestFitting(10, () => true), 10);
  assert.equal(largestFitting(10, (k) => k === 0), 0);
});

test('export options: presets match the brief and custom values are clamped', () => {
  assert.deepEqual(resolveSize({ preset: 'square' }), { width: 1080, height: 1080 });
  assert.deepEqual(resolveSize({ preset: 'portrait' }), { width: 1080, height: 1350 });
  assert.deepEqual(resolveSize({ preset: 'landscape' }), { width: 1200, height: 630 });
  assert.deepEqual(resolveSize({ preset: 'story' }), { width: 1080, height: 1920 });
  assert.deepEqual(resolveSize({ preset: 'custom', customWidth: 99999, customHeight: 10 }), { width: 4096, height: 320 });
  assert.equal(normalizeOptions({ preset: 'nope' }).preset, 'square');
  assert.equal(Object.keys(IMAGE_PRESETS).length, 5);
});

test('PNG header reader', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  assert.deepEqual(readPngSize(new Uint8Array(png)), { width: 1, height: 1 });
  assert.equal(readPngSize(new Uint8Array([1, 2, 3])), null);
});
