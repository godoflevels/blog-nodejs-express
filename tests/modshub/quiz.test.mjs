import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const express = require('express');
const { router, QUESTIONS, PASS_MARK } = require('../../server/quiz');

const app = express();
app.use('/quiz', router);
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}/quiz`;
test.after(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() }));
const allRight = () => QUESTIONS.map((q) => ({ id: q.id, choice: q.correct }));
const wrongChoice = (q) => Object.keys(q.options).find((k) => k !== q.correct);

test('every question has 4 options and a valid right answer', () => {
  assert.equal(QUESTIONS.length, 10);
  for (const q of QUESTIONS) {
    assert.equal(Object.keys(q.options).length, 4);
    assert.ok(q.options[q.correct], q.id);
    assert.ok(q.fact.length > 20);
  }
});

test('the questions endpoint never leaks answers, facts or the code', async () => {
  const res = await fetch(`${base}/api/questions`);
  const text = await res.text();
  const data = JSON.parse(text);
  assert.equal(data.questions.length, 10);
  assert.equal(data.passMark, PASS_MARK);
  assert.ok(!/correct|fact|QUIZ50/i.test(text));
  assert.ok(data.questions.every((q) => q.options.length === 4));
});

test('check tells right from wrong and explains', async () => {
  const q = QUESTIONS[0];
  const ok = await post('/api/check', { id: q.id, choice: q.correct });
  assert.equal(ok.data.correct, true);
  const bad = await post('/api/check', { id: q.id, choice: wrongChoice(q) });
  assert.equal(bad.data.correct, false);
  assert.equal(bad.data.answer, q.correct);
  assert.ok(bad.data.fact);
  assert.equal((await post('/api/check', { id: 'nope', choice: 'a' })).status, 404);
});

test('finish gives the promo code only from the pass mark up', async () => {
  const perfect = await post('/api/finish', { answers: allRight() });
  assert.equal(perfect.data.score, 10);
  assert.equal(perfect.data.passed, true);
  assert.ok(perfect.data.code);

  const answers = allRight();
  for (let i = 0; i < 3; i += 1) answers[i] = { id: QUESTIONS[i].id, choice: wrongChoice(QUESTIONS[i]) };
  const exactly = await post('/api/finish', { answers });
  assert.equal(exactly.data.score, 7);
  assert.equal(exactly.data.passed, true);

  answers[3] = { id: QUESTIONS[3].id, choice: wrongChoice(QUESTIONS[3]) };
  const fail = await post('/api/finish', { answers });
  assert.equal(fail.data.score, 6);
  assert.equal(fail.data.passed, false);
  assert.equal(fail.data.code, null);
});

test('cheating attempts do not unlock the code', async () => {
  // the same right answer ten times
  const q = QUESTIONS[0];
  const repeated = await post('/api/finish', { answers: Array.from({ length: 10 }, () => ({ id: q.id, choice: q.correct })) });
  assert.equal(repeated.data.score, 1);
  assert.equal(repeated.data.code, null);
  // too few answers
  const few = await post('/api/finish', { answers: allRight().slice(0, 8) });
  assert.equal(few.data.passed, false);
  assert.equal(few.data.code, null);
  // junk
  const junk = await post('/api/finish', { answers: 'yes' });
  assert.equal(junk.data.score, 0);
  assert.equal(junk.data.code, null);
});
