import { IconButton } from '../ui.jsx';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl+';
const ALT = isMac ? '⌥' : 'Alt+';
const SHIFT = isMac ? '⇧' : 'Shift+';

const GROUPS = [
  [
    { id: 'h1', text: 'H1', label: 'Heading 1', keys: `${MOD}${ALT}1` },
    { id: 'h2', text: 'H2', label: 'Heading 2', keys: `${MOD}${ALT}2` },
    { id: 'h3', text: 'H3', label: 'Heading 3', keys: `${MOD}${ALT}3` },
  ],
  [
    { id: 'bold', icon: 'bold', label: 'Bold', keys: `${MOD}B` },
    { id: 'italic', icon: 'italic', label: 'Italic', keys: `${MOD}I` },
    { id: 'strike', icon: 'strike', label: 'Strikethrough', keys: `${MOD}${SHIFT}X` },
    { id: 'code', icon: 'code', label: 'Inline code', keys: `${MOD}E` },
  ],
  [
    { id: 'codeblock', icon: 'codeblock', label: 'Code block', keys: `${MOD}${SHIFT}E` },
    { id: 'quote', icon: 'quote', label: 'Quote', keys: `${MOD}${SHIFT}.` },
    { id: 'ul', icon: 'ul', label: 'Bulleted list', keys: `${MOD}${SHIFT}8` },
    { id: 'ol', icon: 'ol', label: 'Numbered list', keys: `${MOD}${SHIFT}7` },
  ],
  [
    { id: 'link', icon: 'link', label: 'Link', keys: `${MOD}K` },
    { id: 'image', icon: 'image', label: 'Image' },
    { id: 'table', icon: 'table', label: 'Table' },
    { id: 'hr', icon: 'hr', label: 'Horizontal rule' },
  ],
  [
    { id: 'undo', icon: 'undo', label: 'Undo', keys: `${MOD}Z` },
    { id: 'redo', icon: 'redo', label: 'Redo', keys: isMac ? `${MOD}${SHIFT}Z` : 'Ctrl+Y' },
  ],
];

export default function FormatToolbar({ onCommand, canUndo, canRedo, disabled }) {
  return (
    <div className="ms-toolbar" role="toolbar" aria-label="Formatting">
      {GROUPS.map((group, gi) => (
        <div className="ms-toolbar__group" key={gi}>
          {group.map((b) => {
            const off = disabled || (b.id === 'undo' && !canUndo) || (b.id === 'redo' && !canRedo);
            const title = b.keys ? `${b.label} (${b.keys})` : b.label;
            return b.text ? (
              <button
                key={b.id}
                type="button"
                className="ms-iconbtn ms-iconbtn--text"
                aria-label={b.label}
                title={title}
                disabled={off}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onCommand(b.id)}
              >
                {b.text}
              </button>
            ) : (
              <IconButton
                key={b.id}
                icon={b.icon}
                label={title}
                disabled={off}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onCommand(b.id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
