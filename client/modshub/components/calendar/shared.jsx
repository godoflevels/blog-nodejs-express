import { useMemo } from 'react';
import { StatusDot, Icon } from '../ui.jsx';
import { wallParts } from '../../core/time.js';
import { useStudio } from '../../state/StudioContext.jsx';

/** Map of 'YYYY-MM-DD' -> posts (already sorted by instant) in the display zone. */
export function useDayGroups(posts) {
  const { displayZone } = useStudio();
  return useMemo(() => {
    const map = new Map();
    for (const post of posts) {
      const { date, time } = wallParts(post.scheduledAt, displayZone);
      if (!map.has(date)) map.set(date, []);
      map.get(date).push({ post, time });
    }
    return map;
  }, [posts, displayZone]);
}

export function PostChip({ post, time, selected, draggable, onOpen, compact = false }) {
  const { categoryById } = useStudio();
  const category = categoryById(post.category);
  return (
    <button
      type="button"
      className={`ms-chip ms-chip--${post.status} ${selected ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}
      style={{ '--cat': category.color }}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', post.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(post.id);
      }}
      title={`${time} · ${post.title}`}
    >
      <StatusDot status={post.status} size={7} />
      <span className="ms-chip__time">{time}</span>
      <span className="ms-chip__title">{post.title || 'Untitled'}</span>
    </button>
  );
}

export function CategoryTag({ id }) {
  const { categoryById } = useStudio();
  const c = categoryById(id);
  return (
    <span className="ms-cat" style={{ '--cat': c.color }}>
      <i aria-hidden="true" />
      {c.name}
    </span>
  );
}

export { Icon };
