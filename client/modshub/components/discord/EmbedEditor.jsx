import { useRef, useState } from 'react';
import { Button, Icon, IconButton } from '../ui.jsx';
import MarkdownEditor from '../editor/MarkdownEditor.jsx';
import DiscordToolbar from './DiscordToolbar.jsx';
import { DISCORD_LIMITS, emptyEmbed } from '../../core/discord.js';

function Counted({ label, value, max, onChange, placeholder, type = 'text' }) {
  const over = value.length > max;
  return (
    <label className="ms-field">
      <span>
        {label}
        <em aria-hidden="true" className={`ms-count ${over ? 'is-over' : ''}`}>{value.length}/{max}</em>
      </span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function UrlInput({ label, value, onChange, placeholder = 'https://' }) {
  const bad = value && !/^https?:\/\/\S+$/i.test(value);
  return (
    <label className="ms-field">
      <span>
        {label}
        {bad ? <em className="ms-count is-over" role="status">needs https://</em> : null}
      </span>
      <input type="url" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A markdown text area with the Discord toolbar, used for embed text. */
function RichField({ post, label, value, max, onChange, rows = 4 }) {
  const ref = useRef(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  return (
    <div className="ms-field">
      <span>
        {label}
        <em aria-hidden="true" className={`ms-count ${value.length > max ? 'is-over' : ''}`}>{value.length}/{max}</em>
      </span>
      <DiscordToolbar post={post} onCommand={(n, a) => ref.current && ref.current.command(n, a)} canUndo={hist.canUndo} canRedo={hist.canRedo} />
      <MarkdownEditor ref={ref} value={value} onChange={onChange} onHistory={setHist} className="ms-source--small" label={label} rows={rows} />
    </div>
  );
}

function FieldsEditor({ post, fields, onChange }) {
  const set = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="ms-fields">
      <div className="ms-fields__head">
        <strong>Fields</strong>
        <Button
          variant="soft"
          size="sm"
          icon="plus"
          disabled={fields.length >= DISCORD_LIMITS.fields}
          onClick={() => onChange([...fields, { name: '', value: '', inline: false }])}
        >
          Add field
        </Button>
      </div>
      {fields.map((f, i) => (
        <div className="ms-fieldrow" key={i}>
          <div className="ms-fieldrow__top">
            <Counted label={`Field ${i + 1} name`} value={f.name} max={DISCORD_LIMITS.fieldName} onChange={(v) => set(i, { name: v })} />
            <label className="ms-check ms-fieldrow__inline">
              <input type="checkbox" checked={f.inline} onChange={(e) => set(i, { inline: e.target.checked })} />
              <span>Inline</span>
            </label>
            <IconButton icon="trash" label={`Remove field ${i + 1}`} onClick={() => onChange(fields.filter((_, j) => j !== i))} />
          </div>
          <label className="ms-field">
            <span>
              Value
              <em aria-hidden="true" className={`ms-count ${f.value.length > DISCORD_LIMITS.fieldValue ? 'is-over' : ''}`}>{f.value.length}/{DISCORD_LIMITS.fieldValue}</em>
            </span>
            <textarea rows={2} value={f.value} onChange={(e) => set(i, { value: e.target.value })} />
          </label>
        </div>
      ))}
      {fields.length === 0 ? <p className="ms-hint">Fields show small titled blocks, up to three inline per row.</p> : null}
      <span hidden>{post.id}</span>
    </div>
  );
}

function EmbedCard({ post, embed, index, total, onChange, onMove, onRemove, onDuplicate }) {
  const set = (patch) => onChange({ ...embed, ...patch });
  const label = embed.title || embed.authorName || (embed.description ? embed.description.slice(0, 40) : 'Empty embed');
  return (
    <details className="ms-embedcard" open={index === 0}>
      <summary>
        <i className="ms-embedcard__swatch" style={{ background: embed.color || '#202225' }} aria-hidden="true" />
        <span className="ms-embedcard__label">Embed {index + 1}: {label}</span>
        <span className="ms-embedcard__actions" onClick={(e) => e.preventDefault()}>
          <IconButton icon="chevronDown" label="Move down" size={16} disabled={index === total - 1} onClick={() => onMove(1)} />
          <IconButton icon="chevronDown" label="Move up" size={16} disabled={index === 0} className="ms-flip" onClick={() => onMove(-1)} />
          <IconButton icon="copy" label="Duplicate embed" size={16} disabled={total >= DISCORD_LIMITS.embeds} onClick={onDuplicate} />
          <IconButton icon="trash" label="Remove embed" size={16} onClick={onRemove} />
        </span>
      </summary>
      <div className="ms-embedcard__body">
        <div className="ms-embedcard__row">
          <label className="ms-field">
            <span>Colour</span>
            <span className="ms-inline">
              <input type="color" value={embed.color || '#5865f2'} onChange={(e) => set({ color: e.target.value })} aria-label="Embed colour" />
              <Button variant="ghost" size="sm" onClick={() => set({ color: null })}>None</Button>
            </span>
          </label>
        </div>
        <div className="ms-embedcard__grid">
          <Counted label="Author name" value={embed.authorName} max={DISCORD_LIMITS.author} onChange={(v) => set({ authorName: v })} />
          <UrlInput label="Author link" value={embed.authorUrl} onChange={(v) => set({ authorUrl: v })} />
          <UrlInput label="Author icon URL" value={embed.authorIconUrl} onChange={(v) => set({ authorIconUrl: v })} />
        </div>
        <div className="ms-embedcard__grid">
          <Counted label="Title" value={embed.title} max={DISCORD_LIMITS.embedTitle} onChange={(v) => set({ title: v })} />
          <UrlInput label="Title link" value={embed.url} onChange={(v) => set({ url: v })} />
        </div>
        <RichField post={post} label="Description" value={embed.description} max={DISCORD_LIMITS.embedDescription} onChange={(v) => set({ description: v })} />
        <FieldsEditor post={post} fields={embed.fields} onChange={(fields) => set({ fields })} />
        <div className="ms-embedcard__grid">
          <UrlInput label="Thumbnail URL (small, top right)" value={embed.thumbnailUrl} onChange={(v) => set({ thumbnailUrl: v })} />
          <UrlInput label="Image URL (large)" value={embed.imageUrl} onChange={(v) => set({ imageUrl: v })} />
        </div>
        <div className="ms-embedcard__grid">
          <Counted label="Footer text" value={embed.footerText} max={DISCORD_LIMITS.footer} onChange={(v) => set({ footerText: v })} />
          <UrlInput label="Footer icon URL" value={embed.footerIconUrl} onChange={(v) => set({ footerIconUrl: v })} />
          <div className="ms-field">
            <span>Timestamp</span>
            <span className="ms-inline">
              <input
                type="datetime-local"
                value={embed.timestamp ? toLocalInput(embed.timestamp) : ''}
                onChange={(e) => set({ timestamp: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                aria-label="Embed timestamp"
              />
              <Button variant="ghost" size="sm" onClick={() => set({ timestamp: new Date().toISOString() })}>Now</Button>
              {embed.timestamp ? <Button variant="ghost" size="sm" onClick={() => set({ timestamp: '' })}>Clear</Button> : null}
            </span>
          </div>
        </div>
      </div>
    </details>
  );
}

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EmbedEditor({ post, embeds, onChange }) {
  const update = (i, next) => onChange(embeds.map((e, j) => (j === i ? next : e)));
  const move = (i, d) => {
    const list = [...embeds];
    const [item] = list.splice(i, 1);
    list.splice(i + d, 0, item);
    onChange(list);
  };
  return (
    <section className="ms-embeds" aria-label="Embeds">
      <div className="ms-embeds__head">
        <h3>
          <Icon name="columns" size={16} /> Embeds <small>{embeds.length}/{DISCORD_LIMITS.embeds}</small>
        </h3>
        <Button
          variant="soft"
          size="sm"
          icon="plus"
          disabled={embeds.length >= DISCORD_LIMITS.embeds}
          onClick={() => onChange([...embeds, emptyEmbed()])}
          data-testid="add-embed"
        >
          Add embed
        </Button>
      </div>
      {embeds.length === 0 ? (
        <p className="ms-hint">Embeds are the framed cards with a coloured bar. They are sent with webhooks (and bots), not typed by hand.</p>
      ) : null}
      {embeds.map((embed, i) => (
        <EmbedCard
          key={i}
          post={post}
          embed={embed}
          index={i}
          total={embeds.length}
          onChange={(next) => update(i, next)}
          onMove={(d) => move(i, d)}
          onRemove={() => onChange(embeds.filter((_, j) => j !== i))}
          onDuplicate={() => onChange([...embeds.slice(0, i + 1), JSON.parse(JSON.stringify(embed)), ...embeds.slice(i + 1)])}
        />
      ))}
    </section>
  );
}
