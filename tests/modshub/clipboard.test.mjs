import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/dom.mjs';
import { buildPayloads, writeToClipboard } from '../../client/modshub/core/clipboard.js';

const SOURCE = '# New update\n\nThis is **bold**, *italic* and ***bold italic***.\n\n- [link](https://modshub.io/)\n\n> quote';

test('payloads: markdown is exact, plain has no markers, html keeps formatting', () => {
  const p = buildPayloads(SOURCE);
  assert.equal(p.markdown, SOURCE);
  assert.doesNotMatch(p.plain, /[*#>\[\]]/);
  assert.match(p.html, /<h1>New update<\/h1>/);
  assert.match(p.html, /<strong>bold<\/strong>/);
  assert.match(p.html, /<em>italic<\/em>/);
  assert.match(p.html, /<em><strong>bold italic<\/strong><\/em>/);
  assert.match(p.html, /<a href="https:\/\/modshub\.io\/"/);
  assert.match(p.html, /<ul>/);
  assert.match(p.html, /<blockquote/);
  // The three representations are different things.
  assert.notEqual(p.markdown, p.plain);
  assert.notEqual(p.html, p.markdown);
});

class FakeItem {
  constructor(parts) {
    this.parts = parts;
    this.types = Object.keys(parts);
  }
}

test('rich copy writes text/html and text/plain through the async clipboard API', async () => {
  const written = [];
  const env = {
    ClipboardItem: FakeItem,
    Blob,
    navigator: { clipboard: { write: async (items) => written.push(...items) } },
  };
  const { html, plain } = buildPayloads(SOURCE);
  const res = await writeToClipboard({ text: plain, html }, env);
  assert.equal(res.ok, true);
  assert.equal(res.rich, true);
  assert.equal(res.degraded, false);
  assert.deepEqual(written[0].types.sort(), ['text/html', 'text/plain']);
  assert.equal(await written[0].parts['text/html'].text(), html);
  assert.equal(await written[0].parts['text/plain'].text(), plain);
  assert.equal(written[0].parts['text/html'].type, 'text/html');
});

test('rich copy falls back to the copy event, still carrying html + plain', async () => {
  const data = {};
  const listeners = {};
  const doc = {
    body: { appendChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, remove() {}, select() {}, setSelectionRange() {} }),
    createRange: () => ({ selectNodeContents() {} }),
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener() {},
    execCommand: (cmd) => {
      if (cmd !== 'copy') return false;
      listeners.copy({ clipboardData: { setData: (t, v) => { data[t] = v; } }, preventDefault() {} });
      return true;
    },
  };
  const res = await writeToClipboard({ text: 'plain', html: '<b>x</b>' }, { document: doc, navigator: {} });
  assert.equal(res.ok, true);
  assert.equal(res.method, 'copy-event');
  assert.equal(res.rich, true);
  assert.deepEqual(data, { 'text/html': '<b>x</b>', 'text/plain': 'plain' });
});

test('rich copy degrades to text and says so when HTML cannot be written', async () => {
  const texts = [];
  const env = {
    ClipboardItem: FakeItem,
    Blob,
    navigator: {
      clipboard: {
        write: async () => { throw new Error('NotAllowedError'); },
        writeText: async (t) => texts.push(t),
      },
    },
  };
  const res = await writeToClipboard({ text: 'plain', html: '<b>x</b>' }, env);
  assert.equal(res.ok, true);
  assert.equal(res.degraded, true);
  assert.equal(res.rich, false);
  assert.deepEqual(texts, ['plain']);
});

test('plain copy uses text only and reports failure when nothing works', async () => {
  const texts = [];
  const ok = await writeToClipboard({ text: 'abc' }, { navigator: { clipboard: { writeText: async (t) => texts.push(t) } } });
  assert.equal(ok.ok, true);
  assert.equal(ok.degraded, false);
  assert.deepEqual(texts, ['abc']);
  const bad = await writeToClipboard({ text: 'abc' }, { navigator: {} });
  assert.equal(bad.ok, false);
});
