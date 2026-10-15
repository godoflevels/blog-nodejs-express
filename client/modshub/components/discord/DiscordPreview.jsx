import { useMemo } from 'react';
import { messageHtml } from '../../core/discord-render.js';
import { downloadPostImage } from '../../core/download-image.js';
import { useStudio } from '../../state/StudioContext.jsx';

/** The message the way Discord draws it. Spoilers reveal on click. */
export default function DiscordPreview({ post }) {
  const { toast } = useStudio();
  const html = useMemo(() => {
    try {
      return messageHtml(post);
    } catch (error) {
      console.error('[modshub] discord preview failed', error);
      return '<p>Preview failed to render this message.</p>';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.content, post.discord, post.image, post.scheduledAt, post.timezone]);

  const empty = !post.content && !post.image && !(post.discord && post.discord.embeds && post.discord.embeds.length);
  return (
    <div
      className="dc-root"
      onClick={(e) => {
        const target = e.target.closest ? e.target : e.target.parentElement;
        const spoiler = target.closest('.dc-spoiler');
        if (spoiler) spoiler.classList.toggle('is-revealed');
        if (target.closest('[data-dl]')) {
          downloadPostImage(post).then((r) => {
            if (r.ok) toast('Image downloaded');
            else if (r.opened) toast('Opened the image in a new tab — use “Save image as…” there', 'info');
          });
        }
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
