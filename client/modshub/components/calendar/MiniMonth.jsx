import { useMemo } from 'react';
import { addMonths, dayNumber, formatDayLong, formatMonth, monthMatrix, startOfMonth, weekdayNames } from '../../core/time.js';
import { IconButton } from '../ui.jsx';

/**
 * A small month grid used by the side panel and the date picker.
 *
 * month    any 'YYYY-MM-DD' inside the month being shown
 * selected the highlighted day
 * marks    Map<'YYYY-MM-DD', {posts?: number, free?: boolean}> for the dots
 */
export default function MiniMonth({ month, onMonth, selected, today, onPick, marks, weekStart = 1, className = '' }) {
  const weeks = useMemo(() => monthMatrix(month, weekStart), [month, weekStart]);
  const names = useMemo(() => weekdayNames(weekStart, 'narrow'), [weekStart]);
  return (
    <div className={`ms-mini ${className}`}>
      <div className="ms-mini__head">
        <strong aria-live="polite">{formatMonth(month)}</strong>
        <span>
          <IconButton icon="chevronLeft" label="Previous month" size={16} onClick={() => onMonth(startOfMonth(addMonths(month, -1)))} />
          <IconButton icon="chevronRight" label="Next month" size={16} onClick={() => onMonth(startOfMonth(addMonths(month, 1)))} />
        </span>
      </div>
      <div className="ms-mini__grid" role="grid" aria-label={formatMonth(month)}>
        {names.map((n, i) => (
          <span className="ms-mini__wd" key={`${n}${i}`} role="columnheader">{n}</span>
        ))}
        {weeks.flat().map((cell) => {
          const mark = marks && marks.get(cell.date);
          return (
            <button
              type="button"
              key={cell.date}
              role="gridcell"
              data-date={cell.date}
              aria-label={formatDayLong(cell.date)}
              aria-selected={cell.date === selected}
              className={`ms-mini__day ${cell.inMonth ? '' : 'is-outside'} ${cell.date === today ? 'is-today' : ''} ${cell.date === selected ? 'is-selected' : ''}`}
              onClick={() => onPick(cell.date)}
            >
              <span>{dayNumber(cell.date)}</span>
              {mark && (mark.posts || mark.free) ? (
                <i className={`ms-mini__dot ${mark.free && !mark.posts ? 'is-free' : ''}`} aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Map of day -> {posts, free} for the dots of a mini calendar. */
export function buildMarks(dayGroups, slotGroups) {
  const map = new Map();
  for (const [date, list] of dayGroups) map.set(date, { posts: list.length, free: false });
  for (const [date, list] of slotGroups) map.set(date, { posts: (map.get(date) || {}).posts || 0, free: list.length > 0 });
  return map;
}
