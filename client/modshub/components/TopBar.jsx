import { useMemo } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { Button, Icon, IconButton, Menu } from './ui.jsx';
import { STATUS_META, STATUS_ORDER } from '../constants.js';
import { buildExport, stringifyExport } from '../core/json-io.js';
import { downloadText } from '../core/filenames.js';
import { todayKey } from '../core/time.js';

function SaveIndicator() {
  const { saveState, actions, conflicts, setUi, online } = useStudio();
  const { status, pending } = saveState;
  if (!online && status !== 'saved') {
    return (
      <span className="ms-save is-error" role="status">
        <Icon name="alert" size={14} /> Offline · {pending} unsaved
      </span>
    );
  }
  if (status === 'saving') {
    return (
      <span className="ms-save is-saving" role="status" aria-live="polite">
        <span className="ms-spinner" aria-hidden="true" /> Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="ms-save is-error" role="status">
        <Icon name="alert" size={14} /> Save failed
        <button type="button" className="ms-linkbtn" onClick={() => actions.saveNow()}>Retry</button>
      </span>
    );
  }
  if (status === 'conflict') {
    const id = Object.keys(conflicts)[0];
    return (
      <span className="ms-save is-error" role="status">
        <Icon name="alert" size={14} /> Conflict
        <button type="button" className="ms-linkbtn" onClick={() => setUi({ selectedId: id })}>Review</button>
      </span>
    );
  }
  return (
    <span className="ms-save is-saved" role="status" aria-live="polite">
      <Icon name="check" size={14} /> Saved
    </span>
  );
}

export default function TopBar({ onImport, onSettings }) {
  const { ui, setUi, templates, actions, posts, toast, displayZone } = useStudio();
  const f = ui.filters;
  const setFilter = (patch) => setUi((p) => ({ filters: { ...p.filters, ...patch } }));

  const newDate = useMemo(() => {
    const today = todayKey(displayZone);
    return ui.cursor.slice(0, 7) === today.slice(0, 7) ? today : ui.cursor;
  }, [ui.cursor, displayZone]);

  const exportAll = () => {
    if (posts.length === 0) {
      toast('There are no posts to export yet', 'info');
      return;
    }
    downloadText(stringifyExport(buildExport(posts)), `modshub-posts-${posts.length}.json`, 'application/json;charset=utf-8');
    toast(`Exported ${posts.length} post${posts.length === 1 ? '' : 's'} as JSON`);
  };

  const newItems = [
    { label: 'Blank draft', icon: 'file', onClick: () => actions.createPost({ date: newDate }) },
    { divider: true },
    { heading: 'From a template' },
    ...templates.map((t) => ({
      label: t.name,
      icon: 'tag',
      hint: t.builtIn ? undefined : 'Yours',
      onClick: () => actions.createPost({ date: newDate, template: t }),
    })),
  ];

  return (
    <header className="ms-top">
      <div className="ms-top__brand">
        <a href="/modshub" className="ms-logo" aria-label="ModsHub Post Studio">
          <span className="ms-logo__mark">Mods<b>Hub</b></span>
          <span className="ms-logo__sub">Post Studio</span>
        </a>
      </div>

      <div className="ms-seg ms-top__views" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={ui.view === 'calendar'} className={ui.view === 'calendar' ? 'is-active' : ''} onClick={() => setUi({ view: 'calendar', selectedId: ui.selectedId })}>
          <Icon name="calendar" size={16} /> <span>Calendar</span>
        </button>
        <button type="button" role="tab" aria-selected={ui.view === 'posts'} className={ui.view === 'posts' ? 'is-active' : ''} onClick={() => setUi({ view: 'posts' })}>
          <Icon name="list" size={16} /> <span>Posts</span>
        </button>
      </div>

      <div className="ms-top__search">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={f.q}
          placeholder="Search posts"
          aria-label="Search posts"
          onChange={(e) => setFilter({ q: e.target.value })}
        />
        {f.q ? <IconButton icon="x" label="Clear search" size={14} onClick={() => setFilter({ q: '' })} /> : null}
      </div>

      <label className="ms-top__status">
        <span className="ms-sr">Filter by status</span>
        <select value={f.status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </label>

      <div className="ms-top__spacer" />
      <SaveIndicator />

      <div className="ms-top__tools ms-hide-sm">
        <IconButton icon="upload" label="Import" onClick={onImport} />
        <IconButton icon="download" label="Export JSON" onClick={exportAll} />
        <IconButton icon="settings" label="Settings" onClick={onSettings} />
      </div>

      <Menu
        label="New post"
        className="ms-top__new"
        trigger={<Button variant="primary" icon="plus" data-testid="new-post" aria-label="New post" className="ms-newpost">New post</Button>}
        items={newItems}
      />

      <Menu
        label="More"
        className="ms-top__more"
        trigger={<IconButton icon="more" label="More" />}
        items={[
          { label: 'Import JSON, Markdown or text…', icon: 'upload', onClick: onImport },
          { label: 'Export all as JSON', icon: 'download', onClick: exportAll },
          { label: 'Settings', icon: 'settings', onClick: onSettings },
          { divider: true },
          { label: 'Admin dashboard', icon: 'home', onClick: () => window.location.assign('/dashboard') },
          { label: 'Log out', icon: 'logout', onClick: () => window.location.assign('/logout') },
        ]}
      />
    </header>
  );
}
