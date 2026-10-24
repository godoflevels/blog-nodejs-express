// Test server for browser tests: the real Studio router and static assets, an
// in-memory store and a throwaway login. It never touches MongoDB or .env.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const express = require('express');
const jwt = require('jsonwebtoken');
const { createModshubRouter } = require('../../server/modshub');
const { createMemoryStore } = require('../../server/modshub/store.memory');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SECRET = 'e2e-secret';
const store = createMemoryStore();
const PORT = Number(process.env.E2E_PORT || 4173);

const app = express();
app.set('views', path.join(ROOT, 'views'));
app.set('view engine', 'ejs');
// Same wiring as production: every signed-in admin shares one calendar.
const WORKSPACE = 'shared';
app.use('/modshub', createModshubRouter({
  store,
  jwtSecret: SECRET,
  workspaceId: WORKSPACE,
  resolveUsername: async (id) => id,
}));
app.use('/quiz', require('../../server/quiz').router);
app.use(express.static(path.join(ROOT, 'public')));

app.get('/admin', (req, res) => res.type('html').send('<h1>Sign in</h1><p id="login-page">admin login</p>'));
app.get('/dashboard', (req, res) => res.type('html').send('<h1>Dashboard</h1>'));
app.get('/logout', (req, res) => res.clearCookie('token').redirect('/'));

// Signs in as <user> (default "tester") and optionally seeds sample posts.
app.get('/__login', async (req, res) => {
  const user = String(req.query.user || 'tester');
  res.cookie('token', jwt.sign({ userId: user }, SECRET), { httpOnly: true, sameSite: 'strict' });
  if (req.query.seed) await seed(user, Number(req.query.seed) || 12);
  res.redirect(String(req.query.to || '/modshub'));
});

app.get('/__reset', async (req, res) => {
  const posts = await store.listPosts(WORKSPACE);
  await store.deleteMany(WORKSPACE, posts.map((p) => p.id));
  const slots = await store.listSlots(WORKSPACE);
  for (const slot of slots) await store.deleteSlot(WORKSPACE, slot.id);
  res.json({ cleared: posts.length, slots: slots.length });
});

async function seed(_user, count) {
  const existing = await store.listPosts(WORKSPACE);
  if (existing.length) return;
  const now = new Date();
  const statuses = ['draft', 'planned', 'ready', 'published', 'archived'];
  const cats = ['updates', 'new-mods', 'graphics', 'cars', 'improvements', 'community', 'promotions', 'announcements'];
  const titles = [
    'New Graphics Update', 'Real Cars Pack 4.2', 'Community Weekend Event', 'Performance Improvements',
    'Summer Promo: 30% off', 'Модпак «Лос-Сантос Ночью»', 'Feature: Live Preview', 'Update 2.1 Release Notes',
    'Hotfix for texture streaming', 'Weekly roundup', 'Creator spotlight', 'Sneak peek: new lighting',
  ];
  for (let i = 0; i < count; i += 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (i * 2) - 6, 15 + (i % 4), (i % 2) * 30));
    await store.insertPost(WORKSPACE, {
      id: `seed-${String(i + 1).padStart(3, '0')}`,
      title: titles[i % titles.length],
      scheduledAt: day.toISOString(),
      timezone: 'UTC',
      status: statuses[i % statuses.length],
      category: cats[i % cats.length],
      tags: i % 3 === 0 ? ['graphics', 'release'] : ['news'],
      content: `# ${titles[i % titles.length]}\n\nThis is **bold**, *italic* and ***bold italic***.\n\n- First point\n  - Nested point\n- Second point\n\n> A short quote\n\n[ModsHub](https://modshub.io/) · Привет 🚗`,
      image: null,
      notes: i === 0 ? 'Internal note for the team' : '',
    });
  }
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`e2e server on http://127.0.0.1:${PORT}`);
});
