import { useCallback, useMemo, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, IconButton, Icon, Menu, Modal, StatusPill } from '../ui.jsx';
import FormatToolbar from './FormatToolbar.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import RichEditor from './RichEditor.jsx';
import MetaFields from './MetaFields.jsx';
import ImageField from './ImageField.jsx';
import Prose from '../preview/Prose.jsx';
import { CompatWarnings } from '../preview/PreviewPane.jsx';
import { useMdOptions, useRendered } from '../preview/hooks.js';
import { textStats } from '../../core/stats.js';
import { useMedia } from '../ui.jsx';
import { relativeTime } from '../../core/time.js';

const MODES = [
  ['markdown', 'Markdown', 'markdown'],
  ['rich', 'Rich Text', 'rich'],
  ['split', 'Split View', 'split'],
];

function NameDialog({ title, label, initial, confirmLabel, onSubmit, onClose }) {
  const [name, setName] = useState(initial);
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>{confirmLabel}</Button>
        </>
      }
    >
      <form
        className="ms-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <label className="ms-field">
          <span>{label}</span>
          <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
      </form>
    </Modal>
  );
}

export default function EditorPane({ post, onBack }) {
  const { ui, setUi, actions, conflicts, saveState } = useStudio();
  const mdOptions = useMdOptions();
  const editorRef = useRef(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [templateDialog, setTemplateDialog] = useState(false);
  const narrow = useMedia('(max-width: 767px)');
  const [detailsOpen, setDetailsOpen] = useState(!narrow);
  const mode = ui.editorMode;

  const rendered = useRendered(post.content);
  const stats = useMemo(() => textStats(rendered.plain), [rendered.plain]);
  const sourceStats = useMemo(() => textStats(post.content), [post.content]);
  const conflict = Object.prototype.hasOwnProperty.call(conflicts, post.id);

  const onContent = useCallback((content) => actions.updatePost(post.id, { content }), [actions, post.id]);
  const onHistory = useCallback((h) => setHist((prev) => (prev.canUndo === h.canUndo && prev.canRedo === h.canRedo ? prev : h)), []);
  const command = (name) => editorRef.current && editorRef.current.command(name);

  const sourcePane = (
    <MarkdownEditor
      key={`md-${post.id}`}
      ref={editorRef}
      value={post.content}
      onChange={onContent}
      onHistory={onHistory}
      placeholder={'Write your post in Markdown…\n\n# Heading\n**bold**, *italic*, ***both***, ~~strike~~\n- list item'}
    />
  );

  return (
    <section className="ms-editor" aria-label="Post editor">
      <header className="ms-editor__bar">
        {onBack ? (
          <Button variant="ghost" size="sm" icon="chevronLeft" onClick={onBack}>
            Back
          </Button>
        ) : null}
        <div className="ms-editor__crumb">
          <StatusPill status={post.status} />
          <span className="ms-editor__saved" title={post.updatedAt}>
            {saveState.status === 'saving' ? 'Saving…' : post.revision ? `Edited ${relativeTime(post.updatedAt)}` : 'New post'}
          </span>
        </div>
        <Menu
          label="Post actions"
          trigger={<IconButton icon="more" label="Post actions" />}
          items={[
            { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicatePost(post.id) },
            { label: 'Save as template…', icon: 'file', onClick: () => setTemplateDialog(true) },
            {
              label: 'Copy post ID',
              icon: 'tag',
              hint: post.id,
              onClick: () => navigator.clipboard && navigator.clipboard.writeText(post.id),
            },
            { divider: true },
            { label: 'Delete post', icon: 'trash', danger: true, onClick: () => actions.deletePost(post.id) },
          ]}
        />
        <IconButton icon="x" label="Close editor" onClick={() => setUi({ selectedId: null })} className="ms-editor__close" />
      </header>

      <div className="ms-editor__scroll">
        {conflict ? (
          <div className="ms-banner ms-banner--warn" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>This post was changed on another device.</strong>
              <span>Keep your version to overwrite it, or load the server version and drop your edits.</span>
            </div>
            <div className="ms-banner__actions">
              <Button variant="primary" size="sm" onClick={() => actions.resolveConflict(post.id, 'mine')}>Keep mine</Button>
              <Button variant="soft" size="sm" onClick={() => actions.resolveConflict(post.id, 'server')}>Use server version</Button>
            </div>
          </div>
        ) : null}

        <details className="ms-details" open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
          <summary>Details</summary>
          <MetaFields post={post} />
        </details>

        <details className="ms-details">
          <summary>
            Image / artwork {post.image ? <span className="ms-details__badge">1</span> : null}
          </summary>
          <ImageField post={post} />
        </details>

        <div className="ms-editor__modes">
          <div className="ms-seg" role="tablist" aria-label="Editing mode">
            {MODES.map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                className={mode === id ? 'is-active' : ''}
                onClick={() => setUi({ editorMode: id })}
              >
                <Icon name={icon} size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <FormatToolbar onCommand={command} canUndo={hist.canUndo} canRedo={hist.canRedo} />

        <div className={`ms-editor__surface ms-editor__surface--${mode}`}>
          {mode === 'markdown' ? sourcePane : null}
          {mode === 'rich' ? (
            <RichEditor
              key={`rich-${post.id}`}
              ref={editorRef}
              value={post.content}
              onChange={onContent}
              mdOptions={mdOptions}
              onHistory={onHistory}
            />
          ) : null}
          {mode === 'split' ? (
            <>
              {sourcePane}
              <div className="ms-editor__live" aria-label="Live preview">
                <Prose markdown={post.content} image={post.image} />
              </div>
            </>
          ) : null}
        </div>

        <footer className="ms-editor__foot">
          <span data-testid="counter">
            {stats.characters.toLocaleString('en-US')} characters · {stats.words.toLocaleString('en-US')} words
          </span>
          <span className="ms-editor__foot-muted">Markdown: {sourceStats.characters.toLocaleString('en-US')} characters</span>
        </footer>

        <CompatWarnings markdown={post.content} />

        <details className="ms-details">
          <summary>
            Internal notes {post.notes ? <span className="ms-details__badge">•</span> : null}
          </summary>
          <label className="ms-field">
            <span className="ms-sr">Internal notes</span>
            <textarea
              className="ms-notes"
              rows={4}
              maxLength={5000}
              value={post.notes}
              placeholder="Only visible to you. Not part of the exported post text."
              onChange={(e) => actions.updatePost(post.id, { notes: e.target.value })}
            />
          </label>
        </details>
      </div>

      {templateDialog ? (
        <NameDialog
          title="Save as template"
          label="Template name"
          initial={post.title.replace(/^Untitled post$/, '')}
          confirmLabel="Save template"
          onClose={() => setTemplateDialog(false)}
          onSubmit={(name) => {
            actions.saveTemplate(post.id, name);
            setTemplateDialog(false);
          }}
        />
      ) : null}
    </section>
  );
}
