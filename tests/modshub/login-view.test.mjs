import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ejs = require('ejs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const view = path.join(ROOT, 'views/admin/index.ejs');

// The site's routes pass a data key called `locals`, which shadows EJS' own
// `locals` inside templates - the login form must not rely on `locals.*`.
test('login form carries ?next=/modshub through the POST', async () => {
  const withNext = await ejs.renderFile(view, { locals: { title: 'Admin' }, nextUrl: '/modshub' });
  assert.match(withNext, /<input type="hidden" name="next" value="\/modshub">/);
  const without = await ejs.renderFile(view, { locals: { title: 'Admin' }, nextUrl: '' });
  assert.doesNotMatch(without, /name="next"/);
});
