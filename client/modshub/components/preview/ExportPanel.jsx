import { Button, Icon } from '../ui.jsx';
import { useExportActions } from './useExportActions.jsx';

export default function ExportPanel({ post, rendered, imageExport, onOpenImage }) {
  const { copy, download, dialog } = useExportActions(post, rendered.plain, rendered.mdOptions);
  const { busy, state } = imageExport;
  const slides = state.slides.length;

  return (
    <section className="ms-export" aria-label="Export">
      <h3 className="ms-export__title">Export</h3>

      <div className="ms-export__group">
        <h4>Copy</h4>
        <div className="ms-export__buttons">
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('markdown')}>Copy Markdown</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('plain')}>Copy Plain Text</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('rich')}>Copy Rich Text</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('json')}>Copy JSON</Button>
        </div>
        <p className="ms-hint">
          <Icon name="info" size={14} /> Rich Text keeps headings, bold, italic, links, lists and quotes in apps that accept
          formatted text (Docs, Word, Gmail, Notion…). Plain-text fields ignore formatting — use Copy Markdown there.
        </p>
      </div>

      <div className="ms-export__group">
        <h4>Download</h4>
        <div className="ms-export__buttons">
          <Button variant="soft" size="sm" icon="download" onClick={() => download('md')}>Markdown (.md)</Button>
          <Button variant="soft" size="sm" icon="download" onClick={() => download('txt')}>Plain Text (.txt)</Button>
          <Button variant="soft" size="sm" icon="download" onClick={() => download('json')}>JSON (.json)</Button>
          <Button
            variant="primary"
            size="sm"
            icon="image"
            data-testid="download-image"
            disabled={busy || state.loading || slides === 0}
            onClick={() => imageExport.download()}
          >
            {busy ? 'Rendering…' : slides > 1 ? `Download Image (${slides} slides, .zip)` : 'Download Image (.png)'}
          </Button>
        </div>
        <button type="button" className="ms-linkbtn" onClick={onOpenImage}>Image size, background and logo…</button>
      </div>
      {dialog}
    </section>
  );
}
