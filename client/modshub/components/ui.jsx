import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '../state/StudioContext.jsx';
import { STATUS_META } from '../constants.js';

/* ---------------------------------------------------------------- icons -- */

const P = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: (<><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H16" /></>),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  settings: (<><path d="M4 7h9M19 7h1M4 17h1M11 17h9" /><circle cx="16" cy="7" r="2.5" /><circle cx="8" cy="17" r="2.5" /></>),
  calendar: (<><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>),
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />,
  italic: <path d="M10 5h8M6 19h8M14.5 5l-5 14" />,
  strike: <path d="M4 12h16M16.5 7.5C16 6 14.4 5 12 5 9.6 5 8 6.2 8 8c0 1.2.8 2 2 2.6M8.5 16.5C9 18 10.4 19 12.2 19c2.3 0 3.8-1.2 3.8-2.8 0-.7-.2-1.2-.6-1.7" />,
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  codeblock: (<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M10 9.5L7.5 12 10 14.5M14 9.5l2.5 2.5-2.5 2.5" /></>),
  quote: <path d="M5 8h5v5a4 4 0 0 1-4 4M14 8h5v5a4 4 0 0 1-4 4" />,
  ul: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  ol: <path d="M10 6h10M10 12h10M10 18h10M4 5.5l1.5-1V9.5M3.5 15c.4-1.3 2.7-1.2 2.7.2 0 1.3-2.7 2.1-2.7 3.3H6.5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  image: (<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="M4 17l5-5 4 4 2.5-2.5L20 18" /></>),
  table: (<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M3.5 10h17M3.5 15h17M10 4.5v15" /></>),
  hr: <path d="M4 12h3M10.5 12h3M17 12h3" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  more: (<><circle cx="5.5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18.5" cy="12" r="1" /></>),
  alert: <path d="M12 4l9 16H3zM12 10v4.5M12 17.2h.01" />,
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>),
  file: <path d="M6 3.5h8l4 4V20.5H6zM14 3.5v4h4" />,
  tag: (<><path d="M4 4h8l8 8-8 8-8-8z" /><circle cx="8.5" cy="8.5" r="1" /></>),
  logout: <path d="M10 5H5.5v14H10M15 8l4 4-4 4M19 12H9.5" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  edit: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
  task: (<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>),
  filter: <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />,
  archive: <path d="M4 5h16v4H4zM6 9v10h12V9M10 13h4" />,
  split: (<><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M12 4.5v15" /></>),
  rich: <path d="M5 18l4.2-11h1.6L15 18M6.6 14h6.8M17.5 9.5v6M14.5 12.5h6" />,
  markdown: (<><rect x="2.5" y="6" width="19" height="12" rx="3" /><path d="M6 15V9l3 3.5L12 9v6M16 9v5.5M14 12.5l2 2.5 2-2.5" /></>),
  grid: (<><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>),
  columns: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9.5 4v16M14.5 4v16" /></>),
  sun: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />,
  star: <path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z" />,
  home: <path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" />,
};

export function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg
      className={`ms-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {P[name] || null}
    </svg>
  );
}

/* ---------------------------------------------------------------- hooks -- */

export function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useOutsideClose(ref, onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose, active]);
}

/* -------------------------------------------------------------- buttons -- */

export function Button({ variant = 'ghost', size = 'md', icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`ms-btn ms-btn--${variant} ms-btn--${size} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children ? <span className="ms-btn__label">{children}</span> : null}
    </button>
  );
}

export function IconButton({ icon, label, active, className = '', size = 18, ...rest }) {
  return (
    <button
      type="button"
      className={`ms-iconbtn ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/* ----------------------------------------------------------------- menu -- */

/**
 * items: [{label, icon, onClick, danger, disabled, checked, divider, hint}]
 */
export function Menu({ trigger, items, align = 'right', label = 'Menu', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, close, open);
  return (
    <div className={`ms-menu ${className}`} ref={ref}>
      <span
        onClick={() => setOpen((o) => !o)}
        role="presentation"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {typeof trigger === 'function' ? trigger({ open }) : trigger}
      </span>
      {open ? (
        <div className={`ms-menu__list ms-menu__list--${align}`} role="menu">
          {items.map((item, i) =>
            item.divider ? (
              <div className="ms-menu__divider" key={`d${i}`} role="separator" />
            ) : item.heading ? (
              <div className="ms-menu__heading" key={`h${i}`}>{item.heading}</div>
            ) : (
              <button
                type="button"
                role="menuitem"
                key={item.label + i}
                className={`ms-menu__item ${item.danger ? 'is-danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick && item.onClick();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={16} /> : <span className="ms-menu__spacer" />}
                <span className="ms-menu__text">
                  {item.label}
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
                {item.checked ? <Icon name="check" size={16} className="ms-menu__check" /> : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- modal -- */

export function Modal({ title, onClose, children, footer, size = 'md', labelledBy }) {
  const ref = useRef(null);
  const previous = useRef(null);

  useLayoutEffect(() => {
    previous.current = document.activeElement;
    const root = ref.current;
    const focusable = root.querySelector('[data-autofocus]') || root.querySelector('input, select, textarea, button:not([data-close])');
    (focusable || root).focus({ preventScroll: true });
    document.body.classList.add('ms-noscroll');
    return () => {
      document.body.classList.remove('ms-noscroll');
      if (previous.current && previous.current.focus) previous.current.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="ms-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`ms-modal__panel ms-modal__panel--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'ms-modal-title'}
        ref={ref}
        tabIndex={-1}
      >
        <header className="ms-modal__head">
          <h2 id={labelledBy || 'ms-modal-title'}>{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} data-close />
        </header>
        <div className="ms-modal__body">{children}</div>
        {footer ? <footer className="ms-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog() {
  const { confirmState, answerConfirm } = useStudio();
  if (!confirmState) return null;
  return (
    <Modal
      title={confirmState.title}
      size="sm"
      onClose={() => answerConfirm(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => answerConfirm(false)}>Cancel</Button>
          <Button variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => answerConfirm(true)} data-autofocus>
            {confirmState.confirmLabel || 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="ms-modal__text">{confirmState.message}</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- toasts -- */

export function Toasts() {
  const { toasts, dismissToast } = useStudio();
  return (
    <div className="ms-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`ms-toast ms-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'} size={18} />
          <span>{t.message}</span>
          {t.action ? (
            <button type="button" className="ms-toast__action" onClick={() => { t.action.onClick(); dismissToast(t.id); }}>
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="ms-toast__close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- status -- */

export function StatusDot({ status, size = 8 }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return <span className="ms-dot" style={{ background: meta.color, width: size, height: size }} aria-hidden="true" />;
}

export function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className="ms-pill" style={{ '--c': meta.color }}>
      <StatusDot status={status} />
      {meta.label}
    </span>
  );
}

export function EmptyState({ icon = 'calendar', title, children, action }) {
  return (
    <div className="ms-empty">
      <div className="ms-empty__icon"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
