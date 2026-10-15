import { useRendered } from './hooks.js';

/** Sanitized, rendered Markdown. The only place HTML is injected for previews. */
export default function Prose({ markdown, className = '', image, discord = null }) {
  const { html } = useRendered(markdown, discord);
  return (
    <article className={`ms-prose ${className}`}>
      {image && image.src ? (
        <figure className="ms-prose__hero">
          <img src={image.src} alt={image.alt || ''} />
        </figure>
      ) : null}
      {markdown.trim() || (discord && discord.embeds && discord.embeds.length) ? (
        // eslint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="ms-prose__empty">Nothing to preview yet. Start writing on the left.</p>
      )}
    </article>
  );
}
