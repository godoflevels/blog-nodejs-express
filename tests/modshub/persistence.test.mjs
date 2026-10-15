import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, classifyDrafts } from '../../client/modshub/core/drafts.js';
import { SaveQueue } from '../../client/modshub/core/save-queue.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const post = (over = {}) => ({
  id: 'p1', title: 'T', scheduledAt: '2026-10-20T15:00:00.000Z', timezone: 'UTC', status: 'draft',
  category: 'updates', tags: [], content: 'hello', image: null, notes: '', revision: 3, ...over,
});

test('draft survives a "page reload" and is offered back until the server has it', () => {
  const storage = new MemoryStorage();
  // Session 1: user types, server never confirms (tab closed / offline).
  const session1 = createDraftStore(storage, 'alice');
  session1.save(post({ content: 'typed but never saved' }), 3);

  // Session 2: same storage, fresh store instance.
  const session2 = createDraftStore(storage, 'alice');
  const serverPosts = [post({ content: 'older server text' })];
  const { recoverable, obsolete } = classifyDrafts(session2.list(), serverPosts);
  assert.equal(recoverable.length, 1);
  assert.equal(recoverable[0].kind, 'unsaved');
  assert.equal(recoverable[0].draft.post.content, 'typed but never saved');
  assert.deepEqual(obsolete, []);

  // Once the server has the same content the draft is obsolete.
  const same = classifyDrafts(session2.list(), [post({ content: 'typed but never saved', revision: 4 })]);
  assert.deepEqual(same.obsolete, ['p1']);
  assert.equal(same.recoverable.length, 0);
});

test('drafts for posts the server never saw are recoverable as new, and are scoped per user', () => {
  const storage = new MemoryStorage();
  createDraftStore(storage, 'alice').save(post({ id: 'brand-new' }), null);
  assert.equal(createDraftStore(storage, 'bob').list().length, 0);
  const { recoverable } = classifyDrafts(createDraftStore(storage, 'alice').list(), []);
  assert.equal(recoverable[0].kind, 'new');
});

test('draft storage failures never throw', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); }, key() { return null; }, length: 0 };
  const store = createDraftStore(broken, 'u');
  assert.equal(store.save(post(), 1), false);
  assert.deepEqual(store.list(), []);
  assert.equal(store.load('p1'), null);
});

const tick = () => new Promise((r) => setTimeout(r, 5));

test('autosave debounces, sends only the latest edit and reports saved', async () => {
  const sent = [];
  const saved = [];
  const queue = new SaveQueue({
    delay: 20,
    save: async (p, base) => { sent.push({ content: p.content, base }); return { status: 'ok', post: { ...p, revision: (base ?? 0) + 1 } }; },
    onSaved: (id, serverPost) => saved.push(serverPost.revision),
  });
  queue.track('p1', 3);
  queue.update(post({ content: 'a' }));
  queue.update(post({ content: 'ab' }));
  queue.update(post({ content: 'abc' }));
  assert.equal(queue.statusOf('p1'), 'dirty');
  assert.equal(queue.hasUnsaved, true);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(sent, [{ content: 'abc', base: 3 }]);
  assert.deepEqual(saved, [4]);
  assert.equal(queue.statusOf('p1'), 'idle');
  assert.equal(queue.hasUnsaved, false);
});

test('edits made while a save is in flight are sent afterwards, in order', async () => {
  const sent = [];
  let release;
  const queue = new SaveQueue({
    delay: 5,
    save: (p, base) => new Promise((resolve) => {
      sent.push(p.content);
      const done = () => resolve({ status: 'ok', post: { ...p, revision: (base ?? 0) + 1 } });
      if (sent.length === 1) release = done; else done();
    }),
  });
  queue.track('p1', 1);
  queue.update(post({ content: 'first' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(queue.statusOf('p1'), 'saving');
  queue.update(post({ content: 'second' }));
  assert.deepEqual(sent, ['first']);
  release();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(sent, ['first', 'second']);
  assert.equal(queue.statusOf('p1'), 'idle');
});

test('network errors keep the edit and retry; conflicts wait for a decision', async () => {
  let fail = true;
  const queue = new SaveQueue({
    delay: 1,
    save: async (p, base) => {
      if (fail) throw new TypeError('Failed to fetch');
      return { status: 'ok', post: { ...p, revision: (base ?? 0) + 1 } };
    },
    setTimer: (fn) => setTimeout(fn, 5),
  });
  queue.track('p1', 1);
  queue.update(post({ content: 'x' }));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(queue.statusOf('p1'), 'error');
  fail = false;
  await queue.flush('p1');
  assert.equal(queue.statusOf('p1'), 'idle');

  const conflicted = new SaveQueue({
    delay: 1,
    save: async (p, base) => (base === 1 ? { status: 'conflict', server: { ...p, revision: 2, content: 'theirs' } } : { status: 'ok', post: { ...p, revision: base + 1 } }),
  });
  conflicted.track('p1', 1);
  conflicted.update(post({ content: 'mine' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(conflicted.statusOf('p1'), 'conflict');
  await conflicted.keepMine('p1');
  assert.equal(conflicted.statusOf('p1'), 'idle');
});
