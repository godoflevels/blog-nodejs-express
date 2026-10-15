import { useEffect, useMemo, useState } from 'react';
import { Button, Icon } from '../ui.jsx';
import { useStudio } from '../../state/StudioContext.jsx';
import { fromWebhookPayload, toWebhookPayload } from '../../core/discord.js';
import { downloadText, fileStem } from '../../core/filenames.js';

/** Discohook style JSON editor: the webhook payload of the message. */
export default function JsonEditor({ post }) {
  const { actions, toast } = useStudio();
  const generated = useMemo(() => `${JSON.stringify(toWebhookPayload(post), null, 2)}\n`, [post.content, post.discord]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState(generated);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  // Follow edits made elsewhere unless the user is typing JSON by hand.
  useEffect(() => {
    if (!dirty) setText(generated);
  }, [generated, dirty]);

  const apply = () => {
    try {
      const parsed = fromWebhookPayload(JSON.parse(text));
      actions.updatePost(post.id, {
        content: parsed.content,
        discord: parsed.discord.username || parsed.discord.avatarUrl || parsed.discord.embeds.length ? parsed.discord : null,
      });
      setDirty(false);
      setError('');
      toast(parsed.notes.length ? parsed.notes.join(' ') : 'JSON applied', parsed.notes.length ? 'info' : 'success');
    } catch (e) {
      setError(e.message || 'Invalid JSON');
    }
  };

  return (
    <div className="ms-json">
      <p className="ms-hint">
        <Icon name="info" size={14} /> This is the payload Discord webhooks (and Discohook) read. Edit it and press Apply, or paste a
        message from Discohook.
      </p>
      <textarea
        className="ms-source ms-source--json"
        value={text}
        spellCheck={false}
        aria-label="Message JSON"
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setError('');
        }}
      />
      {error ? <div className="ms-warn ms-warn--error"><Icon name="alert" size={16} /><div>{error}</div></div> : null}
      <div className="ms-export__buttons">
        <Button variant="primary" size="sm" disabled={!dirty} onClick={apply}>Apply JSON</Button>
        <Button variant="soft" size="sm" icon="copy" onClick={() => actions.copyPost(post, 'json')}>Copy JSON</Button>
        <Button
          variant="soft"
          size="sm"
          icon="download"
          onClick={() => downloadText(generated, `${fileStem(post.title, 'message')}-webhook.json`, 'application/json;charset=utf-8')}
        >
          Download
        </Button>
        {dirty ? <Button variant="ghost" size="sm" onClick={() => { setText(generated); setDirty(false); setError(''); }}>Reset</Button> : null}
      </div>
    </div>
  );
}
