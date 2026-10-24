import { useStudio } from '../state/StudioContext.jsx';
import { Icon } from './ui.jsx';

/** Autosave status: Saved / Saving… / Offline / failed / conflict. */
export default function SaveIndicator({ className = '' }) {
  const { saveState, actions, conflicts, setUi, online } = useStudio();
  const { status, pending } = saveState;
  if (!online && status !== 'saved') {
    return (
      <span className={`ms-save is-error ${className}`} role="status" title="Offline">
        <Icon name="alert" size={14} /> <span className="ms-save__text">Offline · {pending} unsaved</span>
      </span>
    );
  }
  if (status === 'saving') {
    return (
      <span className={`ms-save is-saving ${className}`} role="status" aria-live="polite" title="Saving…">
        <span className="ms-spinner" aria-hidden="true" /> <span className="ms-save__text">Saving…</span>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={`ms-save is-error ${className}`} role="status">
        <Icon name="alert" size={14} /> <span className="ms-save__text">Save failed</span>
        <button type="button" className="ms-linkbtn" onClick={() => actions.saveNow()}>Retry</button>
      </span>
    );
  }
  if (status === 'conflict') {
    const id = Object.keys(conflicts)[0];
    return (
      <span className={`ms-save is-error ${className}`} role="status">
        <Icon name="alert" size={14} /> <span className="ms-save__text">Conflict</span>
        <button type="button" className="ms-linkbtn" onClick={() => setUi({ selectedId: id })}>Review</button>
      </span>
    );
  }
  return (
    <span className={`ms-save is-saved ${className}`} role="status" aria-live="polite" title="All changes saved">
      <Icon name="check" size={14} /> <span className="ms-save__text">Saved</span>
    </span>
  );
}
