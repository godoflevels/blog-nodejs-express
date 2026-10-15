import { useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon } from '../ui.jsx';
import { downloadPostImage } from '../../core/download-image.js';

export default function ImageField({ post }) {
  const { actions, toast } = useStudio();
  const inputRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const image = post.image;

  const upload = async (file) => {
    setBusy(true);
    const src = await actions.uploadImage(file);
    setBusy(false);
    if (src) actions.updatePost(post.id, { image: { src, alt: (image && image.alt) || '' } });
  };

  const applyUrl = () => {
    const value = url.trim();
    if (!/^https?:\/\/\S+$/i.test(value)) return;
    actions.updatePost(post.id, { image: { src: value, alt: (image && image.alt) || '' } });
    setUrl('');
  };

  const download = async () => {
    const r = await downloadPostImage(post);
    if (r.ok) toast('Image downloaded');
    else if (r.opened) toast('Opened the image in a new tab — use “Save image as…” there', 'info');
  };

  return (
    <div className="ms-image">
      <div className="ms-image__preview" aria-live="polite">
        {image ? (
          <img src={image.src} alt={image.alt || 'Post artwork'} />
        ) : (
          <div className="ms-image__empty">
            <Icon name="image" size={26} />
            <span>No artwork</span>
          </div>
        )}
      </div>
      <div className="ms-image__controls">
        <div className="ms-image__row">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (file) upload(file);
            }}
          />
          <Button variant={image ? 'soft' : 'primary'} size="sm" icon="upload" disabled={busy} onClick={() => inputRef.current.click()} data-testid="attach-image">
            {busy ? 'Uploading…' : image ? 'Replace image' : 'Attach image'}
          </Button>
          {image ? (
            <>
              <Button variant="primary" size="sm" icon="download" onClick={download} data-testid="download-attachment">
                Download image
              </Button>
              <Button variant="ghost" size="sm" icon="trash" onClick={() => actions.updatePost(post.id, { image: null })}>
                Remove
              </Button>
            </>
          ) : null}
        </div>
        <label className="ms-field">
          <span>…or image URL (https)</span>
          <span className="ms-inline">
            <input
              type="url"
              value={url}
              placeholder="https://"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyUrl())}
            />
            <Button variant="soft" size="sm" onClick={applyUrl} disabled={!/^https?:\/\/\S+$/i.test(url.trim())}>Use</Button>
          </span>
        </label>
        {image ? (
          <label className="ms-field">
            <span>Alt text</span>
            <input
              type="text"
              maxLength={300}
              value={image.alt || ''}
              onChange={(e) => actions.updatePost(post.id, { image: { ...image, alt: e.target.value } })}
            />
          </label>
        ) : null}
        <p className="ms-hint">PNG, JPEG, WebP or GIF up to 3 MB. Shown under the message in the preview and used as the cover of the picture export.</p>
      </div>
    </div>
  );
}
