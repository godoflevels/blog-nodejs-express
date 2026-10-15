/**
 * Debounced, per-post autosave queue.
 *
 * - `update(post)` records the latest edit and (re)starts the debounce timer.
 * - At most one request per post is in flight; edits made while saving are
 *   sent right after, so nothing is dropped and requests never reorder.
 * - Network/server errors keep the edit and retry with back-off.
 * - 409 conflicts stop the loop and wait for the user's decision.
 */
export class SaveQueue {
  /**
   * @param {object} options
   * @param {(post: object, baseRevision: number|null) => Promise<{status:'ok', post: object}|{status:'conflict', server: object|null}>} options.save
   * @param {number} [options.delay] debounce in ms
   * @param {() => void} [options.onChange] called on every status change
   * @param {(id: string, serverPost: object, info: {superseded: boolean}) => void} [options.onSaved]
   */
  constructor({ save, delay = 800, onChange = () => {}, onSaved = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.save = save;
    this.delay = delay;
    this.onChange = onChange;
    this.onSaved = onSaved;
    // Wrapped: browsers throw "Illegal invocation" when setTimeout is called
    // with a receiver other than window.
    this.setTimer = (fn, ms) => setTimer(fn, ms);
    this.clearTimer = (id) => clearTimer(id);
    /** @type {Map<string, any>} */
    this.entries = new Map();
  }

  entry(id) {
    if (!this.entries.has(id)) {
      this.entries.set(id, {
        latest: null,
        baseRevision: null,
        status: 'idle',
        timer: null,
        running: null,
        retries: 0,
        error: null,
        server: null,
      });
    }
    return this.entries.get(id);
  }

  /** Tell the queue which revision of a post the server has. */
  track(id, baseRevision) {
    this.entry(id).baseRevision = baseRevision;
  }

  update(post) {
    const e = this.entry(post.id);
    e.latest = post;
    if (e.status === 'conflict') return;
    e.status = e.running ? 'saving' : 'dirty';
    e.retries = 0;
    e.error = null;
    this.onChange();
    if (!e.running) this.schedule(post.id, this.delay);
  }

  schedule(id, delay) {
    const e = this.entry(id);
    if (e.timer) this.clearTimer(e.timer);
    e.timer = this.setTimer(() => {
      e.timer = null;
      this.run(id);
    }, delay);
  }

  /** Save now. Resolves when the post is no longer dirty (or failed / conflicted). */
  async flush(id) {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.timer) {
      this.clearTimer(e.timer);
      e.timer = null;
    }
    if (e.running) {
      await e.running;
    }
    if (e.status === 'dirty' || (e.status === 'error' && e.latest)) await this.run(id);
  }

  async flushAll() {
    await Promise.all([...this.entries.keys()].map((id) => this.flush(id)));
  }

  run(id) {
    const e = this.entry(id);
    if (e.running) return e.running;
    if (!e.latest) return Promise.resolve();
    const sent = e.latest;
    e.status = 'saving';
    this.onChange();

    e.running = (async () => {
      try {
        const res = await this.save(sent, e.baseRevision);
        if (res.status === 'conflict') {
          e.status = 'conflict';
          e.server = res.server;
          return;
        }
        e.baseRevision = res.post.revision;
        e.retries = 0;
        e.error = null;
        const superseded = e.latest !== sent;
        this.onSaved(id, res.post, { superseded });
        if (superseded) {
          e.status = 'dirty';
          this.schedule(id, 0);
        } else {
          e.status = 'idle';
        }
      } catch (error) {
        e.status = 'error';
        e.error = error;
        e.retries += 1;
        const backoff = Math.min(30000, 1000 * 2 ** Math.min(e.retries, 5));
        this.schedule(id, backoff);
      } finally {
        e.running = null;
        this.onChange();
      }
    })();
    return e.running;
  }

  /** Conflict resolution: keep my edit, based on the server's current revision. */
  keepMine(id) {
    const e = this.entry(id);
    if (e.server) e.baseRevision = e.server.revision;
    else e.baseRevision = null; // deleted elsewhere: recreate
    e.server = null;
    e.status = 'dirty';
    this.onChange();
    return this.run(id);
  }

  /** Conflict resolution: take the server's version and stop tracking my edit. */
  discard(id, serverRevision) {
    const e = this.entry(id);
    e.latest = null;
    e.server = null;
    e.status = 'idle';
    e.baseRevision = serverRevision ?? null;
    if (e.timer) {
      this.clearTimer(e.timer);
      e.timer = null;
    }
    this.onChange();
  }

  forget(id) {
    const e = this.entries.get(id);
    if (e && e.timer) this.clearTimer(e.timer);
    this.entries.delete(id);
    this.onChange();
  }

  statusOf(id) {
    const e = this.entries.get(id);
    return e ? e.status : 'idle';
  }

  summary() {
    const out = { dirty: 0, saving: 0, error: 0, conflict: 0 };
    for (const e of this.entries.values()) if (e.status in out) out[e.status] += 1;
    return out;
  }

  get hasUnsaved() {
    const s = this.summary();
    return s.dirty + s.saving + s.error + s.conflict > 0;
  }
}
