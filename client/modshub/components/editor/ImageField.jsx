import { useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon } from '../ui.jsx';

export default function ImageField({ post }) {
  const { actions } = useStudio();
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
          <Button variant="soft" size="sm" icon="upload" disabled={busy} onClick={() => inputRef.current.click()}>
            {busy ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}
          </Button>
          {image ? (
            <Button variant="ghost" size="sm" icon="trash" onClick={() => actions.updatePost(post.id, { image: null })}>
              Remove
            </Button>
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
        <p className="ms-hint">PNG, JPEG, WebP or GIF up to 3 MB. Uploaded images are stored privately with your account.</p>
      </div>
    </div>
  );
}
