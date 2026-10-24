import { useMemo, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';
import { fromWall, wallParts, listZones, formatDayShort } from '../../core/time.js';
import { Icon, Select } from '../ui.jsx';
import { DateField, TimeField } from '../pickers.jsx';

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

  const statusOptions = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_META[s].color }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name, color: c.color }));
  if (!categories.some((c) => c.id === post.category)) {
    categoryOptions.unshift({ value: post.category, label: post.category || 'Uncategorised', color: '#6a6e73' });
  }
  const zoneOptions = zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));

  return (
    <div className="ms-meta">
      <div className="ms-meta__chips">
        <Select variant="chip" label="Status" value={post.status} options={statusOptions} onChange={(status) => actions.updatePost(post.id, { status })} />
        <DateField variant="chip" label="Scheduled date" value={wall.date} onChange={(date) => setWall(date, wall.time)} />
        <TimeField variant="chip" label="Scheduled time" value={wall.time} onChange={(time) => setWall(wall.date, time)} />
        <Select variant="chip" icon="globe" label="Timezone" searchable value={post.timezone} options={zoneOptions} onChange={(zone) => setWall(wall.date, wall.time, zone)} />
        <Select variant="chip" label="Category" value={post.category} options={categoryOptions} onChange={(category) => actions.updatePost(post.id, { category })} />
      </div>
      {differs ? (
        <p className="ms-hint ms-meta__note">
          <Icon name="clock" size={14} /> That is {formatDayShort(inDisplay.date)}, {inDisplay.time} in the calendar timezone ({displayZone}).
        </p>
      ) : null}
      <div className="ms-meta__tags">
        <Icon name="tag" size={16} />
        <TagsInput tags={post.tags} onChange={(tags) => actions.updatePost(post.id, { tags })} />
      </div>
    </div>
  );
}
