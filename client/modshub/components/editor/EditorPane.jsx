import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, IconButton, Icon, Menu, Modal } from '../ui.jsx';
import SaveIndicator from '../SaveIndicator.jsx';
import MetaFields from './MetaFields.jsx';
import { postImages, runImageDownload } from '../../core/download-image.js';
import MessageComposer from '../discord/MessageComposer.jsx';
import JsonEditor from '../discord/JsonEditor.jsx';
import { DiscordIssues } from '../preview/PreviewPane.jsx';
import { relativeTime } from '../../core/time.js';

const MODES = [
  ['message', 'Message', 'markdown'],
  ['json', 'JSON', 'code'],
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
  const { ui, setUi, actions, conflicts, saveState, toast } = useStudio();
  const [templateDialog, setTemplateDialog] = useState(false);
  const mode = ui.editorMode === 'json' ? 'json' : 'message';
  const conflict = Object.prototype.hasOwnProperty.call(conflicts, post.id);
  const edited = useMemo(
    () => (post.revision ? `Edited ${relativeTime(post.updatedAt)}${post.updatedBy ? ` by ${post.updatedBy}` : ''}` : 'New post'),
    [post.revision, post.updatedAt, post.updatedBy]
  );

  const imgCount = postImages(post).length;
  return (
    <section className="ms-editor" aria-label="Post editor">
      <header className="ms-editor__bar">
        {onBack ? <IconButton icon="chevronLeft" label="Back" onClick={onBack} data-testid="back" className="ms-editor__back" /> : null}
        <div className="ms-editor__heading">
          <input
            type="text"
            className="ms-editor__title"
            aria-label="Internal title"
            placeholder="Untitled post"
            value={post.title}
            maxLength={200}
            onChange={(e) => actions.updatePost(post.id, { title: e.target.value })}
            onBlur={(e) => {
              if (!e.target.value.trim()) actions.updatePost(post.id, { title: 'Untitled post' });
            }}
          />
          <span className="ms-editor__sub" title={post.updatedAt}>
            {saveState.status === 'saving' ? 'Saving…' : edited}
          </span>
        </div>
        <SaveIndicator className="ms-save--phone-dot ms-editor__save" />
        <Button variant="primary" size="sm" icon="copy" className="ms-editor__copy" data-testid="copy-text" onClick={() => actions.copyPost(post)}>
          Copy text
        </Button>
        {imgCount ? (
          <Button
            variant="soft"
            size="sm"
            icon="download"
            className="ms-editor__img"
            data-testid="download-image-header"
            onClick={() => runImageDownload(post, toast)}
          >
            {imgCount > 1 ? `Images (${imgCount})` : 'Image'}
          </Button>
        ) : null}
        <Menu
          label="Post actions"
          title="Post actions"
          trigger={<IconButton icon="more" label="Post actions" />}
          items={[
            { label: 'Copy text', icon: 'copy', onClick: () => actions.copyPost(post) },
            { label: 'Copy webhook JSON', icon: 'copy', onClick: () => actions.copyPost(post, 'json') },
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
              <strong>This post was changed by someone else.</strong>
              <span>Keep your version to overwrite it, or load the latest version and drop your edits.</span>
            </div>
            <div className="ms-banner__actions">
              <Button variant="primary" size="sm" onClick={() => actions.resolveConflict(post.id, 'mine')}>Keep mine</Button>
              <Button variant="soft" size="sm" onClick={() => actions.resolveConflict(post.id, 'server')}>Use latest version</Button>
            </div>
          </div>
        ) : null}

        <MetaFields post={post} />

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

        {mode === 'message' ? <MessageComposer post={post} /> : <JsonEditor post={post} />}

        <DiscordIssues post={post} />

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
              placeholder="Only visible in the Studio. Not part of the message."
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
