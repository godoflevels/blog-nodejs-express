import test from 'node:test';
import assert from 'node:assert/strict';

const { snippet } = await import('../../client/modshub/core/snippet.js');

test('strips headings, emphasis, spoilers and list markers', () => {
  const out = snippet('# Big **news**\n\n- one ~~two~~ ||three||\n> quoted *text*');
  assert.equal(out, 'Big news one two three quoted text');
});

test('keeps link text but drops urls, images and code blocks', () => {
  assert.equal(snippet('See [ModsHub](https://modshub.io/) ![pic](x.png) ```code``` now'), 'See ModsHub now');
});

test('drops Discord mentions, timestamps and custom emoji', () => {
  assert.equal(snippet('Hi <@123456789012345678> at <t:1700000000:F> <:wave:42> ok'), 'Hi at ok');
});

test('keeps snake_case words and cuts long text with an ellipsis', () => {
  assert.equal(snippet('use my_var_name'), 'use my_var_name');
  const long = snippet('word '.repeat(100), 20);
  assert.ok(long.endsWith('…') && long.length <= 21);
});

test('empty input gives an empty line', () => {
  assert.equal(snippet(''), '');
  assert.equal(snippet(null), '');
});
