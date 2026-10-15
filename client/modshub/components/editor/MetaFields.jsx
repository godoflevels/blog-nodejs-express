import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';
import { fromWall, wallParts, listZones, formatDayShort } from '../../core/time.js';
import { Icon } from '../ui.jsx';

function TagsInput({ tags, onChange }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const parts = raw.split(/[,\n]/).map((t) => t.trim().replace(/^#+/, '').trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    for (const t of parts) {
      if (next.length >= 30) break;
      if (!next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t.slice(0, 40));
    }
    onChange(next);
    setDraft('');
  };
  return (
    <div className="ms-tags">
      {tags.map((t) => (
        <span className="ms-tag" key={t}>
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={tags.length ? 'Add tag' : 'graphics, release…'}
        aria-label="Add tag"
        onChange={(e) => {
          if (/[,\n]/.test(e.target.value)) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => add(draft)}
      />
    </div>
  );
}

export default function MetaFields({ post }) {
  const { actions, categories, displayZone, toast } = useStudio();
  const zones = useMemo(() => {
    const all = listZones();
    return all.includes(post.timezone) ? all : [post.timezone, ...all];
  }, [post.timezone]);
  const wall = wallParts(post.scheduledAt, post.timezone);
  const inDisplay = wallParts(post.scheduledAt, displayZone);
  const differs = post.timezone !== displayZone && (inDisplay.date !== wall.date || inDisplay.time !== wall.time);

  const setWall = (date, time, zone = post.timezone) => {
    if (!date || !time) return;
    const res = fromWall(date, time, zone);
    if (!res) return;
    if (res.adjusted) toast('That time does not exist because of a clock change; it was moved forward', 'info');
    actions.updatePost(post.id, { scheduledAt: res.iso, timezone: zone });
  };

  const hasCategory = categories.some((c) => c.id === post.category);

  return (
    <div className="ms-meta">
      <label className="ms-field ms-meta__title">
        <span>Internal title</span>
        <input
          type="text"
          value={post.title}
          maxLength={200}
          onChange={(e) => actions.updatePost(post.id, { title: e.target.value })}
          onBlur={(e) => {
            if (!e.target.value.trim()) actions.updatePost(post.id, { title: 'Untitled post' });
          }}
        />
      </label>

      <label className="ms-field">
        <span>Scheduled date</span>
        <input type="date" value={wall.date} onChange={(e) => setWall(e.target.value, wall.time)} />
      </label>
      <label className="ms-field">
        <span>Scheduled time</span>
        <input type="time" value={wall.time} step={60} onChange={(e) => setWall(wall.date, e.target.value)} />
      </label>
      <label className="ms-field ms-meta__zone">
        <span>Timezone</span>
        <select value={post.timezone} onChange={(e) => setWall(wall.date, wall.time, e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </label>
      {differs ? (
        <p className="ms-hint ms-meta__note">
          <Icon name="clock" size={14} /> That is {formatDayShort(inDisplay.date)}, {inDisplay.time} in the calendar timezone ({displayZone}).
        </p>
      ) : null}

      <label className="ms-field">
        <span>Status</span>
        <select value={post.status} onChange={(e) => actions.updatePost(post.id, { status: e.target.value })}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </label>
      <label className="ms-field">
        <span>Category</span>
        <select value={post.category} onChange={(e) => actions.updatePost(post.id, { category: e.target.value })}>
          {!hasCategory ? <option value={post.category}>{post.category || 'Uncategorised'}</option> : null}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <div className="ms-field ms-meta__tags">
        <span>Tags</span>
        <TagsInput tags={post.tags} onChange={(tags) => actions.updatePost(post.id, { tags })} />
      </div>
    </div>
  );
}
