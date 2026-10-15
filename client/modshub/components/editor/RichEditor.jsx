import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { markdownToEditorHtml, htmlToMarkdown, checkRichRoundTrip } from '../../core/rich.js';
import { sanitizeHtml } from '../../core/sanitize.js';
import { Button, Icon, Modal } from '../ui.jsx';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function UrlPrompt({ kind, onSubmit, onCancel }) {
  const [url, setUrl] = useState('https://');
  const [alt, setAlt] = useState('');
  const valid = /^https?:\/\/\S+$/i.test(url.trim()) || /^\/modshub\/api\/assets\/[a-f0-9]+$/.test(url.trim());
  return (
    <Modal
      title={kind === 'image' ? 'Insert image' : 'Insert link'}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSubmit({ url: url.trim(), alt })}>Insert</Button>
        </>
      }
    >
      <form
        className="ms-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit({ url: url.trim(), alt });
        }}
      >
        <label className="ms-field">
          <span>{kind === 'image' ? 'Image URL' : 'Link URL'}</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} data-autofocus />
        </label>
        {kind === 'image' ? (
          <label className="ms-field">
            <span>Description (alt text)</span>
            <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </label>
        ) : null}
        {!valid ? <p className="ms-hint">Only http(s) addresses are allowed.</p> : null}
      </form>
    </Modal>
  );
}

/**
 * WYSIWYG editing on top of contentEditable.
 *
 * The Markdown source is only rewritten when the author actually edits here.
 * If the document cannot make the Markdown -> HTML -> Markdown round trip
 * unchanged, the editor is read-only (with an explicit "edit anyway" switch)
 * instead of silently rewriting the post.
 */
const RichEditor = forwardRef(function RichEditor({ value, onChange, mdOptions, onHistory }, ref) {
  const hostRef = useRef(null);
  const emitted = useRef(value);
  const timer = useRef(null);
  const dirty = useRef(false);
  const [forceEdit, setForceEdit] = useState(false);
  const [prompt, setPrompt] = useState(null);

  const [check, setCheck] = useState(() => checkRichRoundTrip(value, mdOptions));
  // Re-run the safety check only when the Markdown changed from outside
  // (restore, conflict resolution) - not for the editor's own edits.
  useLayoutEffect(() => {
    if (value !== emitted.current) setCheck(checkRichRoundTrip(value, mdOptions));
  }, [value, mdOptions]);
  const editable = check.lossless || forceEdit;

  const sync = useCallback(() => {
    if (!hostRef.current || !dirty.current) return;
    dirty.current = false;
    const md = htmlToMarkdown(hostRef.current.innerHTML, mdOptions);
    if (md !== emitted.current) {
      emitted.current = md;
      onChange(md);
    }
  }, [mdOptions, onChange]);

  const schedule = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(sync, 250);
  }, [sync]);

  // Render HTML on mount and whenever the markdown changes from outside.
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    if (value !== emitted.current || hostRef.current.dataset.ready !== '1') {
      hostRef.current.innerHTML = markdownToEditorHtml(value, mdOptions);
      hostRef.current.dataset.ready = '1';
      emitted.current = value;
      dirty.current = false;
    }
  }, [value, mdOptions]);

  // Never lose a pending edit when the user switches modes or posts.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (dirty.current && hostRef.current) {
        const md = htmlToMarkdown(hostRef.current.innerHTML, mdOptions);
        if (md !== emitted.current) onChange(md);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand('styleWithCSS', false, false);
  }, []);

  useEffect(() => {
    if (onHistory) onHistory({ canUndo: true, canRedo: true });
  }, [onHistory]);

  const exec = (cmd, arg) => {
    hostRef.current.focus();
    document.execCommand(cmd, false, arg);
    schedule();
  };

  const insertHtml = (html) => {
    hostRef.current.focus();
    document.execCommand('insertHTML', false, html);
    schedule();
  };

  const selectionText = () => (window.getSelection() ? window.getSelection().toString() : '');

  const currentBlock = () => {
    const sel = window.getSelection();
    let node = sel && sel.anchorNode;
    while (node && node !== hostRef.current) {
      if (node.nodeType === 1 && /^(H[1-6]|BLOCKQUOTE|PRE|P)$/.test(node.nodeName)) return node.nodeName;
      node = node.parentNode;
    }
    return 'P';
  };

  const toggleBlock = (tag) => exec('formatBlock', currentBlock() === tag ? 'P' : tag);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => hostRef.current && hostRef.current.focus(),
      command(name) {
        if (!editable) return;
        switch (name) {
          case 'h1': toggleBlock('H1'); break;
          case 'h2': toggleBlock('H2'); break;
          case 'h3': toggleBlock('H3'); break;
          case 'quote': toggleBlock('BLOCKQUOTE'); break;
          case 'bold': exec('bold'); break;
          case 'italic': exec('italic'); break;
          case 'strike': exec('strikeThrough'); break;
          case 'ul': exec('insertUnorderedList'); break;
          case 'ol': exec('insertOrderedList'); break;
          case 'hr': exec('insertHorizontalRule'); break;
          case 'undo': exec('undo'); break;
          case 'redo': exec('redo'); break;
          case 'code': insertHtml(`<code>${esc(selectionText() || 'code')}</code>`); break;
          case 'codeblock': insertHtml(`<pre><code>${esc(selectionText() || 'code')}</code></pre><p><br></p>`); break;
          case 'table':
            insertHtml(
              '<table><thead><tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>'
            );
            break;
          case 'link':
          case 'image': {
            // Keep the selection while the dialog is open.
            const sel = window.getSelection();
            const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            setPrompt({ kind: name, range: saved, text: selectionText() });
            break;
          }
          default:
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable]
  );

  const submitPrompt = ({ url, alt }) => {
    const { kind, range, text } = prompt;
    setPrompt(null);
    hostRef.current.focus();
    if (range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (kind === 'link') {
      if (text) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
    } else {
      document.execCommand('insertHTML', false, `<img src="${esc(url)}" alt="${esc(alt || '')}">`);
    }
    schedule();
  };

  const onPaste = (e) => {
    if (!editable) return;
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
    else document.execCommand('insertText', false, text);
    schedule();
  };

  return (
    <div className="ms-rich">
      {!check.lossless ? (
        <div className={`ms-banner ${forceEdit ? 'ms-banner--warn' : ''}`} role="status">
          <Icon name="alert" size={18} />
          <div>
            <strong>{forceEdit ? 'Editing may reformat this post.' : 'Rich Text is view-only for this post.'}</strong>
            <span>
              {check.reasons.join(' ')} Your Markdown stays exactly as written until you edit here.
            </span>
          </div>
          {!forceEdit ? (
            <Button variant="soft" size="sm" onClick={() => setForceEdit(true)}>Edit anyway</Button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className={`ms-prose ms-rich__surface ${editable ? '' : 'is-readonly'}`}
        contentEditable={editable}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Post content (rich text)"
        spellCheck
        onInput={schedule}
        onBlur={sync}
        onPaste={onPaste}
        onDrop={(e) => e.preventDefault()}
      />
      {prompt ? <UrlPrompt kind={prompt.kind} onSubmit={submitPrompt} onCancel={() => setPrompt(null)} /> : null}
    </div>
  );
});

export default RichEditor;
