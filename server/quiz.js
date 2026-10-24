'use strict';

/**
 * ModsHub Quiz (/quiz): ten questions, a promo code for 7 or more right.
 *
 * The page itself is static (public/quiz). The answers and the promo code live
 * only here, so the code is never in the page source: it is returned by
 * POST /quiz/api/finish once the submitted answers pass.
 */
const express = require('express');
const path = require('path');

const PASS_MARK = 7;
const PROMO_CODE = process.env.QUIZ_PROMO_CODE || 'QUIZ50';

// id of the right option is `correct`; the client shuffles the order of options.
const QUESTIONS = [
  {
    id: 'q1',
    text: 'What is the tagline on the ModsHub homepage?',
    options: { a: 'Your game. Modded right.', b: 'Play harder. Mod faster.', c: 'Mods for everyone.', d: 'Level up your ride.' },
    correct: 'a',
    fact: 'ModsHub is the mod manager for FiveM and GTA 5: graphics, cars, weapons and UI mods in one click.',
  },
  {
    id: 'q2',
    text: 'ModsHub used to be known under another name. Which one?',
    options: { a: 'GTA Boost', b: 'Fivemods', c: 'RageHub', d: 'ModForge' },
    correct: 'b',
    fact: 'The footer says it plainly: ModsHub (ex. Fivemods).',
  },
  {
    id: 'q3',
    text: 'Realistic Stars, one of the most popular mods, sits in which category?',
    options: { a: 'Real Cars', b: 'Weapon skins', c: 'Improvements', d: 'Clothes & Vests' },
    correct: 'c',
    fact: 'Realistic Stars is an Improvements mod for the sky: a high-resolution night sky with stars and the moon.',
  },
  {
    id: 'q4',
    text: 'Which of these mods belongs to the Roads subcategory?',
    options: { a: 'Indian Ocean', b: 'California Trees', c: 'Realistic Stars', d: 'European Roads' },
    correct: 'd',
    fact: 'European Roads and Los Angeles Roads are both in the Roads subcategory of Improvements. Indian Ocean is water, California Trees is vegetation.',
  },
  {
    id: 'q5',
    text: 'Which of these is an ENB graphics preset in the library?',
    options: { a: 'Taser Holster', b: 'Gray Map', c: 'Ray Fusion Remastered', d: 'Realistic Weapons Sounds' },
    correct: 'c',
    fact: 'Ray Fusion Remastered, Lumen Graphics Empowered and Iconic Visuals are ENB presets in the Graphics Mods category.',
  },
  {
    id: 'q6',
    text: 'Which of these is a car from the Real Cars category?',
    options: { a: 'Miami Wave', b: 'Pfister Boxster', c: 'Northern Lights', d: 'Floral Fantasy' },
    correct: 'b',
    fact: 'Real Cars holds lots of real-world models, like the Pfister Boxster, Bravado C8 Corvette and Obey R8 V10 Liberty.',
  },
  {
    id: 'q7',
    text: 'Which of these is a weapon skin?',
    options: { a: 'Billboards of Los Santos', b: 'Disable Explosion Shake', c: 'Glock | Tactical Elite', d: 'Black Map | Vectorized' },
    correct: 'c',
    fact: 'The Weapon skins category has packs like Glock | Tactical Elite, AR-15 S | Avenger and Assault Rifle | Sakura Branch.',
  },
  {
    id: 'q8',
    text: 'Realistic Weapons Sounds belongs to which category?',
    options: { a: 'Audio', b: 'Interface', c: 'Modpacks', d: 'Effects' },
    correct: 'a',
    fact: 'Audio is the sound category of the library, and Realistic Weapons Sounds is among its most popular mods.',
  },
  {
    id: 'q9',
    text: 'What does ModsHub+ remove?',
    options: { a: 'The game folder', b: 'Your FPS counter', c: 'Mod updates', d: 'Download queues' },
    correct: 'd',
    fact: 'ModsHub+ gives full library access with no download queues, one-click installs and unlimited high-speed downloads.',
  },
  {
    id: 'q10',
    text: 'Which ModsHub plan is a one-time purchase with lifetime updates?',
    options: { a: 'ModsHub Lite', b: 'ModsHub Cars', c: 'ModsHub Plus', d: 'ModsHub Infinity' },
    correct: 'd',
    fact: 'ModsHub Infinity is a one-time purchase: all premium mods, lifetime updates and no download queues.',
  },
];
const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

// Small in-memory limiter: the promo code endpoint is the only thing worth guarding.
const hits = new Map();
function limited(ip, max = 30, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const fresh = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  fresh.push(now);
  hits.set(ip, fresh);
  if (hits.size > 5000) for (const [key, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(key);
  return fresh.length > max;
}

const router = express.Router();
const json = express.json({ limit: '10kb' });
const PAGE = path.join(__dirname, '..', 'public', 'quiz', 'index.html');

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(PAGE);
});

router.get('/api/questions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    passMark: PASS_MARK,
    questions: QUESTIONS.map(({ id, text, options }) => ({
      id,
      text,
      options: Object.entries(options).map(([key, label]) => ({ id: key, label })),
    })),
  });
});

router.post('/api/check', json, (req, res) => {
  const q = BY_ID.get(String((req.body || {}).id));
  if (!q) return res.status(404).json({ error: 'unknown_question' });
  const choice = String((req.body || {}).choice);
  res.set('Cache-Control', 'no-store');
  res.json({ correct: choice === q.correct, answer: q.correct, fact: q.fact });
});

router.post('/api/finish', json, (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: 'too_many', message: 'Slow down and try again in a few minutes.' });
  const answers = Array.isArray((req.body || {}).answers) ? req.body.answers : [];
  const seen = new Set();
  let score = 0;
  for (const a of answers.slice(0, QUESTIONS.length)) {
    const q = a && BY_ID.get(String(a.id));
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    if (String(a.choice) === q.correct) score += 1;
  }
  const passed = seen.size === QUESTIONS.length && score >= PASS_MARK;
  res.set('Cache-Control', 'no-store');
  res.json({ score, total: QUESTIONS.length, passMark: PASS_MARK, passed, code: passed ? PROMO_CODE : null });
});

module.exports = { router, QUESTIONS, PASS_MARK };
