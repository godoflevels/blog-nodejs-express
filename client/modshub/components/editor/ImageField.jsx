import { useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon, IconButton } from '../ui.jsx';
import { postImages, runImageDownload } from '../../core/download-image.js';

const MAX_IMAGES = 10;

/** Up to ten attached images: upload, add by URL, reorder, download one or all. */
export default function ImageField({ post }) {
  const { actions, toast } = useStudio();
  const inputRef = useRef(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const images = postImages(post);
  const room = MAX_IMAGES - images.length;

  const setImages = (next) => {
    actions.updatePost(post.id, { images: next, image: next[0] || null });
  };

  const upload = async (fileList) => {
    const files = [...fileList].slice(0, room);
    if (fileList.length > room) toast(`Only ${MAX_IMAGES} images fit on one post; extra files were skipped`, 'info');
    if (files.length === 0) return;
    setBusy(true);
    const added = [];
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      const src = await actions.uploadImage(file);
      if (src) added.push({ src, alt: '' });
    }
    setBusy(false);
    if (added.length) setImages([...images, ...added]);
  };

  const valid = /^https?:\/\/\S+$/i.test(url.trim());
  const addUrl = () => {
    if (!valid || room <= 0) return;
    setImages([...images, { src: url.trim(), alt: '' }]);
    setUrl('');
  };

  const move = (i, d) => {
    const next = [...images];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    setImages(next);
  };

  return (
    <div className="ms-attach">
      {images.length > 0 ? (
        <ul className="ms-attach__grid" aria-label="Attached images">
          {images.map((img, i) => (
            <li className="ms-attach__item" key={`${img.src}-${i}`}>
              <div className="ms-attach__thumb">
                <img src={img.src} alt={img.alt || `Attached image ${i + 1}`} />
                {i === 0 ? <span className="ms-attach__cover">Cover</span> : null}
              </div>
              <div className="ms-attach__tools">
                <IconButton icon="chevronLeft" label={`Move image ${i + 1} earlier`} size={16} disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="chevronRight" label={`Move image ${i + 1} later`} size={16} disabled={i === images.length - 1} onClick={() => move(i, 1)} />
                <IconButton
                  icon="download"
                  label={`Download image ${i + 1}`}
                  size={16}
                  data-testid={`download-image-${i + 1}`}
                  onClick={() => runImageDownload(post, toast, { index: i })}
                />
                <IconButton icon="trash" label={`Remove image ${i + 1}`} size={16} onClick={() => setImages(images.filter((_, j) => j !== i))} />
              </div>
              <input
                type="text"
                className="ms-attach__alt"
                maxLength={300}
                placeholder="Alt text"
                aria-label={`Alt text of image ${i + 1}`}
                value={img.alt || ''}
                onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="ms-attach__empty">
          <Icon name="image" size={26} />
          <span>No images yet</span>
        </div>
      )}

      <div className="ms-attach__bar">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : [];
            e.target.value = '';
            if (files.length) upload(files);
          }}
        />
        <Button
          variant={images.length ? 'soft' : 'primary'}
          size="sm"
          icon="upload"
          disabled={busy || room <= 0}
          data-testid="attach-image"
          onClick={() => inputRef.current.click()}
        >
          {busy ? 'Uploading…' : images.length ? 'Attach more' : 'Attach images'}
        </Button>
        {images.length > 0 ? (
          <Button variant="primary" size="sm" icon="download" data-testid="download-attachment" onClick={() => runImageDownload(post, toast)}>
            {images.length > 1 ? `Download all (${images.length}, .zip)` : 'Download image'}
          </Button>
        ) : null}
        <span className="ms-count ms-count--lg">{images.length}/{MAX_IMAGES}</span>
      </div>

      <label className="ms-field">
        <span>…or add an image by URL (https)</span>
        <span className="ms-inline">
          <input
            type="url"
            value={url}
            placeholder="https://"
            disabled={room <= 0}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
          />
          <Button variant="soft" size="sm" onClick={addUrl} disabled={!valid || room <= 0}>Add</Button>
        </span>
      </label>
      <p className="ms-hint">
        PNG, JPEG, WebP or GIF, up to 3 MB each. All images appear under the message in the preview; the first one is the
        cover of the picture export.
      </p>
    </div>
  );
}
