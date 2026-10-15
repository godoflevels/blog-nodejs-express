import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseImportFiles, decodeText, titleFromFilename, IMPORT_LIMITS } from '../../client/modshub/core/import-files.js';
import { JSON_TEMPLATE } from '../../client/modshub/core/json-io.js';

const bytes = (s) => new TextEncoder().encode(s);

test('md/txt files become drafts with the file name as title and untouched markdown', () => {
  const src = '# Заголовок\r\n\r\nТекст **жирный** 🚗\r\n';
  const out = parseImportFiles([{ name: 'new_graphics-pack.md', bytes: bytes(src) }]);
  assert.equal(out.texts.length, 1);
  assert.equal(out.texts[0].title, 'new graphics-pack');
  assert.equal(out.texts[0].content, '# Заголовок\n\nТекст **жирный** 🚗\n');
  assert.deepEqual(out.problems, []);
});

test('title from file name', () => {
  assert.equal(titleFromFilename('C:\\posts\\Мой_пост.txt'), 'Мой пост');
  assert.equal(titleFromFilename('.md'), 'Imported post');
});

test('encodings: BOM, utf-16 and windows-1251 fallback', () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).text, 'A');
  const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
  assert.equal(decodeText(utf16).text, 'AB');
  const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет"
  const res = decodeText(cp1251);
  assert.equal(res.text, 'Привет');
  assert.equal(res.encoding, 'windows-1251');
  assert.ok(res.warning);
});

test('json file is parsed with validation', () => {
  const out = parseImportFiles([{ name: 'posts.json', bytes: bytes(JSON.stringify(JSON_TEMPLATE)) }], { defaultTimezone: 'UTC' });
  assert.equal(out.jsons[0].parsed.ok, true);
  assert.equal(out.jsons[0].parsed.posts.length, 1);
});

test('zip with several posts: md, txt and json are read, junk is ignored', () => {
  const zip = zipSync({
    'one.md': strToU8('# One'),
    'folder/two.txt': strToU8('Two'),
    'posts.json': strToU8(JSON.stringify(JSON_TEMPLATE)),
    '__MACOSX/._one.md': strToU8('junk'),
    '.DS_Store': strToU8('junk'),
    'image.png': new Uint8Array([1, 2, 3]),
  });
  const out = parseImportFiles([{ name: 'bundle.zip', bytes: zip }], { defaultTimezone: 'UTC' });
  assert.deepEqual(out.texts.map((t) => t.title).sort(), ['one', 'two']);
  assert.equal(out.jsons.length, 1);
  assert.deepEqual(out.problems, []);
});

test('limits: oversize text, unsupported type, bad zip, too many files', () => {
  const big = new Uint8Array(IMPORT_LIMITS.textBytes + 1);
  assert.match(parseImportFiles([{ name: 'big.txt', bytes: big }]).problems[0].message, /larger than/);
  assert.match(parseImportFiles([{ name: 'a.exe', bytes: bytes('x') }]).problems[0].message, /Unsupported/);
  assert.match(parseImportFiles([{ name: 'a.zip', bytes: bytes('not a zip') }]).problems[0].message, /Cannot read ZIP/);
  const many = Array.from({ length: IMPORT_LIMITS.files + 1 }, (_, i) => ({ name: `${i}.md`, bytes: bytes('x') }));
  assert.match(parseImportFiles(many).problems[0].message, /Too many files/);
});

test('a zip bomb style archive is refused before inflating', () => {
  const files = {};
  for (let i = 0; i < 30; i += 1) files[`f${i}.txt`] = new Uint8Array(900 * 1024).fill(97);
  const zip = zipSync(files);
  const out = parseImportFiles([{ name: 'bomb.zip', bytes: zip }]);
  assert.equal(out.texts.length, 0);
  assert.match(out.problems[0].message, /expands/);
});
