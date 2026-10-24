import { useStudio } from '../state/StudioContext.jsx';
import { STATUS_META, STATUS_ORDER } from '../constants.js';
import { Button, Icon, Popover, Select } from './ui.jsx';
import { DateField } from './pickers.jsx';

export const SORTS = [
  { value: 'date-asc', label: 'Date: earliest first' },
  { value: 'date-desc', label: 'Date: latest first' },
  { value: 'modified-desc', label: 'Modified: newest first' },
  { value: 'modified-asc', label: 'Modified: oldest first' },
];

export const EMPTY_FILTERS = { q: '', status: 'all', category: 'all', from: '', to: '' };

export function activeFilterCount(f, includeSearch = false) {
  return [f.status !== 'all', f.category !== 'all', Boolean(f.from), Boolean(f.to), includeSearch && Boolean(f.q)].filter(Boolean).length;
}

function Chips({ label, value, options, onChange }) {
  return (
    <div className="ms-fgroup" role="radiogroup" aria-label={label}>
      <span className="ms-fgroup__label">{label}</span>
      <div className="ms-chips">
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            className={`ms-fchip ${value === o.value ? 'is-on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.color ? <i style={{ background: o.color }} aria-hidden="true" /> : null}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Status and category chips, plus sort and a date range on the Posts screen. */
export function FilterForm({ full = false }) {
  const { ui, setUi, categories } = useStudio();
  const f = ui.filters;
  const set = (patch) => setUi((p) => ({ filters: { ...p.filters, ...patch } }));
  return (
    <div className="ms-fform">
      <Chips
        label="Status"
        value={f.status}
        onChange={(status) => set({ status })}
        options={[{ value: 'all', label: 'All' }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_META[s].color }))]}
      />
      <Chips
        label="Category"
        value={f.category}
        onChange={(category) => set({ category })}
        options={[{ value: 'all', label: 'All' }, ...categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))]}
      />
      {full ? (
        <>
          <div className="ms-fgroup">
            <span className="ms-fgroup__label">Date range</span>
            <div className="ms-fform__dates">
              <DateField label="From" value={f.from} max={f.to || undefined} clearable placeholder="Any" onChange={(from) => set({ from })} />
              <DateField label="To" value={f.to} min={f.from || undefined} clearable placeholder="Any" onChange={(to) => set({ to })} />
            </div>
          </div>
          <div className="ms-fgroup">
            <span className="ms-fgroup__label">Sort by</span>
            <Select label="Sort" value={f.sort} options={SORTS} onChange={(sort) => set({ sort })} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Opens the filters as a popover on desktop and a bottom sheet on phones. */
export function FiltersButton({ full = false, className = '' }) {
  const { ui, setUi } = useStudio();
  const count = activeFilterCount(ui.filters);
  return (
    <Popover
      label="Filters"
      title="Filters"
      placement="bottom-end"
      className={className}
      panelClassName="ms-pop--filters"
      trigger={
        <button type="button" className={`ms-iconbtn ms-iconbtn--filter ${count ? 'is-active' : ''}`} aria-label={count ? `Filters (${count} active)` : 'Filters'} title="Filters" data-testid="filters">
          <Icon name="sliders" size={20} />
          {count ? <b className="ms-iconbtn__badge">{count}</b> : null}
        </button>
      }
    >
      {(close) => (
        <div className="ms-pickerbody">
          <FilterForm full={full} />
          <div className="ms-pickerbody__foot">
            <Button variant="ghost" size="sm" disabled={count === 0 && ui.filters.sort === 'date-asc'} onClick={() => setUi((p) => ({ filters: { ...p.filters, ...EMPTY_FILTERS, q: p.filters.q, sort: 'date-asc' } }))}>
              Reset
            </Button>
            <Button variant="primary" size="sm" onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Search box shared by the calendar and the posts screen. */
export function SearchField({ className = '', autoFocus = false, onClose }) {
  const { ui, setUi } = useStudio();
  const q = ui.filters.q;
  return (
    <div className={`ms-search ${className}`}>
      <Icon name="search" size={16} />
      <input
        type="search"
        value={q}
        autoFocus={autoFocus}
        placeholder="Search posts"
        aria-label="Search posts"
        onChange={(e) => setUi((p) => ({ filters: { ...p.filters, q: e.target.value } }))}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onClose) onClose();
        }}
      />
      {q ? (
        <button type="button" className="ms-iconbtn ms-iconbtn--tiny" aria-label="Clear search" onClick={() => setUi((p) => ({ filters: { ...p.filters, q: '' } }))}>
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}
