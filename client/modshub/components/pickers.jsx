import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '../state/StudioContext.jsx';
import { Button, Icon, Popover } from './ui.jsx';
import MiniMonth, { buildMarks } from './calendar/MiniMonth.jsx';
import { useDayGroups, useSlotGroups } from './calendar/shared.jsx';
import { formatDayShort, startOfMonth, todayKey } from '../core/time.js';

/** A date field that opens a month grid (no native date input). */
export function DateField({ value, onChange, label, placeholder = 'Pick a date', clearable = false, variant = 'field', min, max, className = '' }) {
  const { posts, settings, displayZone } = useStudio();
  const groups = useDayGroups(posts);
  const slotGroups = useSlotGroups();
  const marks = useMemo(() => buildMarks(groups, slotGroups), [groups, slotGroups]);
  const today = todayKey(displayZone);
  const [month, setMonth] = useState(startOfMonth(value || today));
  useEffect(() => {
    if (value) setMonth(startOfMonth(value));
  }, [value]);

  return (
    <Popover
      label={label}
      title={label}
      placement="bottom-start"
      className={className}
      panelClassName="ms-pop--picker"
      trigger={
        <button type="button" className={`ms-select ms-select--${variant}`} aria-label={`${label}: ${value ? formatDayShort(value) : 'not set'}`} data-testid={`date-${label.toLowerCase().replace(/\W+/g, '-')}`}>
          <Icon name="calendar" size={16} />
          <span className="ms-select__text">{value ? formatDayShort(value) : placeholder}</span>
        </button>
      }
    >
      {(close) => (
        <div className="ms-pickerbody">
          <MiniMonth
            month={month}
            onMonth={setMonth}
            selected={value}
            today={today}
            marks={marks}
            weekStart={settings.weekStart}
            onPick={(date) => {
              if ((min && date < min) || (max && date > max)) return;
              onChange(date);
              close();
            }}
          />
          <div className="ms-pickerbody__foot">
            <Button variant="ghost" size="sm" onClick={() => { onChange(today); close(); }}>Today</Button>
            {clearable && value ? (
              <Button variant="ghost" size="sm" onClick={() => { onChange(''); close(); }}>Clear</Button>
            ) : null}
          </div>
        </div>
      )}
    </Popover>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const QUICK = ['09:00', '12:00', '15:00', '18:00', '21:00'];
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** A time field with hour/minute grids and a typed fallback. */
export function TimeField({ value, onChange, label = 'Time', variant = 'field', className = '' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [h, m] = value.split(':');
  const apply = (next) => {
    const hit = TIME_RE.exec(next);
    if (hit) onChange(`${hit[1].padStart(2, '0')}:${hit[2]}`);
  };
  return (
    <Popover
      label={label}
      title={label}
      placement="bottom-start"
      className={className}
      panelClassName="ms-pop--picker ms-pop--time"
      trigger={
        <button type="button" className={`ms-select ms-select--${variant}`} aria-label={`${label}: ${value}`} data-testid="time-field">
          <Icon name="clock" size={16} />
          <span className="ms-select__text">{value}</span>
        </button>
      }
    >
      {(close) => (
        <div className="ms-pickerbody ms-timebody">
          <div className="ms-timebody__row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="ms-timebody__input"
              aria-label="Time (HH:MM)"
              data-autofocus
              value={draft}
              maxLength={5}
              placeholder="HH:MM"
              onChange={(e) => {
                setDraft(e.target.value);
                apply(e.target.value);
              }}
              onBlur={() => setDraft(value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply(draft);
                  close();
                }
              }}
            />
            <span className="ms-timebody__quick">
              {QUICK.map((q) => (
                <button type="button" key={q} className={q === value ? 'is-on' : ''} onClick={() => onChange(q)}>{q}</button>
              ))}
            </span>
          </div>
          <div className="ms-timebody__cols">
            <div>
              <span className="ms-timebody__cap">Hour</span>
              <div className="ms-timebody__grid ms-timebody__grid--h">
                {HOURS.map((x) => (
                  <button type="button" key={x} className={x === h ? 'is-on' : ''} aria-label={`Hour ${x}`} onClick={() => onChange(`${x}:${m}`)}>{x}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="ms-timebody__cap">Minute</span>
              <div className="ms-timebody__grid ms-timebody__grid--m">
                {MINUTES.map((x) => (
                  <button type="button" key={x} className={x === m ? 'is-on' : ''} aria-label={`Minute ${x}`} onClick={() => onChange(`${h}:${x}`)}>{x}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="ms-pickerbody__foot">
            <Button variant="primary" size="sm" onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
