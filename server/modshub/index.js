'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const {
  ID_RE,
  ASSET_ID_RE,
  ASSET_PATH_RE,
  LIMITS,
  STATUSES,
  validatePost,
  validateSlot,
  validateSettings,
} = require('./schema');

const MAX_ASSET_BYTES = 3 * 1024 * 1024;
const MAX_ASSETS_PER_OWNER = 300;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const BUNDLE = path.join(__dirname, '..', '..', 'public', 'modshub-studio', 'studio.js');

function detectImageType(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function apiError(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: code, message, ...extra });
}

/**
 * @param {object} options
 * @param {object} options.store      store implementation (mongo or memory)
 * @param {string} options.jwtSecret  secret used to verify the admin cookie
 * @param {string} [options.cookieName]
 * @param {string} [options.loginPath]
 * @param {string|((userId: string) => string)} [options.workspaceId]
 *        One id for everybody = a shared calendar. Default: one workspace per account.
 * @param {(userId: string) => Promise<string>} [options.resolveUsername]
 *        Maps the JWT user id to a display name (shown as "edited by").
 */
function createModshubRouter({
  store,
  jwtSecret,
  cookieName = 'token',
  loginPath = '/admin',
  workspaceId,
  resolveUsername,
}) {
  if (!store) throw new Error('createModshubRouter: store is required');
  const router = express.Router();
  const workspaceOf =
    typeof workspaceId === 'function' ? workspaceId : workspaceId ? () => workspaceId : (userId) => userId;
  const nameCache = new Map();
  const nameOf = async (userId) => {
    const hit = nameCache.get(userId);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.name;
    let name = userId;
    if (resolveUsername) {
      try {
        name = (await resolveUsername(userId)) || userId;
      } catch (_) {
        name = userId;
      }
    }
    nameCache.set(userId, { name, at: Date.now() });
    return name;
  };

  router.use(cookieParser());

  // ---- auth -------------------------------------------------------------
  function readOwner(req) {
    const token = req.cookies && req.cookies[cookieName];
    if (!token || !jwtSecret) return null;
    try {
      const decoded = jwt.verify(token, jwtSecret);
      return decoded && decoded.userId ? String(decoded.userId) : null;
    } catch (_) {
      return null;
    }
  }

  const requirePage = (req, res, next) => {
    const owner = readOwner(req);
    if (!owner) return res.redirect(`${loginPath}?next=${encodeURIComponent('/modshub')}`);
    req.ownerId = owner;
    next();
  };

  const requireApi = async (req, res, next) => {
    const owner = readOwner(req);
    if (!owner) return apiError(res, 401, 'unauthorized', 'Please sign in again');
    req.userId = owner;
    req.ownerId = workspaceOf(owner);
    req.username = await nameOf(owner);
    // Cookies are SameSite=Strict already; this is a second, header based check.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const site = req.get('sec-fetch-site');
      if (site && site !== 'same-origin' && site !== 'none') {
        return apiError(res, 403, 'cross_site', 'Cross-site requests are not allowed');
      }
      const origin = req.get('origin');
      if (origin) {
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch (_) {
          /* fall through */
        }
        if (originHost !== req.get('host')) {
          return apiError(res, 403, 'cross_site', 'Cross-site requests are not allowed');
        }
      }
    }
    next();
  };

  // ---- page -------------------------------------------------------------
  router.get('/', requirePage, (req, res) => {
    let version = '0';
    try {
      version = String(Math.floor(fs.statSync(BUNDLE).mtimeMs));
    } catch (_) {
      /* bundle not built yet: page renders a helpful message */
    }
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: data: blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    });
    res.render('modshub/index', {
      layout: false,
      title: 'ModsHub Post Studio',
      version,
      built: version !== '0',
    });
  });

  // ---- API --------------------------------------------------------------
  const api = express.Router();
  api.use(requireApi);
  api.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  const json = express.json({ limit: '12mb', type: 'application/json' });

  api.get('/bootstrap', async (req, res, next) => {
    try {
      const [posts, settings] = await Promise.all([store.listPosts(req.ownerId), store.getSettings(req.ownerId)]);
      const slots = await store.listSlots(req.ownerId);
      res.json({
        user: { id: req.userId, name: req.username },
        workspace: req.ownerId,
        posts,
        slots,
        settings,
        serverTime: new Date().toISOString(),
        limits: { ...LIMITS, assetBytes: MAX_ASSET_BYTES },
      });
    } catch (e) {
      next(e);
    }
  });

  async function checkAsset(ownerId, post) {
    const src = post.image && post.image.src;
    const m = src && ASSET_PATH_RE.exec(src);
    if (!m) return true;
    return store.assetExists(ownerId, m[1]);
  }

  async function cleanupAsset(ownerId, src) {
    const m = src && ASSET_PATH_RE.exec(src);
    if (!m) return;
    if ((await store.countImageRefs(ownerId, src)) === 0) await store.deleteAsset(ownerId, m[1]);
  }

  api.put('/posts/:id', json, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_RE.test(id)) return apiError(res, 400, 'bad_id', 'Invalid post id');
      const body = req.body || {};
      const result = validatePost({ ...(body.post || {}), id }, { path: 'post', defaultTimezone: body.post && body.post.timezone });
      if (!result.ok) return apiError(res, 422, 'invalid_post', 'Post failed validation', { details: result.errors });
      const baseRevision = body.baseRevision === null || body.baseRevision === undefined ? null : Number(body.baseRevision);
      if (baseRevision !== null && (!Number.isInteger(baseRevision) || baseRevision < 1)) {
        return apiError(res, 400, 'bad_revision', 'baseRevision must be a positive integer or null');
      }
      if (!(await checkAsset(req.ownerId, result.value))) {
        return apiError(res, 422, 'invalid_post', 'Post failed validation', {
          details: [{ path: 'post.image.src', message: 'uploaded image was not found' }],
        });
      }
      const previous = baseRevision === null ? null : await store.getPost(req.ownerId, id);
      result.value.updatedBy = req.username;
      const saved = await store.upsertPost(req.ownerId, result.value, baseRevision);
      if (saved.status === 'conflict') {
        return res.status(409).json({ error: 'conflict', message: 'Post was changed elsewhere', server: saved.server });
      }
      if (previous && previous.image && (!saved.post.image || previous.image.src !== saved.post.image.src)) {
        await cleanupAsset(req.ownerId, previous.image.src);
      }
      res.json({ post: saved.post });
    } catch (e) {
      next(e);
    }
  });

  api.delete('/posts/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_RE.test(id)) return apiError(res, 400, 'bad_id', 'Invalid post id');
      const previous = await store.getPost(req.ownerId, id);
      await store.deletePost(req.ownerId, id);
      if (previous && previous.image) await cleanupAsset(req.ownerId, previous.image.src);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  api.post('/posts/import', json, async (req, res, next) => {
    try {
      const { posts, onConflict } = req.body || {};
      if (!Array.isArray(posts) || posts.length === 0) return apiError(res, 400, 'bad_request', 'posts must be a non-empty array');
      if (posts.length > LIMITS.postsPerRequest) {
        return apiError(res, 413, 'too_many', `At most ${LIMITS.postsPerRequest} posts per request`);
      }
      if (!['skip', 'overwrite'].includes(onConflict)) {
        return apiError(res, 400, 'bad_request', 'onConflict must be "skip" or "overwrite"');
      }
      const validated = posts.map((p, i) => validatePost(p, { path: `posts[${i}]` }));
      const ids = validated.filter((v) => v.ok).map((v) => v.value.id);
      const existing = await store.existingIds(req.ownerId, ids);
      const seen = new Set();
      const results = [];
      for (let i = 0; i < validated.length; i += 1) {
        const v = validated[i];
        if (!v.ok) {
          results.push({ index: i, status: 'invalid', errors: v.errors });
          continue;
        }
        const post = v.value;
        post.updatedBy = req.username;
        if (seen.has(post.id)) {
          results.push({ index: i, id: post.id, status: 'skipped', reason: 'duplicate id in request' });
          continue;
        }
        seen.add(post.id);
        if (!(await checkAsset(req.ownerId, post))) {
          results.push({ index: i, id: post.id, status: 'invalid', errors: [{ path: `posts[${i}].image.src`, message: 'uploaded image was not found' }] });
          continue;
        }
        if (existing.has(post.id)) {
          if (onConflict === 'skip') {
            results.push({ index: i, id: post.id, status: 'skipped', reason: 'already exists' });
            continue;
          }
          const saved = await store.replacePost(req.ownerId, post);
          results.push({ index: i, id: post.id, status: 'updated', post: saved });
        } else {
          const saved = await store.insertPost(req.ownerId, post);
          results.push({ index: i, id: post.id, status: 'created', post: saved });
        }
      }
      res.json({ results });
    } catch (e) {
      next(e);
    }
  });

  api.post('/posts/bulk', json, async (req, res, next) => {
    try {
      const { action, ids, patch } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => typeof x === 'string' && ID_RE.test(x))) {
        return apiError(res, 400, 'bad_request', 'ids must be a list of 1-500 valid post ids');
      }
      if (action === 'delete') {
        const before = await store.listPosts(req.ownerId);
        const images = before.filter((p) => ids.includes(p.id) && p.image).map((p) => p.image.src);
        const deleted = await store.deleteMany(req.ownerId, ids);
        for (const src of new Set(images)) await cleanupAsset(req.ownerId, src);
        return res.json({ deleted });
      }
      if (action === 'patch') {
        const clean = {};
        if (patch && patch.status !== undefined) {
          if (!STATUSES.includes(patch.status)) return apiError(res, 400, 'bad_request', 'invalid status');
          clean.status = patch.status;
        }
        if (patch && patch.category !== undefined) {
          if (typeof patch.category !== 'string' || patch.category.length > LIMITS.category) {
            return apiError(res, 400, 'bad_request', 'invalid category');
          }
          clean.category = patch.category.trim();
        }
        if (Object.keys(clean).length === 0) return apiError(res, 400, 'bad_request', 'patch must set status or category');
        clean.updatedBy = req.username;
        const posts = await store.patchMany(req.ownerId, ids, clean);
        return res.json({ posts });
      }
      return apiError(res, 400, 'bad_request', 'action must be "delete" or "patch"');
    } catch (e) {
      next(e);
    }
  });

  api.put('/slots/:id', json, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_RE.test(id)) return apiError(res, 400, 'bad_id', 'Invalid slot id');
      const body = req.body || {};
      const result = validateSlot({ ...(body.slot || {}), id }, { path: 'slot', defaultTimezone: body.slot && body.slot.timezone });
      if (!result.ok) return apiError(res, 422, 'invalid_slot', 'Slot failed validation', { details: result.errors });
      const saved = await store.putSlot(req.ownerId, { ...result.value, createdBy: req.username });
      res.json({ slot: saved });
    } catch (e) {
      next(e);
    }
  });

  api.delete('/slots/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ID_RE.test(id)) return apiError(res, 400, 'bad_id', 'Invalid slot id');
      await store.deleteSlot(req.ownerId, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  api.put('/settings', json, async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = validateSettings(body.settings);
      if (!result.ok) return apiError(res, 422, 'invalid_settings', 'Settings failed validation', { details: result.errors });
      const baseRevision = Number(body.baseRevision) || 0;
      const current = await store.getSettings(req.ownerId);
      // Partial updates merge into the stored document.
      const { revision: _rev, ...currentData } = current;
      const saved = await store.putSettings(req.ownerId, { ...currentData, ...result.value }, baseRevision);
      if (saved.status === 'conflict') {
        return res.status(409).json({ error: 'conflict', message: 'Settings were changed elsewhere', server: saved.server });
      }
      res.json({ settings: saved.settings });
    } catch (e) {
      next(e);
    }
  });

  api.post(
    '/assets',
    express.raw({ type: IMAGE_TYPES, limit: MAX_ASSET_BYTES }),
    async (req, res, next) => {
      try {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return apiError(res, 415, 'unsupported_type', 'Send the image as raw png, jpeg, webp or gif');
        }
        const mime = detectImageType(req.body);
        if (!mime || !IMAGE_TYPES.includes(mime)) {
          return apiError(res, 415, 'unsupported_type', 'File is not a valid png, jpeg, webp or gif image');
        }
        if ((await store.countAssets(req.ownerId)) >= MAX_ASSETS_PER_OWNER) {
          return apiError(res, 409, 'quota', 'Too many uploaded images, remove unused posts first');
        }
        const rawName = req.get('x-filename');
        const name = rawName ? decodeURIComponent(rawName).replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 100) : '';
        const asset = await store.putAsset(req.ownerId, { mime, data: req.body, name });
        res.status(201).json({ id: asset.id, src: `/modshub/api/assets/${asset.id}`, mime, size: asset.size });
      } catch (e) {
        next(e);
      }
    }
  );

  api.get('/assets/:id', async (req, res, next) => {
    try {
      if (!ASSET_ID_RE.test(req.params.id)) return apiError(res, 404, 'not_found', 'Not found');
      const asset = await store.getAsset(req.ownerId, req.params.id);
      if (!asset) return apiError(res, 404, 'not_found', 'Not found');
      res.set({
        'Content-Type': asset.mime,
        'Content-Length': String(asset.data.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
      res.end(asset.data);
    } catch (e) {
      next(e);
    }
  });

  api.use((req, res) => apiError(res, 404, 'not_found', 'Unknown endpoint'));

  // JSON error handler (body-parser size/syntax errors, store failures).
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return apiError(res, 413, 'too_large', 'Request body is too large');
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return apiError(res, 400, 'bad_json', 'Request body is not valid JSON');
    }
    if (err && err.type === 'encoding.unsupported') {
      return apiError(res, 415, 'unsupported_type', 'Unsupported request encoding');
    }
    console.error('[modshub]', err);
    return apiError(res, 500, 'server_error', 'Something went wrong on the server');
  });

  router.use('/api', api);
  return router;
}

module.exports = { createModshubRouter, detectImageType };
