import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { IconButton } from '../ui.jsx';
import { wallParts } from '../../core/time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Jump straight to any month; months that hold posts or free places carry a dot. */
export default function MonthPicker({ cursor, onPick }) {
  const { posts, slotsView, displayZone } = useStudio();
  const [year, setYear] = useState(Number(cursor.slice(0, 4)));
  const currentMonth = Number(cursor.slice(5, 7));
  const currentYear = Number(cursor.slice(0, 4));

  const marks = useMemo(() => {
    const map = new Map();
    for (const p of posts) {
      const key = wallParts(p.scheduledAt, displayZone).date.slice(0, 7);
      map.set(key, { ...(map.get(key) || {}), posts: true });
    }
    for (const s of slotsView) {
      const key = s.date.slice(0, 7);
      map.set(key, { ...(map.get(key) || {}), free: true });
    }
    return map;
  }, [posts, slotsView, displayZone]);

  return (
    <div className="ms-monthpicker">
      <div className="ms-monthpicker__year">
        <IconButton icon="chevronLeft" label="Previous year" onClick={() => setYear((y) => y - 1)} />
        <strong>{year}</strong>
        <IconButton icon="chevronRight" label="Next year" onClick={() => setYear((y) => y + 1)} />
      </div>
      <div className="ms-monthpicker__grid">
        {MONTHS.map((name, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          const mark = marks.get(key);
          return (
            <button
              type="button"
              key={name}
              className={`${year === currentYear && i + 1 === currentMonth ? 'is-current' : ''}`}
              onClick={() => onPick(`${key}-01`)}
              aria-label={`${name} ${year}`}
            >
              {name}
              <span className="ms-monthpicker__marks" aria-hidden="true">
                {mark && mark.posts ? <i className="is-posts" /> : null}
                {mark && mark.free ? <i className="is-free" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
