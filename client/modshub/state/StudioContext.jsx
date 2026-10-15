import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import schema from '../../../server/modshub/schema.js';
import { api, describeError, NetworkError, setUnauthorizedHandler } from './api.js';
import { SaveQueue } from '../core/save-queue.js';
import { createDraftStore, classifyDrafts } from '../core/drafts.js';
import { newPostId, newTemplateId, uniqueId } from '../core/ids.js';
import { fromWall, resolveZone, wallParts, moveToDate, moveToWall, todayKey, startOfMonth } from '../core/time.js';
import { BUILT_IN_TEMPLATES } from '../core/templates.js';

const { defaultSettings } = schema;

const StudioContext = createContext(null);
export const useStudio = () => useContext(StudioContext);

const CAL_MODES = ['month', 'week', 'day', 'list'];
const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      /* private mode / quota: UI preferences are optional */
    }
  },
};

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const date = p.get('date');
  return {
    view: p.get('view') === 'posts' ? 'posts' : 'calendar',
    mode: CAL_MODES.includes(p.get('mode')) ? p.get('mode') : null,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    post: p.get('post') || null,
  };
}

const matches = (post, q) => {
  if (!q) return true;
  const needle = q.toLocaleLowerCase();
  return (
    post.title.toLocaleLowerCase().includes(needle) ||
    post.content.toLocaleLowerCase().includes(needle) ||
    post.notes.toLocaleLowerCase().includes(needle) ||
    post.tags.some((t) => t.toLocaleLowerCase().includes(needle))
  );
};

export function StudioProvider({ children }) {
  const [phase, setPhase] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [version, setVersion] = useState(0);
  const [settings, setSettingsState] = useState(() => ({ ...defaultSettings(), revision: 0 }));
  const [limits, setLimits] = useState(null);
  const [userId, setUserId] = useState('');
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [recoverable, setRecoverable] = useState([]);
  const [conflicts, setConflicts] = useState({});
  const [queueTick, setQueueTick] = useState(0);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  const postsRef = useRef(new Map());
  const settingsRef = useRef(settings);
  const draftsRef = useRef(null);
  const queueRef = useRef(null);
  const toastId = useRef(0);
  const settingsTimer = useRef(null);
  const settingsSaving = useRef(false);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  settingsRef.current = settings;

  // ---- UI state -----------------------------------------------------------
  const urlInit = useMemo(readUrl, []);
  const zoneForInit = resolveZone('auto');
  const [ui, setUiState] = useState(() => ({
    view: urlInit.view,
    calMode:
      urlInit.mode ||
      (CAL_MODES.includes(store.get('modshub:calMode', '')) ? store.get('modshub:calMode', '') : window.matchMedia('(max-width: 767px)').matches ? 'list' : 'month'),
    cursor: urlInit.date || todayKey(zoneForInit),
    selectedId: urlInit.post,
    editorMode: ['markdown', 'rich', 'split'].includes(store.get('modshub:editorMode', '')) ? store.get('modshub:editorMode', '') : 'split',
    previewTab: 'preview',
    showPreview: store.get('modshub:showPreview', '1') !== '0',
    mobileTab: 'edit',
    filters: { q: '', status: 'all', category: 'all', from: '', to: '', sort: 'date-asc' },
    selection: [],
  }));

  const setUi = useCallback((patch) => {
    setUiState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      if (next.calMode !== prev.calMode) store.set('modshub:calMode', next.calMode);
      if (next.editorMode !== prev.editorMode) store.set('modshub:editorMode', next.editorMode);
      if (next.showPreview !== prev.showPreview) store.set('modshub:showPreview', next.showPreview ? '1' : '0');
      return next;
    });
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set('view', ui.view);
    if (ui.view === 'calendar') {
      p.set('mode', ui.calMode);
      p.set('date', ui.cursor);
    }
    if (ui.selectedId) p.set('post', ui.selectedId);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [ui.view, ui.calMode, ui.cursor, ui.selectedId]);

  // ---- toasts / confirm ---------------------------------------------------
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message, kind = 'success', extra = {}) => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((t) => [...t.slice(-3), { id, message, kind, ...extra }]);
      const ttl = extra.sticky ? 0 : kind === 'error' ? 7000 : 2600;
      if (ttl) window.setTimeout(() => dismissToast(id), ttl);
      return id;
    },
    [dismissToast]
  );

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setConfirmState({ ...options, resolve });
      }),
    []
  );
  const answerConfirm = useCallback((value) => {
    setConfirmState((state) => {
      if (state) state.resolve(value);
      return null;
    });
  }, []);

  // ---- save queue ---------------------------------------------------------
  if (!queueRef.current) {
    queueRef.current = new SaveQueue({
      delay: 800,
      save: (post, base) => api.savePost(post, base),
      onChange: () => setQueueTick((n) => n + 1),
      onSaved: (id, serverPost, { superseded }) => {
        const current = postsRef.current.get(id);
        if (current) {
          postsRef.current.set(id, {
            ...current,
            revision: serverPost.revision,
            createdAt: serverPost.createdAt,
            updatedAt: superseded ? current.updatedAt : serverPost.updatedAt,
          });
          setVersion((v) => v + 1);
        }
        if (!superseded && draftsRef.current) draftsRef.current.remove(id);
      },
    });
  }
  const queue = queueRef.current;

  // Conflicts are mirrored into React state so the UI can show the dialog.
  useEffect(() => {
    const next = {};
    for (const [id, entry] of queue.entries) if (entry.status === 'conflict') next[id] = entry.server;
    setConflicts((prev) => {
      const same = Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]);
      return same ? prev : next;
    });
  }, [queueTick, queue]);

  // ---- bootstrap ----------------------------------------------------------
  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const data = await api.bootstrap();
      const map = new Map();
      for (const p of data.posts) {
        map.set(p.id, p);
        queue.track(p.id, p.revision);
      }
      postsRef.current = map;
      setSettingsState(data.settings);
      settingsRef.current = data.settings;
      setLimits(data.limits);
      setUserId(data.user.id);
      const drafts = createDraftStore(window.localStorage, data.user.id);
      draftsRef.current = drafts;
      const { recoverable: rec, obsolete } = classifyDrafts(drafts.list(), data.posts);
      obsolete.forEach((id) => drafts.remove(id));
      setRecoverable(rec);
      setPhase('ready');
      bump();
    } catch (error) {
      setLoadError(error);
      setPhase('error');
    }
  }, [bump, queue]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      window.location.assign(`/admin?next=${encodeURIComponent('/modshub')}`);
    });
    load();
  }, [load]);

  // ---- leaving the page ---------------------------------------------------
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (queue.hasUnsaved) {
        event.preventDefault();
        // eslint-disable-next-line no-param-reassign
        event.returnValue = '';
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') queue.flushAll();
    };
    const onOnline = () => {
      setOnline(true);
      queue.flushAll();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [queue]);

  // ---- derived data -------------------------------------------------------
  const displayZone = useMemo(() => resolveZone(settings.defaultTimezone), [settings.defaultTimezone]);
  const posts = useMemo(
    () => [...postsRef.current.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
  const categories = settings.categories;
  const categoryById = useCallback(
    (id) => categories.find((c) => c.id === id) || { id, name: id || 'Uncategorised', color: '#6a6e73' },
    [categories]
  );
  const templates = useMemo(() => [...BUILT_IN_TEMPLATES, ...(settings.templates || []).map((t) => ({ ...t, builtIn: false }))], [settings.templates]);

  const filteredPosts = useMemo(() => {
    const f = ui.filters;
    const out = posts.filter((p) => {
      if (f.status !== 'all' && p.status !== f.status) return false;
      if (f.category !== 'all' && p.category !== f.category) return false;
      if (f.from || f.to) {
        const day = wallParts(p.scheduledAt, displayZone).date;
        if (f.from && day < f.from) return false;
        if (f.to && day > f.to) return false;
      }
      return matches(p, f.q.trim());
    });
    if (f.sort === 'date-desc') out.reverse();
    if (f.sort === 'modified-desc') out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (f.sort === 'modified-asc') out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    return out;
  }, [posts, ui.filters, displayZone]);

  const selectedPost = ui.selectedId ? postsRef.current.get(ui.selectedId) || null : null;

  // ---- save state summary -------------------------------------------------
  const saveState = useMemo(() => {
    const s = queue.summary();
    let status = 'saved';
    if (s.conflict > 0) status = 'conflict';
    else if (s.error > 0) status = 'error';
    else if (s.dirty + s.saving > 0) status = 'saving';
    return { status, pending: s.dirty + s.saving + s.error + s.conflict, ...s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueTick, queue]);

  // ---- post actions -------------------------------------------------------
  const writePost = useCallback(
    (next) => {
      postsRef.current.set(next.id, next);
      bump();
      const entry = queue.entry(next.id);
      if (draftsRef.current) draftsRef.current.save(next, entry.baseRevision);
      queue.update(next);
    },
    [bump, queue]
  );

  const updatePost = useCallback(
    (id, patch) => {
      const prev = postsRef.current.get(id);
      if (!prev) return;
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      writePost(next);
    },
    [writePost]
  );

  const blankPost = useCallback(
    (overrides = {}) => {
      const s = settingsRef.current;
      const zone = resolveZone(s.defaultTimezone);
      const date = overrides.date || todayKey(zone);
      const time = overrides.time || s.defaultTime || '18:00';
      const when = fromWall(date, time, zone);
      const now = new Date().toISOString();
      return {
        id: newPostId(),
        title: 'Untitled post',
        scheduledAt: when ? when.iso : now,
        timezone: zone,
        status: 'draft',
        category: s.categories[0] ? s.categories[0].id : '',
        tags: [],
        content: '',
        image: null,
        notes: '',
        revision: null,
        createdAt: now,
        updatedAt: now,
      };
    },
    []
  );

  const createPost = useCallback(
    ({ date, time, template, open = true } = {}) => {
      const base = blankPost({ date, time });
      if (template) {
        base.title = template.title || base.title;
        base.content = template.content || '';
        base.category = template.category || base.category;
        base.tags = [...(template.tags || [])];
      }
      queue.track(base.id, null);
      writePost(base);
      if (open) setUi({ selectedId: base.id, mobileTab: 'edit' });
      return base;
    },
    [blankPost, queue, setUi, writePost]
  );

  const duplicatePost = useCallback(
    (id) => {
      const src = postsRef.current.get(id);
      if (!src) return null;
      const now = new Date().toISOString();
      const copy = {
        ...src,
        id: newPostId(),
        title: `${src.title} (copy)`.slice(0, 200),
        status: 'draft',
        tags: [...src.tags],
        image: src.image ? { ...src.image } : null,
        revision: null,
        createdAt: now,
        updatedAt: now,
      };
      queue.track(copy.id, null);
      writePost(copy);
      setUi({ selectedId: copy.id });
      toast('Post duplicated as a draft');
      return copy;
    },
    [queue, setUi, toast, writePost]
  );

  const removeLocal = useCallback(
    (id) => {
      postsRef.current.delete(id);
      queue.forget(id);
      if (draftsRef.current) draftsRef.current.remove(id);
    },
    [queue]
  );

  const deletePost = useCallback(
    async (id, { ask = true } = {}) => {
      const post = postsRef.current.get(id);
      if (!post) return false;
      if (ask) {
        const ok = await confirm({
          title: 'Delete this post?',
          message: `"${post.title}" will be removed from the calendar. This cannot be undone.`,
          confirmLabel: 'Delete post',
          danger: true,
        });
        if (!ok) return false;
      }
      removeLocal(id);
      setUi((p) => ({ selectedId: p.selectedId === id ? null : p.selectedId, selection: p.selection.filter((x) => x !== id) }));
      bump();
      try {
        await api.deletePost(id);
        toast('Post deleted');
      } catch (error) {
        postsRef.current.set(id, post);
        queue.track(id, post.revision);
        bump();
        toast(describeError(error), 'error');
        return false;
      }
      return true;
    },
    [bump, confirm, queue, removeLocal, setUi, toast]
  );

  const deletePosts = useCallback(
    async (ids) => {
      if (!ids.length) return false;
      const ok = await confirm({
        title: `Delete ${ids.length} post${ids.length > 1 ? 's' : ''}?`,
        message: 'The selected posts will be removed permanently. This cannot be undone.',
        confirmLabel: `Delete ${ids.length}`,
        danger: true,
      });
      if (!ok) return false;
      const backup = ids.map((id) => postsRef.current.get(id)).filter(Boolean);
      // Unsaved new posts only exist locally.
      const remote = backup.filter((p) => p.revision !== null).map((p) => p.id);
      backup.forEach((p) => removeLocal(p.id));
      setUi((p) => ({ selection: [], selectedId: ids.includes(p.selectedId) ? null : p.selectedId }));
      bump();
      try {
        if (remote.length) await api.bulkDelete(remote);
        toast(`${ids.length} post${ids.length > 1 ? 's' : ''} deleted`);
      } catch (error) {
        backup.forEach((p) => {
          postsRef.current.set(p.id, p);
          queue.track(p.id, p.revision);
        });
        bump();
        toast(describeError(error), 'error');
        return false;
      }
      return true;
    },
    [bump, confirm, queue, removeLocal, setUi, toast]
  );

  const movePost = useCallback(
    (id, { date, time }) => {
      const post = postsRef.current.get(id);
      if (!post) return;
      const zone = resolveZone(settingsRef.current.defaultTimezone);
      const iso = time ? moveToWall(post.scheduledAt, zone, date, time) : moveToDate(post.scheduledAt, zone, date);
      if (iso === post.scheduledAt) return;
      updatePost(id, { scheduledAt: iso });
    },
    [updatePost]
  );

  const bulkPatch = useCallback(
    async (ids, patch) => {
      // Flush local edits first so the server patch doesn't race an autosave.
      await queue.flushAll();
      try {
        const saved = await api.bulkPatch(ids, patch);
        for (const p of saved) {
          postsRef.current.set(p.id, p);
          queue.track(p.id, p.revision);
        }
        bump();
        toast(`Updated ${saved.length} post${saved.length === 1 ? '' : 's'}`);
        return true;
      } catch (error) {
        toast(describeError(error), 'error');
        return false;
      }
    },
    [bump, queue, toast]
  );

  // ---- images -------------------------------------------------------------
  const uploadImage = useCallback(
    async (file) => {
      if (!file) return null;
      const max = (limits && limits.assetBytes) || 3 * 1024 * 1024;
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
        toast('Use a PNG, JPEG, WebP or GIF image', 'error');
        return null;
      }
      if (file.size > max) {
        toast(`Image is larger than ${Math.round(max / 1024 / 1024)} MB`, 'error');
        return null;
      }
      try {
        const asset = await api.uploadAsset(file, file.name);
        return asset.src;
      } catch (error) {
        toast(describeError(error), 'error');
        return null;
      }
    },
    [limits, toast]
  );

  // ---- import -------------------------------------------------------------
  const importPosts = useCallback(
    async (items, onConflict) => {
      // Embedded data: URLs are uploaded as assets first.
      const prepared = [];
      for (const item of items) {
        let image = item.image;
        if (image && image.src && image.src.startsWith('data:')) {
          try {
            const blob = await (await fetch(image.src)).blob();
            const src = await uploadImage(blob);
            image = src ? { src, alt: image.alt || '' } : null;
          } catch (_) {
            image = null;
          }
        }
        prepared.push({ ...item, image });
      }
      const summary = { created: 0, updated: 0, skipped: 0, invalid: 0 };
      for (let i = 0; i < prepared.length; i += schema.LIMITS.postsPerRequest) {
        const chunk = prepared.slice(i, i + schema.LIMITS.postsPerRequest);
        const results = await api.importPosts(chunk, onConflict);
        for (const r of results) {
          summary[r.status] = (summary[r.status] || 0) + 1;
          if (r.post) {
            postsRef.current.set(r.post.id, r.post);
            queue.track(r.post.id, r.post.revision);
            if (draftsRef.current) draftsRef.current.remove(r.post.id);
          }
        }
      }
      bump();
      return summary;
    },
    [bump, queue, uploadImage]
  );

  // ---- settings -----------------------------------------------------------
  const flushSettings = useCallback(async () => {
    if (settingsSaving.current) return;
    settingsSaving.current = true;
    try {
      const current = settingsRef.current;
      const { revision, ...data } = current;
      const res = await api.saveSettings(data, revision);
      if (res.status === 'ok') {
        // Keep edits made while the request was in flight.
        const merged = { ...settingsRef.current, revision: res.settings.revision };
        settingsRef.current = merged;
        setSettingsState(merged);
      } else if (res.server) {
        const merged = { ...res.server, ...data, revision: res.server.revision };
        settingsRef.current = merged;
        setSettingsState(merged);
        toast('Settings were changed on another device; your values were applied on top', 'info');
        settingsTimer.current = window.setTimeout(flushSettings, 200);
      }
    } catch (error) {
      toast(describeError(error), 'error');
    } finally {
      settingsSaving.current = false;
    }
  }, [toast]);

  const saveSettings = useCallback(
    (patch) => {
      const merged = { ...settingsRef.current, ...patch };
      settingsRef.current = merged;
      setSettingsState(merged);
      window.clearTimeout(settingsTimer.current);
      settingsTimer.current = window.setTimeout(flushSettings, 600);
    },
    [flushSettings]
  );

  const saveTemplate = useCallback(
    (postId, name) => {
      const post = postsRef.current.get(postId);
      if (!post) return;
      const template = {
        id: newTemplateId(),
        name: name.slice(0, 60),
        title: post.title,
        content: post.content,
        category: post.category,
        tags: [...post.tags],
      };
      saveSettings({ templates: [...(settingsRef.current.templates || []), template] });
      toast(`Template "${template.name}" saved`);
    },
    [saveSettings, toast]
  );

  // ---- save controls ------------------------------------------------------
  const saveNow = useCallback(async () => {
    await queue.flushAll();
  }, [queue]);

  const resolveConflict = useCallback(
    async (id, choice) => {
      const entry = queue.entry(id);
      if (choice === 'mine') {
        await queue.keepMine(id);
        toast('Your version was saved');
      } else {
        const server = entry.server;
        queue.discard(id, server ? server.revision : null);
        if (server) postsRef.current.set(id, server);
        else postsRef.current.delete(id);
        if (draftsRef.current) draftsRef.current.remove(id);
        bump();
        toast('Loaded the version from the server', 'info');
      }
    },
    [bump, queue, toast]
  );

  const restoreDrafts = useCallback(() => {
    for (const { draft } of recoverable) {
      const post = { ...draft.post };
      queue.track(post.id, draft.baseRevision ?? null);
      writePost(post);
    }
    toast(`Restored ${recoverable.length} unsaved draft${recoverable.length > 1 ? 's' : ''}`);
    setRecoverable([]);
  }, [queue, recoverable, toast, writePost]);

  const discardDrafts = useCallback(() => {
    recoverable.forEach(({ draft }) => draftsRef.current && draftsRef.current.remove(draft.post.id));
    setRecoverable([]);
  }, [recoverable]);

  const value = {
    phase,
    loadError,
    reload: load,
    userId,
    online,
    limits,
    settings,
    categories,
    categoryById,
    templates,
    displayZone,
    posts,
    filteredPosts,
    postById: (id) => postsRef.current.get(id) || null,
    selectedPost,
    ui,
    setUi,
    saveState,
    conflicts,
    recoverable,
    toasts,
    toast,
    dismissToast,
    confirmState,
    confirm,
    answerConfirm,
    actions: {
      createPost,
      updatePost,
      duplicatePost,
      deletePost,
      deletePosts,
      movePost,
      bulkPatch,
      uploadImage,
      importPosts,
      saveSettings,
      saveTemplate,
      saveNow,
      resolveConflict,
      restoreDrafts,
      discardDrafts,
      openMonth: (date) => setUi({ cursor: startOfMonth(date) }),
    },
    uniqueId,
    NetworkError,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
