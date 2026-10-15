/**
 * Slide pagination.
 *
 * Pure layout logic (no DOM) so it can be unit tested: given the measured
 * height of every block and the room available on a slide, decide which
 * blocks go on which slide.
 *
 * Rules, in priority order:
 *  1. A heading is never left at the bottom of a slide away from what follows
 *     it (`keepWithNext`).
 *  2. A block that fits on a fresh slide is moved there rather than split.
 *  3. Only blocks taller than a whole slide are split, and only at natural
 *     seams (list items, table rows, code lines) through `split`.
 *  4. A block that cannot be split and is taller than a slide gets a slide of
 *     its own and is flagged `overflow` so the renderer can shrink it to fit.
 *
 * @typedef {object} Block
 * @property {number} height            rendered height incl. bottom gap
 * @property {number} [minHeight]       smallest piece that may stand alone
 * @property {boolean} [keepWithNext]   heading-like block
 * @property {(room: number) => ({head: Block, tail: Block} | null)} [split]
 */

/**
 * @param {Block[]} blocks
 * @param {{capacityFirst: number, capacity: number}} opts room on the first slide / on the others
 * @returns {{pages: Array<{blocks: Block[], used: number, overflow: boolean}>}}
 */
export function paginate(blocks, { capacityFirst, capacity }) {
  const pages = [];
  const queue = [...blocks];
  let current = { blocks: [], used: 0, overflow: false };

  const capOf = () => (pages.length === 0 ? capacityFirst : capacity);
  const closePage = () => {
    pages.push(current);
    current = { blocks: [], used: 0, overflow: false };
  };
  const place = (block) => {
    current.blocks.push(block);
    current.used += block.height;
  };
  const validSplit = (parts, room) =>
    parts && parts.head && parts.tail && parts.head.height > 0 && parts.head.height <= room + 0.5;

  let guard = 0;
  while (queue.length > 0) {
    guard += 1;
    if (guard > 50000) throw new Error('paginate: layout did not converge');

    const block = queue.shift();
    const follower = queue[0];
    const cap = capOf();
    const room = cap - current.used;
    const empty = current.blocks.length === 0;
    const need = block.height + (block.keepWithNext && follower ? follower.minHeight ?? follower.height : 0);

    if (need <= room) {
      place(block);
      continue;
    }

    if (!empty) {
      // Prefer a fresh slide when the block (with its follower) fits there.
      if (need <= capacity) {
        closePage();
        queue.unshift(block);
        continue;
      }
      // Taller than a whole slide: use what is left of this one.
      if (block.split && room >= (block.minHeight ?? 0)) {
        const parts = block.split(room);
        if (validSplit(parts, room)) {
          place(parts.head);
          queue.unshift(parts.tail);
          closePage();
          continue;
        }
      }
      closePage();
      queue.unshift(block);
      continue;
    }

    // Empty slide and the block still does not fit.
    if (block.split) {
      const parts = block.split(room);
      if (validSplit(parts, room)) {
        place(parts.head);
        queue.unshift(parts.tail);
        closePage();
        continue;
      }
    }
    place(block);
    current.overflow = block.height > cap;
    closePage();
  }

  if (current.blocks.length > 0 || pages.length === 0) closePage();
  return { pages };
}

/** Largest k in [0, n] for which fits(k) is true. `fits` must be monotone. */
export function largestFitting(n, fits) {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
