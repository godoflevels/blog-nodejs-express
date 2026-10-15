import { useMemo } from 'react';
import { messageHtml } from '../../core/discord-render.js';

/** The message the way Discord draws it. Spoilers reveal on click. */
export default function DiscordPreview({ post }) {
  const html = useMemo(() => {
    try {
      return messageHtml(post);
    } catch (error) {
      console.error('[modshub] discord preview failed', error);
      return '<p>Preview failed to render this message.</p>';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.content, post.discord, post.scheduledAt, post.timezone]);

  const empty = !post.content && !(post.discord && post.discord.embeds && post.discord.embeds.length);
  return (
    <div
      className="dc-root"
      onClick={(e) => {
        const spoiler = e.target.closest && e.target.closest('.dc-spoiler');
        if (spoiler) spoiler.classList.toggle('is-revealed');
      }}
    >
      {empty ? (
        <p className="dc-empty">Your message preview appears here as you type.</p>
      ) : (
        // eslint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
