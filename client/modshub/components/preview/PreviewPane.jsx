import { useMemo } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { checkCompatibility } from '../../core/compat.js';
import { Icon } from '../ui.jsx';
import DiscordPreview from '../discord/DiscordPreview.jsx';
import { discordIssues } from '../../core/discord.js';
import SlideStrip from './SlideStrip.jsx';
import ImageSettings from './ImageSettings.jsx';
import ExportPanel from './ExportPanel.jsx';
import { useImageExport, useRendered } from './hooks.js';

const TABS = [
  ['preview', 'Discord'],
  ['raw', 'Raw text'],
  ['plain', 'Plain Text'],
  ['image', 'Export Preview'],
];

/** Discord's real limits plus syntax Discord does not render. */
export function DiscordIssues({ post }) {
  const issues = useMemo(() => discordIssues(post), [post.content, post.discord]); // eslint-disable-line react-hooks/exhaustive-deps
  const unsupported = useMemo(() => checkCompatibility(post.content, 'discord'), [post.content]);
  if (issues.length === 0 && unsupported.length === 0) return null;
  return (
    <div className="ms-warn" role="status">
      <Icon name="alert" size={16} />
      <div>
        <strong>Before you send this to Discord</strong>
        <ul>
          {issues.map((w, i) => (
            <li key={`i${i}`} className={w.level === 'error' ? 'is-error' : ''}>{w.message}</li>
          ))}
          {unsupported.map((w) => (
            <li key={w.feature}>{w.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PreviewPane({ post, showExport = true, forcedTab, tabs = ['preview', 'raw', 'plain', 'image'] }) {
  const { ui, setUi } = useStudio();
  const rendered = useRendered(post.content, post.discord);
  const imageExport = useImageExport(post, rendered.html);
  const tab = forcedTab || (tabs.includes(ui.previewTab) ? ui.previewTab : tabs[0]);

  const body = (() => {
    if (tab === 'raw') {
      return (
        <pre className="ms-raw" tabIndex={0} aria-label="Raw Markdown">
          {post.content || 'Nothing here yet.'}
        </pre>
      );
    }
    if (tab === 'plain') {
      return (
        <pre className="ms-raw ms-raw--plain" tabIndex={0} aria-label="Plain text">
          {rendered.plain || 'Nothing here yet.'}
        </pre>
      );
    }
    if (tab === 'image') {
      const { state, busy, download, options } = imageExport;
      return (
        <div className="ms-imgtab">
          <details className="ms-imgtab__settings" open>
            <summary>Image settings</summary>
            <ImageSettings options={options} hasImage={Boolean(post.image)} />
          </details>
          {state.warnings.map((w) => (
            <div className="ms-warn" key={w}>
              <Icon name="alert" size={16} />
              <div>{w}</div>
            </div>
          ))}
          <div className={`ms-imgtab__stage ${state.loading ? 'is-loading' : ''}`}>
            {state.slides.length ? (
              <SlideStrip slides={state.slides} width={state.width} onDownload={download} busy={busy} />
            ) : (
              <p className="ms-hint">{state.loading ? 'Preparing preview…' : 'Nothing to render yet.'}</p>
            )}
          </div>
        </div>
      );
    }
    return <DiscordPreview post={post} />;
  })();

  return (
    <div className="ms-preview">
      <div className="ms-tabs" role="tablist" aria-label="Preview mode" hidden={Boolean(forcedTab)}>
        {TABS.filter(([id]) => tabs.includes(id)).map(([id, label]) => (
          <button
            type="button"
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setUi({ previewTab: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ms-preview__scroll">
        {tab === 'preview' ? <DiscordIssues post={post} /> : null}
        <div className="ms-preview__content" role="tabpanel">{body}</div>
        {showExport ? (
          <ExportPanel post={post} rendered={rendered} imageExport={imageExport} onOpenImage={() => setUi({ previewTab: 'image' })} />
        ) : null}
      </div>
    </div>
  );
}
