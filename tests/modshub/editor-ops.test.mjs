import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toggleBold, toggleItalic, toggleStrike, toggleInlineCode, setHeading, toggleQuote, toggleBulletList,
  toggleNumberedList, toggleCodeBlock, insertLink, insertImage, insertTable, insertHorizontalRule,
  continueList, indentList,
} from '../../client/modshub/core/editor-ops.js';
import { History } from '../../client/modshub/core/history.js';

const sel = (value, start, end = start) => ({ value, start, end });
const run = (op, value, start, end, ...args) => op(sel(value, start, end), ...args);
const pick = (r) => r.value.slice(r.start, r.end);

test('bold wraps, unwraps (inside and outside) and never eats text', () => {
  let r = run(toggleBold, 'say hello now', 4, 9);
  assert.equal(r.value, 'say **hello** now');
  assert.equal(pick(r), 'hello');
  r = run(toggleBold, r.value, r.start, r.end);
  assert.equal(r.value, 'say hello now');
  r = run(toggleBold, 'say **hello** now', 4, 13); // selection includes markers
  assert.equal(r.value, 'say hello now');
});

test('bold and italic toggle independently on ***bold italic***', () => {
  const base = '***both***';
  const noBold = run(toggleBold, base, 3, 7);
  assert.equal(noBold.value, '*both*');
  const noItalic = run(toggleItalic, base, 3, 7);
  assert.equal(noItalic.value, '**both**');
  const addItalic = run(toggleItalic, '**x**', 2, 3);
  assert.equal(addItalic.value, '***x***');
});

test('markers hug the text: surrounding spaces stay outside', () => {
  const r = run(toggleBold, 'a  word  b', 1, 9);
  assert.equal(r.value, 'a  **word**  b');
});

test('empty selection expands to the word, or inserts a placeholder', () => {
  assert.equal(run(toggleItalic, 'hello world', 2, 2).value, '*hello* world');
  const r = run(toggleBold, '', 0, 0);
  assert.equal(r.value, '**bold text**');
  assert.equal(pick(r), 'bold text');
});

test('multi paragraph selection is wrapped per paragraph', () => {
  const r = run(toggleBold, 'one\n\ntwo', 0, 8);
  assert.equal(r.value, '**one**\n\n**two**');
});

test('strike and inline code', () => {
  assert.equal(run(toggleStrike, 'old news', 0, 3).value, '~~old~~ news');
  assert.equal(run(toggleStrike, '~~old~~ news', 2, 5).value, 'old news');
  assert.equal(run(toggleInlineCode, 'run npm test', 4, 12).value, 'run `npm test`');
  assert.equal(run(toggleInlineCode, 'a`b', 0, 3).value, '`` a`b ``');
});

test('headings set, switch and toggle off', () => {
  assert.equal(run(setHeading, 'Title', 0, 0, 1).value, '# Title');
  assert.equal(run(setHeading, '# Title', 0, 0, 2).value, '## Title');
  assert.equal(run(setHeading, '## Title', 0, 0, 2).value, 'Title');
  assert.equal(run(setHeading, 'a\nb', 0, 3, 3).value, '### a\n### b');
});

test('quote, bullets, numbers toggle on every selected line', () => {
  assert.equal(run(toggleQuote, 'a\nb', 0, 3).value, '> a\n> b');
  assert.equal(run(toggleQuote, '> a\n> b', 0, 7).value, 'a\nb');
  assert.equal(run(toggleBulletList, 'a\nb', 0, 3).value, '- a\n- b');
  assert.equal(run(toggleBulletList, '- a\n- b', 0, 7).value, 'a\nb');
  assert.equal(run(toggleNumberedList, 'a\nb\nc', 0, 5).value, '1. a\n2. b\n3. c');
  assert.equal(run(toggleNumberedList, '1. a\n2. b', 0, 9).value, 'a\nb');
  assert.equal(run(toggleBulletList, '1. a\n2. b', 0, 9).value, '- a\n- b');
  assert.equal(run(toggleBulletList, '  nested', 0, 0).value, '  - nested');
});

test('code block wraps, unwraps and respects existing backticks', () => {
  const r = run(toggleCodeBlock, 'const a = 1;', 0, 12);
  assert.equal(r.value, '```\nconst a = 1;\n```\n');
  assert.equal(run(toggleCodeBlock, r.value, 0, r.value.length).value.trim(), 'const a = 1;');
  assert.equal(run(toggleCodeBlock, 'x ``` y', 0, 7).value.startsWith('````\n'), true);
  assert.equal(run(toggleCodeBlock, '', 0, 0).value, '```\ncode\n```\n');
});

test('link, image, table, rule insert with the right placeholders', () => {
  let r = run(insertLink, 'see docs', 4, 8);
  assert.equal(r.value, 'see [docs](https://)');
  assert.equal(pick(r), 'https://');
  r = run(insertLink, 'https://modshub.io', 0, 18);
  assert.equal(r.value, '[link text](https://modshub.io)');
  assert.equal(pick(r), 'link text');
  r = run(insertImage, '', 0, 0);
  assert.equal(r.value, '![image description](https://)');
  r = run(insertTable, 'before', 6, 6);
  assert.match(r.value, /^before\n\n\| Column 1 \| Column 2 \| Column 3 \|\n\| --- \| --- \| --- \|/);
  r = run(insertHorizontalRule, 'a', 1, 1);
  assert.equal(r.value, 'a\n\n---\n');
});

test('Enter continues lists, increments numbers, exits on an empty item', () => {
  assert.equal(continueList(sel('- one', 5)).value, '- one\n- ');
  assert.equal(continueList(sel('9. nine', 7)).value, '9. nine\n10. ');
  assert.equal(continueList(sel('- [ ] task', 10)).value, '- [ ] task\n- [ ] ');
  assert.equal(continueList(sel('- one\n- ', 8)).value, '- one\n');
  assert.equal(continueList(sel('plain', 5)), null);
});

test('Tab indents and outdents list items only', () => {
  assert.equal(indentList(sel('- a', 3)).value, '  - a');
  assert.equal(indentList(sel('  - a', 5), true).value, '- a');
  assert.equal(indentList(sel('1. a', 4)).value, '   1. a');
  assert.equal(indentList(sel('plain', 5)), null);
});

test('history coalesces typing, keeps toolbar steps separate, and redo works', () => {
  const h = new History({ value: '', start: 0, end: 0 });
  h.push({ value: 'a', start: 1, end: 1 }, 'type', 1000);
  h.push({ value: 'ab', start: 2, end: 2 }, 'type', 1200);
  h.push({ value: '**ab**', start: 2, end: 4 }, 'action', 1300);
  assert.equal(h.undo().value, 'ab');
  assert.equal(h.undo().value, '');
  assert.equal(h.undo(), null);
  assert.equal(h.redo().value, 'ab');
  h.push({ value: 'abc', start: 3, end: 3 }, 'type', 5000);
  assert.equal(h.canRedo, false);
});
