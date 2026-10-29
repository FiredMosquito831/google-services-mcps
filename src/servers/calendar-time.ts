/**
 * Time helpers for the curated Calendar tools: time zones (an IANA name, or the fixed offset of an RFC 3339 time),
 * wall-clock times in a zone, and the free-slot computation of calendar_suggest_time. Pure functions, no network.
 */

/** A time zone: an IANA name (Europe/Berlin), or a fixed offset in minutes east of UTC (from "+02:00" or "Z"). */
export type Zone = { kind: 'iana'; name: string } | { kind: 'fixed'; minutes: number };

const OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/i;

/** The fixed offset at the end of an RFC 3339 time ("Z" or "+02:00"). */
export function zoneOfTime(value: string): Zone {
  const match = OFFSET_RE.exec(value);
  if (!match) throw new Error(`"${value}" has no time zone offset.`);
  const text = match[1] as string;
  if (text.toUpperCase() === 'Z') return { kind: 'fixed', minutes: 0 };
  const sign = text.startsWith('-') ? -1 : 1;
  return { kind: 'fixed', minutes: sign * (Number(text.slice(1, 3)) * 60 + Number(text.slice(4, 6))) };
}

/** An IANA time zone, checked by Intl. Throws for a name Intl does not know. */
export function ianaZone(name: string): Zone {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
  } catch {
    throw new Error(`time_zone "${name}" is not a known IANA time zone, for example Europe/Berlin or America/New_York.`);
  }
  return { kind: 'iana', name };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(name: string): Intl.DateTimeFormat {
  let f = formatters.get(name);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(name, f);
  }
  return f;
}

/** Minutes east of UTC that the zone is at the instant `ms`. */
export function offsetAt(ms: number, zone: Zone): number {
  if (zone.kind === 'fixed') return zone.minutes;
  const parts = Object.fromEntries(formatterFor(zone.name).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((local - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The UTC instant of a wall-clock time (a date and minutes after midnight) in the zone. */
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, zone: Zone): number {
  const guess = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const first = guess - offsetAt(guess, zone) * 60000;
  const second = offsetAt(first, zone);
  return second === offsetAt(guess, zone) ? first : guess - second * 60000;
}

/** The local date of an instant in the zone. */
export function localDate(ms: number, zone: Zone): { year: number; month: number; day: number } {
  const d = new Date(ms + offsetAt(ms, zone) * 60000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** RFC 3339 in the zone, with its offset, to the minute: 2026-11-02T10:00:00+01:00. */
export function formatInZone(ms: number, zone: Zone): string {
  const off = offsetAt(ms, zone);
  const d = new Date(ms + off * 60000);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** "HH:MM" as minutes after midnight (24:00 allowed as the end of the day). */
export function minuteOfDay(value: string, field: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  if (!match || Number(match[2]) > 59 || minutes > 24 * 60) throw new Error(`${field} must be HH:MM (24-hour clock), for example 09:00, got "${value}".`);
  return minutes;
}

export interface Interval {
  start: number;
  end: number;
}

/** Sorted, overlapping or touching intervals joined, clipped to [from, to). */
export function mergeIntervals(list: readonly Interval[], from: number, to: number): Interval[] {
  const clipped = list
    .map((i) => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of clipped) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export interface SlotOptions {
  /** The search window, ms since the epoch. */
  from: number;
  to: number;
  /** Busy periods of every calendar, in any order. */
  busy: readonly Interval[];
  durationMinutes: number;
  zone: Zone;
  /** Working hours in the zone, minutes after midnight. Absent: any time of day. */
  workingHours?: { start: number; end: number };
  weekdaysOnly: boolean;
  /** Suggested meetings start on a multiple of this many minutes of the local clock. */
  stepMinutes: number;
  maxSuggestions: number;
}

/**
 * Free time: the window, cut to working hours (and weekdays) when asked, minus every busy period. A free period counts
 * when a meeting of the duration fits in it, starting on the step. One suggestion per free period (its earliest start),
 * in time order, up to maxSuggestions.
 */
export function freeSlots(o: SlotOptions): { periods: Interval[]; suggestions: Interval[] } {
  const allowed: Interval[] = [];
  if (!o.workingHours && !o.weekdaysOnly) {
    allowed.push({ start: o.from, end: o.to });
  } else {
    const hours = o.workingHours ?? { start: 0, end: 24 * 60 };
    let date = localDate(o.from, o.zone);
    // At most one pass per day of the window (bounded by the window itself).
    for (;;) {
      const dayStart = zonedToUtc(date.year, date.month, date.day, 0, o.zone);
      if (dayStart >= o.to) break;
      const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
      if (!o.weekdaysOnly || (weekday !== 0 && weekday !== 6)) {
        const start = Math.max(zonedToUtc(date.year, date.month, date.day, hours.start, o.zone), o.from);
        const end = Math.min(zonedToUtc(date.year, date.month, date.day, hours.end, o.zone), o.to);
        if (end > start) allowed.push({ start, end });
      }
      const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
      date = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
    }
  }

  const busy = mergeIntervals(o.busy, o.from, o.to);
  const free: Interval[] = [];
  for (const a of allowed) {
    let cursor = a.start;
    for (const b of busy) {
      if (b.end <= cursor || b.start >= a.end) continue;
      if (b.start > cursor) free.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < a.end) free.push({ start: cursor, end: a.end });
  }

  const duration = o.durationMinutes * 60000;
  const step = o.stepMinutes * 60000;
  const periods: Interval[] = [];
  const suggestions: Interval[] = [];
  for (const f of free) {
    const off = offsetAt(f.start, o.zone) * 60000;
    const aligned = Math.ceil((f.start + off) / step) * step - off;
    if (aligned + duration > f.end) continue;
    periods.push(f);
    if (suggestions.length < o.maxSuggestions) suggestions.push({ start: aligned, end: aligned + duration });
  }
  return { periods, suggestions };
}
