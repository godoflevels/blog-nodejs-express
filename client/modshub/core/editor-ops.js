/**
 * Toolbar / keyboard operations for the Markdown source editor.
 *
 * Every operation is a pure function `(sel, ...args) => sel` where
 * `sel = { value, start, end }` (selection offsets in UTF-16 code units, as in
 * <textarea>). Nothing here touches the DOM, which keeps them testable and
 * guarantees an operation only inserts/removes the markers it is responsible
 * for - the rest of the text is never rewritten.
 *
 * These helpers edit *text*; rendering Markdown is always markdown-it's job.
 */

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function replaceRange(value, from, to, text) {
  return value.slice(0, from) + text + value.slice(to);
}

function lineStartOf(value, index) {
  return value.lastIndexOf('\n', index - 1) + 1;
}

function lineEndOf(value, index) {
  const i = value.indexOf('\n', index);
  return i === -1 ? value.length : i;
}

/** [from, to) covering every line touched by the selection. */
function selectedLinesRange(value, start, end) {
  const from = lineStartOf(value, start);
  // A selection that ends at the very start of a line does not include it.
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  return [from, lineEndOf(value, effectiveEnd)];
}

function expandToWord(value, start, end) {
  if (start !== end) return [start, end];
  let a = start;
  let b = end;
  while (a > 0 && WORD_CHAR.test(value[a - 1])) a -= 1;
  while (b < value.length && WORD_CHAR.test(value[b])) b += 1;
  return [a, b];
}

function runBefore(value, index, ch) {
  let n = 0;
  while (index - 1 - n >= 0 && value[index - 1 - n] === ch) n += 1;
  return n;
}

function runAfter(value, index, ch) {
  let n = 0;
  while (index + n < value.length && value[index + n] === ch) n += 1;
  return n;
}

function leadingRun(text, ch) {
  let n = 0;
  while (n < text.length && text[n] === ch) n += 1;
  return n;
}

function trailingRun(text, ch) {
  let n = 0;
  while (n < text.length && text[text.length - 1 - n] === ch) n += 1;
  return n;
}

/**
 * Wraps/unwraps with emphasis markers, aware of `*` / `_` run lengths so
 * bold and italic can be toggled independently on `***text***`.
 * @param {'bold'|'italic'} kind
 */
function toggleEmphasis(sel, kind) {
  let { value, start, end } = sel;
  const need = kind === 'bold' ? 2 : 1;
  const add = kind === 'bold' ? '**' : '*';
  const placeholder = kind === 'bold' ? 'bold text' : 'italic text';
  const removable = (run) => (kind === 'bold' ? run >= 2 : run % 2 === 1);

  [start, end] = expandToWord(value, start, end);
  let selected = value.slice(start, end);

  // Keep markers hugging the text: `** word **` would not render as bold.
  const leadWs = selected.length - selected.trimStart().length;
  const trailWs = selected.length - selected.trimEnd().length;
  if (leadWs + trailWs < selected.length) {
    start += leadWs;
    end -= trailWs;
    selected = value.slice(start, end);
  }

  for (const ch of ['*', '_']) {
    // Markers inside the selection: user selected `**text**` itself.
    const lead = leadingRun(selected, ch);
    const trail = trailingRun(selected, ch);
    const inner = Math.min(lead, trail);
    if (inner > 0 && selected.length > lead + trail && removable(inner)) {
      const next = replaceRange(value, start, end, selected.slice(need, selected.length - need));
      return { value: next, start, end: end - need * 2 };
    }
    // Markers outside the selection.
    const left = runBefore(value, start, ch);
    const right = runAfter(value, end, ch);
    const outer = Math.min(left, right);
    if (outer > 0 && selected.length > 0 && removable(outer)) {
      const next = value.slice(0, start - need) + selected + value.slice(end + need);
      return { value: next, start: start - need, end: end - need };
    }
  }

  if (selected.length === 0) {
    const text = add + placeholder + add;
    const next = replaceRange(value, start, end, text);
    return { value: next, start: start + add.length, end: start + add.length + placeholder.length };
  }
  // Wrap each paragraph separately so markers never span a blank line.
  if (/\n\s*\n/.test(selected)) {
    const wrapped = selected
      .split(/(\n\s*\n)/)
      .map((part, i) => (i % 2 === 1 || part.trim() === '' ? part : add + part + add))
      .join('');
    return { value: replaceRange(value, start, end, wrapped), start, end: start + wrapped.length };
  }
  const next = replaceRange(value, start, end, add + selected + add);
  return { value: next, start: start + add.length, end: end + add.length };
}

export const toggleBold = (sel) => toggleEmphasis(sel, 'bold');
export const toggleItalic = (sel) => toggleEmphasis(sel, 'italic');

function toggleSimpleWrap(sel, marker, placeholder) {
  let { value, start, end } = sel;
  [start, end] = expandToWord(value, start, end);
  let selected = value.slice(start, end);
  const leadWs = selected.length - selected.trimStart().length;
  const trailWs = selected.length - selected.trimEnd().length;
  if (leadWs + trailWs < selected.length) {
    start += leadWs;
    end -= trailWs;
    selected = value.slice(start, end);
  }
  const m = marker.length;
  if (selected.length > 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    return {
      value: replaceRange(value, start, end, selected.slice(m, selected.length - m)),
      start,
      end: end - 2 * m,
    };
  }
  if (selected.length > 0 && value.slice(start - m, start) === marker && value.slice(end, end + m) === marker) {
    return {
      value: value.slice(0, start - m) + selected + value.slice(end + m),
      start: start - m,
      end: end - m,
    };
  }
  if (selected.length === 0) {
    const next = replaceRange(value, start, end, marker + placeholder + marker);
    return { value: next, start: start + m, end: start + m + placeholder.length };
  }
  return { value: replaceRange(value, start, end, marker + selected + marker), start: start + m, end: end + m };
}

export const toggleStrike = (sel) => toggleSimpleWrap(sel, '~~', 'strikethrough');

export function toggleInlineCode(sel) {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);
  // A selection containing backticks needs a longer delimiter.
  if (selected.includes('`') && !/^(`+) .* \1$/.test(selected)) {
    const next = replaceRange(value, start, end, `\`\` ${selected} \`\``);
    return { value: next, start: start + 3, end: end + 3 };
  }
  return toggleSimpleWrap(sel, '`', 'code');
}

// ---- line based operations --------------------------------------------------

function mapLines(sel, fn) {
  const { value, start, end } = sel;
  const [from, to] = selectedLinesRange(value, start, end);
  const lines = value.slice(from, to).split('\n');
  const mapped = fn(lines);
  const text = mapped.join('\n');
  const next = replaceRange(value, from, to, text);
  const delta = text.length - (to - from);
  const collapsed = start === end;
  return {
    value: next,
    start: collapsed ? Math.max(from, start + (mapped[0].length - lines[0].length)) : from,
    end: collapsed ? Math.max(from, end + (mapped[0].length - lines[0].length)) : end + delta,
  };
}

const HEADING_PREFIX = /^(#{1,6})[ \t]+/;
const BULLET_PREFIX = /^(\s*)([-*+])[ \t]+/;
const ORDERED_PREFIX = /^(\s*)(\d+)[.)][ \t]+/;
const QUOTE_PREFIX = /^(\s*)>[ \t]?/;

export function setHeading(sel, level) {
  return mapLines(sel, (lines) => {
    const wanted = '#'.repeat(level);
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    const allSame = nonEmpty.length > 0 && nonEmpty.every((l) => (HEADING_PREFIX.exec(l) || [])[1] === wanted);
    return lines.map((line) => {
      if (line.trim() === '') return line;
      const stripped = line.replace(HEADING_PREFIX, '');
      return allSame ? stripped : `${wanted} ${stripped}`;
    });
  });
}

export function toggleQuote(sel) {
  return mapLines(sel, (lines) => {
    const all = lines.every((l) => QUOTE_PREFIX.test(l));
    return lines.map((l) => (all ? l.replace(QUOTE_PREFIX, '$1') : l.trim() === '' ? '>' : `> ${l}`));
  });
}

export function toggleBulletList(sel) {
  return mapLines(sel, (lines) => {
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    const all = nonEmpty.length > 0 && nonEmpty.every((l) => BULLET_PREFIX.test(l));
    return lines.map((l) => {
      if (l.trim() === '') return l;
      if (all) return l.replace(BULLET_PREFIX, '$1');
      const indent = /^\s*/.exec(l)[0];
      const rest = l.slice(indent.length).replace(/^\d+[.)][ \t]+/, '');
      return `${indent}- ${rest}`;
    });
  });
}

export function toggleNumberedList(sel) {
  return mapLines(sel, (lines) => {
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    const all = nonEmpty.length > 0 && nonEmpty.every((l) => ORDERED_PREFIX.test(l));
    let n = 0;
    return lines.map((l) => {
      if (l.trim() === '') return l;
      if (all) return l.replace(ORDERED_PREFIX, '$1');
      n += 1;
      const indent = /^\s*/.exec(l)[0];
      const rest = l.slice(indent.length).replace(/^[-*+][ \t]+/, '');
      return `${indent}${n}. ${rest}`;
    });
  });
}

export function toggleTaskList(sel) {
  return mapLines(sel, (lines) => {
    const TASK = /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/;
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    const all = nonEmpty.length > 0 && nonEmpty.every((l) => TASK.test(l));
    return lines.map((l) => {
      if (l.trim() === '') return l;
      if (all) return l.replace(TASK, '$1- ');
      const indent = /^\s*/.exec(l)[0];
      const rest = l.slice(indent.length).replace(/^[-*+][ \t]+/, '').replace(/^\d+[.)][ \t]+/, '');
      return `${indent}- [ ] ${rest}`;
    });
  });
}

// ---- block insertion --------------------------------------------------------

/** Inserts a block surrounded by blank lines, without duplicating existing ones. */
function insertBlock(sel, block, selectInside) {
  const { value, start, end } = sel;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const needBefore = before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const needAfter = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const text = needBefore + block + needAfter;
  const next = before + text + after;
  const base = before.length + needBefore.length;
  const inside = selectInside || [block.length, block.length];
  return { value: next, start: base + inside[0], end: base + inside[1] };
}

export function insertHorizontalRule(sel) {
  const res = insertBlock({ ...sel, end: sel.end }, '---');
  return { ...res, start: res.end, end: res.end };
}

export function insertTable(sel) {
  const block = '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |';
  return insertBlock(sel, block, [2, 10]);
}

export function toggleCodeBlock(sel) {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);

  // Already inside a fence: selection includes both fence lines.
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(selected.trim());
  if (fenced) {
    return { value: replaceRange(value, start, end, fenced[1]), start, end: start + fenced[1].length };
  }
  // Cursor/selection between a pair of fence lines.
  const [from, to] = selectedLinesRange(value, start, end);
  const prevLineEnd = from - 1;
  const prevLineStart = prevLineEnd >= 0 ? lineStartOf(value, prevLineEnd) : -1;
  const nextLineStart = to + 1;
  if (prevLineStart >= 0 && nextLineStart <= value.length) {
    const prevLine = value.slice(prevLineStart, prevLineEnd);
    const nextLine = value.slice(nextLineStart, lineEndOf(value, nextLineStart));
    if (/^```[^`]*$/.test(prevLine) && /^```\s*$/.test(nextLine)) {
      const next = value.slice(0, prevLineStart) + value.slice(from, to) + value.slice(lineEndOf(value, nextLineStart));
      return { value: next, start: prevLineStart, end: prevLineStart + (to - from) };
    }
  }
  if (selected.length === 0) {
    return insertBlock(sel, '```\ncode\n```', [4, 8]);
  }
  const body = selected.replace(/\n$/, '');
  // A longer fence if the code itself contains ```
  let fence = '```';
  while (body.includes(fence)) fence += '`';
  const block = `${fence}\n${body}\n${fence}`;
  return insertBlock(sel, block, [fence.length + 1, fence.length + 1 + body.length]);
}

export function insertLink(sel) {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    const text = 'link text';
    const out = `[${text}](${selected})`;
    return { value: replaceRange(value, start, end, out), start: start + 1, end: start + 1 + text.length };
  }
  if (selected.length > 0) {
    const out = `[${selected}](https://)`;
    const urlStart = start + selected.length + 3;
    return { value: replaceRange(value, start, end, out), start: urlStart, end: urlStart + 'https://'.length };
  }
  const out = '[link text](https://)';
  return { value: replaceRange(value, start, end, out), start: start + 1, end: start + 1 + 'link text'.length };
}

export function insertImage(sel) {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);
  const alt = selected || 'image description';
  const out = `![${alt}](https://)`;
  const urlStart = start + 2 + alt.length + 2;
  return { value: replaceRange(value, start, end, out), start: urlStart, end: urlStart + 'https://'.length };
}

export function insertText(sel, text) {
  const { value, start, end } = sel;
  return { value: replaceRange(value, start, end, text), start: start + text.length, end: start + text.length };
}

// ---- Enter / Tab in lists ---------------------------------------------------

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/;

/**
 * Enter at the end of a list item continues the list; Enter on an empty item
 * ends it. Returns null when the default Enter behaviour should run.
 */
export function continueList(sel) {
  const { value, start, end } = sel;
  if (start !== end) return null;
  const from = lineStartOf(value, start);
  const to = lineEndOf(value, start);
  if (start !== to) return null; // only at end of line
  const line = value.slice(from, to);
  const m = LIST_LINE.exec(line);
  if (!m) return null;
  const [, indent, marker, space, task, rest] = m;
  if (rest.trim() === '' && !task) {
    // Empty item: leave the list.
    const next = replaceRange(value, from, to, '');
    return { value: next, start: from, end: from };
  }
  let nextMarker = marker;
  const ordered = /^\d+/.exec(marker);
  if (ordered) nextMarker = `${Number(ordered[0]) + 1}${marker.slice(ordered[0].length)}`;
  const insertion = `\n${indent}${nextMarker}${space}${task ? '[ ] ' : ''}`;
  const next = replaceRange(value, start, end, insertion);
  const caret = start + insertion.length;
  return { value: next, start: caret, end: caret };
}

/** Tab / Shift+Tab on list lines. Returns null when not on a list. */
export function indentList(sel, outdent = false) {
  const { value, start, end } = sel;
  const [from, to] = selectedLinesRange(value, start, end);
  const lines = value.slice(from, to).split('\n');
  if (!lines.every((l) => l.trim() === '' || LIST_LINE.test(l))) return null;
  const width = (l) => {
    const m = LIST_LINE.exec(l);
    return m ? m[2].length + m[3].length : 2;
  };
  let delta0 = 0;
  const mapped = lines.map((l, i) => {
    if (l.trim() === '') return l;
    if (outdent) {
      const strip = Math.min(width(l), /^ */.exec(l)[0].length);
      if (i === 0) delta0 = -strip;
      return l.slice(strip);
    }
    const pad = ' '.repeat(width(l));
    if (i === 0) delta0 = pad.length;
    return pad + l;
  });
  const text = mapped.join('\n');
  const next = replaceRange(value, from, to, text);
  const total = text.length - (to - from);
  return {
    value: next,
    start: Math.max(from, start + delta0),
    end: start === end ? Math.max(from, end + delta0) : end + total,
  };
}
