import { useMemo, useRef, useState } from 'react';
import schema from '../../../../server/modshub/schema.js';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon, Modal } from '../ui.jsx';
import Prose from '../preview/Prose.jsx';
import { parseImportFiles, IMPORT_LIMITS, extensionOf } from '../../core/import-files.js';
import { JSON_TEMPLATE, formatIssue } from '../../core/json-io.js';
import { newPostId } from '../../core/ids.js';
import { downloadText } from '../../core/filenames.js';
import { fromWall, wallParts, formatDayShort } from '../../core/time.js';
import { STATUS_META, STATUS_ORDER } from '../../constants.js';

const ACCEPT = '.json,.md,.markdown,.txt,.zip,application/json,text/plain,text/markdown,application/zip';
const MAX_BYTES = { json: IMPORT_LIMITS.jsonBytes, md: IMPORT_LIMITS.textBytes, markdown: IMPORT_LIMITS.textBytes, txt: IMPORT_LIMITS.textBytes, zip: IMPORT_LIMITS.zipBytes };

function TextItemFields({ item, onChange, categories, zone }) {
  const wall = wallParts(item.post.scheduledAt, item.post.timezone || zone);
  const setWhen = (date, time) => {
    const res = fromWall(date, time, item.post.timezone);
    if (res) onChange({ post: { ...item.post, scheduledAt: res.iso } });
  };
  return (
    <div className="ms-import__fields">
      <label className="ms-field">
        <span>Title</span>
        <input type="text" value={item.post.title} maxLength={200} onChange={(e) => onChange({ post: { ...item.post, title: e.target.value } })} />
      </label>
      <label className="ms-field">
        <span>Date</span>
        <input type="date" value={wall.date} onChange={(e) => e.target.value && setWhen(e.target.value, wall.time)} />
      </label>
      <label className="ms-field">
        <span>Time</span>
        <input type="time" value={wall.time} onChange={(e) => e.target.value && setWhen(wall.date, e.target.value)} />
      </label>
      <label className="ms-field">
        <span>Status</span>
        <select value={item.post.status} onChange={(e) => onChange({ post: { ...item.post, status: e.target.value } })}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
      </label>
      <label className="ms-field">
        <span>Category</span>
        <select value={item.post.category} onChange={(e) => onChange({ post: { ...item.post, category: e.target.value } })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default function ImportDialog({ onClose }) {
  const { posts, displayZone, settings, categories, actions, toast, confirm, ui } = useStudio();
  const [step, setStep] = useState('pick');
  const [items, setItems] = useState([]);
  const [problems, setProblems] = useState([]);
  const [fatal, setFatal] = useState([]);
  const [policy, setPolicy] = useState('skip');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const existingIds = useMemo(() => new Set(posts.map((p) => p.id)), [posts]);

  const buildItems = (result) => {
    const next = [];
    const defaultWhen = fromWall(ui.cursor, settings.defaultTime || '18:00', displayZone);
    result.texts.forEach((t, i) => {
      next.push({
        key: `t${i}`,
        kind: 'text',
        source: t.source,
        include: true,
        valid: true,
        warning: t.warning,
        errors: [],
        warnings: [],
        post: {
          id: newPostId(),
          title: t.title.slice(0, 200),
          content: t.content.slice(0, schema.LIMITS.content),
          scheduledAt: defaultWhen ? defaultWhen.iso : new Date().toISOString(),
          timezone: displayZone,
          status: 'draft',
          category: categories[0] ? categories[0].id : '',
          tags: [],
          image: null,
          notes: '',
          discord: t.discord || null,
        },
        truncated: t.content.length > schema.LIMITS.content,
      });
    });
    result.jsons.forEach((j, fi) => {
      if (!j.parsed.ok) {
        j.parsed.fatal.forEach((f) => next.push({ key: `jf${fi}-${f.line}`, kind: 'fatal', source: j.source, message: f.message, line: f.line }));
        return;
      }
      j.parsed.posts.forEach((p) => {
        next.push({
          key: `j${fi}-${p.index}`,
          kind: 'json',
          source: j.source,
          include: Boolean(p.value),
          valid: Boolean(p.value),
          exists: p.existsInStudio,
          errors: p.errors,
          warnings: p.warnings,
          line: p.line,
          index: p.index,
          post: p.value,
        });
      });
    });
    return next;
  };

  const analyse = (files) => {
    const result = parseImportFiles(files, { existingIds, defaultTimezone: displayZone });
    const all = buildItems(result);
    setProblems(result.problems);
    setFatal(all.filter((i) => i.kind === 'fatal'));
    setItems(all.filter((i) => i.kind !== 'fatal'));
    setStep('review');
  };

  const readFiles = async (fileList) => {
    const files = [...fileList];
    const read = [];
    const rejected = [];
    for (const f of files) {
      const ext = extensionOf(f.name);
      const max = MAX_BYTES[ext];
      if (!max) {
        read.push({ name: f.name, bytes: new Uint8Array(0), rejected: 'Unsupported file type. Use .json, .md, .txt or .zip.' });
      } else if (f.size > max) {
        rejected.push({ source: f.name, message: `File is larger than ${Math.round(max / 1024)} KB limit.` });
      } else {
        read.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      }
    }
    const usable = read.filter((r) => !r.rejected);
    const unsupported = read.filter((r) => r.rejected).map((r) => ({ source: r.name, message: r.rejected }));
    const result = parseImportFiles(usable, { existingIds, defaultTimezone: displayZone });
    const all = buildItems(result);
    setProblems([...rejected, ...unsupported, ...result.problems]);
    setFatal(all.filter((i) => i.kind === 'fatal'));
    setItems(all.filter((i) => i.kind !== 'fatal'));
    setStep('review');
  };

  const update = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const chosen = items.filter((i) => i.include && i.post);
  const conflicts = chosen.filter((i) => existingIds.has(i.post.id));

  const run = async () => {
    let toSend = chosen.map((i) => ({ ...i.post }));
    let onConflict = 'skip';
    if (policy === 'copy') {
      const taken = new Set([...existingIds, ...toSend.map((p) => p.id)]);
      toSend = toSend.map((p) => {
        if (!existingIds.has(p.id)) return p;
        let n = 1;
        let id = `${p.id.slice(0, 52)}-copy`;
        while (taken.has(id)) {
          n += 1;
          id = `${p.id.slice(0, 50)}-copy-${n}`;
        }
        taken.add(id);
        return { ...p, id };
      });
    } else if (policy === 'overwrite' && conflicts.length) {
      const ok = await confirm({
        title: `Overwrite ${conflicts.length} existing post${conflicts.length > 1 ? 's' : ''}?`,
        message: 'Their current text and settings will be replaced by the imported versions. This cannot be undone.',
        confirmLabel: 'Overwrite',
        danger: true,
      });
      if (!ok) return;
      onConflict = 'overwrite';
    } else {
      toSend = toSend.filter((p) => !existingIds.has(p.id));
    }
    if (toSend.length === 0) {
      toast('Nothing new to import', 'info');
      return;
    }
    setBusy(true);
    try {
      const result = await actions.importPosts(toSend, onConflict);
      setSummary(result);
      setStep('done');
      const first = toSend[0];
      if (first) actions.openMonth(wallParts(first.scheduledAt, displayZone).date);
    } catch (error) {
      toast(error.message || 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 'review' ? (
      <>
        <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
        <Button variant="primary" disabled={busy || chosen.length === 0} onClick={run}>
          {busy ? 'Importing…' : `Import ${chosen.length} post${chosen.length === 1 ? '' : 's'}`}
        </Button>
      </>
    ) : step === 'done' ? (
      <Button variant="primary" onClick={onClose}>Done</Button>
    ) : (
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
    );

  return (
    <Modal title="Import posts" size="lg" onClose={onClose} footer={footer}>
      {step === 'pick' ? (
        <div className="ms-import">
          <div
            className={`ms-drop ${dragging ? 'is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
            }}
          >
            <Icon name="upload" size={28} />
            <p><strong>Drop files here</strong> or choose them</p>
            <p className="ms-hint">.json export, .md or .txt posts, or a .zip with several files</p>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              data-testid="import-file"
              onChange={(e) => {
                if (e.target.files.length) readFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button variant="primary" icon="file" onClick={() => fileInput.current.click()} data-autofocus>Choose files</Button>
          </div>

          <details className="ms-details">
            <summary>Paste JSON instead</summary>
            <textarea
              className="ms-manual"
              rows={8}
              value={pasted}
              placeholder='{ "version": 1, "posts": [ … ] }'
              onChange={(e) => setPasted(e.target.value)}
              aria-label="JSON to import"
            />
            <Button
              variant="soft"
              size="sm"
              disabled={!pasted.trim()}
              onClick={() => analyse([{ name: 'pasted.json', bytes: new TextEncoder().encode(pasted) }])}
            >
              Check JSON
            </Button>
          </details>

          <div className="ms-import__template">
            <div>
              <strong>Not sure about the format?</strong>
              <p className="ms-hint">The template shows every field. Dates need an offset, e.g. 2026-10-20T18:00:00+03:00.</p>
            </div>
            <Button
              variant="soft"
              size="sm"
              icon="download"
              onClick={() => downloadText(`${JSON.stringify(JSON_TEMPLATE, null, 2)}\n`, 'modshub-posts-template.json', 'application/json;charset=utf-8')}
            >
              Download JSON Template
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="ms-import">
          {problems.map((p) => (
            <div className="ms-warn ms-warn--error" key={`${p.source}${p.message}`}>
              <Icon name="alert" size={16} />
              <div><strong>{p.source || 'Import'}</strong> — {p.message}</div>
            </div>
          ))}
          {fatal.map((f) => (
            <div className="ms-warn ms-warn--error" key={f.key}>
              <Icon name="alert" size={16} />
              <div>
                <strong>{f.source}</strong> — {f.message}
                {f.line ? <span> (line {f.line})</span> : null}
              </div>
            </div>
          ))}

          {items.length === 0 && problems.length + fatal.length === 0 ? <p className="ms-hint">No posts found in the selected files.</p> : null}

          {items.length > 0 ? (
            <>
              <p className="ms-import__summary">
                {items.filter((i) => i.valid).length} of {items.length} post{items.length === 1 ? '' : 's'} can be imported
                {items.some((i) => !i.valid) ? ` · ${items.filter((i) => !i.valid).length} with errors` : ''}.
                Choose what to import:
              </p>
              <ul className="ms-import__list">
                {items.map((item) => (
                  <li key={item.key} className={`ms-import__item ${item.valid ? '' : 'is-invalid'}`}>
                    <label className="ms-check">
                      <input
                        type="checkbox"
                        checked={item.include}
                        disabled={!item.valid}
                        onChange={(e) => update(item.key, { include: e.target.checked })}
                        aria-label={`Import ${item.post ? item.post.title : 'post'}`}
                      />
                      <span>
                        <strong>{item.post ? item.post.title : `Post ${typeof item.index === 'number' ? item.index + 1 : ''}`}</strong>
                        <small>
                          {item.source}
                          {item.line ? ` · line ${item.line}` : ''}
                        </small>
                      </span>
                    </label>
                    <div className="ms-import__badges">
                      {item.kind === 'text' ? <span className="ms-badge">New draft</span> : null}
                      {item.valid && item.kind === 'json' && !item.exists ? <span className="ms-badge ms-badge--new">New</span> : null}
                      {item.exists ? <span className="ms-badge ms-badge--warn">ID already exists</span> : null}
                      {!item.valid ? <span className="ms-badge ms-badge--error">Invalid</span> : null}
                      {item.post ? (
                        <span className="ms-badge">{formatDayShort(wallParts(item.post.scheduledAt, item.post.timezone).date)} · {wallParts(item.post.scheduledAt, item.post.timezone).time}</span>
                      ) : null}
                    </div>
                    {item.kind === 'text' ? (
                      <>
                        <TextItemFields item={item} onChange={(patch) => update(item.key, patch)} categories={categories} zone={displayZone} />
                        {item.warning ? <p className="ms-hint">{item.warning}</p> : null}
                        {item.truncated ? <p className="ms-hint">Text was longer than {schema.LIMITS.content.toLocaleString('en-US')} characters and was shortened.</p> : null}
                      </>
                    ) : null}
                    {item.errors.length > 0 ? (
                      <ul className="ms-import__errors">
                        {item.errors.map((e, i) => (
                          <li key={i}>{formatIssue(e)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.warnings.length > 0 ? (
                      <ul className="ms-import__warnings">
                        {item.warnings.map((e, i) => (
                          <li key={i}>{formatIssue(e)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {item.post ? (
                      <details className="ms-import__preview">
                        <summary>Preview</summary>
                        <Prose markdown={item.post.content} image={item.post.image && !item.post.image.src.startsWith('data:') ? item.post.image : null} />
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>

              {conflicts.length > 0 ? (
                <fieldset className="ms-import__policy">
                  <legend>{conflicts.length} selected post{conflicts.length > 1 ? 's use' : ' uses'} an ID that already exists</legend>
                  {[
                    ['skip', 'Skip them (keep the existing posts)'],
                    ['copy', 'Import them as new copies'],
                    ['overwrite', 'Overwrite the existing posts (asks for confirmation)'],
                  ].map(([value, label]) => (
                    <label className="ms-check" key={value}>
                      <input type="radio" name="policy" value={value} checked={policy === value} onChange={() => setPolicy(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {step === 'done' && summary ? (
        <div className="ms-import ms-import--done">
          <Icon name="check" size={36} />
          <h3>Import finished</h3>
          <ul>
            {summary.created ? <li>{summary.created} new post{summary.created > 1 ? 's' : ''} created</li> : null}
            {summary.updated ? <li>{summary.updated} existing post{summary.updated > 1 ? 's' : ''} overwritten</li> : null}
            {summary.skipped ? <li>{summary.skipped} skipped</li> : null}
            {summary.invalid ? <li>{summary.invalid} rejected by the server</li> : null}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
