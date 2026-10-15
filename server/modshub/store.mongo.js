'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { defaultSettings } = require('./schema');

/**
 * MongoDB store for ModsHub Post Studio.
 *
 * Every query is scoped by `ownerId` (the admin user id from the JWT), so a
 * second admin account never sees someone else's calendar.
 *
 * The store contract is shared with store.memory.js - see that file for the
 * documented return shapes.
 */

const { Schema } = mongoose;

const PostSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    id: { type: String, required: true },
    title: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    timezone: { type: String, required: true },
    status: { type: String, required: true },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },
    content: { type: String, default: '' },
    image: { type: new Schema({ src: String, alt: String }, { _id: false }), default: null },
    notes: { type: String, default: '' },
    discord: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    revision: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'modshub_posts', versionKey: false, minimize: false }
);
PostSchema.index({ ownerId: 1, id: 1 }, { unique: true });
PostSchema.index({ ownerId: 1, scheduledAt: 1 });

const SettingsSchema = new Schema(
  {
    ownerId: { type: String, required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
    revision: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'modshub_settings', versionKey: false, minimize: false }
);

const SlotSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    id: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, default: '' },
    timezone: { type: String, required: true },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'modshub_slots', versionKey: false }
);
SlotSchema.index({ ownerId: 1, id: 1 }, { unique: true });

const AssetSchema = new Schema(
  {
    ownerId: { type: String, required: true },
    id: { type: String, required: true },
    mime: { type: String, required: true },
    name: { type: String, default: '' },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'modshub_assets', versionKey: false }
);
AssetSchema.index({ ownerId: 1, id: 1 }, { unique: true });

function models(connection) {
  const c = connection || mongoose;
  return {
    Post: c.models.ModsHubPost || c.model('ModsHubPost', PostSchema),
    Settings: c.models.ModsHubSettings || c.model('ModsHubSettings', SettingsSchema),
    Asset: c.models.ModsHubAsset || c.model('ModsHubAsset', AssetSchema),
    Slot: c.models.ModsHubSlot || c.model('ModsHubSlot', SlotSchema),
  };
}

function toApi(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    scheduledAt: new Date(doc.scheduledAt).toISOString(),
    timezone: doc.timezone,
    status: doc.status,
    category: doc.category || '',
    tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
    content: doc.content || '',
    image: doc.image && doc.image.src ? { src: doc.image.src, alt: doc.image.alt || '' } : null,
    notes: doc.notes || '',
    discord: doc.discord || null,
    createdBy: doc.createdBy || '',
    updatedBy: doc.updatedBy || '',
    revision: doc.revision,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

function slotToApi(doc) {
  return {
    id: doc.id,
    date: doc.date,
    time: doc.time || '',
    timezone: doc.timezone,
    note: doc.note || '',
    createdBy: doc.createdBy || '',
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function editableFields(post) {
  return {
    title: post.title,
    scheduledAt: new Date(post.scheduledAt),
    timezone: post.timezone,
    status: post.status,
    category: post.category,
    tags: post.tags,
    content: post.content,
    image: post.image,
    notes: post.notes,
    discord: post.discord || null,
  };
}

function isDuplicateKey(error) {
  return error && (error.code === 11000 || /E11000/.test(String(error.message)));
}

function createMongoStore(connection) {
  const { Post, Settings, Asset, Slot } = models(connection);

  async function getPost(ownerId, id) {
    return toApi(await Post.findOne({ ownerId, id }).lean());
  }

  return {
    async listPosts(ownerId) {
      const docs = await Post.find({ ownerId }).sort({ scheduledAt: 1 }).lean();
      return docs.map(toApi);
    },

    getPost,

    async upsertPost(ownerId, post, baseRevision) {
      const now = new Date();
      if (baseRevision === null || baseRevision === undefined) {
        try {
          const created = await Post.create({
            ownerId,
            id: post.id,
            ...editableFields(post),
            createdBy: post.updatedBy || '',
            updatedBy: post.updatedBy || '',
            revision: 1,
            createdAt: post.createdAt ? new Date(post.createdAt) : now,
            updatedAt: now,
          });
          return { status: 'ok', post: toApi(created.toObject()) };
        } catch (error) {
          if (isDuplicateKey(error)) return { status: 'conflict', server: await getPost(ownerId, post.id) };
          throw error;
        }
      }

      const updated = await Post.findOneAndUpdate(
        { ownerId, id: post.id, revision: baseRevision },
        { $set: { ...editableFields(post), updatedBy: post.updatedBy || '', updatedAt: now }, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true }
      ).lean();
      if (updated) return { status: 'ok', post: toApi(updated) };
      return { status: 'conflict', server: await getPost(ownerId, post.id) };
    },

    async deletePost(ownerId, id) {
      const res = await Post.deleteOne({ ownerId, id });
      return res.deletedCount > 0;
    },

    async existingIds(ownerId, ids) {
      const docs = await Post.find({ ownerId, id: { $in: ids } }).select('id').lean();
      return new Set(docs.map((d) => d.id));
    },

    async replacePost(ownerId, post) {
      const now = new Date();
      const doc = await Post.findOneAndUpdate(
        { ownerId, id: post.id },
        {
          $set: { ...editableFields(post), updatedBy: post.updatedBy || '', updatedAt: now },
          $inc: { revision: 1 },
          $setOnInsert: { createdAt: post.createdAt ? new Date(post.createdAt) : now, createdBy: post.updatedBy || '' },
        },
        { returnDocument: 'after', upsert: true, runValidators: true }
      ).lean();
      return toApi(doc);
    },

    async insertPost(ownerId, post) {
      const now = new Date();
      const doc = await Post.create({
        ownerId,
        id: post.id,
        ...editableFields(post),
        createdBy: post.updatedBy || '',
        updatedBy: post.updatedBy || '',
        revision: 1,
        createdAt: post.createdAt ? new Date(post.createdAt) : now,
        updatedAt: now,
      });
      return toApi(doc.toObject());
    },

    async patchMany(ownerId, ids, patch) {
      const set = { updatedAt: new Date() };
      if (patch.updatedBy) set.updatedBy = patch.updatedBy;
      if (patch.status) set.status = patch.status;
      if (patch.category !== undefined) set.category = patch.category;
      await Post.updateMany({ ownerId, id: { $in: ids } }, { $set: set, $inc: { revision: 1 } });
      const docs = await Post.find({ ownerId, id: { $in: ids } }).lean();
      return docs.map(toApi);
    },

    async deleteMany(ownerId, ids) {
      const res = await Post.deleteMany({ ownerId, id: { $in: ids } });
      return res.deletedCount;
    },

    async countImageRefs(ownerId, src) {
      return Post.countDocuments({ ownerId, 'image.src': src });
    },

    async getSettings(ownerId) {
      const doc = await Settings.findOne({ ownerId }).lean();
      if (!doc) return { ...defaultSettings(), revision: 0 };
      return { ...defaultSettings(), ...doc.data, revision: doc.revision };
    },

    async putSettings(ownerId, data, baseRevision) {
      const now = new Date();
      if (!baseRevision) {
        try {
          const created = await Settings.create({ ownerId, data, revision: 1, updatedAt: now });
          return { status: 'ok', settings: { ...defaultSettings(), ...created.data, revision: created.revision } };
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
        }
      } else {
        const updated = await Settings.findOneAndUpdate(
          { ownerId, revision: baseRevision },
          { $set: { data, updatedAt: now }, $inc: { revision: 1 } },
          { returnDocument: 'after' }
        ).lean();
        if (updated) return { status: 'ok', settings: { ...defaultSettings(), ...updated.data, revision: updated.revision } };
      }
      const current = await Settings.findOne({ ownerId }).lean();
      return {
        status: 'conflict',
        server: current ? { ...defaultSettings(), ...current.data, revision: current.revision } : null,
      };
    },

    async countAssets(ownerId) {
      return Asset.countDocuments({ ownerId });
    },

    async putAsset(ownerId, { mime, data, name }) {
      const id = crypto.randomBytes(12).toString('hex');
      await Asset.create({ ownerId, id, mime, name: name || '', size: data.length, data });
      return { id, mime, size: data.length };
    },

    async getAsset(ownerId, id) {
      const doc = await Asset.findOne({ ownerId, id }).lean();
      if (!doc) return null;
      // lean() returns a BSON Binary for Buffer fields on some driver versions.
      const raw = doc.data && doc.data.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
      return { mime: doc.mime, data: raw };
    },

    async assetExists(ownerId, id) {
      return Boolean(await Asset.exists({ ownerId, id }));
    },

    async deleteAsset(ownerId, id) {
      const res = await Asset.deleteOne({ ownerId, id });
      return res.deletedCount > 0;
    },

    async listSlots(ownerId) {
      const docs = await Slot.find({ ownerId }).sort({ date: 1, time: 1 }).lean();
      return docs.map(slotToApi);
    },

    async putSlot(ownerId, slot) {
      const doc = await Slot.findOneAndUpdate(
        { ownerId, id: slot.id },
        {
          $set: { date: slot.date, time: slot.time || '', timezone: slot.timezone, note: slot.note || '' },
          $setOnInsert: { createdBy: slot.createdBy || '', createdAt: new Date() },
        },
        { returnDocument: 'after', upsert: true }
      ).lean();
      return slotToApi(doc);
    },

    async deleteSlot(ownerId, id) {
      const res = await Slot.deleteOne({ ownerId, id });
      return res.deletedCount > 0;
    },

    /**
     * Moves documents owned by other accounts into `target`, so every admin
     * works in one shared calendar. Idempotent; conflicting ids are skipped.
     */
    async adoptWorkspace(target) {
      let moved = 0;
      for (const Model of [Post, Slot, Asset]) {
        const foreign = await Model.find({ ownerId: { $ne: target } }).select('_id').lean();
        for (const { _id } of foreign) {
          try {
            await Model.updateOne({ _id }, { $set: { ownerId: target } });
            moved += 1;
          } catch (error) {
            if (!isDuplicateKey(error)) throw error;
          }
        }
      }
      // Settings: one document per workspace. Keep the target's, else the oldest.
      const mine = await Settings.findOne({ ownerId: target }).lean();
      const others = await Settings.find({ ownerId: { $ne: target } }).sort({ updatedAt: 1 }).lean();
      if (others.length) {
        if (!mine) {
          const [first, ...rest] = others;
          await Settings.updateOne({ _id: first._id }, { $set: { ownerId: target } });
          moved += 1;
          for (const o of rest) await Settings.deleteOne({ _id: o._id });
        } else {
          for (const o of others) await Settings.deleteOne({ _id: o._id });
        }
      }
      return moved;
    },
  };
}

module.exports = { createMongoStore, models };
