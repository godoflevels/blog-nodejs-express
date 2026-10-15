import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const express = require('express');
const jwt = require('jsonwebtoken');
const { createModshubRouter } = require('../../server/modshub');
const { createMemoryStore } = require('../../server/modshub/store.memory');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SECRET = 'test-secret';
const store = createMemoryStore();
let server;
let base;

const cookieFor = (userId) => `token=${jwt.sign({ userId }, SECRET)}`;
const ALICE = cookieFor('alice');
const BOB = cookieFor('bob');

async function call(method, url, { cookie = ALICE, body, headers = {}, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const mkPost = (over = {}) => ({
  title: 'A post',
  scheduledAt: '2026-10-20T15:00:00.000Z',
  timezone: 'Europe/Moscow',
  status: 'planned',
  category: 'updates',
  tags: ['a'],
  content: '# Hi\n\n**bold** Привет 🚗',
  image: null,
  notes: '',
  ...over,
});

before(async () => {
  const app = express();
  app.set('views', path.join(ROOT, 'views'));
  app.set('view engine', 'ejs');
  app.use('/modshub', createModshubRouter({ store, jwtSecret: SECRET }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/modshub`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('page requires login and sends a strict CSP', async () => {
  const anon = await call('GET', '/', { cookie: null });
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.get('location'), '/admin?next=%2Fmodshub');
  const ok = await call('GET', '/');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(ok.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(ok.text, /ModsHub/);
});

test('API rejects missing or forged tokens', async () => {
  assert.equal((await call('GET', '/api/bootstrap', { cookie: null })).status, 401);
  const forged = `token=${jwt.sign({ userId: 'alice' }, 'wrong-secret')}`;
  assert.equal((await call('GET', '/api/bootstrap', { cookie: forged })).status, 401);
});

test('bootstrap on an empty account returns defaults', async () => {
  const res = await call('GET', '/api/bootstrap');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.posts, []);
  assert.equal(res.json.settings.categories.length, 8);
  assert.equal(res.json.settings.revision, 0);
});

test('create, update with revision, and conflict detection', async () => {
  const created = await call('PUT', '/api/posts/p-1', { body: { post: mkPost(), baseRevision: null } });
  assert.equal(created.status, 200);
  assert.equal(created.json.post.revision, 1);
  assert.equal(created.json.post.content, '# Hi\n\n**bold** Привет 🚗');
  assert.equal(created.json.post.scheduledAt, '2026-10-20T15:00:00.000Z');
  assert.equal(created.json.post.timezone, 'Europe/Moscow');

  const updated = await call('PUT', '/api/posts/p-1', { body: { post: mkPost({ title: 'Renamed' }), baseRevision: 1 } });
  assert.equal(updated.json.post.revision, 2);
  assert.equal(updated.json.post.title, 'Renamed');

  const stale = await call('PUT', '/api/posts/p-1', { body: { post: mkPost({ title: 'Stale' }), baseRevision: 1 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.server.title, 'Renamed');

  const again = await call('PUT', '/api/posts/p-1', { body: { post: mkPost(), baseRevision: null } });
  assert.equal(again.status, 409);
});

test('validation errors are specific and nothing is stored', async () => {
  const res = await call('PUT', '/api/posts/p-bad', {
    body: { post: mkPost({ status: 'soon', scheduledAt: 'tomorrow', timezone: 'Mars/Base', tags: 'x' }), baseRevision: null },
  });
  assert.equal(res.status, 422);
  const paths = res.json.details.map((d) => d.path).sort();
  assert.deepEqual(paths, ['post.scheduledAt', 'post.status', 'post.tags', 'post.timezone']);
  assert.equal((await call('GET', '/api/bootstrap')).json.posts.some((p) => p.id === 'p-bad'), false);
  assert.equal((await call('PUT', '/api/posts/bad%20id', { body: { post: mkPost(), baseRevision: null } })).status, 400);
});

test('accounts are isolated from each other', async () => {
  await call('PUT', '/api/posts/shared-id', { body: { post: mkPost({ title: 'Alice only' }), baseRevision: null } });
  const bob = await call('GET', '/api/bootstrap', { cookie: BOB });
  assert.deepEqual(bob.json.posts, []);
  const bobSave = await call('PUT', '/api/posts/shared-id', { cookie: BOB, body: { post: mkPost({ title: 'Bob' }), baseRevision: null } });
  assert.equal(bobSave.status, 200);
  const alice = (await call('GET', '/api/bootstrap')).json.posts.find((p) => p.id === 'shared-id');
  assert.equal(alice.title, 'Alice only');
});

test('cross-site writes are refused', async () => {
  const res = await call('PUT', '/api/posts/p-x', {
    body: { post: mkPost(), baseRevision: null },
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(res.status, 403);
  const origin = await call('DELETE', '/api/posts/p-1', { headers: { origin: 'https://evil.example' } });
  assert.equal(origin.status, 403);
});

test('bad JSON and oversized bodies get JSON errors', async () => {
  const bad = await call('PUT', '/api/posts/p-j', { raw: '{nope', headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'bad_json');
  const huge = await call('PUT', '/api/posts/p-j', {
    raw: JSON.stringify({ post: mkPost({ content: 'x'.repeat(13 * 1024 * 1024) }), baseRevision: null }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(huge.status, 413);
});

test('content over the limit is rejected, not truncated', async () => {
  const res = await call('PUT', '/api/posts/p-long', { body: { post: mkPost({ content: 'x'.repeat(50001) }), baseRevision: null } });
  assert.equal(res.status, 422);
});

test('import: skip vs overwrite, invalid items reported per index', async () => {
  const items = [
    { id: 'imp-1', ...mkPost({ title: 'One' }) },
    { id: 'imp-2', ...mkPost({ title: 'Two' }) },
    { id: 'imp-3', ...mkPost({ status: 'nope' }) },
  ];
  const first = await call('POST', '/api/posts/import', { body: { posts: items, onConflict: 'skip' } });
  assert.deepEqual(first.json.results.map((r) => r.status), ['created', 'created', 'invalid']);
  assert.equal(first.json.results[2].errors[0].path, 'posts[2].status');

  const changed = items.slice(0, 2).map((p) => ({ ...p, title: `${p.title} v2` }));
  const skip = await call('POST', '/api/posts/import', { body: { posts: changed, onConflict: 'skip' } });
  assert.deepEqual(skip.json.results.map((r) => r.status), ['skipped', 'skipped']);
  const kept = (await call('GET', '/api/bootstrap')).json.posts.find((p) => p.id === 'imp-1');
  assert.equal(kept.title, 'One');

  const over = await call('POST', '/api/posts/import', { body: { posts: changed, onConflict: 'overwrite' } });
  assert.deepEqual(over.json.results.map((r) => r.status), ['updated', 'updated']);
  const replaced = (await call('GET', '/api/bootstrap')).json.posts.find((p) => p.id === 'imp-1');
  assert.equal(replaced.title, 'One v2');
  assert.equal(replaced.revision, 2);

  const tooMany = await call('POST', '/api/posts/import', {
    body: { posts: Array.from({ length: 201 }, (_, i) => ({ id: `m-${i}`, ...mkPost() })), onConflict: 'skip' },
  });
  assert.equal(tooMany.status, 413);
});

test('bulk patch and delete', async () => {
  const patch = await call('POST', '/api/posts/bulk', { body: { action: 'patch', ids: ['imp-1', 'imp-2'], patch: { status: 'archived' } } });
  assert.equal(patch.status, 200);
  assert.deepEqual(patch.json.posts.map((p) => p.status), ['archived', 'archived']);
  const cat = await call('POST', '/api/posts/bulk', { body: { action: 'patch', ids: ['imp-1'], patch: { category: 'cars' } } });
  assert.equal(cat.json.posts[0].category, 'cars');
  assert.equal((await call('POST', '/api/posts/bulk', { body: { action: 'patch', ids: ['imp-1'], patch: { status: 'x' } } })).status, 400);
  const del = await call('POST', '/api/posts/bulk', { body: { action: 'delete', ids: ['imp-1', 'imp-2'] } });
  assert.equal(del.json.deleted, 2);
});

test('settings: defaults, save, stale revision and validation', async () => {
  const saved = await call('PUT', '/api/settings', { body: { settings: { weekStart: 0, defaultTime: '09:30' }, baseRevision: 0 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.settings.weekStart, 0);
  assert.equal(saved.json.settings.revision, 1);
  assert.equal(saved.json.settings.categories.length, 8);
  const stale = await call('PUT', '/api/settings', { body: { settings: { weekStart: 1 }, baseRevision: 0 } });
  assert.equal(stale.status, 409);
  const invalid = await call('PUT', '/api/settings', { body: { settings: { defaultTime: '25:99', categories: [] }, baseRevision: 1 } });
  assert.equal(invalid.status, 422);
  const cats = await call('PUT', '/api/settings', {
    body: { settings: { categories: [{ id: 'new-mods', name: 'New Mods', color: '#00a170' }, { name: 'Мои моды', color: '#ffffff' }] }, baseRevision: 1 },
  });
  assert.equal(cats.json.settings.categories[1].id, 'мои-моды');
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('asset upload, serving, ownership and orphan cleanup', async () => {
  const bad = await call('POST', '/api/assets', { raw: Buffer.from('not an image'), headers: { 'content-type': 'image/png' } });
  assert.equal(bad.status, 415);
  const svg = await call('POST', '/api/assets', { raw: Buffer.from('<svg/>'), headers: { 'content-type': 'image/svg+xml' } });
  assert.equal(svg.status, 415);

  const up = await call('POST', '/api/assets', { raw: PNG_1PX, headers: { 'content-type': 'image/png', 'x-filename': 'cover.png' } });
  assert.equal(up.status, 201);
  assert.match(up.json.src, /^\/modshub\/api\/assets\/[a-f0-9]{24}$/);

  const get = await fetch(base.replace('/modshub', '') + up.json.src, { headers: { cookie: ALICE } });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('content-type'), 'image/png');
  assert.equal(get.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), PNG_1PX);
  const other = await fetch(base.replace('/modshub', '') + up.json.src, { headers: { cookie: BOB } });
  assert.equal(other.status, 404);

  // A post may only reference an asset that exists for its owner.
  const missing = await call('PUT', '/api/posts/p-img', {
    body: { post: mkPost({ image: { src: '/modshub/api/assets/' + 'a'.repeat(24), alt: '' } }), baseRevision: null },
  });
  assert.equal(missing.status, 422);

  const withImage = await call('PUT', '/api/posts/p-img', {
    body: { post: mkPost({ image: { src: up.json.src, alt: 'cover' } }), baseRevision: null },
  });
  assert.equal(withImage.status, 200);
  assert.equal(withImage.json.post.image.src, up.json.src);

  await call('DELETE', '/api/posts/p-img');
  const gone = await fetch(base.replace('/modshub', '') + up.json.src, { headers: { cookie: ALICE } });
  assert.equal(gone.status, 404);
});

test('asset ?download=1 sends a download header with the original name', async () => {
  const up = await call('POST', '/api/assets', { raw: PNG_1PX, headers: { 'content-type': 'image/png', 'x-filename': encodeURIComponent('Моя картинка.png') } });
  assert.equal(up.status, 201);
  const url = base.replace('/modshub', '') + up.json.src;
  const inline = await fetch(url, { headers: { cookie: ALICE } });
  assert.equal(inline.headers.get('content-disposition'), null);
  const dl = await fetch(`${url}?download=1`, { headers: { cookie: ALICE } });
  assert.equal(dl.status, 200);
  const disposition = dl.headers.get('content-disposition');
  assert.match(disposition, /^attachment; filename="/);
  assert.ok(disposition.includes(encodeURIComponent('Моя картинка.png')));
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), PNG_1PX);
});

test('several images per post: validated, legacy image mapped, assets cleaned up per image', async () => {
  const mk = async () => (await call('POST', '/api/assets', { raw: PNG_1PX, headers: { 'content-type': 'image/png' } })).json.src;
  const [a, b, c] = [await mk(), await mk(), await mk()];

  const saved = await call('PUT', '/api/posts/p-multi', {
    body: { post: mkPost({ images: [{ src: a, alt: 'one' }, { src: b, alt: 'two' }, { src: c, alt: '' }] }), baseRevision: null },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.post.images.map((i) => i.src), [a, b, c]);
  assert.equal(saved.json.post.image.src, a, 'image is the first attachment');

  // dropping two of them removes only those assets
  const trimmed = await call('PUT', '/api/posts/p-multi', { body: { post: mkPost({ images: [{ src: b, alt: 'two' }] }), baseRevision: 1 } });
  assert.deepEqual(trimmed.json.post.images.map((i) => i.src), [b]);
  assert.equal(trimmed.json.post.image.src, b);
  const get = (src) => fetch(base.replace('/modshub', '') + src, { headers: { cookie: ALICE } });
  assert.equal((await get(a)).status, 404);
  assert.equal((await get(c)).status, 404);
  assert.equal((await get(b)).status, 200);

  // an older client that only knows `image`
  const legacy = await call('PUT', '/api/posts/p-legacy', { body: { post: mkPost({ image: { src: 'https://example.com/x.png', alt: 'x' } }), baseRevision: null } });
  assert.deepEqual(legacy.json.post.images, [{ src: 'https://example.com/x.png', alt: 'x' }]);

  // limits and missing assets
  const many = await call('PUT', '/api/posts/p-many', {
    body: { post: mkPost({ images: Array.from({ length: 11 }, (_, i) => ({ src: `https://example.com/${i}.png` })) }), baseRevision: null },
  });
  assert.equal(many.status, 422);
  const missing = await call('PUT', '/api/posts/p-miss', {
    body: { post: mkPost({ images: [{ src: '/modshub/api/assets/' + 'b'.repeat(24) }] }), baseRevision: null },
  });
  assert.equal(missing.status, 422);

  // deleting the post cleans up what is left
  await call('DELETE', '/api/posts/p-multi');
  assert.equal((await get(b)).status, 404);
});

test('delete is idempotent', async () => {
  assert.equal((await call('DELETE', '/api/posts/never-existed')).status, 200);
});
