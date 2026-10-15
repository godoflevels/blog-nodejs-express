import { useEffect, useState } from 'react';
import { StudioProvider, useStudio } from './state/StudioContext.jsx';
import TopBar from './components/TopBar.jsx';
import CalendarView from './components/calendar/CalendarView.jsx';
import ListView from './components/calendar/ListView.jsx';
import PostsView from './components/PostsView.jsx';
import EditorPane from './components/editor/EditorPane.jsx';
import PreviewPane from './components/preview/PreviewPane.jsx';
import QuickActions from './components/preview/QuickActions.jsx';
import ImportDialog from './components/dialogs/ImportDialog.jsx';
import SettingsDialog from './components/dialogs/SettingsDialog.jsx';
import { Button, ConfirmDialog, EmptyState, Icon, IconButton, Toasts, useMedia } from './components/ui.jsx';

function Banner() {
  const { recoverable, actions } = useStudio();
  if (recoverable.length === 0) return null;
  const latest = recoverable.reduce((a, b) => (a.draft.savedAt > b.draft.savedAt ? a : b));
  return (
    <div className="ms-banner ms-banner--info" role="alert">
      <Icon name="info" size={18} />
      <div>
        <strong>
          {recoverable.length === 1 ? 'You have unsaved changes from your last session.' : `You have ${recoverable.length} posts with unsaved changes from your last session.`}
        </strong>
        <span>Last edit {new Date(latest.draft.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.</span>
      </div>
      <div className="ms-banner__actions">
        <Button variant="primary" size="sm" onClick={actions.restoreDrafts}>Restore</Button>
        <Button variant="soft" size="sm" onClick={actions.discardDrafts}>Discard</Button>
      </div>
    </div>
  );
}

function Browse() {
  const { ui } = useStudio();
  return ui.view === 'posts' ? <PostsView /> : <CalendarView />;
}

function Workspace() {
  const s = useStudio();
  const { ui, setUi, selectedPost: post, filteredPosts } = s;
  const wide = useMedia('(min-width: 1280px)');
  const xwide = useMedia('(min-width: 1536px)');
  const mid = useMedia('(min-width: 900px)');

  // A post id from the URL that no longer exists.
  useEffect(() => {
    if (ui.selectedId && !post && s.phase === 'ready') setUi({ selectedId: null });
  }, [ui.selectedId, post, s.phase, setUi]);

  if (!post) {
    return (
      <main className="ms-main ms-main--browse">
        <Browse />
      </main>
    );
  }

  const split = ui.editorMode === 'split';
  const showList = wide && (!split || xwide);
  const showRight = ui.showPreview;

  // Phones and small tablets: one pane at a time.
  if (!mid) {
    const tab = ui.mobileTab;
    let content;
    if (tab === 'browse') content = <Browse />;
    else if (tab === 'preview') content = <PreviewPane post={post} showExport={false} tabs={['preview', 'raw', 'plain']} />;
    else if (tab === 'export') content = <PreviewPane post={post} showExport forcedTab="image" />;
    else content = <EditorPane post={post} onBack={() => setUi({ mobileTab: 'browse' })} />;
    return (
      <main className="ms-main ms-main--tabs">
        <div className="ms-main__pane">{content}</div>
        {tab === 'edit' || tab === 'preview' ? <QuickActions post={post} /> : null}
        <nav className="ms-tabbar" aria-label="Sections">
          {[
            ['browse', 'Calendar', ui.view === 'posts' ? 'list' : 'calendar'],
            ['edit', 'Edit', 'edit'],
            ['preview', 'Preview', 'eye'],
            ['export', 'Export', 'download'],
          ].map(([id, label, icon]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'is-active' : ''} onClick={() => setUi({ mobileTab: id })}>
              <Icon name={icon} size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    );
  }

  const cols = [showList ? 'list' : null, 'editor', showRight ? 'right' : null].filter(Boolean);
  return (
    <main className={`ms-main ms-main--edit ms-cols-${cols.length}`}>
      {showList ? (
        <aside className="ms-pane ms-pane--list" aria-label="Posts">
          <div className="ms-pane__head">
            <strong>{ui.view === 'posts' ? 'All posts' : 'Calendar'}</strong>
            <Button variant="ghost" size="sm" icon="calendar" onClick={() => setUi({ selectedId: null })}>Full view</Button>
          </div>
          <ListView posts={filteredPosts} compact title="No posts match the filters" />
        </aside>
      ) : null}
      <div className="ms-pane ms-pane--editor">
        <EditorPane post={post} onBack={showList ? null : () => setUi({ selectedId: null })} />
      </div>
      {showRight ? (
        <aside className="ms-pane ms-pane--preview" aria-label="Preview and export">
          <PreviewPane post={post} />
        </aside>
      ) : null}
      <button
        type="button"
        className={`ms-dock ${showRight ? 'is-open' : ''}`}
        onClick={() => setUi({ showPreview: !showRight })}
        aria-label={showRight ? 'Hide preview and export' : 'Show preview and export'}
        aria-pressed={showRight}
        title={showRight ? 'Hide preview and export' : 'Show preview and export'}
      >
        <Icon name={showRight ? 'chevronRight' : 'eye'} size={18} />
        {!showRight ? <span>Preview &amp; export</span> : null}
      </button>
    </main>
  );
}

function Shell() {
  const s = useStudio();
  const [dialog, setDialog] = useState(null);

  // Ctrl/Cmd+S flushes autosave immediately.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        s.actions.saveNow().then(() => s.toast('Saved'));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [s.actions, s.toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.phase === 'loading') {
    return (
      <div className="ms-boot" role="status">
        <div className="ms-boot__logo">ModsHub <span>Post Studio</span></div>
        <div className="ms-boot__spinner" aria-hidden="true" />
        <p className="ms-boot__text">Loading your calendar…</p>
      </div>
    );
  }
  if (s.phase === 'error') {
    return (
      <div className="ms-boot">
        <EmptyState
          icon="alert"
          title="Could not load the Studio"
          action={<Button variant="primary" onClick={s.reload}>Try again</Button>}
        >
          {s.loadError && s.loadError.message ? s.loadError.message : 'Check your connection and try again.'}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="ms-app">
      <TopBar onImport={() => setDialog('import')} onSettings={() => setDialog('settings')} />
      <Banner />
      <Workspace />
      {dialog === 'import' ? <ImportDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'settings' ? <SettingsDialog onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
