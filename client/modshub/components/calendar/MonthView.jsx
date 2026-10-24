import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { monthMatrix, weekdayNames, dayNumber, todayKey, formatDayLong } from '../../core/time.js';
import { Icon, useMedia } from '../ui.jsx';
import { FreeChip, PostChip, useDayGroups, useSlotGroups } from './shared.jsx';
import { DayAgenda } from './ListView.jsx';

const MAX_CHIPS = 3;

export default function MonthView({ posts }) {
  const { ui, setUi, settings, displayZone, actions } = useStudio();
  // Same breakpoint as the phone layout: dots and the day's posts below.
  const compact = useMedia('(max-width: 899px)');
  const fine = useMedia('(pointer: fine)');
  const groups = useDayGroups(posts);
  const slotGroups = useSlotGroups();
  const weeks = useMemo(() => monthMatrix(ui.cursor, settings.weekStart), [ui.cursor, settings.weekStart]);
  const names = useMemo(() => weekdayNames(settings.weekStart, compact ? 'narrow' : 'short'), [settings.weekStart, compact]);
  const today = todayKey(displayZone);
  const [dropTarget, setDropTarget] = useState(null);
  const [picked, setPicked] = useState(ui.cursor);

  const open = (id) => setUi({ selectedId: id, mobileTab: 'edit' });
  const openFree = (id) => setUi({ freeSlot: id });
  const create = (date) => actions.createPost({ date });

  return (
    <div className="ms-month">
      <div className="ms-month__weekdays" role="row">
        {names.map((n, i) => (
          <div key={`${n}${i}`} className="ms-month__weekday" role="columnheader">{n}</div>
        ))}
      </div>
      <div className={`ms-month__grid ${ui.markFree ? 'is-marking' : ''}`} role="grid" aria-label="Month calendar">
        {weeks.flat().map((cell) => {
          const items = groups.get(cell.date) || [];
          const free = slotGroups.get(cell.date) || [];
          const allDayFree = free.some((f) => !f.time);
          const isToday = cell.date === today;
          const room = Math.max(1, MAX_CHIPS - Math.min(free.length, 2));
          const more = items.length - room;
          return (
            <div
              key={cell.date}
              role="gridcell"
              data-date={cell.date}
              aria-label={`${formatDayLong(cell.date)}${allDayFree ? ', free place' : ''}`}
              className={`ms-cell ${cell.inMonth ? '' : 'is-outside'} ${isToday ? 'is-today' : ''} ${allDayFree ? 'has-free' : ''} ${dropTarget === cell.date ? 'is-drop' : ''} ${compact && picked === cell.date ? 'is-picked' : ''}`}
              onClick={() => {
                if (ui.markFree) actions.toggleFree({ date: cell.date });
                else if (compact) setPicked(cell.date);
                else if (items.length === 0 && free.length === 0) create(cell.date);
              }}
              onDragOver={(e) => {
                if (!fine || ui.markFree) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dropTarget !== cell.date) setDropTarget(cell.date);
              }}
              onDragLeave={() => setDropTarget((t) => (t === cell.date ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) actions.movePost(id, { date: cell.date });
              }}
            >
              <div className="ms-cell__head">
                <span className="ms-cell__num">{dayNumber(cell.date)}</span>
                {compact && (items.length > 0 || free.length > 0) ? (
                  <span className="ms-cell__dots" aria-hidden="true">
                    {free.length > 0 ? <i className="ms-dot-s ms-dot-s--free" /> : null}
                    {items.slice(0, 3).map(({ post }) => (
                      <i key={post.id} className={`ms-dot-s ms-dot-s--${post.status}`} />
                    ))}
                  </span>
                ) : !compact ? (
                  <span className="ms-cell__tools">
                    <button
                      type="button"
                      className={`ms-cell__btn ${allDayFree ? 'is-on' : ''}`}
                      aria-label={`${allDayFree ? 'Unmark' : 'Mark'} ${formatDayLong(cell.date)} as free`}
                      title={allDayFree ? 'Remove the free marker' : 'Mark this day as free'}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.toggleFree({ date: cell.date });
                      }}
                    >
                      <Icon name="star" size={13} />
                    </button>
                    <button
                      type="button"
                      className="ms-cell__btn"
                      aria-label={`New post on ${formatDayLong(cell.date)}`}
                      title="New post"
                      onClick={(e) => {
                        e.stopPropagation();
                        create(cell.date);
                      }}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </span>
                ) : null}
              </div>
              {!compact ? (
                <div className="ms-cell__body">
                  {free.slice(0, 2).map(({ slot, time }) => (
                    <FreeChip key={slot.id} slot={slot} time={time} onOpen={openFree} />
                  ))}
                  {items.slice(0, room).map(({ post, time }) => (
                    <PostChip key={post.id} post={post} time={time} selected={ui.selectedId === post.id} draggable={fine && !ui.markFree} onOpen={open} />
                  ))}
                  {more > 0 ? (
                    <button
                      type="button"
                      className="ms-cell__more"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUi({ calMode: 'day', cursor: cell.date });
                      }}
                    >
                      +{more} more
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {compact ? (
        <DayAgenda
          date={picked}
          items={groups.get(picked) || []}
          free={slotGroups.get(picked) || []}
          onCreate={() => create(picked)}
          onToggleFree={() => actions.toggleFree({ date: picked })}
          onOpen={open}
          onOpenFree={openFree}
        />
      ) : null}
    </div>
  );
}
