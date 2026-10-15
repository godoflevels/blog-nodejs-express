import { DateTime, IANAZone } from 'luxon';

/**
 * Time model
 * ----------
 * A post stores an *instant* (ISO string, UTC) plus the IANA timezone the
 * author scheduled it in. Wall-clock date/time is always derived from the pair,
 * never stored separately, so saving or exporting can't shift a date.
 *
 * The calendar grid is drawn in a single "display" zone (settings, default:
 * the browser zone). Dragging a post to another day keeps its wall time in
 * that display zone and recomputes the instant.
 *
 * Plain calendar dates are 'YYYY-MM-DD' strings and are manipulated in UTC so
 * date arithmetic can never be affected by DST.
 */

export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

export function isValidZone(zone) {
  return typeof zone === 'string' && zone.length > 0 && IANAZone.isValidZone(zone);
}

/** Resolves the "auto" setting to a concrete IANA zone. */
export function resolveZone(setting) {
  return setting && setting !== 'auto' && isValidZone(setting) ? setting : browserZone();
}

export function listZones() {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch (_) {
    zones = [];
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  return zones;
}

/** @returns {{date: string, time: string, offset: string}} wall clock of `isoUtc` in `zone` */
export function wallParts(isoUtc, zone) {
  const dt = DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(zone);
  if (!dt.isValid) return { date: '', time: '', offset: '' };
  return { date: dt.toISODate(), time: dt.toFormat('HH:mm'), offset: dt.toFormat('ZZ') };
}

/**
 * Wall-clock -> instant.
 * `adjusted` is true when the wall time does not exist in `zone` (DST gap) and
 * was moved forward by the zone rules.
 * @returns {{iso: string, adjusted: boolean} | null}
 */
export function fromWall(date, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid) return null;
  return { iso: dt.toUTC().toISO(), adjusted: dt.toFormat('HH:mm') !== time || dt.toISODate() !== date };
}

/** ISO 8601 with the zone's offset, e.g. 2026-10-20T18:00:00+03:00 */
export function toOffsetIso(isoUtc, zone) {
  const dt = DateTime.fromISO(isoUtc, { zone: 'utc' }).setZone(zone);
  return dt.isValid ? dt.toISO({ suppressMilliseconds: true }) : '';
}

/** Parses an ISO string that carries an offset (or Z) into an instant. */
export function parseOffsetIso(text) {
  const dt = DateTime.fromISO(text, { setZone: true });
  if (!dt.isValid) return null;
  return { iso: dt.toUTC().toISO(), offsetMinutes: dt.offset };
}

export function dayKey(isoUtc, zone) {
  return wallParts(isoUtc, zone).date;
}

/** Same wall time (in `zone`), different calendar date. */
export function moveToDate(isoUtc, zone, newDate) {
  const { time } = wallParts(isoUtc, zone);
  const res = fromWall(newDate, time, zone);
  return res ? res.iso : isoUtc;
}

/** Different date and time in `zone`. */
export function moveToWall(isoUtc, zone, newDate, newTime) {
  const res = fromWall(newDate, newTime, zone);
  return res ? res.iso : isoUtc;
}

/** Re-express the same wall clock in another zone (used when the zone select changes). */
export function changeZoneKeepingInstant(isoUtc, fromZone, toZone) {
  return { ...wallParts(isoUtc, toZone), from: wallParts(isoUtc, fromZone) };
}

// ---- calendar date arithmetic (zone independent) --------------------------

const utc = (date) => DateTime.fromISO(date, { zone: 'utc' });

export function todayKey(zone) {
  return DateTime.now().setZone(zone).toISODate();
}

export function addDays(date, n) {
  return utc(date).plus({ days: n }).toISODate();
}

export function addMonths(date, n) {
  return utc(date).plus({ months: n }).toISODate();
}

export function startOfMonth(date) {
  return utc(date).startOf('month').toISODate();
}

/** @param {0|1} weekStart 0 = Sunday, 1 = Monday */
export function startOfWeek(date, weekStart = 1) {
  const dt = utc(date);
  const weekday = dt.weekday % 7; // luxon: Mon=1..Sun=7 -> Sun=0..Sat=6
  const back = (weekday - weekStart + 7) % 7;
  return dt.minus({ days: back }).toISODate();
}

export function weekDays(date, weekStart = 1) {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Always 6 rows x 7 columns so the grid height is stable between months. */
export function monthMatrix(date, weekStart = 1) {
  const first = startOfMonth(date);
  const month = utc(first).month;
  const gridStart = startOfWeek(first, weekStart);
  return Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => {
      const d = addDays(gridStart, row * 7 + col);
      return { date: d, inMonth: utc(d).month === month };
    })
  );
}

export function weekdayNames(weekStart = 1, style = 'short') {
  const monday = '2024-01-01'; // a Monday
  const start = weekStart === 1 ? monday : addDays(monday, -1);
  return Array.from({ length: 7 }, (_, i) => utc(addDays(start, i)).toLocaleString({ weekday: style }, { locale: 'en-US' }));
}

export function formatMonth(date) {
  return utc(date).toLocaleString({ month: 'long', year: 'numeric' }, { locale: 'en-US' });
}

export function formatDayLong(date) {
  return utc(date).toLocaleString({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, { locale: 'en-US' });
}

export function formatDayShort(date) {
  return utc(date).toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' }, { locale: 'en-US' });
}

export function formatWeekRange(date, weekStart = 1) {
  const days = weekDays(date, weekStart);
  const a = utc(days[0]);
  const b = utc(days[6]);
  const sameMonth = a.month === b.month;
  const left = a.toLocaleString({ day: 'numeric', month: sameMonth ? undefined : 'short' }, { locale: 'en-US' });
  const right = b.toLocaleString({ day: 'numeric', month: 'short', year: 'numeric' }, { locale: 'en-US' });
  return `${left} – ${right}`;
}

export function dayNumber(date) {
  return utc(date).day;
}

export function isoToMillis(iso) {
  return Date.parse(iso);
}

export function minutesOfDay(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function timeFromMinutes(total) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const h = String(Math.floor(clamped / 60)).padStart(2, '0');
  const m = String(clamped % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatTimeLabel(time) {
  const dt = DateTime.fromISO(`2000-01-01T${time}`, { zone: 'utc' });
  return dt.isValid ? dt.toLocaleString({ hour: '2-digit', minute: '2-digit', hour12: false }, { locale: 'en-GB' }) : time;
}

export function relativeTime(iso, nowMs = Date.now()) {
  const diff = Math.round((nowMs - Date.parse(iso)) / 1000);
  if (!Number.isFinite(diff)) return '';
  if (Math.abs(diff) < 45) return 'just now';
  const abs = Math.abs(diff);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, secs] of units) {
    if (abs >= secs) {
      const n = Math.floor(abs / secs);
      return diff > 0 ? `${n} ${name}${n > 1 ? 's' : ''} ago` : `in ${n} ${name}${n > 1 ? 's' : ''}`;
    }
  }
  return 'just now';
}
