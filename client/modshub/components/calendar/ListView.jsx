import { useEffect, useMemo, useRef } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { formatDayLong, todayKey } from '../../core/time.js';
import { Button, EmptyState, Icon, Menu, StatusDot, IconButton } from '../ui.jsx';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';
import { CategoryTag, useDayGroups } from './shared.jsx';

export function PostRowMenu({ post }) {
  const { actions } = useStudio();
  return (
    <Menu
      label="Post actions"
      trigger={<IconButton icon="more" label="Post actions" />}
      items={[
        { heading: 'Status' },
        ...STATUS_ORDER.map((s) => ({
          label: STATUS_META[s].label,
          checked: post.status === s,
          onClick: () => actions.updatePost(post.id, { status: s }),
        })),
        { divider: true },
        { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicatePost(post.id) },
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => actions.deletePost(post.id) },
      ]}
    />
  );
}

function Row({ post, time, selected, onOpen, compact }) {
  const preview = useMemo(() => post.content.replace(/\s+/g, ' ').slice(0, 140), [post.content]);
  return (
    <div className={`ms-row ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="ms-row__main" onClick={() => onOpen(post.id)}>
        <span className="ms-row__time">{time}</span>
        <StatusDot status={post.status} size={9} />
        <span className="ms-row__text">
          <span className="ms-row__title">{post.title || 'Untitled'}</span>
          {!compact && preview ? <span className="ms-row__preview">{preview}</span> : null}
        </span>
        {!compact ? (
          <span className="ms-row__meta">
            <CategoryTag id={post.category} />
          </span>
        ) : null}
      </button>
      <PostRowMenu post={post} />
    </div>
  );
}

/** Used by the compact month view on phones. */
export function DayAgenda({ date, items, onCreate, onOpen }) {
  const { ui } = useStudio();
  return (
    <section className="ms-agenda" aria-label={`Posts on ${formatDayLong(date)}`}>
      <header>
        <h3>{formatDayLong(date)}</h3>
        <Button variant="soft" size="sm" icon="plus" onClick={onCreate}>New</Button>
      </header>
      {items.length === 0 ? (
        <p className="ms-agenda__empty">Nothing planned for this day.</p>
      ) : (
        items.map(({ post, time }) => (
          <Row key={post.id} post={post} time={time} selected={ui.selectedId === post.id} onOpen={onOpen} />
        ))
      )}
    </section>
  );
}

export default function ListView({ posts, compact = false, from, to, title }) {
  const { ui, setUi, displayZone, actions } = useStudio();
  const groups = useDayGroups(posts);
  const today = todayKey(displayZone);
  const listRef = useRef(null);

  const days = useMemo(() => {
    let keys = [...groups.keys()].sort();
    if (from) keys = keys.filter((k) => k >= from);
    if (to) keys = keys.filter((k) => k <= to);
    return keys;
  }, [groups, from, to]);

  // Keep the open post in view in the compact (editor) list.
  useEffect(() => {
    if (!compact || !listRef.current || !ui.selectedId) return;
    const el = listRef.current.querySelector('.ms-row.is-selected');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [compact, ui.selectedId]);

  const open = (id) => setUi({ selectedId: id, mobileTab: 'edit' });

  if (days.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title={title || 'No posts here yet'}
        action={<Button variant="primary" icon="plus" onClick={() => actions.createPost({ date: ui.cursor })}>New post</Button>}
      >
        Plan your next ModsHub announcement or change the filters.
      </EmptyState>
    );
  }

  return (
    <div className={`ms-list ${compact ? 'is-compact' : ''}`} ref={listRef}>
      {days.map((day) => (
        <section key={day} className="ms-list__day">
          <h3 className={day === today ? 'is-today' : ''}>
            {formatDayLong(day)}
            {day === today ? <span className="ms-today-badge">Today</span> : null}
          </h3>
          {groups.get(day).map(({ post, time }) => (
            <Row key={post.id} post={post} time={time} selected={ui.selectedId === post.id} onOpen={open} compact={compact} />
          ))}
        </section>
      ))}
    </div>
  );
}

export { Icon };
