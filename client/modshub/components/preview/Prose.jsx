import { useRendered } from './hooks.js';

/** Sanitized, rendered Markdown. The only place HTML is injected for previews. */
export default function Prose({ markdown, className = '', image }) {
  const { html } = useRendered(markdown);
  return (
    <article className={`ms-prose ${className}`}>
      {image && image.src ? (
        <figure className="ms-prose__hero">
          <img src={image.src} alt={image.alt || ''} />
        </figure>
      ) : null}
      {markdown.trim() ? (
        // eslint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="ms-prose__empty">Nothing to preview yet. Start writing on the left.</p>
      )}
    </article>
  );
}
