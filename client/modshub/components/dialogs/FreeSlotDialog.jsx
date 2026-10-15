import { useEffect, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Modal } from '../ui.jsx';
import { formatDayLong } from '../../core/time.js';

/** Details of one free place: note, "use it for a post", or remove. */
export default function FreeSlotDialog() {
  const { ui, setUi, slotsView, actions, settings } = useStudio();
  const view = slotsView.find((v) => v.slot.id === ui.freeSlot);
  const [note, setNote] = useState(view ? view.slot.note || '' : '');
  useEffect(() => setNote(view ? view.slot.note || '' : ''), [view && view.slot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ui.freeSlot) return null;
  const close = () => setUi({ freeSlot: null });
  if (!view) {
    // Removed elsewhere while the dialog was open.
    window.setTimeout(close, 0);
    return null;
  }
  const { slot, date, time } = view;
  const saveNote = () => {
    if (note !== (slot.note || '')) actions.updateSlotNote(slot.id, note.slice(0, 200));
  };

  return (
    <Modal
      title="Free place"
      size="sm"
      onClose={() => {
        saveNote();
        close();
      }}
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => {
              actions.removeSlot(slot.id);
              close();
            }}
          >
            Remove marker
          </Button>
          <Button
            variant="primary"
            data-testid="use-slot"
            onClick={() => {
              close();
              actions.createPost({ date, time: time || settings.defaultTime, slotId: slot.id });
            }}
          >
            Create post here
          </Button>
        </>
      }
    >
      <div className="ms-form">
        <p className="ms-modal__text">
          <strong>{formatDayLong(date)}</strong>
          {time ? ` at ${time}` : ' (any time)'}
          {slot.createdBy ? <span className="ms-hint">Marked free by {slot.createdBy}</span> : null}
        </p>
        <label className="ms-field">
          <span>Note (visible to everyone)</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            placeholder="e.g. keep for the Friday release"
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => e.key === 'Enter' && saveNote()}
            data-autofocus
          />
        </label>
      </div>
    </Modal>
  );
}
