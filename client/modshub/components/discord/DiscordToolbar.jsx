import { useState } from 'react';
import { Button, Icon, IconButton, Menu, Modal, Popover, Select } from '../ui.jsx';
import { DateField, TimeField } from '../pickers.jsx';
import { isMac } from '../editor/FormatToolbar.jsx';
import { fromWall, wallParts } from '../../core/time.js';

const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT = isMac ? '⇧' : 'Shift+';
const ALT = isMac ? '⌥' : 'Alt+';

const GROUPS = [
  [
    { id: 'h1', text: 'H1', label: 'Heading 1', keys: `${MOD}${ALT}1` },
    { id: 'h2', text: 'H2', label: 'Heading 2', keys: `${MOD}${ALT}2` },
    { id: 'h3', text: 'H3', label: 'Heading 3', keys: `${MOD}${ALT}3` },
    { id: 'subtext', text: '-#', label: 'Small text (-#)' },
  ],
  [
    { id: 'bold', icon: 'bold', label: 'Bold', keys: `${MOD}B` },
    { id: 'italic', icon: 'italic', label: 'Italic', keys: `${MOD}I` },
    { id: 'underline', text: 'U', label: 'Underline', keys: `${MOD}U`, cls: 'is-underline' },
    { id: 'strike', icon: 'strike', label: 'Strikethrough', keys: `${MOD}${SHIFT}X` },
    { id: 'spoiler', icon: 'eye', label: 'Spoiler (||text||)', keys: `${MOD}${SHIFT}S` },
  ],
  [
    { id: 'code', icon: 'code', label: 'Inline code', keys: `${MOD}E` },
    { id: 'codeblock', icon: 'codeblock', label: 'Code block', keys: `${MOD}${SHIFT}E` },
    { id: 'quote', icon: 'quote', label: 'Quote (>)', keys: `${MOD}${SHIFT}.` },
    { id: 'mquote', text: '>>>', label: 'Quote the rest of the message (>>>)' },
  ],
  [
    { id: 'ul', icon: 'ul', label: 'Bulleted list', keys: `${MOD}${SHIFT}8` },
    { id: 'ol', icon: 'ol', label: 'Numbered list', keys: `${MOD}${SHIFT}7` },
    { id: 'link', icon: 'link', label: 'Masked link [text](url)', keys: `${MOD}K` },
  ],
];

const EMOJI = (
  '😀 😁 😂 🤣 😊 😍 😎 🤔 😅 😉 🙂 😴 🤯 🥳 🤩 😱 😢 😭 😡 😈 👍 👎 👏 🙌 🙏 💪 👋 🤝 👀 🔥 ✨ ⭐ 🌟 💥 🎉 🎊 🎁 🏆 🥇 ' +
  '🎮 🕹️ 🚗 🏎️ 🚓 🚕 🚙 🛻 🏍️ 🚀 ✈️ 🛠️ ⚙️ 🔧 🔨 💡 📢 📣 🔔 📌 📎 🔗 ✅ ❌ ⚠️ ❗ ❓ 💬 📅 ⏰ 🆕 🆓 💯 ' +
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ➡️ ⬇️ ⬆️ ▶️ ☑️ 🔸 🔹 🟢 🟡 🔴 🔵 ⚡ 🌙 ☀️ 🌈 📷 🎬 🎵 📦 📥 🔒 🔑'
).split(' ');

function TimestampDialog({ post, onInsert, onClose }) {
  const base = wallParts(post.scheduledAt, post.timezone);
  const [date, setDate] = useState(base.date);
  const [time, setTime] = useState(base.time);
  const [style, setStyle] = useState('F');
  const when = fromWall(date, time, post.timezone);
  const unix = when ? Math.floor(Date.parse(when.iso) / 1000) : null;
  const styles = [
    ['t', 'Short time'], ['T', 'Long time'], ['d', 'Short date'], ['D', 'Long date'],
    ['f', 'Short date and time'], ['F', 'Long date and time'], ['R', 'Relative (in 3 days)'],
  ];
  return (
    <Modal
      title="Insert a Discord timestamp"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!unix} onClick={() => onInsert(`<t:${unix}:${style}>`)}>Insert</Button>
        </>
      }
    >
      <div className="ms-form">
        <p className="ms-hint">
          Shows the time in every reader's own timezone. Entered in the post's timezone ({post.timezone}).
        </p>
        <div className="ms-field">
          <span>Date</span>
          <DateField label="Timestamp date" value={date} onChange={setDate} />
        </div>
        <div className="ms-field">
          <span>Time</span>
          <TimeField label="Timestamp time" value={time} onChange={setTime} />
        </div>
        <div className="ms-field">
          <span>Style</span>
          <Select label="Style" value={style} onChange={setStyle} options={styles.map(([value, label]) => ({ value, label }))} />
        </div>
        {unix ? <code className="ms-code-line">{`<t:${unix}:${style}>`}</code> : null}
      </div>
    </Modal>
  );
}

function IdDialog({ kind, onInsert, onClose }) {
  const [id, setId] = useState('');
  const valid = /^\d{15,25}$/.test(id.trim());
  const wrap = { user: (v) => `<@${v}>`, role: (v) => `<@&${v}>`, channel: (v) => `<#${v}>` }[kind];
  const title = { user: 'Mention a user', role: 'Mention a role', channel: 'Link a channel' }[kind];
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onInsert(wrap(id.trim()))}>Insert</Button>
        </>
      }
    >
      <form
        className="ms-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onInsert(wrap(id.trim()));
        }}
      >
        <label className="ms-field">
          <span>{kind[0].toUpperCase() + kind.slice(1)} ID</span>
          <input type="text" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} placeholder="123456789012345678" data-autofocus />
        </label>
        <p className="ms-hint">
          In Discord enable Developer Mode (Settings → Advanced), then right-click the {kind} and choose “Copy ID”.
        </p>
      </form>
    </Modal>
  );
}

export default function DiscordToolbar({ post, onCommand, canUndo, canRedo }) {
  const [dialog, setDialog] = useState(null); // 'timestamp' | 'user' | 'role' | 'channel'
  const keep = (e) => e.preventDefault();

  const insert = (text) => {
    onCommand('insert', text);
    setDialog(null);
  };

  return (
    <div className="ms-toolbar ms-toolbar--discord" role="toolbar" aria-label="Discord formatting">
      {GROUPS.map((group, gi) => (
        <div className="ms-toolbar__group" key={gi}>
          {group.map((b) => {
            const title = b.keys ? `${b.label} (${b.keys})` : b.label;
            return b.text ? (
              <button
                key={b.id}
                type="button"
                className={`ms-iconbtn ms-iconbtn--text ${b.cls || ''}`}
                aria-label={b.label}
                title={title}
                onMouseDown={keep}
                onClick={() => onCommand(b.id)}
              >
                {b.text}
              </button>
            ) : (
              <IconButton key={b.id} icon={b.icon} label={title} onMouseDown={keep} onClick={() => onCommand(b.id)} />
            );
          })}
        </div>
      ))}
      <div className="ms-toolbar__group ms-toolbar__pop">
        <Popover
          label="Emoji"
          title="Emoji"
          placement="bottom-start"
          panelClassName="ms-pop--emoji"
          trigger={
            <button type="button" className="ms-iconbtn ms-iconbtn--text" aria-label="Emoji" title="Emoji" onMouseDown={keep}>
              🙂
            </button>
          }
        >
          {(close) => (
            <div className="ms-emoji">
              {EMOJI.map((e) => (
                <button type="button" key={e} onMouseDown={keep} onClick={() => { close(); insert(e); }} aria-label={`Insert ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </Popover>
        <Menu
          label="Mention"
          title="Mention"
          align="left"
          trigger={
            <button type="button" className="ms-iconbtn ms-iconbtn--text" aria-label="Mention" title="Mention (@everyone, @here, user, role, channel)" onMouseDown={keep}>
              @
            </button>
          }
          items={[
            { label: '@everyone', onClick: () => insert('@everyone') },
            { label: '@here', onClick: () => insert('@here') },
            { label: 'User…', onClick: () => setDialog('user') },
            { label: 'Role…', onClick: () => setDialog('role') },
            { label: 'Channel…', onClick: () => setDialog('channel') },
          ]}
        />
        <IconButton icon="clock" label="Timestamp (<t:…>)" onMouseDown={keep} onClick={() => setDialog('timestamp')} />
      </div>
      <div className="ms-toolbar__group">
        <IconButton icon="undo" label={`Undo (${MOD}Z)`} disabled={!canUndo} onMouseDown={keep} onClick={() => onCommand('undo')} />
        <IconButton icon="redo" label="Redo" disabled={!canRedo} onMouseDown={keep} onClick={() => onCommand('redo')} />
      </div>
      {dialog === 'timestamp' ? <TimestampDialog post={post} onInsert={insert} onClose={() => setDialog(null)} /> : null}
      {['user', 'role', 'channel'].includes(dialog) ? <IdDialog kind={dialog} onInsert={insert} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

export { Icon };
