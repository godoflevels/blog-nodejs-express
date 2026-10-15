import test from 'node:test';
import assert from 'node:assert/strict';
import { document } from './helpers/dom.mjs';
import { renderMarkdown, analyzeMarkdown } from '../../client/modshub/core/markdown.js';
import { sanitizeHtml } from '../../client/modshub/core/sanitize.js';
import { toPlainText } from '../../client/modshub/core/plaintext.js';
import { checkRichRoundTrip } from '../../client/modshub/core/rich.js';
import { checkCompatibility } from '../../client/modshub/core/compat.js';
import { countCharacters, countWords } from '../../client/modshub/core/stats.js';

const html = (md, opts) => sanitizeHtml(renderMarkdown(md, opts));

test('headings h1-h4', () => {
  const out = html('# One\n\n## Two\n\n### Three\n\n#### Four');
  assert.match(out, /<h1>One<\/h1>/);
  assert.match(out, /<h2>Two<\/h2>/);
  assert.match(out, /<h3>Three<\/h3>/);
  assert.match(out, /<h4>Four<\/h4>/);
});

test('bold with ** and __', () => {
  assert.match(html('**bold**'), /<strong>bold<\/strong>/);
  assert.match(html('__bold__'), /<strong>bold<\/strong>/);
});

test('italic with * and _', () => {
  assert.match(html('*italic*'), /<em>italic<\/em>/);
  assert.match(html('_italic_'), /<em>italic<\/em>/);
});

test('bold italic with *** and ___', () => {
  for (const src of ['***both***', '___both___']) {
    const out = html(src);
    assert.match(out, /<em><strong>both<\/strong><\/em>|<strong><em>both<\/em><\/strong>/, src);
  }
});

test('nested emphasis combinations', () => {
  assert.match(html('**bold with *italic* inside**'), /<strong>bold with <em>italic<\/em> inside<\/strong>/);
  assert.match(html('*italic with **bold** inside*'), /<em>italic with <strong>bold<\/strong> inside<\/em>/);
  assert.match(html('~~strikethrough~~'), /<s>strikethrough<\/s>/);
  assert.match(html('~~**bold gone**~~'), /<s><strong>bold gone<\/strong><\/s>/);
});

test('emphasis combos from the brief all render together in one document', () => {
  const src = '***a*** ___b___ **c *d* e** *f **g** h* ~~i~~ **j** _k_';
  const out = html(src);
  assert.doesNotMatch(out, /[*_]{2,}/, 'no stray markers left in output');
  assert.equal((out.match(/<strong>/g) || []).length, 5);
});

test('nested lists keep their structure', () => {
  const out = html('- one\n  - nested a\n  - nested b\n    - deep\n- two\n\n1. first\n2. second');
  assert.match(out, /<ul>\s*<li>one\s*<ul>\s*<li>nested a<\/li>\s*<li>nested b\s*<ul>\s*<li>deep<\/li>/);
  assert.match(out, /<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
  assert.equal(analyzeMarkdown('- a\n  - b').nestedList, true);
});

test('task lists render as disabled checkboxes', () => {
  const out = html('- [x] done\n- [ ] todo');
  assert.match(out, /<input[^>]*checked[^>]*>/);
  assert.equal((out.match(/<input/g) || []).length, 2);
  assert.match(out, /disabled/);
});

test('links are clickable and safe', () => {
  const out = html('[ModsHub](https://modshub.io/)');
  assert.match(out, /<a href="https:\/\/modshub\.io\/" target="_blank" rel="noopener noreferrer">ModsHub<\/a>/);
  assert.match(html('https://example.com'), /<a href="https:\/\/example\.com"/);
  const bad = html('[x](javascript:alert(1))');
  assert.doesNotMatch(bad, /<a /);
  assert.doesNotMatch(bad, /href=/);
});

test('blockquote', () => {
  assert.match(html('> quoted *text*'), /<blockquote>\s*<p>quoted <em>text<\/em><\/p>\s*<\/blockquote>/);
});

test('inline code and fenced code with language', () => {
  assert.match(html('use `npm test` now'), /<code>npm test<\/code>/);
  const out = html('```js\nconst a = "<b>";\n```');
  assert.match(out, /<pre data-lang="js"><code class="language-js">const a = "&lt;b&gt;";\n<\/code><\/pre>/);
});

test('horizontal rule', () => {
  assert.match(html('before\n\n---\n\nafter'), /<hr>/);
});

test('tables', () => {
  const out = html('| Name | Qty |\n| --- | ---: |\n| Car | 2 |');
  assert.match(out, /<table>/);
  assert.match(out, /<th>Name<\/th>/);
  assert.match(out, /<td>Car<\/td>/);
});

test('images', () => {
  const out = html('![preview](https://example.com/a.png)');
  assert.match(out, /<img src="https:\/\/example\.com\/a\.png" alt="preview">/);
});

test('unicode, cyrillic and emoji survive untouched', () => {
  const src = '# Привет, мир!\n\nНовый **мод** 🚗 для GTA V — 你好 ¡Hola! 👨‍👩‍👧‍👦';
  const out = html(src);
  assert.match(out, /Привет, мир!/);
  assert.match(out, /<strong>мод<\/strong> 🚗/);
  assert.ok(out.includes('👨‍👩‍👧‍👦'));
  const plain = toPlainText(src);
  assert.ok(plain.includes('Привет, мир!'));
  assert.ok(plain.includes('👨‍👩‍👧‍👦'));
  assert.equal(countCharacters('👨‍👩‍👧‍👦'), 1);
  assert.equal(countWords('Новый мод для GTA V'), 5);
});

test('line breaks: soft breaks preserved, extra blank lines kept', () => {
  assert.match(html('one\ntwo'), /one<br>\s*two/);
  assert.doesNotMatch(html('one\ntwo', { breaks: false }), /<br>/);
  const gaps = html('one\n\n\n\ntwo');
  assert.equal((gaps.match(/class="md-gap"/g) || []).length, 2);
  assert.doesNotMatch(html('one\n\n\n\ntwo', { preserveBlankLines: false }), /md-gap/);
});

test('raw HTML and scripts are never executed', () => {
  const nasty = '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[a](data:text/html;base64,PHNjcmlwdD4=)\n\n<a href="javascript:alert(1)">x</a>\n\n[b](javascript:alert(2))\n\n![c](javascript:alert(3))';
  const out = html(nasty);
  // Inspect the real DOM: the payload may exist only as escaped text.
  const host = document.createElement('div');
  host.innerHTML = out;
  assert.equal(host.querySelectorAll('script, iframe, object, embed, img, style, form').length, 0);
  assert.equal(host.querySelectorAll('a').length, 0);
  for (const el of host.querySelectorAll('*')) {
    for (const attr of el.attributes) assert.doesNotMatch(attr.name, /^on/i);
  }
  assert.ok(host.textContent.includes('<script>alert(1)</script>'));
  assert.equal(analyzeMarkdown(nasty).rawHtml, true);
});

test('sanitizer strips dangerous markup from arbitrary HTML as a second line of defence', () => {
  const out = sanitizeHtml('<p onclick="x()">hi</p><script>1</script><iframe src="//e"></iframe><a href="javascript:1">l</a><img src="javascript:1">');
  assert.equal(out, '<p>hi</p><a>l</a><img>');
});

test('plain text export removes markers but keeps meaning', () => {
  const src = [
    '# Title',
    '',
    'This is **bold**, *italic* and ***both*** and ~~gone~~ with `code`.',
    '',
    '- one',
    '  - nested',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '> quote',
    '',
    '[ModsHub](https://modshub.io/)',
    '',
    '---',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
  ].join('\n');
  const plain = toPlainText(src);
  assert.match(plain, /^Title\n\nThis is bold, italic and both and gone with code\.\n\n• one\n {2}• nested\n• two\n\n1\. first\n2\. second\n\n│ quote\n\nModsHub \(https:\/\/modshub\.io\/\)\n\n─+\n\na \| b\n1 \| 2$/);
  assert.doesNotMatch(plain, /[*_~`#>]/);
});

test('plain text keeps hard line breaks and spacing between paragraphs', () => {
  assert.equal(toPlainText('a\nb\n\nc'), 'a\nb\n\nc');
  assert.equal(toPlainText('a\n\n\n\nb'), 'a\n\n\n\nb');
});

test('rich text round trip is lossless for typical posts', () => {
  const docs = [
    '# New update\n\nThis is **bold**, *italic* and ***bold italic***.',
    '- one\n  - nested\n- two\n\n1. a\n2. b',
    '> quote\n\n```js\nconst x = 1;\n```\n\n---',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    'Привет **мир** 🚗',
    'one\n\n\n\ntwo',
  ];
  for (const doc of docs) {
    const res = checkRichRoundTrip(doc);
    assert.equal(res.lossless, true, doc);
  }
});

test('rich round trip never silently accepts a change: markdown it cannot represent is flagged', () => {
  const res = checkRichRoundTrip('text <b>raw</b> text');
  // Raw HTML is escaped by both passes so the *rendering* is stable, but the
  // analysis must still tell the user about it.
  assert.equal(analyzeMarkdown('text <b>raw</b> text').rawHtml, true);
  assert.ok(res.html.includes('&lt;b&gt;'));
});

test('compatibility warnings per target profile', () => {
  const src = '# H\n\n| a |\n| - |\n| 1 |\n\n- [x] t';
  const tg = checkCompatibility(src, 'telegram').map((w) => w.feature);
  assert.ok(tg.includes('headings'));
  assert.ok(tg.includes('table'));
  assert.ok(tg.includes('taskList'));
  assert.deepEqual(checkCompatibility(src, 'gfm'), []);
  assert.ok(checkCompatibility('<b>x</b>', 'gfm').some((w) => w.feature === 'rawHtml'));
});
