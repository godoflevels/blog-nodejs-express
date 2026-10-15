import { useCallback, useRef, useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Icon } from '../ui.jsx';
import MarkdownEditor from '../editor/MarkdownEditor.jsx';
import DiscordToolbar from './DiscordToolbar.jsx';
import EmbedEditor from './EmbedEditor.jsx';
import { DISCORD_LIMITS } from '../../core/discord.js';

/** Discohook style message builder: identity, text with Discord formatting, embeds. */
export default function MessageComposer({ post }) {
  const { actions } = useStudio();
  const editorRef = useRef(null);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const d = post.discord || { username: '', avatarUrl: '', embeds: [] };

  const saveDiscord = (next) => {
    const empty = !next.username && !next.avatarUrl && next.embeds.length === 0;
    actions.updatePost(post.id, { discord: empty ? null : next });
  };
  const onContent = useCallback((content) => actions.updatePost(post.id, { content }), [actions, post.id]);
  const onHistory = useCallback((h) => setHist((p) => (p.canUndo === h.canUndo && p.canRedo === h.canRedo ? p : h)), []);

  const length = post.content.length;
  const over = length > DISCORD_LIMITS.content;

  return (
    <section className="ms-composer" aria-label="Discord message">
      <details className="ms-details">
        <summary>
          Sender {d.username || d.avatarUrl ? <span className="ms-details__badge">custom</span> : <span className="ms-details__muted">webhook default</span>}
        </summary>
        <div className="ms-embedcard__grid">
          <label className="ms-field">
            <span>
              Username
              <em aria-hidden="true" className={`ms-count ${(d.username || '').length > DISCORD_LIMITS.username ? 'is-over' : ''}`}>
                {(d.username || '').length}/{DISCORD_LIMITS.username}
              </em>
            </span>
            <input
              type="text"
              value={d.username || ''}
              placeholder="ModsHub"
              onChange={(e) => saveDiscord({ ...d, username: e.target.value })}
            />
          </label>
          <label className="ms-field">
            <span>Avatar URL</span>
            <input
              type="url"
              value={d.avatarUrl || ''}
              placeholder="https://"
              onChange={(e) => saveDiscord({ ...d, avatarUrl: e.target.value })}
            />
          </label>
        </div>
      </details>

      <div className="ms-composer__text">
        <div className="ms-composer__bar">
          <h3>
            <Icon name="markdown" size={16} /> Message
          </h3>
          <span className={`ms-count ms-count--lg ${over ? 'is-over' : ''}`} data-testid="counter">
            {length.toLocaleString('en-US')} / {DISCORD_LIMITS.content.toLocaleString('en-US')}
          </span>
          <Button variant="primary" size="sm" icon="copy" data-testid="copy-text-inline" onClick={() => actions.copyPost(post)}>
            Copy text
          </Button>
        </div>
        <DiscordToolbar
          post={post}
          onCommand={(name, arg) => editorRef.current && editorRef.current.command(name, arg)}
          canUndo={hist.canUndo}
          canRedo={hist.canRedo}
        />
        <MarkdownEditor
          key={`md-${post.id}`}
          ref={editorRef}
          value={post.content}
          onChange={onContent}
          onHistory={onHistory}
          placeholder={'Type the message like in Discord…\n\n# Big heading\n**bold**  __underline__  *italic*  ~~strike~~  ||spoiler||\n> quote\n-# small text'}
        />
      </div>

      <EmbedEditor post={post} embeds={d.embeds} onChange={(embeds) => saveDiscord({ ...d, embeds })} />
    </section>
  );
}
