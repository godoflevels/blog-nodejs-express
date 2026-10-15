import { Button, Icon } from '../ui.jsx';
import { downloadPostImage } from '../../core/download-image.js';
import { useStudio } from '../../state/StudioContext.jsx';
import { useExportActions } from './useExportActions.jsx';

export default function ExportPanel({ post, rendered, imageExport, onOpenImage }) {
  const { copy, download, dialog } = useExportActions(post, rendered.plain, rendered.mdOptions);
  const { toast } = useStudio();
  const { busy, state } = imageExport;
  const slides = state.slides.length;

  return (
    <section className="ms-export" aria-label="Export">
      <h3 className="ms-export__title">Export</h3>

      <div className="ms-export__group">
        <h4>Copy</h4>
        <div className="ms-export__buttons">
          <Button variant="primary" size="sm" icon="copy" data-testid="copy-text" onClick={() => copy('markdown')}>Copy message text</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('webhook')}>Copy webhook JSON</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('plain')}>Copy Plain Text</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('rich')}>Copy Rich Text</Button>
          <Button variant="soft" size="sm" icon="copy" onClick={() => copy('json')}>Copy post JSON</Button>
        </div>
        <p className="ms-hint">
          <Icon name="info" size={14} />
          <span>
            “Copy message text” is exactly what you paste into Discord, with its own formatting
            (<code>**bold**</code>, <code>__underline__</code>, <code>||spoiler||</code>) intact. Embeds need the webhook JSON.
          </span>
        </p>
      </div>

      <div className="ms-export__group">
        <h4>Download</h4>
        <div className="ms-export__buttons">
          <Button variant="soft" size="sm" icon="download" onClick={() => download('md')}>Message text (.md)</Button>
          <Button variant="soft" size="sm" icon="download" onClick={() => download('txt')}>Plain Text (.txt)</Button>
          <Button variant="soft" size="sm" icon="download" onClick={() => download('webhook')}>Webhook JSON</Button>
          {post.image ? (
            <Button
              variant="primary"
              size="sm"
              icon="download"
              data-testid="download-attachment-export"
              onClick={async () => {
                const r = await downloadPostImage(post);
                if (r.ok) toast('Image downloaded');
                else if (r.opened) toast('Opened the image in a new tab — use “Save image as…” there', 'info');
              }}
            >
              Attached image
            </Button>
          ) : null}
          <Button variant="soft" size="sm" icon="download" onClick={() => download('json')}>Post JSON</Button>
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
