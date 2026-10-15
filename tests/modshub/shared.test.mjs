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
const SECRET = 'shared-secret';
const NAMES = { u1: 'Owner', u2: 'jixo' };
const store = createMemoryStore();
let server;
let base;

const cookieFor = (userId) => `token=${jwt.sign({ userId }, SECRET)}`;
const OWNER = cookieFor('u1');
const JIXO = cookieFor('u2');

async function call(method, url, { cookie = OWNER, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not json */ }
  return { status: res.status, json, text };
}

const post = (over = {}) => ({
  title: 'Shared',
  scheduledAt: '2026-10-20T15:00:00.000Z',
  timezone: 'Europe/Moscow',
  status: 'planned',
  category: 'updates',
  tags: [],
  content: '||secret|| __underlined__',
  image: null,
  notes: '',
  ...over,
});

before(async () => {
  const app = express();
  app.set('views', path.join(ROOT, 'views'));
  app.set('view engine', 'ejs');
  app.use('/modshub', createModshubRouter({
    store,
    jwtSecret: SECRET,
    workspaceId: 'shared',
    resolveUsername: async (id) => NAMES[id],
  }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/modshub`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('two admins share one calendar and see who changed what', async () => {
  const created = await call('PUT', '/api/posts/p-1', { body: { post: post(), baseRevision: null } });
  assert.equal(created.status, 200);
  assert.equal(created.json.post.createdBy, 'Owner');
  assert.equal(created.json.post.updatedBy, 'Owner');

  const seen = await call('GET', '/api/bootstrap', { cookie: JIXO });
  assert.equal(seen.json.user.name, 'jixo');
  assert.equal(seen.json.workspace, 'shared');
  assert.equal(seen.json.posts.length, 1);
  assert.equal(seen.json.posts[0].title, 'Shared');

  const edited = await call('PUT', '/api/posts/p-1', { cookie: JIXO, body: { post: post({ title: 'Edited by jixo' }), baseRevision: 1 } });
  assert.equal(edited.json.post.updatedBy, 'jixo');
  assert.equal(edited.json.post.createdBy, 'Owner');

  // The owner's stale tab now conflicts instead of silently overwriting.
  const stale = await call('PUT', '/api/posts/p-1', { body: { post: post({ title: 'Stale' }), baseRevision: 1 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.server.title, 'Edited by jixo');
});

test('free places: mark, list for everyone, validate, remove', async () => {
  const added = await call('PUT', '/api/slots/slot-aaa', { body: { slot: { date: '2026-10-21', time: '', timezone: 'UTC', note: 'keep for Friday' } } });
  assert.equal(added.status, 200);
  assert.equal(added.json.slot.createdBy, 'Owner');
  const timed = await call('PUT', '/api/slots/slot-bbb', { cookie: JIXO, body: { slot: { date: '2026-10-22', time: '18:30', timezone: 'Europe/Moscow' } } });
  assert.equal(timed.json.slot.createdBy, 'jixo');

  const boot = await call('GET', '/api/bootstrap', { cookie: JIXO });
  assert.deepEqual(boot.json.slots.map((s) => [s.id, s.date, s.time]), [['slot-aaa', '2026-10-21', ''], ['slot-bbb', '2026-10-22', '18:30']]);

  assert.equal((await call('PUT', '/api/slots/slot-bad', { body: { slot: { date: '21/10/2026' } } })).status, 422);
  assert.equal((await call('PUT', '/api/slots/slot-bad', { body: { slot: { date: '2026-10-21', time: '25:00' } } })).status, 422);
  assert.equal((await call('DELETE', '/api/slots/slot-aaa', { cookie: JIXO })).status, 200);
  const after = await call('GET', '/api/bootstrap');
  assert.deepEqual(after.json.slots.map((s) => s.id), ['slot-bbb']);
});

test('Discord embeds are stored and validated', async () => {
  const embed = {
    color: '#5865f2', authorName: 'ModsHub', title: 'New pack', url: 'https://modshub.io/', description: '**Hi**',
    fields: [{ name: 'Version', value: '1.2', inline: true }], footerText: 'Footer', imageUrl: 'https://example.com/a.png', timestamp: '2026-10-20T15:00:00Z',
  };
  const ok = await call('PUT', '/api/posts/p-d', { body: { post: post({ discord: { username: 'ModsHub', avatarUrl: 'https://example.com/av.png', embeds: [embed] } }), baseRevision: null } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.post.discord.username, 'ModsHub');
  assert.equal(ok.json.post.discord.embeds[0].title, 'New pack');
  assert.deepEqual(ok.json.post.discord.embeds[0].fields, [{ name: 'Version', value: '1.2', inline: true }]);
  assert.equal(ok.json.post.discord.embeds[0].timestamp, '2026-10-20T15:00:00.000Z');

  const bad = await call('PUT', '/api/posts/p-d2', { body: { post: post({ discord: { embeds: [{ color: 'red', imageUrl: 'javascript:alert(1)', fields: [{ name: 'x'.repeat(300), value: 'v' }] }] } }), baseRevision: null } });
  assert.equal(bad.status, 422);
  const paths = bad.json.details.map((d) => d.path);
  assert.ok(paths.includes('post.discord.embeds[0].color'));
  assert.ok(paths.includes('post.discord.embeds[0].imageUrl'));
  assert.ok(paths.includes('post.discord.embeds[0].fields[0].name'));

  const many = await call('PUT', '/api/posts/p-d3', { body: { post: post({ discord: { embeds: Array.from({ length: 11 }, () => ({ title: 't' })) } }), baseRevision: null } });
  assert.equal(many.status, 422);
});

test('workspace merge moves per-account data into the shared calendar', async () => {
  const s = createMemoryStore();
  await s.insertPost('old-user', { id: 'a', title: 'A', scheduledAt: '2026-10-01T10:00:00Z', timezone: 'UTC', status: 'draft', category: '', tags: [], content: '' });
  await s.putSlot('old-user', { id: 'slot-x', date: '2026-10-02', timezone: 'UTC' });
  const moved = await s.adoptWorkspace('shared');
  assert.equal(moved, 2);
  assert.equal((await s.listPosts('shared')).length, 1);
  assert.equal((await s.listPosts('old-user')).length, 0);
  assert.equal((await s.listSlots('shared')).length, 1);
});
