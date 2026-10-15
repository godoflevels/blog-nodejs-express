import { useMemo, useState } from 'react';
import schema from '../../../../server/modshub/schema.js';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon, IconButton, Modal } from '../ui.jsx';
import { listZones, browserZone } from '../../core/time.js';
import { buildExport, stringifyExport, JSON_TEMPLATE } from '../../core/json-io.js';
import { downloadText } from '../../core/filenames.js';

const TABS = [
  ['general', 'General'],
  ['categories', 'Categories'],
  ['templates', 'Templates'],
  ['data', 'Data'],
];

function Categories({ settings, actions }) {
  const cats = settings.categories;
  const save = (next) => actions.saveSettings({ categories: next });
  const patch = (i, p) => save(cats.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i, d) => {
    const next = [...cats];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    save(next);
  };
  const add = () => {
    let n = cats.length + 1;
    let name = `Category ${n}`;
    while (cats.some((c) => c.name === name)) {
      n += 1;
      name = `Category ${n}`;
    }
    let id = schema.slugify(name);
    while (cats.some((c) => c.id === id)) id = `${id}-x`;
    save([...cats, { id, name, color: '#0087da' }]);
  };
  return (
    <div className="ms-settings__section">
      <p className="ms-hint">Categories group posts in the calendar and in exports. Renaming keeps existing posts attached.</p>
      <ul className="ms-catlist">
        {cats.map((c, i) => (
          <li key={c.id}>
            <input type="color" value={c.color} aria-label={`Colour for ${c.name}`} onChange={(e) => patch(i, { color: e.target.value })} />
            <input
              type="text"
              value={c.name}
              maxLength={40}
              aria-label={`Name of category ${i + 1}`}
              onChange={(e) => patch(i, { name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && patch(i, { name: c.id })}
            />
            <IconButton icon="chevronDown" label="Move down" disabled={i === cats.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon="chevronLeft" label="Move up" disabled={i === 0} className="ms-rot90" onClick={() => move(i, -1)} />
            <IconButton icon="trash" label={`Delete ${c.name}`} disabled={cats.length <= 1} onClick={() => save(cats.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <div className="ms-settings__row">
        <Button variant="soft" size="sm" icon="plus" disabled={cats.length >= schema.LIMITS.categories} onClick={add}>Add category</Button>
        <Button variant="ghost" size="sm" onClick={() => save(schema.DEFAULT_CATEGORIES.map((c) => ({ ...c })))}>Reset to defaults</Button>
      </div>
    </div>
  );
}

export default function SettingsDialog({ onClose, initialTab = 'general' }) {
  const { settings, actions, posts, userId, toast } = useStudio();
  const [tab, setTab] = useState(initialTab);
  const zones = useMemo(() => listZones(), []);
  const set = (patch) => actions.saveSettings(patch);

  return (
    <Modal title="Studio settings" size="lg" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="ms-settings">
        <nav className="ms-settings__tabs" role="tablist" aria-label="Settings sections">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === 'general' ? (
          <div className="ms-settings__section ms-form">
            <label className="ms-field">
              <span>Calendar timezone</span>
              <select value={settings.defaultTimezone} onChange={(e) => set({ defaultTimezone: e.target.value })}>
                <option value="auto">This device ({browserZone()})</option>
                {zones.map((z) => (
                  <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <small>The calendar grid and new posts use this zone. Each post keeps its own timezone.</small>
            </label>
            <label className="ms-field">
              <span>Week starts on</span>
              <select value={settings.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) })}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </label>
            <label className="ms-field">
              <span>Default time for new posts</span>
              <input type="time" value={settings.defaultTime} onChange={(e) => e.target.value && set({ defaultTime: e.target.value })} />
            </label>
          </div>
        ) : null}

        {tab === 'categories' ? <Categories settings={settings} actions={actions} /> : null}

        {tab === 'templates' ? (
          <div className="ms-settings__section">
            <p className="ms-hint">Templates only create an editable draft — nothing is scheduled or published.</p>
            <h4>Built in</h4>
            <ul className="ms-tpllist">
              {[
                'New mod release',
                'Update announcement',
                'Feature announcement',
                'Community announcement',
                'Promotional post',
              ].map((n) => (
                <li key={n}><Icon name="file" size={16} /> {n}</li>
              ))}
            </ul>
            <h4>Yours</h4>
            {(settings.templates || []).length === 0 ? (
              <p className="ms-hint">None yet. Open a post and choose “Save as template…” from its ⋯ menu.</p>
            ) : (
              <ul className="ms-tpllist">
                {settings.templates.map((t) => (
                  <li key={t.id}>
                    <Icon name="file" size={16} /> {t.name}
                    <IconButton
                      icon="trash"
                      label={`Delete template ${t.name}`}
                      onClick={() => set({ templates: settings.templates.filter((x) => x.id !== t.id) })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === 'data' ? (
          <div className="ms-settings__section">
            <p>
              {posts.length} post{posts.length === 1 ? '' : 's'} are stored on the server for this account
              {userId ? '' : ''}. Unsaved edits are also kept in this browser until the server confirms them.
            </p>
            <div className="ms-settings__row">
              <Button
                variant="soft"
                icon="download"
                disabled={posts.length === 0}
                onClick={() => {
                  downloadText(stringifyExport(buildExport(posts)), `modshub-posts-${posts.length}.json`, 'application/json;charset=utf-8');
                  toast(`Exported ${posts.length} posts`);
                }}
              >
                Export all as JSON
              </Button>
              <Button
                variant="ghost"
                icon="file"
                onClick={() => downloadText(`${JSON.stringify(JSON_TEMPLATE, null, 2)}\n`, 'modshub-posts-template.json', 'application/json;charset=utf-8')}
              >
                Download JSON Template
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
