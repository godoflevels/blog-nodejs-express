import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import {
  discordBold, discordItalic, toggleStrike, toggleInlineCode, toggleUnderline, toggleSpoiler, setHeading,
  toggleQuote, toggleMultilineQuote, toggleSubtext, toggleBulletList, toggleNumberedList, toggleCodeBlock,
  insertLink, insertText, continueList, indentList,
} from '../../core/editor-ops.js';
import { History } from '../../core/history.js';
import { isMac } from './FormatToolbar.jsx';

const OPS = {
  bold: discordBold,
  italic: discordItalic,
  underline: toggleUnderline,
  strike: toggleStrike,
  spoiler: toggleSpoiler,
  code: toggleInlineCode,
  codeblock: toggleCodeBlock,
  quote: toggleQuote,
  mquote: toggleMultilineQuote,
  subtext: toggleSubtext,
  ul: toggleBulletList,
  ol: toggleNumberedList,
  link: insertLink,
  h1: (s) => setHeading(s, 1),
  h2: (s) => setHeading(s, 2),
  h3: (s) => setHeading(s, 3),
};

/**
 * Markdown source editor: a plain <textarea> with our own undo history, so
 * toolbar actions can edit programmatically without losing undo.
 */
const MarkdownEditor = forwardRef(function MarkdownEditor({ value, onChange, onHistory, placeholder, disabled, id, className = '', label = 'Message text', rows }, ref) {
  const taRef = useRef(null);
  const historyRef = useRef(null);
  const lastValue = useRef(value);
  const pendingSelection = useRef(null);
  if (!historyRef.current) historyRef.current = new History({ value, start: 0, end: 0 });

  const notify = useCallback(() => {
    if (onHistory) onHistory({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo });
  }, [onHistory]);

  // Content replaced from outside (restore draft, conflict resolution).
  useLayoutEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      historyRef.current.reset({ value, start: 0, end: 0 });
      notify();
    }
  }, [value, notify]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (sel && taRef.current) {
      taRef.current.setSelectionRange(sel.start, sel.end);
      pendingSelection.current = null;
    }
  });

  const commit = useCallback(
    (state, kind) => {
      lastValue.current = state.value;
      pendingSelection.current = { start: state.start, end: state.end };
      historyRef.current.push(state, kind);
      onChange(state.value);
      notify();
    },
    [notify, onChange]
  );

  const currentSelection = () => {
    const el = taRef.current;
    return { value: el.value, start: el.selectionStart, end: el.selectionEnd };
  };

  const run = useCallback(
    (name) => {
      const op = OPS[name];
      if (!op || !taRef.current) return false;
      const out = op(currentSelection());
      if (!out) return false;
      commit(out, 'action');
      taRef.current.focus();
      return true;
    },
    [commit]
  );

  const undo = useCallback(() => {
    const state = historyRef.current.undo();
    if (state) {
      lastValue.current = state.value;
      pendingSelection.current = state;
      onChange(state.value);
      notify();
    }
  }, [notify, onChange]);

  const redo = useCallback(() => {
    const state = historyRef.current.redo();
    if (state) {
      lastValue.current = state.value;
      pendingSelection.current = state;
      onChange(state.value);
      notify();
    }
  }, [notify, onChange]);

  useImperativeHandle(
    ref,
    () => ({
      command(name, arg) {
        if (name === 'undo') undo();
        else if (name === 'redo') redo();
        else if (name === 'insert') {
          const el = taRef.current;
          if (!el) return;
          commit(insertText({ value: el.value, start: el.selectionStart, end: el.selectionEnd }, arg), 'action');
          el.focus();
        } else run(name);
      },
      focus: () => taRef.current && taRef.current.focus(),
    }),
    [run, undo, redo]
  );

  useLayoutEffect(() => {
    notify();
  }, [notify]);

  const onKeyDown = (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      const out = continueList(currentSelection());
      if (out) {
        e.preventDefault();
        commit(out, 'action');
      }
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      const out = indentList(currentSelection(), e.shiftKey);
      if (out) {
        e.preventDefault();
        commit(out, 'action');
      }
      return;
    }
    if (!mod) return;
    const key = e.key.toLowerCase();
    let handled = true;
    if (e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) run(`h${e.code.slice(-1)}`);
    else if (!e.altKey && !e.shiftKey && key === 'b') run('bold');
    else if (!e.altKey && !e.shiftKey && key === 'i') run('italic');
    else if (!e.altKey && !e.shiftKey && key === 'e') run('code');
    else if (!e.altKey && !e.shiftKey && key === 'u') run('underline');
    else if (!e.altKey && e.shiftKey && key === 's') run('spoiler');
    else if (!e.altKey && !e.shiftKey && key === 'k') run('link');
    else if (!e.altKey && e.shiftKey && key === 'x') run('strike');
    else if (!e.altKey && e.shiftKey && key === 'e') run('codeblock');
    else if (!e.altKey && e.shiftKey && e.code === 'Digit7') run('ol');
    else if (!e.altKey && e.shiftKey && e.code === 'Digit8') run('ul');
    else if (!e.altKey && e.shiftKey && e.code === 'Period') run('quote');
    else if (!e.altKey && !e.shiftKey && key === 'z') undo();
    else if (!e.altKey && e.shiftKey && key === 'z') redo();
    else if (!e.altKey && !e.shiftKey && key === 'y' && !isMac) redo();
    else handled = false;
    if (handled) e.preventDefault();
  };

  return (
    <textarea
      id={id}
      ref={taRef}
      className={`ms-source ${className}`}
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck
      autoCapitalize="sentences"
      aria-label={label}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const el = e.target;
        lastValue.current = el.value;
        historyRef.current.push({ value: el.value, start: el.selectionStart, end: el.selectionEnd }, 'type');
        onChange(el.value);
        notify();
      }}
    />
  );
});

export default MarkdownEditor;
