import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { weekDays, todayKey, formatDayShort, minutesOfDay, timeFromMinutes, wallParts, dayNumber, weekdayNames, formatDayLong } from '../../core/time.js';
import { StatusDot, useMedia } from '../ui.jsx';
import { useDayGroups, useSlotGroups } from './shared.jsx';

const HOUR_H = 56;
const BLOCK_MIN = 34; // visual length of a post in minutes
const SNAP = 15;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Greedy lane assignment so simultaneous posts sit side by side. */
function layout(items) {
  const sorted = [...items].sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
  const lanesEnd = [];
  const placed = sorted.map((item) => {
    const start = minutesOfDay(item.time);
    let lane = lanesEnd.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(0);
    }
    lanesEnd[lane] = start + BLOCK_MIN;
    return { ...item, start, lane };
  });
  // Lane count per cluster of overlapping posts.
  return placed.map((p) => {
    const overlapping = placed.filter((q) => q.start < p.start + BLOCK_MIN && q.start + BLOCK_MIN > p.start);
    const lanes = Math.max(...overlapping.map((q) => q.lane)) + 1;
    return { ...p, lanes };
  });
}

function nowMinutes(zone) {
  const parts = wallParts(new Date().toISOString(), zone);
  return { date: parts.date, minutes: minutesOfDay(parts.time) };
}

export default function TimeGridView({ posts, mode }) {
  const { ui, setUi, settings, displayZone, actions } = useStudio();
  const fine = useMedia('(pointer: fine)');
  const groups = useDayGroups(posts);
  const slotGroups = useSlotGroups();
  const days = useMemo(() => (mode === 'day' ? [ui.cursor] : weekDays(ui.cursor, settings.weekStart)), [mode, ui.cursor, settings.weekStart]);
  const today = todayKey(displayZone);
  const scrollRef = useRef(null);
  const [now, setNow] = useState(() => nowMinutes(displayZone));
  const names = useMemo(() => weekdayNames(settings.weekStart, 'short'), [settings.weekStart]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMinutes(displayZone)), 60000);
    return () => window.clearInterval(t);
  }, [displayZone]);

  // Start the viewport near the first post of the range, or at 7:00.
  useLayoutEffect(() => {
    const all = days.flatMap((d) => (groups.get(d) || []).map((x) => minutesOfDay(x.time)));
    const first = all.length ? Math.min(...all) : 7 * 60;
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, ((first - 60) / 60) * HOUR_H);
    // only when the range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], mode]);

  const minutesAt = (event, element, step) => {
    const rect = element.getBoundingClientRect();
    const raw = ((event.clientY - rect.top) / HOUR_H) * 60;
    return Math.max(0, Math.min(24 * 60 - step, Math.floor(raw / step) * step));
  };

  const open = (id) => setUi({ selectedId: id, mobileTab: 'edit' });

  return (
    <div className={`ms-grid ms-grid--${mode}`}>
      <div className="ms-grid__head" style={{ '--cols': days.length }}>
        <div className="ms-grid__corner" />
        {days.map((d, i) => (
          <button
            type="button"
            key={d}
            className={`ms-grid__day ${d === today ? 'is-today' : ''}`}
            onClick={() => setUi({ calMode: 'day', cursor: d })}
            aria-label={formatDayLong(d)}
          >
            <small>{mode === 'day' ? formatDayShort(d).split(' ')[0] : names[i]}</small>
            <b>{dayNumber(d)}</b>
            {(slotGroups.get(d) || []).some((f) => !f.time) ? <em className="ms-grid__free">Free</em> : null}
          </button>
        ))}
      </div>
      <div className="ms-grid__scroll" ref={scrollRef}>
        <div className="ms-grid__body" style={{ '--cols': days.length, '--hour': `${HOUR_H}px` }}>
          <div className="ms-grid__hours" aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className="ms-grid__hour" style={{ height: HOUR_H }}>
                <span>{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const items = layout(groups.get(d) || []);
            return (
              <div
                key={d}
                className={`ms-grid__col ${d === today ? 'is-today' : ''}`}
                style={{ height: HOUR_H * 24 }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const time = timeFromMinutes(minutesAt(e, e.currentTarget, 30));
                  if (ui.markFree) actions.toggleFree({ date: d, time });
                  else actions.createPost({ date: d, time });
                }}
                onDragOver={(e) => {
                  if (!fine) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) actions.movePost(id, { date: d, time: timeFromMinutes(minutesAt(e, e.currentTarget, SNAP)) });
                }}
              >
                {HOURS.map((h) => (
                  <div key={h} className="ms-grid__line" style={{ top: h * HOUR_H }} />
                ))}
                {d === now.date ? <div className="ms-grid__now" style={{ top: (now.minutes / 60) * HOUR_H }} /> : null}
                {(slotGroups.get(d) || []).filter((f) => f.time).map(({ slot, time }) => (
                  <button
                    type="button"
                    key={slot.id}
                    className="ms-block ms-block--free"
                    style={{ top: (minutesOfDay(time) / 60) * HOUR_H, height: Math.max(26, (BLOCK_MIN / 60) * HOUR_H - 2), left: 2, right: 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ui.markFree) actions.removeSlot(slot.id);
                      else setUi({ freeSlot: slot.id });
                    }}
                    title={`Free place at ${time}${slot.note ? `: ${slot.note}` : ''}`}
                  >
                    <span className="ms-block__time">{time}</span>
                    <span className="ms-block__title">Free{slot.note ? `: ${slot.note}` : ''}</span>
                  </button>
                ))}
                {items.map(({ post, time, start, lane, lanes }) => (
                  <button
                    type="button"
                    key={post.id}
                    className={`ms-block ms-block--${post.status} ${ui.selectedId === post.id ? 'is-selected' : ''}`}
                    draggable={fine}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', post.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      open(post.id);
                    }}
                    style={{
                      top: (start / 60) * HOUR_H,
                      height: Math.max(28, (BLOCK_MIN / 60) * HOUR_H - 2),
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                    title={`${time} · ${post.title}`}
                  >
                    <StatusDot status={post.status} size={7} />
                    <span className="ms-block__time">{time}</span>
                    <span className="ms-block__title">{post.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
