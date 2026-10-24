import { useMemo } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';
import { Icon } from '../ui.jsx';
import MiniMonth, { buildMarks } from './MiniMonth.jsx';
import { useDayGroups, useSlotGroups } from './shared.jsx';
import { formatDayShort, startOfMonth, todayKey } from '../../core/time.js';

/** Desktop sidebar of the calendar: mini month, status and category filters, free places. */
export default function SidePanel() {
  const { ui, setUi, posts, categories, settings, displayZone, slotsView } = useStudio();
  const groups = useDayGroups(posts);
  const slotGroups = useSlotGroups();
  const marks = useMemo(() => buildMarks(groups, slotGroups), [groups, slotGroups]);
  const today = todayKey(displayZone);
  const f = ui.filters;
  const setFilter = (patch) => setUi((p) => ({ filters: { ...p.filters, ...patch } }));

  const byStatus = useMemo(() => {
    const map = new Map();
    for (const p of posts) map.set(p.status, (map.get(p.status) || 0) + 1);
    return map;
  }, [posts]);
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const p of posts) map.set(p.category, (map.get(p.category) || 0) + 1);
    return map;
  }, [posts]);
  const upcomingFree = useMemo(() => slotsView.filter((s) => s.date >= today).slice(0, 5), [slotsView, today]);

  return (
    <aside className="ms-side" aria-label="Calendar sidebar">
      <MiniMonth
        month={startOfMonth(ui.cursor)}
        onMonth={(m) => setUi({ cursor: m })}
        selected={ui.cursor}
        today={today}
        marks={marks}
        weekStart={settings.weekStart}
        onPick={(date) => setUi({ cursor: date })}
      />

      <section className="ms-side__sec" aria-label="Status">
        <h3>Status</h3>
        <ul className="ms-side__list">
          <li>
            <button type="button" className={f.status === 'all' ? 'is-on' : ''} aria-pressed={f.status === 'all'} onClick={() => setFilter({ status: 'all' })}>
              <i className="ms-side__swatch is-all" aria-hidden="true" />
              <span>All posts</span>
              <em>{posts.length}</em>
            </button>
          </li>
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <button type="button" className={f.status === s ? 'is-on' : ''} aria-pressed={f.status === s} onClick={() => setFilter({ status: f.status === s ? 'all' : s })}>
                <i className="ms-side__swatch" style={{ background: STATUS_META[s].color }} aria-hidden="true" />
                <span>{STATUS_META[s].label}</span>
                <em>{byStatus.get(s) || 0}</em>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ms-side__sec" aria-label="Categories">
        <h3>Categories</h3>
        <ul className="ms-side__list">
          {categories.map((c) => (
            <li key={c.id}>
              <button type="button" className={f.category === c.id ? 'is-on' : ''} aria-pressed={f.category === c.id} onClick={() => setFilter({ category: f.category === c.id ? 'all' : c.id })}>
                <i className="ms-side__swatch is-square" style={{ background: c.color }} aria-hidden="true" />
                <span>{c.name}</span>
                <em>{byCategory.get(c.id) || 0}</em>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ms-side__sec" aria-label="Free places">
        <h3>Free places</h3>
        {upcomingFree.length === 0 ? (
          <p className="ms-side__empty">No free places marked. Use “Mark free places” to tell your teammate where there is room.</p>
        ) : (
          <ul className="ms-side__list">
            {upcomingFree.map(({ slot, date, time }) => (
              <li key={slot.id}>
                <button type="button" onClick={() => setUi({ cursor: date, freeSlot: slot.id })} title={slot.note || 'Free place'}>
                  <Icon name="star" size={14} className="ms-side__star" />
                  <span>{formatDayShort(date)}{time ? ` · ${time}` : ''}</span>
                  {slot.createdBy ? <em>{slot.createdBy}</em> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
