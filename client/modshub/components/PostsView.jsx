import { useMemo } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { Button, EmptyState, Icon, Menu, StatusPill } from './ui.jsx';
import { EMPTY_FILTERS, FiltersButton, SearchField, activeFilterCount } from './Filters.jsx';
import SaveIndicator from './SaveIndicator.jsx';
import { CategoryTag } from './calendar/shared.jsx';
import { PostRowMenu } from './calendar/ListView.jsx';
import { wallParts, formatDayShort } from '../core/time.js';
import { buildExport, stringifyExport } from '../core/json-io.js';
import { snippet } from '../core/snippet.js';
import { downloadText } from '../core/filenames.js';
import { STATUS_META, STATUS_ORDER } from '../constants.js';

export default function PostsView() {
  const { ui, setUi, filteredPosts, posts, categories, categoryById, displayZone, actions, toast } = useStudio();
  const f = ui.filters;
  const setFilter = (patch) => setUi((p) => ({ filters: { ...p.filters, ...patch } }));
  const selected = useMemo(() => new Set(ui.selection), [ui.selection]);
  const visibleIds = filteredPosts.map((p) => p.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const anyFilter = activeFilterCount(f, true) > 0;

  const toggle = (id) =>
    setUi((p) => ({ selection: p.selection.includes(id) ? p.selection.filter((x) => x !== id) : [...p.selection, id] }));

  const exportSelected = () => {
    const chosen = posts.filter((p) => selected.has(p.id));
    downloadText(stringifyExport(buildExport(chosen)), `modshub-posts-${chosen.length}.json`, 'application/json;charset=utf-8');
    toast(`Exported ${chosen.length} post${chosen.length === 1 ? '' : 's'} as JSON`);
  };

  return (
    <section className="ms-posts" aria-label="All posts">
      <header className="ms-posts__head">
        <h1>Posts</h1>
        <div className="ms-posts__tools">
          <SearchField className="ms-posts__search" />
          <FiltersButton full />
          <SaveIndicator />
        </div>
      </header>

      <div className="ms-posts__bar">
        <label className="ms-check">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setUi({ selection: allSelected ? [] : visibleIds })}
            aria-label="Select all visible posts"
          />
          <span>{ui.selection.length > 0 ? `${ui.selection.length} selected` : `${filteredPosts.length} of ${posts.length} posts`}</span>
        </label>
        {ui.selection.length > 0 ? (
          <div className="ms-posts__bulk">
            <Button variant="soft" size="sm" icon="download" onClick={exportSelected}>Export JSON</Button>
            <Menu
              label="Change category"
              trigger={<Button variant="soft" size="sm" icon="tag">Category</Button>}
              items={categories.map((c) => ({ label: c.name, onClick: () => actions.bulkPatch(ui.selection, { category: c.id }) }))}
            />
            <Menu
              label="Change status"
              trigger={<Button variant="soft" size="sm" icon="check">Status</Button>}
              items={STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label, onClick: () => actions.bulkPatch(ui.selection, { status: s }) }))}
            />
            <Button variant="soft" size="sm" icon="archive" onClick={() => actions.bulkPatch(ui.selection, { status: 'archived' })}>Archive</Button>
            <Button variant="danger" size="sm" icon="trash" onClick={() => actions.deletePosts(ui.selection)}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setUi({ selection: [] })}>Clear</Button>
          </div>
        ) : null}
      </div>

      {filteredPosts.length === 0 ? (
        <EmptyState
          icon={posts.length === 0 ? 'calendar' : 'search'}
          title={posts.length === 0 ? 'No posts yet' : 'No posts match these filters'}
          action={
            posts.length === 0 ? (
              <Button variant="primary" icon="plus" onClick={() => actions.createPost()}>Create the first post</Button>
            ) : (
              <Button variant="soft" onClick={() => setFilter(EMPTY_FILTERS)}>Clear filters</Button>
            )
          }
        >
          {posts.length === 0 ? 'Start from a template or an empty draft. Nothing is published automatically.' : 'Try another search term or widen the date range.'}
        </EmptyState>
      ) : (
        <ul className="ms-posts__list">
          {filteredPosts.map((post) => {
            const w = wallParts(post.scheduledAt, displayZone);
            const cat = categoryById(post.category);
            return (
              <li key={post.id} className={`ms-card ${selected.has(post.id) ? 'is-selected' : ''}`} style={{ '--cat': cat.color }}>
                <label className="ms-check ms-card__check">
                  <input type="checkbox" checked={selected.has(post.id)} onChange={() => toggle(post.id)} aria-label={`Select ${post.title}`} />
                </label>
                <button type="button" className="ms-card__main" onClick={() => setUi({ selectedId: post.id, mobileTab: 'edit' })}>
                  {post.image ? (
                    <span className="ms-card__thumb"><img src={post.image.src} alt="" loading="lazy" /></span>
                  ) : null}
                  <span className="ms-card__text">
                    <span className="ms-card__top">
                      <StatusPill status={post.status} />
                      <CategoryTag id={post.category} />
                    </span>
                    <strong className="ms-card__title">{post.title || 'Untitled'}</strong>
                    <span className="ms-card__snippet">{snippet(post.content, 160) || 'No text yet'}</span>
                    <span className="ms-card__meta">
                      <Icon name="clock" size={14} /> {formatDayShort(w.date)}, {w.time}
                      {post.tags.length ? <span className="ms-card__tags">{post.tags.slice(0, 4).map((t) => `#${t}`).join(' ')}</span> : null}
                    </span>
                  </span>
                </button>
                <PostRowMenu post={post} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
