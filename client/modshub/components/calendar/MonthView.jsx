import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { monthMatrix, weekdayNames, dayNumber, todayKey, formatDayLong } from '../../core/time.js';
import { Icon, useMedia } from '../ui.jsx';
import { PostChip, useDayGroups } from './shared.jsx';
import { DayAgenda } from './ListView.jsx';

const MAX_CHIPS = 3;

export default function MonthView({ posts }) {
  const { ui, setUi, settings, displayZone, actions } = useStudio();
  const compact = useMedia('(max-width: 767px)');
  const fine = useMedia('(pointer: fine)');
  const groups = useDayGroups(posts);
  const weeks = useMemo(() => monthMatrix(ui.cursor, settings.weekStart), [ui.cursor, settings.weekStart]);
  const names = useMemo(() => weekdayNames(settings.weekStart, compact ? 'narrow' : 'short'), [settings.weekStart, compact]);
  const today = todayKey(displayZone);
  const [dropTarget, setDropTarget] = useState(null);
  const [picked, setPicked] = useState(ui.cursor);

  const open = (id) => setUi({ selectedId: id, mobileTab: 'edit' });
  const create = (date) => actions.createPost({ date });

  return (
    <div className="ms-month">
      <div className="ms-month__weekdays" role="row">
        {names.map((n, i) => (
          <div key={`${n}${i}`} className="ms-month__weekday" role="columnheader">{n}</div>
        ))}
      </div>
      <div className="ms-month__grid" role="grid" aria-label="Month calendar">
        {weeks.flat().map((cell) => {
          const items = groups.get(cell.date) || [];
          const isToday = cell.date === today;
          const more = items.length - MAX_CHIPS;
          return (
            <div
              key={cell.date}
              role="gridcell"
              aria-label={formatDayLong(cell.date)}
              className={`ms-cell ${cell.inMonth ? '' : 'is-outside'} ${isToday ? 'is-today' : ''} ${dropTarget === cell.date ? 'is-drop' : ''} ${compact && picked === cell.date ? 'is-picked' : ''}`}
              onClick={() => {
                if (compact) setPicked(cell.date);
                else if (items.length === 0) create(cell.date);
              }}
              onDragOver={(e) => {
                if (!fine) return;
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
                {compact && items.length > 0 ? (
                  <span className="ms-cell__dots" aria-hidden="true">
                    {items.slice(0, 3).map(({ post }) => (
                      <i key={post.id} className={`ms-dot-s ms-dot-s--${post.status}`} />
                    ))}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="ms-cell__add"
                    aria-label={`New post on ${formatDayLong(cell.date)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      create(cell.date);
                    }}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
              {!compact ? (
                <div className="ms-cell__body">
                  {items.slice(0, MAX_CHIPS).map(({ post, time }) => (
                    <PostChip key={post.id} post={post} time={time} selected={ui.selectedId === post.id} draggable={fine} onOpen={open} />
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
        <DayAgenda date={picked} items={groups.get(picked) || []} onCreate={() => create(picked)} onOpen={open} />
      ) : null}
    </div>
  );
}
