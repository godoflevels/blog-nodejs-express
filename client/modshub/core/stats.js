/**
 * Character / word counters that behave for Unicode: graphemes (so an emoji
 * with a skin tone or a flag is one character) and Intl word segmentation
 * (works for Cyrillic and CJK, unlike splitting on spaces).
 */

let graphemeSegmenter = null;
let wordSegmenter = null;

function segmenters() {
  if (graphemeSegmenter === null && typeof Intl !== 'undefined' && Intl.Segmenter) {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  }
}

export function countCharacters(text) {
  segmenters();
  if (!graphemeSegmenter) return [...text].length;
  let n = 0;
  // eslint-disable-next-line no-unused-vars
  for (const _ of graphemeSegmenter.segment(text)) n += 1;
  return n;
}

export function countWords(text) {
  segmenters();
  if (!wordSegmenter) return (text.trim().match(/\S+/gu) || []).length;
  let n = 0;
  for (const seg of wordSegmenter.segment(text)) if (seg.isWordLike) n += 1;
  return n;
}

export function textStats(text) {
  return { characters: countCharacters(text), words: countWords(text) };
}
