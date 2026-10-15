import { useState } from 'react';
import { useStudio } from '../../state/StudioContext.jsx';
import { Button, Modal } from '../ui.jsx';
import { buildRichHtml, writeToClipboard } from '../../core/clipboard.js';
import { buildExport, stringifyExport } from '../../core/json-io.js';
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
      payload = { text: post.content };
      label = 'Markdown';
    } else if (kind === 'plain') {
      payload = { text: plain };
      label = 'Plain text';
    } else if (kind === 'rich') {
      payload = { text: plain, html: buildRichHtml(post.content, mdOptions) };
      label = 'Rich text';
    } else {
      payload = { text: stringifyExport(buildExport([post])) };
      label = 'JSON';
    }
    const result = await writeToClipboard(payload);
    if (!result.ok) setManual({ label, text: payload.text });
    else if (result.degraded) {
      toast('Copied as plain text — this browser cannot copy formatted text. Use Copy Markdown for apps that read Markdown.', 'info');
    } else toast('Copied successfully');
  };

  const download = (kind) => {
    if (kind === 'md') downloadText(post.content, `${stem}.md`, 'text/markdown;charset=utf-8');
    else if (kind === 'txt') downloadText(plain, `${stem}.txt`);
    else downloadText(stringifyExport(buildExport([post])), `${stem}.json`, 'application/json;charset=utf-8');
    toast(`${kind === 'md' ? 'Markdown' : kind === 'txt' ? 'Text' : 'JSON'} downloaded`);
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
