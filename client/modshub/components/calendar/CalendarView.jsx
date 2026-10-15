import { useMemo } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { addDays, addMonths, formatMonth, formatWeekRange, formatDayLong, todayKey, startOfMonth, weekDays } from '../../core/time.js';
import { Button, IconButton, Icon, useMedia } from '../ui.jsx';
import MonthView from './MonthView.jsx';
import TimeGridView from './TimeGridView.jsx';
import ListView from './ListView.jsx';

const MODES = [
  ['month', 'Month'],
  ['week', 'Week'],
  ['day', 'Day'],
  ['list', 'List'],
];

export default function CalendarView() {
  const { ui, setUi, filteredPosts, displayZone, settings, actions } = useStudio();
  const narrow = useMedia('(max-width: 639px)');
  const { calMode, cursor } = ui;

  const title = useMemo(() => {
    if (calMode === 'week') return formatWeekRange(cursor, settings.weekStart);
    if (calMode === 'day') return formatDayLong(cursor);
    return formatMonth(cursor);
  }, [calMode, cursor, settings.weekStart]);

  const shift = (dir) => {
    if (calMode === 'month' || calMode === 'list') setUi({ cursor: startOfMonth(addMonths(cursor, dir)) });
    else if (calMode === 'week') setUi({ cursor: addDays(cursor, 7 * dir) });
    else setUi({ cursor: addDays(cursor, dir) });
  };

  const monthRange = useMemo(() => {
    const from = startOfMonth(cursor);
    return { from, to: addDays(addMonths(from, 1), -1) };
  }, [cursor]);

  let body;
  if (calMode === 'month') body = <MonthView posts={filteredPosts} />;
  else if (calMode === 'list') body = <ListView posts={filteredPosts} from={monthRange.from} to={monthRange.to} title={`No posts in ${formatMonth(cursor)}`} />;
  else if (narrow) {
    // Seven columns do not fit a phone: show the same range as an agenda.
    const days = calMode === 'week' ? weekDays(cursor, settings.weekStart) : [cursor];
    body = <ListView posts={filteredPosts} from={days[0]} to={days[days.length - 1]} title="Nothing planned in this range" />;
  } else body = <TimeGridView posts={filteredPosts} mode={calMode} />;

  return (
    <section className="ms-calendar" aria-label="Publication calendar">
      <header className="ms-calendar__bar">
        <div className="ms-calendar__nav">
          <Button variant="ghost" size="sm" onClick={() => setUi({ cursor: todayKey(displayZone) })}>Today</Button>
          <IconButton icon="chevronLeft" label="Previous" onClick={() => shift(-1)} />
          <IconButton icon="chevronRight" label="Next" onClick={() => shift(1)} />
          <h2 className="ms-calendar__title" aria-live="polite">{title}</h2>
        </div>
        <div className="ms-calendar__right">
          <div className="ms-seg" role="tablist" aria-label="Calendar mode">
            {MODES.map(([id, label]) => (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={calMode === id}
                className={calMode === id ? 'is-active' : ''}
                onClick={() => setUi({ calMode: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="soft" size="sm" icon="plus" className="ms-hide-sm" onClick={() => actions.createPost({ date: cursor })}>
            New
          </Button>
        </div>
      </header>
      <div className="ms-calendar__body">{body}</div>
      <p className="ms-calendar__zone">
        <Icon name="clock" size={14} /> Times are shown in {displayZone}
      </p>
    </section>
  );
}
