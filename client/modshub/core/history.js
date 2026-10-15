/**
 * Undo/redo for the Markdown textarea.
 *
 * Setting `textarea.value` from code wipes the browser's native undo stack, so
 * the editor keeps its own. Consecutive typing within `coalesceMs` collapses
 * into one step; toolbar actions are always a step of their own.
 */
export class History {
  constructor(initial, { limit = 300, coalesceMs = 800 } = {}) {
    this.limit = limit;
    this.coalesceMs = coalesceMs;
    this.reset(initial);
  }

  reset(state) {
    this.states = [{ ...state }];
    this.index = 0;
    this.lastKind = 'reset';
    this.lastAt = 0;
  }

  get current() {
    return this.states[this.index];
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.states.length - 1;
  }

  /**
   * @param {{value: string, start: number, end: number}} state
   * @param {'type'|'action'} [kind]
   */
  push(state, kind = 'type', now = Date.now()) {
    if (state.value === this.current.value) {
      // Selection-only change: keep the caret of the current step up to date.
      this.states[this.index] = { ...state };
      return;
    }
    // New edit discards the redo branch.
    this.states.length = this.index + 1;
    const merge = kind === 'type' && this.lastKind === 'type' && now - this.lastAt < this.coalesceMs && this.index > 0;
    if (merge) {
      this.states[this.index] = { ...state };
    } else {
      this.states.push({ ...state });
      this.index += 1;
      if (this.states.length > this.limit) {
        this.states.shift();
        this.index -= 1;
      }
    }
    this.lastKind = kind;
    this.lastAt = now;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    this.lastKind = 'undo';
    return { ...this.current };
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    this.lastKind = 'redo';
    return { ...this.current };
  }
}
