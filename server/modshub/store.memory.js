'use strict';

const crypto = require('crypto');
const { defaultSettings } = require('./schema');

/**
 * In-memory implementation of the Post Studio store contract.
 *
 * Used by the unit/API tests and by the e2e test server so they run without a
 * MongoDB instance. It mirrors store.mongo.js method for method:
 *
 *   listPosts(ownerId)                       -> Post[]
 *   getPost(ownerId, id)                     -> Post | null
 *   upsertPost(ownerId, post, baseRevision)  -> {status:'ok', post} | {status:'conflict', server}
 *   deletePost(ownerId, id)                  -> boolean
 *   existingIds(ownerId, ids)                -> Set<string>
 *   replacePost / insertPost / patchMany / deleteMany
 *   countImageRefs(ownerId, src)             -> number
 *   getSettings / putSettings(ownerId, data, baseRevision)
 *   countAssets / putAsset / getAsset / assetExists / deleteAsset
 *
 * A Post is { id, title, scheduledAt(ISO UTC), timezone, status, category,
 * tags, content, image, notes, revision, createdAt, updatedAt }.
 */
function createMemoryStore() {
  const posts = new Map(); // ownerId -> Map(id -> post)
  const settings = new Map(); // ownerId -> { data, revision }
  const assets = new Map(); // ownerId -> Map(id -> { mime, data, name })

  const bucket = (map, ownerId) => {
    if (!map.has(ownerId)) map.set(ownerId, new Map());
    return map.get(ownerId);
  };
  const clone = (value) => (value === null ? null : structuredClone(value));
  const iso = (d) => new Date(d).toISOString();

  function build(post, revision, existing) {
    const now = new Date().toISOString();
    return {
      id: post.id,
      title: post.title,
      scheduledAt: iso(post.scheduledAt),
      timezone: post.timezone,
      status: post.status,
      category: post.category || '',
      tags: [...(post.tags || [])],
      content: post.content || '',
      image: post.image ? { src: post.image.src, alt: post.image.alt || '' } : null,
      notes: post.notes || '',
      revision,
      createdAt: existing ? existing.createdAt : post.createdAt || now,
      updatedAt: now,
    };
  }

  return {
    async listPosts(ownerId) {
      return [...bucket(posts, ownerId).values()]
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .map(clone);
    },

    async getPost(ownerId, id) {
      return clone(bucket(posts, ownerId).get(id) || null);
    },

    async upsertPost(ownerId, post, baseRevision) {
      const map = bucket(posts, ownerId);
      const existing = map.get(post.id);
      if (baseRevision === null || baseRevision === undefined) {
        if (existing) return { status: 'conflict', server: clone(existing) };
        const created = build(post, 1, null);
        map.set(post.id, created);
        return { status: 'ok', post: clone(created) };
      }
      if (!existing || existing.revision !== baseRevision) {
        return { status: 'conflict', server: clone(existing || null) };
      }
      const updated = build(post, existing.revision + 1, existing);
      map.set(post.id, updated);
      return { status: 'ok', post: clone(updated) };
    },

    async deletePost(ownerId, id) {
      return bucket(posts, ownerId).delete(id);
    },

    async existingIds(ownerId, ids) {
      const map = bucket(posts, ownerId);
      return new Set(ids.filter((id) => map.has(id)));
    },

    async replacePost(ownerId, post) {
      const map = bucket(posts, ownerId);
      const existing = map.get(post.id);
      const next = build(post, existing ? existing.revision + 1 : 1, existing);
      map.set(post.id, next);
      return clone(next);
    },

    async insertPost(ownerId, post) {
      const map = bucket(posts, ownerId);
      if (map.has(post.id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const created = build(post, 1, null);
      map.set(post.id, created);
      return clone(created);
    },

    async patchMany(ownerId, ids, patch) {
      const map = bucket(posts, ownerId);
      const out = [];
      for (const id of ids) {
        const existing = map.get(id);
        if (!existing) continue;
        const next = {
          ...existing,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          revision: existing.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        map.set(id, next);
        out.push(clone(next));
      }
      return out;
    },

    async deleteMany(ownerId, ids) {
      const map = bucket(posts, ownerId);
      let count = 0;
      for (const id of ids) if (map.delete(id)) count += 1;
      return count;
    },

    async countImageRefs(ownerId, src) {
      let n = 0;
      for (const p of bucket(posts, ownerId).values()) if (p.image && p.image.src === src) n += 1;
      return n;
    },

    async getSettings(ownerId) {
      const row = settings.get(ownerId);
      if (!row) return { ...defaultSettings(), revision: 0 };
      return { ...defaultSettings(), ...clone(row.data), revision: row.revision };
    },

    async putSettings(ownerId, data, baseRevision) {
      const row = settings.get(ownerId);
      const current = row ? row.revision : 0;
      if ((baseRevision || 0) !== current) {
        return {
          status: 'conflict',
          server: row ? { ...defaultSettings(), ...clone(row.data), revision: row.revision } : null,
        };
      }
      const next = { data: clone(data), revision: current + 1 };
      settings.set(ownerId, next);
      return { status: 'ok', settings: { ...defaultSettings(), ...clone(next.data), revision: next.revision } };
    },

    async countAssets(ownerId) {
      return bucket(assets, ownerId).size;
    },

    async putAsset(ownerId, { mime, data, name }) {
      const id = crypto.randomBytes(12).toString('hex');
      bucket(assets, ownerId).set(id, { mime, data: Buffer.from(data), name: name || '' });
      return { id, mime, size: data.length };
    },

    async getAsset(ownerId, id) {
      const a = bucket(assets, ownerId).get(id);
      return a ? { mime: a.mime, data: Buffer.from(a.data) } : null;
    },

    async assetExists(ownerId, id) {
      return bucket(assets, ownerId).has(id);
    },

    async deleteAsset(ownerId, id) {
      return bucket(assets, ownerId).delete(id);
    },
  };
}

module.exports = { createMemoryStore };
