import { useEffect, useMemo, useRef } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { formatDayLong, formatDayShort, todayKey } from '../../core/time.js';
import { Button, EmptyState, Icon, IconButton, Menu, StatusDot } from '../ui.jsx';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';
import { snippet } from '../../core/snippet.js';
import { CategoryTag, useDayGroups, useSlotGroups } from './shared.jsx';

export function PostRowMenu({ post }) {
  const { actions } = useStudio();
  return (
    <span className="ms-rowtools">
      <IconButton icon="copy" label="Copy text" onClick={() => actions.copyPost(post)} data-testid="row-copy" />
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
          { label: 'Copy webhook JSON', icon: 'copy', onClick: () => actions.copyPost(post, 'json') },
          { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicatePost(post.id) },
          { label: 'Delete', icon: 'trash', danger: true, onClick: () => actions.deletePost(post.id) },
        ]}
      />
    </span>
  );
}

function Row({ post, time, selected, onOpen, compact }) {
  const { categoryById } = useStudio();
  const preview = useMemo(() => snippet(post.content, 140), [post.content]);
  return (
    <div className={`ms-row ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`} style={{ '--cat': categoryById(post.category).color }}>
      <button type="button" className="ms-row__main" onClick={() => onOpen(post.id)}>
        <span className="ms-row__time">{time}</span>
        <StatusDot status={post.status} size={9} />
        <span className="ms-row__text">
          <span className="ms-row__title">{post.title || 'Untitled'}</span>
          {!compact && preview ? <span className="ms-row__preview">{preview}</span> : null}
        </span>
        {!compact ? (
          <span className="ms-row__meta">
            {post.updatedBy ? <span className="ms-by" title={`Last edited by ${post.updatedBy}`}>{post.updatedBy}</span> : null}
            <CategoryTag id={post.category} />
          </span>
        ) : null}
      </button>
      <PostRowMenu post={post} />
    </div>
  );
}

function FreeRow({ slot, time, compact, onOpen }) {
  const { actions } = useStudio();
  return (
    <div className={`ms-row ms-row--free ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="ms-row__main" onClick={() => onOpen(slot.id)}>
        <span className="ms-row__time">{time || 'Any'}</span>
        <Icon name="star" size={14} />
        <span className="ms-row__text">
          <span className="ms-row__title">Free place</span>
          {slot.note ? <span className="ms-row__preview">{slot.note}</span> : null}
        </span>
        {!compact && slot.createdBy ? <span className="ms-row__meta"><span className="ms-by">{slot.createdBy}</span></span> : null}
      </button>
      <Button variant="soft" size="sm" icon="plus" onClick={() => actions.createPost({ date: slot.date, time: slot.time || undefined, slotId: slot.id })}>
        Use
      </Button>
    </div>
  );
}

/** Used by the compact month view on phones. */
export function DayAgenda({ date, items, free = [], onCreate, onToggleFree, onOpen, onOpenFree }) {
  const { ui } = useStudio();
  const allDay = free.some((f) => !f.time);
  return (
    <section className="ms-agenda" aria-label={`Posts on ${formatDayLong(date)}`}>
      <header>
        <h3>{formatDayShort(date)}</h3>
        <span className="ms-agenda__actions">
          <Button variant={allDay ? 'soft' : 'ghost'} size="sm" icon="star" className={allDay ? 'ms-btn--free-on' : ''} onClick={onToggleFree}>{allDay ? 'Unmark free' : 'Mark free'}</Button>
          <Button variant="soft" size="sm" icon="plus" onClick={onCreate}>New</Button>
        </span>
      </header>
      {free.map(({ slot, time }) => (
        <FreeRow key={slot.id} slot={slot} time={time} onOpen={onOpenFree} />
      ))}
      {items.length === 0 && free.length === 0 ? (
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
  const slotGroups = useSlotGroups();
  const today = todayKey(displayZone);
  const listRef = useRef(null);

  const days = useMemo(() => {
    let keys = [...new Set([...groups.keys(), ...slotGroups.keys()])].sort();
    if (from) keys = keys.filter((k) => k >= from);
    if (to) keys = keys.filter((k) => k <= to);
    return keys;
  }, [groups, slotGroups, from, to]);

  useEffect(() => {
    if (!compact || !listRef.current || !ui.selectedId) return;
    const el = listRef.current.querySelector('.ms-row.is-selected');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [compact, ui.selectedId]);

  const open = (id) => setUi({ selectedId: id, mobileTab: 'edit' });
  const openFree = (id) => setUi({ freeSlot: id });

  if (days.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title={title || 'No posts here yet'}
        action={<Button variant="primary" icon="plus" onClick={() => actions.createPost({ date: ui.cursor })}>New post</Button>}
      >
        Plan your next ModsHub announcement or mark free places for your teammate.
      </EmptyState>
    );
  }

  return (
    <div className={`ms-list ${compact ? 'is-compact' : ''}`} ref={listRef}>
      {days.map((day) => {
        const rows = [
          ...(groups.get(day) || []).map((x) => ({ type: 'post', time: x.time, ...x })),
          ...(slotGroups.get(day) || []).map((x) => ({ type: 'free', time: x.time, ...x })),
        ].sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.type === 'free' ? -1 : 1));
        return (
          <section key={day} className="ms-list__day">
            <h3 className={day === today ? 'is-today' : ''}>
              {formatDayLong(day)}
              {day === today ? <span className="ms-today-badge">Today</span> : null}
            </h3>
            {rows.map((r) =>
              r.type === 'post' ? (
                <Row key={r.post.id} post={r.post} time={r.time} selected={ui.selectedId === r.post.id} onOpen={open} compact={compact} />
              ) : (
                <FreeRow key={r.slot.id} slot={r.slot} time={r.time} compact={compact} onOpen={openFree} />
              )
            )}
          </section>
        );
      })}
    </div>
  );
}
