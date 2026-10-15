import { useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Modal } from '../ui.jsx';
import { buildRichHtml, writeToClipboard } from '../../core/clipboard.js';
import { buildExport, stringifyExport } from '../../core/json-io.js';
import { messageText, toWebhookPayload } from '../../core/discord.js';
import { downloadText, fileStem } from '../../core/filenames.js';
import { isMac } from '../editor/FormatToolbar.jsx';

/** Copy / download actions shared by the Export block and the mobile quick bar. */
export function useExportActions(post, plain, mdOptions) {
  const { toast } = useStudio();
  const [manual, setManual] = useState(null);
  const stem = fileStem(post.title, 'post');

  const copy = async (kind) => {
    let payload;
    let label;
    if (kind === 'markdown') {
      payload = { text: messageText(post) };
      label = 'Message text';
    } else if (kind === 'webhook') {
      payload = { text: `${JSON.stringify(toWebhookPayload(post), null, 2)}\n` };
      label = 'Webhook JSON';
    } else if (kind === 'plain') {
      payload = { text: plain };
      label = 'Plain text';
    } else if (kind === 'rich') {
      payload = { text: plain, html: buildRichHtml(post.content, mdOptions) };
      label = 'Rich text';
    } else {
      payload = { text: stringifyExport(buildExport([post])) };
      label = 'Post JSON';
    }
    const result = await writeToClipboard(payload);
    if (!result.ok) setManual({ label, text: payload.text });
    else if (result.degraded) {
      toast('Copied as plain text — this browser cannot copy formatted text. Use Copy Markdown for apps that read Markdown.', 'info');
    } else toast('Copied successfully');
  };

  const download = (kind) => {
    if (kind === 'md') downloadText(messageText(post), `${stem}.md`, 'text/markdown;charset=utf-8');
    else if (kind === 'txt') downloadText(plain, `${stem}.txt`);
    else if (kind === 'webhook') {
      downloadText(`${JSON.stringify(toWebhookPayload(post), null, 2)}\n`, `${stem}-webhook.json`, 'application/json;charset=utf-8');
    } else downloadText(stringifyExport(buildExport([post])), `${stem}.json`, 'application/json;charset=utf-8');
    toast(`${{ md: 'Message text', txt: 'Plain text', webhook: 'Webhook JSON' }[kind] || 'Post JSON'} downloaded`);
  };

  const dialog = manual ? (
    <Modal
      title={`Copy ${manual.label} manually`}
      onClose={() => setManual(null)}
      footer={<Button variant="primary" onClick={() => setManual(null)}>Done</Button>}
    >
      <p className="ms-modal__text">
        Your browser blocked automatic copying. Select the text below and press {isMac ? '⌘C' : 'Ctrl+C'}.
      </p>
      <textarea className="ms-manual" readOnly value={manual.text} data-autofocus onFocus={(e) => e.target.select()} />
    </Modal>
  ) : null;

  return { copy, download, dialog };
}
