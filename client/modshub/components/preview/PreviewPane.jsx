import { useMemo } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { checkCompatibility, TARGET_PROFILES } from '../../core/compat.js';
import { Icon } from '../ui.jsx';
import Prose from './Prose.jsx';
import SlideStrip from './SlideStrip.jsx';
import ImageSettings from './ImageSettings.jsx';
import ExportPanel from './ExportPanel.jsx';
import { useImageExport, useRendered } from './hooks.js';

const TABS = [
  ['preview', 'Preview'],
  ['raw', 'Raw Markdown'],
  ['plain', 'Plain Text'],
  ['image', 'Export Preview'],
];

export function CompatWarnings({ markdown }) {
  const { settings } = useStudio();
  const warnings = useMemo(() => checkCompatibility(markdown, settings.targetProfile), [markdown, settings.targetProfile]);
  if (warnings.length === 0) return null;
  const profile = TARGET_PROFILES[settings.targetProfile] || TARGET_PROFILES.gfm;
  return (
    <div className="ms-warn" role="status">
      <Icon name="alert" size={16} />
      <div>
        <strong>{warnings.length === 1 ? '1 formatting warning' : `${warnings.length} formatting warnings`}</strong>
        <ul>
          {warnings.map((w) => (
            <li key={w.feature}>{w.message}</li>
          ))}
        </ul>
        <small>Target format: {profile.label}. Change it in Settings.</small>
      </div>
    </div>
  );
}

export default function PreviewPane({ post, showExport = true, forcedTab, tabs = ['preview', 'raw', 'plain', 'image'] }) {
  const { ui, setUi } = useStudio();
  const rendered = useRendered(post.content);
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
    return <Prose markdown={post.content} image={post.image} />;
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
        <CompatWarnings markdown={post.content} />
        <div className="ms-preview__content" role="tabpanel">{body}</div>
        {showExport ? (
          <ExportPanel post={post} rendered={rendered} imageExport={imageExport} onOpenImage={() => setUi({ previewTab: 'image' })} />
        ) : null}
      </div>
    </div>
  );
}
