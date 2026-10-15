import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExport, stringifyExport, parseImport, JSON_TEMPLATE, inferZone, EXPORT_VERSION,
} from '../../client/modshub/core/json-io.js';
import { fromWall } from '../../client/modshub/core/time.js';

const post = (over = {}) => ({
  id: 'post-001',
  title: 'New Graphics Update',
  scheduledAt: fromWall('2026-10-20', '18:00', 'Europe/Moscow').iso,
  timezone: 'Europe/Moscow',
  status: 'planned',
  category: 'graphics',
  tags: ['graphics', 'release'],
  content: '# New update\n\nExplore **new graphics** for GTA 5.\n\n***Available now***\n\nПривет 🚗',
  image: null,
  notes: 'internal',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-02T11:00:00.000Z',
  ...over,
});

test('export has the documented shape and offset based scheduledAt', () => {
  const out = buildExport([post()], { now: new Date('2026-10-15T00:00:00Z') });
  assert.equal(out.version, 1);
  assert.equal(out.posts[0].scheduledAt, '2026-10-20T18:00:00+03:00');
  assert.equal(out.posts[0].timezone, 'Europe/Moscow');
  assert.equal(out.posts[0].image, null);
});

test('export -> import round trip loses nothing (content, time, zone, metadata)', () => {
  const originals = [
    post(),
    post({
      id: 'post-002',
      title: 'Zone test',
      timezone: 'America/Los_Angeles',
      scheduledAt: fromWall('2026-10-20', '23:30', 'America/Los_Angeles').iso,
      content: 'line 1\nline 2\n\n\n\nline 3 — `code` ~~x~~',
      tags: [],
      status: 'ready',
      image: { src: 'https://example.com/pic.png', alt: 'Picture' },
    }),
  ];
  const text = stringifyExport(buildExport(originals));
  const parsed = parseImport(text, { defaultTimezone: 'UTC' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.posts.length, 2);
  parsed.posts.forEach((p, i) => {
    assert.deepEqual(p.errors, []);
    const o = originals[i];
    assert.equal(p.value.id, o.id);
    assert.equal(p.value.content, o.content);
    assert.equal(p.value.scheduledAt, o.scheduledAt);
    assert.equal(p.value.timezone, o.timezone);
    assert.equal(p.value.status, o.status);
    assert.equal(p.value.category, o.category);
    assert.deepEqual(p.value.tags, o.tags);
    assert.deepEqual(p.value.image, o.image);
    assert.equal(p.value.notes, o.notes);
    assert.equal(p.value.createdAt, o.createdAt);
  });
});

test('the downloadable template imports cleanly', () => {
  const parsed = parseImport(JSON.stringify(JSON_TEMPLATE), { defaultTimezone: 'Europe/Moscow' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.posts[0].errors, []);
  assert.equal(parsed.posts[0].value.scheduledAt, '2026-10-20T15:00:00.000Z');
});

test('brief example without timezone keeps its offset wall clock', () => {
  const text = JSON.stringify({
    version: 1,
    posts: [{ id: 'post-001', title: 'x', scheduledAt: '2026-10-20T18:00:00+03:00', status: 'planned', category: 'updates', tags: [], content: '', image: null, notes: '' }],
  });
  const withMoscow = parseImport(text, { defaultTimezone: 'Europe/Moscow' }).posts[0].value;
  assert.equal(withMoscow.timezone, 'Europe/Moscow');
  const withNY = parseImport(text, { defaultTimezone: 'America/New_York' }).posts[0].value;
  assert.equal(withNY.timezone, 'Etc/GMT-3');
  assert.equal(withNY.scheduledAt, '2026-10-20T15:00:00.000Z');
  assert.equal(inferZone('2026-10-20T18:00:00Z', 'Europe/Berlin'), 'UTC');
});

test('fatal problems: empty, invalid JSON with line, wrong shape, version', () => {
  assert.equal(parseImport('   ').ok, false);
  const bad = parseImport('{\n  "version": 1,\n  "posts": [\n    { "id": "a", }\n  ]\n}');
  assert.equal(bad.ok, false);
  assert.match(bad.fatal[0].message, /Invalid JSON/);
  assert.equal(bad.fatal[0].line, 4);
  assert.equal(parseImport('[]').ok, false);
  assert.match(parseImport('{"posts":[]}').fatal[0].message, /version/);
  assert.match(parseImport('{"version":2,"posts":[]}').fatal[0].message, /newer/);
  assert.match(parseImport('{"version":1,"posts":{}}').fatal[0].message, /array/);
});

test('field errors carry line numbers and are reported per post', () => {
  const text = [
    '{',
    '  "version": 1,',
    '  "posts": [',
    '    {',
    '      "id": "good",',
    '      "title": "Fine",',
    '      "scheduledAt": "2026-10-20T18:00:00+03:00",',
    '      "status": "planned",',
    '      "content": "ok"',
    '    },',
    '    {',
    '      "id": "bad",',
    '      "title": "",',
    '      "scheduledAt": "20 Oct 2026",',
    '      "status": "soon",',
    '      "tags": "x"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
  const parsed = parseImport(text, { defaultTimezone: 'UTC' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.posts[0].errors.length, 0);
  const bad = parsed.posts[1];
  assert.equal(bad.value, null);
  const byPath = Object.fromEntries(bad.errors.map((e) => [e.path, e.line]));
  assert.equal(byPath['posts[1].title'], 13);
  assert.equal(byPath['posts[1].scheduledAt'], 14);
  assert.equal(byPath['posts[1].status'], 15);
  assert.equal(byPath['posts[1].tags'], 16);
});

test('duplicate ids inside a file and collisions with existing posts are detected', () => {
  const mk = (id) => ({ id, title: id, scheduledAt: '2026-10-20T18:00:00Z', timezone: 'UTC', status: 'draft', category: 'updates', content: '' });
  const parsed = parseImport(JSON.stringify({ version: 1, posts: [mk('a'), mk('b'), mk('a')] }), {
    existingIds: new Set(['b']),
  });
  assert.equal(parsed.posts[0].existsInStudio, false);
  assert.equal(parsed.posts[1].existsInStudio, true);
  assert.equal(parsed.posts[2].duplicateOf, 0);
  assert.match(parsed.posts[2].errors[0].message, /duplicate id/);
});

test('export version constant and html in content are never interpreted', () => {
  assert.equal(EXPORT_VERSION, 1);
  const evil = post({ content: '<script>alert(1)</script> **x**' });
  const parsed = parseImport(stringifyExport(buildExport([evil])));
  assert.equal(parsed.posts[0].value.content, evil.content);
});
