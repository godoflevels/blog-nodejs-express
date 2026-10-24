import { useMemo, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { addDays, addMonths, formatMonth, formatWeekRange, formatDayLong, todayKey, startOfMonth, weekDays, dayNumber } from '../../core/time.js';
import { Button, IconButton, Icon, Popover, useMedia } from '../ui.jsx';
import MonthView from './MonthView.jsx';
import TimeGridView from './TimeGridView.jsx';
import ListView from './ListView.jsx';
import MonthPicker from './MonthPicker.jsx';
import SidePanel from './SidePanel.jsx';
import SaveIndicator from '../SaveIndicator.jsx';
import { FiltersButton, SearchField } from '../Filters.jsx';

const MODES = [
  ['month', 'Month'],
  ['week', 'Week'],
  ['day', 'Day'],
  ['list', 'List'],
];

function ModeTabs({ calMode, setUi, fill = false }) {
  return (
    <div className={`ms-seg ${fill ? 'ms-seg--fill' : ''}`} role="tablist" aria-label="Calendar mode">
      {MODES.map(([id, label]) => (
        <button type="button" key={id} role="tab" aria-selected={calMode === id} className={calMode === id ? 'is-active' : ''} onClick={() => setUi({ calMode: id })}>
          {label}
        </button>
      ))}
    </div>
  );
}

function TitleButton({ title, cursor, setUi }) {
  return (
    <Popover
      label="Choose a month"
      title="Go to month"
      placement="bottom-start"
      panelClassName="ms-pop--picker"
      className="ms-calendar__titlewrap"
      trigger={
        <button type="button" className="ms-calendar__title" aria-live="polite" data-testid="month-title">
          <span>{title}</span>
          <Icon name="chevronDown" size={16} />
        </button>
      }
    >
      {(close) => (
        <MonthPicker
          cursor={cursor}
          onPick={(date) => {
            close();
            setUi({ cursor: date });
          }}
        />
      )}
    </Popover>
  );
}

function MarkBanner({ calMode }) {
  return (
    <div className="ms-banner ms-banner--free" role="status">
      <Icon name="star" size={18} />
      <div>
        <strong>Marking free places</strong>
        <span>
          {calMode === 'week' || calMode === 'day'
            ? 'Tap a time slot to mark it free; tap the marker again to remove it.'
            : 'Tap a day to mark it free; tap again to unmark. Your teammate sees it right away.'}
        </span>
      </div>
    </div>
  );
}

export default function CalendarView() {
  const { ui, setUi, filteredPosts, displayZone, settings } = useStudio();
  const mobile = useMedia('(max-width: 899px)');
  const narrow = useMedia('(max-width: 639px)');
  const sidebar = useMedia('(min-width: 1180px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const touch = useRef(null);
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
  const goToday = () => setUi({ cursor: todayKey(displayZone) });

  const monthRange = useMemo(() => {
    const from = startOfMonth(cursor);
    return { from, to: addDays(addMonths(from, 1), -1) };
  }, [cursor]);

  let body;
  if (calMode === 'month') body = <MonthView posts={filteredPosts} />;
  else if (calMode === 'list') body = <ListView posts={filteredPosts} from={monthRange.from} to={monthRange.to} title={`No posts in ${formatMonth(cursor)}`} />;
  else if (narrow) {
    const days = calMode === 'week' ? weekDays(cursor, settings.weekStart) : [cursor];
    body = <ListView posts={filteredPosts} from={days[0]} to={days[days.length - 1]} title="Nothing planned in this range" />;
  } else body = <TimeGridView posts={filteredPosts} mode={calMode} />;

  // Swipe sideways on a phone to page through months, weeks or days.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !mobile || ui.markFree) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
  };

  const todayNum = dayNumber(todayKey(displayZone));
  const q = ui.filters.q;
  const showSearch = searchOpen || Boolean(q);

  return (
    <section className="ms-calendar" aria-label="Publication calendar">
      {mobile ? (
        <header className="ms-mbar">
          <div className="ms-mbar__row">
            <TitleButton title={title} cursor={cursor} setUi={setUi} />
            <span className="ms-mbar__tools">
              <button type="button" className="ms-todaybtn" onClick={goToday} aria-label="Today" title="Go to today">
                <Icon name="calendar" size={24} />
                <b>{todayNum}</b>
              </button>
              <IconButton icon="search" label="Search" active={showSearch} onClick={() => setSearchOpen((o) => !o)} />
              <FiltersButton />
            </span>
          </div>
          {showSearch ? <SearchField autoFocus={searchOpen && !q} onClose={() => setSearchOpen(false)} /> : null}
          <div className="ms-mbar__row">
            <ModeTabs calMode={calMode} setUi={setUi} fill />
            <IconButton
              icon="star"
              label={ui.markFree ? 'Done marking free places' : 'Mark free places'}
              active={ui.markFree}
              className="ms-mbar__star"
              data-testid="mark-free"
              onClick={() => setUi({ markFree: !ui.markFree })}
            />
            <SaveIndicator className="ms-save--dot" />
          </div>
        </header>
      ) : (
        <header className="ms-calendar__bar">
          <div className="ms-calendar__nav">
            <Button variant="soft" size="sm" onClick={goToday}>Today</Button>
            <IconButton icon="chevronLeft" label="Previous" onClick={() => shift(-1)} data-testid="prev" />
            <IconButton icon="chevronRight" label="Next" onClick={() => shift(1)} data-testid="next" />
            <TitleButton title={title} cursor={cursor} setUi={setUi} />
          </div>
          <div className="ms-calendar__right">
            <SearchField className="ms-calendar__search" />
            {!sidebar ? <FiltersButton /> : null}
            <Button
              variant={ui.markFree ? 'primary' : 'soft'}
              size="sm"
              icon="star"
              aria-pressed={ui.markFree}
              data-testid="mark-free"
              onClick={() => setUi({ markFree: !ui.markFree })}
            >
              {ui.markFree ? 'Done marking' : 'Mark free places'}
            </Button>
            <ModeTabs calMode={calMode} setUi={setUi} />
            <SaveIndicator />
          </div>
        </header>
      )}
      {ui.markFree ? <MarkBanner calMode={calMode} /> : null}
      <div className="ms-calendar__main">
        {!mobile && sidebar ? <SidePanel /> : null}
        <div className="ms-calendar__body" onTouchStart={mobile ? onTouchStart : undefined} onTouchEnd={mobile ? onTouchEnd : undefined}>
          {body}
          <p className="ms-calendar__zone">
            <Icon name="clock" size={14} /> Times are shown in {displayZone} · shared calendar
          </p>
        </div>
      </div>
    </section>
  );
}
