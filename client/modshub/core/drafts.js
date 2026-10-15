/**
 * Local draft recovery.
 *
 * localStorage is *not* the database - the server is. Drafts only exist so an
 * accidental refresh, crash or lost connection never loses typing. A draft is
 * written on every edit and removed as soon as the server confirms the save.
 */

const PREFIX = 'modshub:v1:draft:';
const FIELDS = ['title', 'scheduledAt', 'timezone', 'status', 'category', 'tags', 'content', 'image', 'images', 'notes', 'discord'];

export function sameEditableContent(a, b) {
  if (!a || !b) return false;
  return FIELDS.every((field) => JSON.stringify(a[field] ?? null) === JSON.stringify(b[field] ?? null));
}

export function createDraftStore(storage, ownerKey) {
  const keyFor = (id) => `${PREFIX}${ownerKey}:${id}`;
  const prefix = `${PREFIX}${ownerKey}:`;

  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  };

  return {
    save(post, baseRevision) {
      return safe(() => {
        storage.setItem(keyFor(post.id), JSON.stringify({ post, baseRevision, savedAt: Date.now() }));
        return true;
      }, false);
    },
    remove(id) {
      safe(() => storage.removeItem(keyFor(id)));
    },
    load(id) {
      return safe(() => {
        const raw = storage.getItem(keyFor(id));
        return raw ? JSON.parse(raw) : null;
      }, null);
    },
    list() {
      return safe(() => {
        const out = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key && key.startsWith(prefix)) {
            const raw = storage.getItem(key);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (parsed && parsed.post && parsed.post.id) out.push(parsed);
            } catch (_) {
              /* ignore corrupt entry */
            }
          }
        }
        return out.sort((a, b) => b.savedAt - a.savedAt);
      }, []);
    },
  };
}

/**
 * Splits stored drafts into the ones worth offering back and the ones that
 * are already represented on the server.
 * @returns {{recoverable: Array<{draft: object, server: object|null, kind: 'new'|'unsaved'|'behind'}>, obsolete: string[]}}
 */
export function classifyDrafts(drafts, serverPosts) {
  const byId = new Map(serverPosts.map((p) => [p.id, p]));
  const recoverable = [];
  const obsolete = [];
  for (const draft of drafts) {
    const server = byId.get(draft.post.id) || null;
    if (!server) {
      recoverable.push({ draft, server: null, kind: 'new' });
    } else if (sameEditableContent(draft.post, server)) {
      obsolete.push(draft.post.id);
    } else if (draft.baseRevision === server.revision) {
      recoverable.push({ draft, server, kind: 'unsaved' });
    } else {
      recoverable.push({ draft, server, kind: 'behind' });
    }
  }
  return { recoverable, obsolete };
}
