/**
 * Curated Calendar tools (calendar_*), served by the workspace-user server (MCP name "gws-user").
 * Read: list calendars, list events, get event, free/busy, suggest times. Write: create event, update event, respond.
 * Destructive: delete event (asks for approval first). A create, update or respond call that emails guests or the
 * organizer (send_updates all or externalOnly) sends to other people, so that call is gated as destructive
 * (destructiveWhen; the destructive rule, docs/SECURITY.md).
 *
 * Times: RFC 3339 with an offset, or (since 1.40.0) a local date and time without one, read in time_zone, else in the
 * calendar's own time zone, as Google's Calendar MCP server reads its times.
 *
 * Auth: OAuth user token from `gsm login workspace-user`. Time zone and free-slot rules are in calendar-time.ts.
 */
import { randomUUID } from 'node:crypto';
import { calendar, type calendar_v3 } from '@googleapis/calendar';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import {
  addDays,
  daysBetween,
  formatInZone,
  formatLocal,
  formatWithOffset,
  freeSlots,
  ianaZone,
  isLocalTime,
  localTimeText,
  localToUtc,
  minuteOfDay,
  offsetAt,
  zoneOfTime,
  type Interval,
  type Zone,
} from './calendar-time.js';

type Auth = OAuth2Client | JWT;
type CalendarApi = calendar_v3.Calendar;

// The account is chosen per call (see account-context.ts), so the client is not cached here.
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('workspace-user', cfg);
}

const PRIMARY = 'primary';
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
/** RFC 3339 with an offset, or (1.40.0) a local date and time without one. */
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const timeArg = (field: string) =>
  z
    .string()
    .regex(
      TIME_RE,
      `${field} must be RFC 3339 with an offset, for example 2026-10-13T09:00:00+02:00 or 2026-10-13T07:00:00Z, or a local time without an offset, for example 2026-10-13T09:00`,
    );

// ---------- Calendar helpers ----------

function eventSummary(e: calendar_v3.Schema$Event) {
  return {
    id: e.id,
    summary: e.summary,
    status: e.status,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
    html_link: e.htmlLink,
  };
}

/** The Google Meet address of an event: its video entry point, else the older hangoutLink. */
function meetLink(e: calendar_v3.Schema$Event): string | undefined {
  return e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? e.hangoutLink ?? undefined;
}

/**
 * One event as calendar_list_events lists it (1.40.0): the summary of before, then only what the event has, so the list
 * stays small: its type when it is not a default event (always with event_types), all_day, the organizer, your own
 * answer, the guests' answers counted, the Meet link, the series an occurrence belongs to (recurring_event_id) or
 * recurring for a series, a visibility other than the default, and availability free when it does not block time.
 */
export function listItem(e: calendar_v3.Schema$Event, withType: boolean) {
  const guests = e.attendees ?? [];
  const self = guests.find((a) => a.self);
  const answers = { total: guests.length, accepted: 0, tentative: 0, declined: 0, needs_action: 0 };
  for (const a of guests) {
    if (a.responseStatus === 'accepted') answers.accepted += 1;
    else if (a.responseStatus === 'tentative') answers.tentative += 1;
    else if (a.responseStatus === 'declined') answers.declined += 1;
    else answers.needs_action += 1;
  }
  const meet = meetLink(e);
  const type = e.eventType ?? 'default';
  return {
    ...eventSummary(e),
    ...(withType || type !== 'default' ? { event_type: type } : {}),
    ...(e.start?.date ? { all_day: true } : {}),
    ...(e.organizer?.email ? { organizer: e.organizer.email } : {}),
    ...(self?.responseStatus ? { your_response: self.responseStatus } : {}),
    ...(guests.length ? { guests: answers } : {}),
    ...(meet ? { meet_link: meet } : {}),
    ...(e.recurringEventId ? { recurring_event_id: e.recurringEventId } : {}),
    ...(e.recurrence?.length ? { recurring: true } : {}),
    ...(e.visibility && e.visibility !== 'default' ? { visibility: e.visibility } : {}),
    ...(e.transparency === 'transparent' ? { availability: 'free' } : {}),
  };
}

/**
 * The time zone of a calendar, the zone its events are listed in (events.list timeZone): one request for that one field.
 * events.list takes the scopes every event tool has, so no new scope is needed.
 */
export async function calendarZone(api: CalendarApi, calendarId: string): Promise<string> {
  const res = await api.events.list({ calendarId, maxResults: 1, fields: 'timeZone' });
  const zone = res.data.timeZone;
  if (!zone) throw new Error('Google sent no time zone for it');
  return zone;
}

/**
 * The IANA zone a local time (no offset) is read in: time_zone when given (checked), else the calendar's own zone. When
 * the calendar's zone cannot be read, the error says to give time_zone or an offset; nothing has been changed then.
 */
async function zoneForLocal(api: CalendarApi, calendarId: string, timeZone: string | undefined, field: string): Promise<string> {
  if (timeZone !== undefined) {
    ianaZone(timeZone);
    return timeZone;
  }
  let zone: string;
  try {
    zone = await calendarZone(api, calendarId);
    ianaZone(zone);
  } catch (err) {
    throw new Error(
      `${field} is a local time without an offset, and the time zone of calendar ${calendarId} could not be read (${(err as Error).message}). Give time_zone (an IANA name such as Europe/Berlin) or a time with an offset. Nothing was changed.`,
    );
  }
  return zone;
}

/** The UTC instant of a time argument: RFC 3339 as written, a local time in the zone. */
function instantOf(value: string, zone: string | undefined, field: string): number {
  if (RFC3339_RE.test(value)) return Date.parse(value);
  if (!zone) throw new Error(`${field} is a local time without an offset; give time_zone.`);
  return localToUtc(value, ianaZone(zone), field);
}

/**
 * A date (YYYY-MM-DD) makes an all-day time; RFC 3339 with an offset a timed one, as before; a local time without an
 * offset (1.40.0) a timed one in the zone, as Calendar takes it (EventDateTime.dateTime: "A time zone offset is required
 * unless a time zone is explicitly specified in timeZone").
 */
function eventTime(value: string, timeZone: string | undefined, field: string): calendar_v3.Schema$EventDateTime {
  if (DATE_RE.test(value)) return { date: value };
  if (RFC3339_RE.test(value)) return { dateTime: value, timeZone };
  if (isLocalTime(value)) {
    if (!timeZone) throw new Error(`${field} is a local time without an offset; give time_zone.`);
    return { dateTime: localTimeText(value, field), timeZone };
  }
  throw new Error(`${field} must be YYYY-MM-DD (all-day), RFC 3339 with an offset, or a local time such as 2026-11-02T10:00, got "${value}".`);
}

/**
 * A note when a time has an offset that is not time_zone's offset at that moment: Calendar keeps the instant the offset
 * gives, so the event is not at that hour of time_zone's clock. Nothing when they agree or the zone is not known.
 */
function offsetNote(value: string, timeZone: string | undefined, field: string): string | undefined {
  if (!timeZone || !RFC3339_RE.test(value)) return undefined;
  let zone: Zone;
  try {
    zone = ianaZone(timeZone);
  } catch {
    return undefined;
  }
  const ms = Date.parse(value);
  const given = zoneOfTime(value);
  if (given.kind === 'fixed' && offsetAt(ms, zone) === given.minutes) return undefined;
  const offset = /(Z|[+-]\d{2}:\d{2})$/i.exec(value)?.[1]?.toUpperCase();
  return `${field} has the offset ${offset}, which is not the offset of ${timeZone} at that time: Calendar keeps the instant the offset gives, ${formatInZone(ms, zone)} in ${timeZone}. To use ${timeZone}'s clock, give the time without an offset.`;
}

function checkSameKind(start: string, end: string): void {
  if (DATE_RE.test(start) !== DATE_RE.test(end)) {
    throw new Error('start and end must both be dates (all-day) or both be RFC 3339 date-times.');
  }
}

/** RRULE, EXRULE, RDATE and EXDATE lines (RFC 5545), as Calendar takes them. */
const RECURRENCE_RE = /^(RRULE|EXRULE|RDATE|EXDATE)[:;]/i;

function checkRecurrence(lines: string[], start: string | undefined, timeZone: string | undefined): void {
  for (const line of lines) {
    if (!RECURRENCE_RE.test(line)) throw new Error(`recurrence lines start with RRULE:, EXRULE:, RDATE or EXDATE (RFC 5545), for example "RRULE:FREQ=WEEKLY;BYDAY=MO", got "${line}".`);
  }
  // Calendar expands a timed recurring event in the start's time zone, so it needs one (Event.start.timeZone). A local
  // start (no offset) always gets one: time_zone, else the calendar's zone.
  if (lines.length && start !== undefined && !DATE_RE.test(start) && !isLocalTime(start) && !timeZone) {
    throw new Error('A recurring event with a start time needs time_zone (an IANA name such as Europe/Berlin): Calendar expands the recurrence in that zone.');
  }
}

/** Reminders of an event: the given ones in place of the calendar's defaults (an empty list: none). */
function remindersOf(list: Array<{ method: 'email' | 'popup'; minutes: number }>): calendar_v3.Schema$Event['reminders'] {
  return { useDefault: false, overrides: list.map((r) => ({ method: r.method, minutes: r.minutes })) };
}

/** A new Google Meet conference for the event (conferenceDataVersion=1 must go with it). */
function meetRequest(): calendar_v3.Schema$ConferenceData {
  return { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
}

const sameEmail = (a: string | null | undefined, b: string): boolean => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The guest list after adding and removing addresses: the existing guests keep their entries (response status, optional
 * flag, comment), removed ones go, new ones are added once. Addresses compare without case.
 */
export function mergeAttendees(
  current: readonly calendar_v3.Schema$EventAttendee[],
  add: readonly string[],
  remove: readonly string[],
): { attendees: calendar_v3.Schema$EventAttendee[]; added: string[]; removed: string[]; notFound: string[] } {
  const both = add.filter((a) => remove.some((r) => sameEmail(a, r)));
  if (both.length) throw new Error(`An address cannot be both added and removed: ${both.join(', ')}.`);
  const removed: string[] = [];
  const notFound: string[] = [];
  for (const r of remove) {
    if (current.some((a) => sameEmail(a.email, r))) removed.push(r);
    else notFound.push(r);
  }
  const kept = current.filter((a) => !remove.some((r) => sameEmail(a.email, r)));
  const added: string[] = [];
  for (const email of add) {
    if (kept.some((a) => sameEmail(a.email, email)) || added.some((x) => sameEmail(x, email))) continue;
    added.push(email.trim());
  }
  return { attendees: [...kept, ...added.map((email) => ({ email }))], added, removed, notFound };
}

/** "There can be at most 25 attachments per event" (Discovery, Event.attachments). */
const MAX_ATTACHMENTS = 25;

/** A file attachment as the tools take it: a link to the file (a Drive file's link), with an optional title. */
type AttachmentArg = { file_url: string; title?: string };

function attachmentOf(a: AttachmentArg): calendar_v3.Schema$EventAttachment {
  let protocol = '';
  try {
    protocol = new URL(a.file_url).protocol;
  } catch {
    // Reported below.
  }
  if (protocol !== 'https:') throw new Error(`An attachment's file_url must be an https link, such as a Drive file's link (https://drive.google.com/file/d/<id>/view), got "${a.file_url}".`);
  return { fileUrl: a.file_url, ...(a.title !== undefined ? { title: a.title } : {}) };
}

/**
 * The attachments after adding and removing some (by link): the existing ones stay, removed ones go, new ones are added
 * once. Calendar allows at most 25 per event.
 */
export function mergeAttachments(
  current: readonly calendar_v3.Schema$EventAttachment[],
  add: readonly AttachmentArg[],
  remove: readonly string[],
): { attachments: calendar_v3.Schema$EventAttachment[]; notFound: string[] } {
  const notFound = remove.filter((url) => !current.some((a) => a.fileUrl === url));
  const kept = current.filter((a) => !remove.includes(a.fileUrl ?? ''));
  const added = add
    .map(attachmentOf)
    .filter((a, i, all) => !kept.some((k) => k.fileUrl === a.fileUrl) && all.findIndex((x) => x.fileUrl === a.fileUrl) === i);
  const attachments = [...kept, ...added];
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`An event can have at most ${MAX_ATTACHMENTS} attachments (Calendar); this change would give it ${attachments.length}.`);
  }
  return { attachments, notFound };
}

const calendarId = z.string().optional().describe('Calendar ID. Default "primary".');
const eventId = z.string().describe('Event ID, as returned by calendar_list_events.');
const sendUpdates = z
  .enum(['all', 'externalOnly', 'none'])
  .optional()
  .describe('Who gets invitation or change emails: all, externalOnly, or none. Default none.');
const recurrence = z
  .array(z.string())
  .optional()
  .describe("Recurrence lines (RFC 5545), for example [\"RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10\"]. A timed recurring event needs time_zone, or a local start time (it takes the calendar's zone).");
const reminders = z
  .array(z.object({ method: z.enum(['email', 'popup']), minutes: z.number().int().min(0).max(40320) }))
  .max(5)
  .optional()
  .describe("Reminders in place of the calendar's defaults, at most 5, minutes before the start (0 to 40320). An empty list: no reminders.");
const EVENT_TYPES = ['default', 'outOfOffice', 'focusTime', 'workingLocation', 'fromGmail', 'birthday'] as const;
const visibility = z
  .enum(['default', 'public', 'private', 'confidential'])
  .optional()
  .describe("Who sees the event's details: default (the calendar's setting), public, private (only the guests), confidential.");
const colorId = z
  .string()
  .regex(/^\d{1,2}$/, 'color_id is an event colour id such as "5"')
  .optional()
  .describe('Event colour, an id of the event palette: 1 Lavender, 2 Sage, 3 Grape, 4 Flamingo, 5 Banana, 6 Tangerine, 7 Peacock, 8 Graphite, 9 Blueberry, 10 Basil, 11 Tomato (calendar_colors_get lists them). It changes only your own view.');
const availability = z
  .enum(['busy', 'free'])
  .optional()
  .describe("busy blocks the time (Calendar's default); free shows you as available (Calendar's transparency transparent).");
const attachmentArg = z.object({
  file_url: z.string().describe("The file's link; for a Drive file, the link Drive shows (https://drive.google.com/file/d/<id>/view)."),
  title: z.string().optional().describe('The title shown for it.'),
});

/** Calendar's transparency for an availability argument. */
const transparencyOf = (a: 'busy' | 'free'): string => (a === 'free' ? 'transparent' : 'opaque');

/** An event's attachments as the tools return them. */
const attachmentsOut = (list: readonly calendar_v3.Schema$EventAttachment[]) => list.map((a) => ({ title: a.title, file_url: a.fileUrl, file_id: a.fileId }));

/** True when send_updates makes Google email guests or the organizer: such a call sends to other people. */
export const emailsPeople = (sendUpdates: string | undefined): boolean => sendUpdates === 'all' || sendUpdates === 'externalOnly';

/** The status event types calendar_create_event makes (Google: "only available on primary calendars"). */
const STATUS_TYPES = ['default', 'focusTime', 'outOfOffice', 'workingLocation'] as const;
const AUTO_DECLINE = ['declineNone', 'declineAllConflictingInvitations', 'declineOnlyNewConflictingInvitations'] as const;

interface StatusArgs {
  event_type?: (typeof STATUS_TYPES)[number];
  auto_decline?: (typeof AUTO_DECLINE)[number];
  decline_message?: string;
  chat_status?: 'available' | 'doNotDisturb';
  working_location?: { type: 'homeOffice' | 'officeLocation' | 'customLocation'; label?: string; building_id?: string; floor_id?: string; desk_id?: string };
  availability?: 'busy' | 'free';
  visibility?: string;
  start: string;
  end: string;
}

/**
 * The fields of a focus time, out of office or working location event, as Google's guide sets them
 * (https://developers.google.com/workspace/calendar/api/guides/calendar-status): focus time and out of office are timed
 * events that block time (transparency opaque) with their properties; a working location is public and transparent,
 * timed or one whole day. Arguments that do not fit the type are refused before any request. Without event_type: none.
 */
export function statusFields(a: StatusArgs): Partial<calendar_v3.Schema$Event> {
  const type = a.event_type ?? 'default';
  const decline = a.auto_decline !== undefined || a.decline_message !== undefined;
  if (type === 'default') {
    if (decline || a.chat_status !== undefined || a.working_location !== undefined) {
      throw new Error('auto_decline, decline_message, chat_status and working_location go with event_type focusTime, outOfOffice or workingLocation.');
    }
    return a.event_type === 'default' ? { eventType: 'default' } : {};
  }
  if (type === 'focusTime' || type === 'outOfOffice') {
    if (DATE_RE.test(a.start) || DATE_RE.test(a.end)) throw new Error(`A ${type} event has a start and an end time; it cannot be all-day (Google's guide).`);
    if (a.availability === 'free') throw new Error(`A ${type} event blocks time (Google's guide sets transparency opaque); leave availability out or give busy.`);
    if (a.working_location !== undefined) throw new Error('working_location goes with event_type workingLocation.');
    if (type === 'outOfOffice' && a.chat_status !== undefined) throw new Error('chat_status goes with event_type focusTime.');
    const props = {
      ...(a.auto_decline !== undefined ? { autoDeclineMode: a.auto_decline } : {}),
      ...(a.decline_message !== undefined ? { declineMessage: a.decline_message } : {}),
      ...(type === 'focusTime' && a.chat_status !== undefined ? { chatStatus: a.chat_status } : {}),
    };
    return type === 'focusTime'
      ? { eventType: 'focusTime', transparency: 'opaque', focusTimeProperties: props }
      : { eventType: 'outOfOffice', transparency: 'opaque', outOfOfficeProperties: props };
  }
  const where = a.working_location;
  if (!where) throw new Error('event_type workingLocation needs working_location (type homeOffice, officeLocation or customLocation).');
  if (decline || a.chat_status !== undefined) throw new Error('auto_decline, decline_message and chat_status go with focusTime or outOfOffice.');
  if (a.visibility !== undefined && a.visibility !== 'public') throw new Error("A working location event is public (Google's guide); leave visibility out or give public.");
  if (a.availability === 'busy') throw new Error("A working location event does not block time (Google's guide sets transparency transparent); leave availability out or give free.");
  if (DATE_RE.test(a.start) && daysBetween(a.start, a.end) !== 1) throw new Error('An all-day working location event spans exactly one day: end is the day after start.');
  if (where.type === 'homeOffice' && (where.label !== undefined || where.building_id !== undefined || where.floor_id !== undefined || where.desk_id !== undefined)) {
    throw new Error('label, building_id, floor_id and desk_id go with an officeLocation or customLocation working location.');
  }
  if (where.type === 'customLocation' && (where.building_id !== undefined || where.floor_id !== undefined || where.desk_id !== undefined)) {
    throw new Error('building_id, floor_id and desk_id go with an officeLocation working location.');
  }
  const place =
    where.type === 'homeOffice'
      ? { homeOffice: {} }
      : where.type === 'customLocation'
        ? { customLocation: { ...(where.label !== undefined ? { label: where.label } : {}) } }
        : {
            officeLocation: {
              ...(where.label !== undefined ? { label: where.label } : {}),
              ...(where.building_id !== undefined ? { buildingId: where.building_id } : {}),
              ...(where.floor_id !== undefined ? { floorId: where.floor_id } : {}),
              ...(where.desk_id !== undefined ? { deskId: where.desk_id } : {}),
            },
          };
  return { eventType: 'workingLocation', visibility: 'public', transparency: 'transparent', workingLocationProperties: { type: where.type, ...place } };
}

/**
 * The end of an event whose start moves and whose end is not given, keeping its duration, as Google's update_event does
 * ("Preserves duration if updating only start"). An all-day event keeps its number of days; a timed one its length, the
 * end written as the start is (with the start's offset, or as a local time in the same zone).
 */
export function keptEnd(current: calendar_v3.Schema$Event, start: string, zone: string | undefined): { end: calendar_v3.Schema$EventDateTime; kept: string } {
  const s = current.start;
  const e = current.end;
  if (DATE_RE.test(start)) {
    if (!s?.date || !e?.date) throw new Error('start is a date (all-day), but the event has start and end times; give end too.');
    const days = daysBetween(s.date, e.date);
    return { end: { date: addDays(start, days) }, kept: `${days} day(s)` };
  }
  if (!s?.dateTime || !e?.dateTime) throw new Error('start is a date and time, but the event is all-day; give end too.');
  const length = Date.parse(e.dateTime) - Date.parse(s.dateTime);
  const endMs = instantOf(start, zone, 'start') + length;
  const end = RFC3339_RE.test(start)
    ? { dateTime: formatWithOffset(endMs, zoneOfTime(start)), timeZone: zone }
    : { dateTime: formatLocal(endMs, ianaZone(zone as string)), timeZone: zone };
  return { end, kept: `${Math.round(length / 60000)} minute(s)` };
}

/**
 * What the approval of calendar_delete_event shows (1.27.0): the event read first (a read, it changes nothing), with its
 * title, time, organizer and number of guests, and whether the ID is a single event, one occurrence of a recurring
 * event, or the whole series. When the event cannot be read, the ids and the reason; the delete then runs as asked.
 */
export async function deletePreview(
  api: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  sendUpdates: string | undefined,
): Promise<Record<string, unknown>> {
  const base = { calendar_id: calendarId, event_id: eventId, send_updates: sendUpdates ?? 'none' };
  let e: calendar_v3.Schema$Event;
  try {
    e = (await api.events.get({ calendarId, eventId })).data;
  } catch (err) {
    return { ...base, note: `The event could not be read first, so only its ids are shown: ${(err as Error).message}` };
  }
  const guests = (e.attendees ?? []).filter((a) => !a.self && !a.resource).length;
  const scope = e.recurrence?.length
    ? 'the whole recurring series: every occurrence'
    : e.recurringEventId
      ? `one occurrence of a recurring event (series ${e.recurringEventId}); the other occurrences stay`
      : 'one event';
  return {
    ...base,
    title: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    deletes: scope,
    ...(e.organizer?.email ? { organizer: e.organizer.email } : {}),
    guests,
    effect:
      emailsPeople(sendUpdates) && guests > 0
        ? `Deletes it, and Google emails a cancellation to ${sendUpdates === 'externalOnly' ? 'the guests outside your organization' : `the ${guests} guest(s)`}.`
        : 'Deletes it. Nobody is emailed.',
  };
}

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const calendarApi = async () => calendar({ version: 'v3', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'calendar_list_calendars',
      title: 'List calendars',
      description:
        "List calendars in the account list, with id, summary, primary flag, access role and time zone (matches list_calendars in Google's Calendar MCP server). Use an id as calendar_id in the other tools. Up to 250 a page (Google's most); when there are more, or when the call pages, the answer is { next_page_token, calendars } and page_token reads on.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.calendarlist', 'calendar.calendarlist.readonly', 'calendar.readonly'),
      inputSchema: {
        page_size: z.number().int().min(1).max(250).optional().describe("Calendars per page, 1 to 250 (Google's most). Default 250."),
        page_token: z.string().optional().describe('next_page_token from the previous call.'),
      },
      async handler({ page_size, page_token }) {
        const api = await calendarApi();
        const res = await api.calendarList.list({ maxResults: page_size ?? 250, ...(page_token !== undefined ? { pageToken: page_token } : {}) });
        const calendars = (res.data.items ?? []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary ?? false,
          access_role: c.accessRole,
          time_zone: c.timeZone,
        }));
        // The plain list, as before 1.40.0, unless the call pages or Google has another page (before, it was dropped).
        if (page_size === undefined && page_token === undefined && !res.data.nextPageToken) return calendars;
        return { next_page_token: res.data.nextPageToken ?? undefined, calendars };
      },
    }),
    defineTool({
      name: 'calendar_list_events',
      title: 'List calendar events',
      description:
        "List events, earliest first (matches list_events in Google's Calendar MCP server; q is the keyword search that stands in for its search_events, which is a semantic search with no public API). Recurring events are expanded into instances by default. Without time_min the list starts now; Google's server sets no lower bound unless asked, which include_past does here. time_min and time_max may be local times without an offset, read in time_zone, else in the calendar's zone. event_types filters by type (Google's default is default, outOfOffice, focusTime and fromGmail). Each event also says what it has beyond its time: event_type when not a default event, all_day, organizer, your_response (when you are a guest), guests (the answers counted), meet_link, recurring_event_id (an occurrence of a series), visibility when not default, availability free when it does not block time; calendar_get_event has the details.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events', 'calendar.events.readonly', 'calendar.readonly'),
      inputSchema: {
        calendar_id: calendarId,
        time_min: timeArg('time_min').optional().describe('Start of range: RFC 3339, or a local time without an offset. Default: now (or no lower bound with include_past).'),
        time_max: timeArg('time_max').optional().describe('End of range: RFC 3339, or a local time without an offset. Default: no end.'),
        q: z.string().optional().describe('Free-text search over events: title, description, location and attendees. Every word must match.'),
        max_results: z.number().int().min(1).max(250).optional().describe('1 to 250. Default 50. A page larger than the result limit is cut at whole events; ask for fewer.'),
        single_events: z.boolean().optional().describe('Expand recurring events into instances. Default true.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
        include_past: z
          .boolean()
          .optional()
          .describe('When time_min is not given: true lists from the earliest event (no lower bound), as Google\'s list_events does. Default false: from now.'),
        event_types: z.array(z.enum(EVENT_TYPES)).optional().describe('Only these event types. Each event then carries its event_type.'),
        time_zone: z
          .string()
          .optional()
          .describe("IANA time zone for the times in the answer, and for time_min and time_max without an offset, for example Europe/Zurich. Default: the calendar's."),
        order_by: z
          .enum(['startTime', 'updated'])
          .optional()
          .describe('startTime (needs single_events, the default) or updated (last modification, ascending). Default: startTime when single_events is on, else unordered.'),
      },
      async handler({ calendar_id, time_min, time_max, q, max_results, single_events, page_token, include_past, event_types, time_zone, order_by }) {
        const expand = single_events ?? true;
        if (order_by === 'startTime' && !expand) throw new Error('order_by startTime needs single_events (Calendar orders by start time only when recurring events are expanded).');
        if (time_zone !== undefined) ianaZone(time_zone);
        const api = await calendarApi();
        const id = calendar_id ?? PRIMARY;
        // A local time (no offset) is read in time_zone, else in the calendar's zone. Calendar takes timeMin and timeMax
        // only with an offset, so it is sent as a UTC instant.
        const localMin = time_min !== undefined && isLocalTime(time_min);
        const localMax = time_max !== undefined && isLocalTime(time_max);
        const zone = localMin || localMax ? await zoneForLocal(api, id, time_zone, localMin ? 'time_min' : 'time_max') : time_zone;
        const bound = (value: string | undefined, field: string) =>
          value === undefined ? undefined : isLocalTime(value) ? new Date(instantOf(value, zone, field)).toISOString() : value;
        const res = await api.events.list({
          calendarId: id,
          timeMin: bound(time_min, 'time_min') ?? (include_past === true ? undefined : new Date().toISOString()),
          timeMax: bound(time_max, 'time_max'),
          q,
          maxResults: max_results ?? 50,
          singleEvents: expand,
          // startTime ordering is only allowed when recurring events are expanded.
          orderBy: order_by ?? (expand ? 'startTime' : undefined),
          pageToken: page_token,
          ...(event_types?.length ? { eventTypes: event_types } : {}),
          ...(time_zone !== undefined ? { timeZone: time_zone } : {}),
        });
        const withType = Boolean(event_types?.length);
        return {
          events: (res.data.items ?? []).map((e) => listItem(e, withType)),
          time_zone: res.data.timeZone,
          next_page_token: res.data.nextPageToken ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'calendar_get_event',
      title: 'Get calendar event',
      description:
        "Read one event (matches get_event in Google's Calendar MCP server): description, organizer, creator, attendees and their responses, the Google Meet link, attachments, reminders, recurrence, event type, visibility, availability and colour.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events', 'calendar.events.readonly', 'calendar.readonly'),
      inputSchema: { calendar_id: calendarId, event_id: eventId },
      async handler({ calendar_id, event_id }) {
        const api = await calendarApi();
        const res = await api.events.get({ calendarId: calendar_id ?? PRIMARY, eventId: event_id });
        const e = res.data;
        return {
          ...eventSummary(e),
          description: e.description,
          organizer: e.organizer?.email,
          attendees: (e.attendees ?? []).slice(0, 100).map((a) => ({
            email: a.email,
            response_status: a.responseStatus,
            optional: a.optional ?? false,
            organizer: a.organizer ?? false,
          })),
          attendees_total: e.attendees?.length ?? 0,
          hangout_link: e.hangoutLink,
          recurrence: e.recurrence,
          // Added in 1.8.0 (Google's get_event returns these).
          event_type: e.eventType ?? 'default',
          meet_link: meetLink(e) ?? null,
          creator: e.creator?.email,
          visibility: e.visibility ?? 'default',
          availability: e.transparency === 'transparent' ? 'free' : 'busy',
          reminders: e.reminders
            ? { use_default: e.reminders.useDefault ?? false, overrides: (e.reminders.overrides ?? []).map((r) => ({ method: r.method, minutes: r.minutes })) }
            : null,
          attachments: (e.attachments ?? []).map((a) => ({ title: a.title, file_url: a.fileUrl, file_id: a.fileId, mime_type: a.mimeType })),
          recurring_event_id: e.recurringEventId ?? undefined,
          // 1.40.0: the colour create and update set (absent when the event has the calendar's colour).
          ...(e.colorId ? { color_id: e.colorId } : {}),
        };
      },
    }),
    defineTool({
      name: 'calendar_freebusy',
      title: 'Check free/busy',
      description:
        "Return busy periods for one or more calendars in a time range. Event titles are not included. time_min and time_max may be local times without an offset, read in time_zone, else in your primary calendar's zone.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events.freebusy', 'calendar.freebusy', 'calendar.readonly'),
      inputSchema: {
        time_min: timeArg('time_min'),
        time_max: timeArg('time_max'),
        calendar_ids: z.array(z.string()).optional().describe('Calendar IDs. Default ["primary"].'),
        time_zone: z
          .string()
          .optional()
          .describe("IANA time zone for time_min and time_max without an offset, and for the busy periods in the answer (Google's default: UTC), for example Europe/Berlin."),
      },
      async handler({ time_min, time_max, calendar_ids, time_zone }) {
        if (time_zone !== undefined) ianaZone(time_zone);
        const api = await calendarApi();
        const local = isLocalTime(time_min) || isLocalTime(time_max);
        const zone = local ? await zoneForLocal(api, PRIMARY, time_zone, isLocalTime(time_min) ? 'time_min' : 'time_max') : time_zone;
        const bound = (value: string, field: string) => (isLocalTime(value) ? new Date(instantOf(value, zone, field)).toISOString() : value);
        const items = (calendar_ids?.length ? calendar_ids : [PRIMARY]).map((id) => ({ id }));
        const res = await api.freebusy.query({
          requestBody: { timeMin: bound(time_min, 'time_min'), timeMax: bound(time_max, 'time_max'), items, ...(time_zone !== undefined ? { timeZone: time_zone } : {}) },
        });
        const calendars = Object.fromEntries(
          Object.entries(res.data.calendars ?? {}).map(([id, c]) => [
            id,
            {
              busy: (c.busy ?? []).map((b) => ({ start: b.start, end: b.end })),
              errors: (c.errors ?? []).map((e) => e.reason ?? 'unknown'),
            },
          ]),
        );
        return { time_min, time_max, calendars };
      },
    }),
    defineTool({
      name: 'calendar_suggest_time',
      title: 'Suggest meeting times',
      description:
        "Find times when everyone is free (matches suggest_time in Google's Calendar MCP server). Reads the free/busy periods of the attendees' calendars (and yours, unless include_primary is false) in the window, removes them, and returns the free periods long enough for the meeting, with one suggested meeting time per free period. working_hours and weekdays_only limit the search to those hours, in time_zone. start_time and end_time may be local times without an offset, read in time_zone, else in your primary calendar's zone. A calendar Google cannot show (not shared, or outside your organisation) is listed under unavailable, and its busy time is not counted. Then create the event with calendar_create_event.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events.freebusy', 'calendar.freebusy', 'calendar.readonly'),
      inputSchema: {
        attendees: z.array(z.string()).min(1).max(50).describe('Email addresses or calendar IDs of the people to meet (Google answers for at most 50 calendars).'),
        start_time: timeArg('start_time').describe('Start of the search window: RFC 3339 with an offset, or a local time without one.'),
        end_time: timeArg('end_time').describe('End of the search window: RFC 3339 with an offset, or a local time without one.'),
        duration_minutes: z.number().int().min(1).max(1440).optional().describe('Length of the meeting in minutes. Default 30.'),
        time_zone: z
          .string()
          .optional()
          .describe("IANA time zone for working_hours, the answer, and start_time and end_time without an offset, for example Europe/Zurich. Default: the offset of start_time; for a local start_time, your primary calendar's zone."),
        working_hours: z
          .object({ start: z.string().describe('HH:MM, for example 09:00'), end: z.string().describe('HH:MM, for example 17:00') })
          .optional()
          .describe('Only suggest times inside these hours of each day, in time_zone. Default: any time of day.'),
        weekdays_only: z.boolean().optional().describe('Skip Saturdays and Sundays (in time_zone). Default false.'),
        include_primary: z.boolean().optional().describe('Also count your primary calendar. Default true.'),
        max_suggestions: z.number().int().min(1).max(50).optional().describe('How many meeting times to suggest, 1 to 50. Default 5.'),
      },
      async handler({ attendees, start_time, end_time, duration_minutes, time_zone, working_hours, weekdays_only, include_primary, max_suggestions }) {
        const local = isLocalTime(start_time) || isLocalTime(end_time);
        // Checked before any request, as before; a local time is compared once its zone is known.
        if (!local && !(Date.parse(end_time) > Date.parse(start_time))) throw new Error('end_time must be after start_time.');
        if (time_zone !== undefined) ianaZone(time_zone);
        const hours = working_hours ? { start: minuteOfDay(working_hours.start, 'working_hours.start'), end: minuteOfDay(working_hours.end, 'working_hours.end') } : undefined;
        if (hours && hours.end <= hours.start) throw new Error('working_hours.end must be after working_hours.start on the same day.');
        const ids = [...new Set(attendees.map((a) => a.trim()).filter(Boolean))];
        if (include_primary !== false && !ids.includes(PRIMARY)) ids.unshift(PRIMARY);
        if (ids.length > 50) throw new Error('Google answers free/busy for at most 50 calendars at once.');

        const api = await calendarApi();
        const localZone = local ? await zoneForLocal(api, PRIMARY, time_zone, isLocalTime(start_time) ? 'start_time' : 'end_time') : undefined;
        const from = instantOf(start_time, localZone, 'start_time');
        const to = instantOf(end_time, localZone, 'end_time');
        if (!(to > from)) throw new Error('end_time must be after start_time.');
        const zone: Zone =
          time_zone !== undefined ? ianaZone(time_zone) : localZone !== undefined && isLocalTime(start_time) ? ianaZone(localZone) : zoneOfTime(start_time);
        const res = await api.freebusy.query({ requestBody: { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), items: ids.map((id) => ({ id })) } });
        const busy: Interval[] = [];
        const unavailable: Array<{ calendar: string; reason: string }> = [];
        for (const [id, c] of Object.entries(res.data.calendars ?? {})) {
          if (c.errors?.length) unavailable.push({ calendar: id, reason: c.errors.map((e) => e.reason ?? 'unknown').join(', ') });
          for (const b of c.busy ?? []) if (b.start && b.end) busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
        }
        const duration = duration_minutes ?? 30;
        const slots = freeSlots({ from, to, busy, durationMinutes: duration, zone, workingHours: hours, weekdaysOnly: weekdays_only === true, stepMinutes: 15, maxSuggestions: max_suggestions ?? 5 });
        const show = (i: Interval) => ({ start: formatInZone(i.start, zone), end: formatInZone(i.end, zone) });
        const periods = slots.periods.slice(0, 100);
        return {
          time_zone: zone.kind === 'iana' ? zone.name : formatInZone(from, zone).slice(19),
          duration_minutes: duration,
          calendars: ids,
          suggestions: slots.suggestions.map(show),
          free_periods: periods.map((p) => ({ ...show(p), minutes: Math.round((p.end - p.start) / 60000) })),
          ...(slots.periods.length > periods.length ? { free_periods_total: slots.periods.length } : {}),
          ...(unavailable.length ? { unavailable, note: 'The busy time of the unavailable calendars is not counted.' } : {}),
        };
      },
    }),

    // ---- write ----
    defineTool({
      name: 'calendar_create_event',
      title: 'Create calendar event',
      description:
        "Create an event (matches create_event in Google's Calendar MCP server). start and end are RFC 3339 date-times with an offset, local date-times without one (read in time_zone, else in the calendar's time zone), or YYYY-MM-DD for an all-day event. add_meet adds a Google Meet link; recurrence makes it repeat (RRULE lines); reminders replace the calendar's defaults; visibility, color_id, availability and attachments (links to files) as in Google's tool. event_type makes a focus time, out of office or working location event, on your primary calendar (Google: these are available on primary calendars and to some users). Invitations go out only if send_updates says so; a call that emails invitations to attendees asks as a destructive action.",
      kind: 'write',
      // Invitations emailed to the attendees are a send to other people (the destructive rule).
      destructiveWhen: ({ send_updates, attendees }) => emailsPeople(send_updates) && (attendees?.length ?? 0) > 0,
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: {
        calendar_id: calendarId,
        summary: z.string(),
        start: z.string().describe('RFC 3339 date-time with offset, a local date-time without one (2026-11-02T10:00), or YYYY-MM-DD for all-day'),
        end: z.string().describe('RFC 3339 date-time with offset, a local date-time without one, or YYYY-MM-DD for all-day (end date is exclusive for all-day)'),
        time_zone: z
          .string()
          .optional()
          .describe("IANA time zone, for example Europe/Berlin: the event's zone, and the zone of start and end without an offset (default for those: the calendar's zone)."),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional().describe('Guest email addresses'),
        send_updates: sendUpdates,
        add_meet: z.boolean().optional().describe('Create a Google Meet link for the event. Default false.'),
        recurrence,
        reminders,
        visibility,
        color_id: colorId,
        availability,
        attachments: z
          .array(attachmentArg)
          .max(MAX_ATTACHMENTS)
          .optional()
          .describe('Files to attach, as links (at most 25). Attaching does not share a Drive file with the guests; share it in Drive.'),
        event_type: z
          .enum(STATUS_TYPES)
          .optional()
          .describe('default (a normal event), focusTime, outOfOffice or workingLocation, on your primary calendar. focusTime and outOfOffice have start and end times and block time; workingLocation needs working_location, is public and free, timed or one whole day.'),
        auto_decline: z
          .enum(AUTO_DECLINE)
          .optional()
          .describe('focusTime and outOfOffice: decline invitations that overlap: declineNone, declineAllConflictingInvitations or declineOnlyNewConflictingInvitations.'),
        decline_message: z.string().optional().describe('focusTime and outOfOffice: the message sent with an automatic decline.'),
        chat_status: z.enum(['available', 'doNotDisturb']).optional().describe('focusTime: your status in Chat during it.'),
        working_location: z
          .object({
            type: z.enum(['homeOffice', 'officeLocation', 'customLocation']),
            label: z.string().optional().describe('officeLocation: the office name shown; customLocation: the place.'),
            building_id: z.string().optional().describe("officeLocation: a building id of your organization's resources."),
            floor_id: z.string().optional(),
            desk_id: z.string().optional(),
          })
          .optional()
          .describe('workingLocation: where you work.'),
      },
      async handler({
        calendar_id,
        summary,
        start,
        end,
        time_zone,
        description,
        location,
        attendees,
        send_updates,
        add_meet,
        recurrence: rules,
        reminders: alarms,
        visibility: shown,
        color_id,
        availability: free,
        attachments,
        event_type,
        auto_decline,
        decline_message,
        chat_status,
        working_location,
      }) {
        checkSameKind(start, end);
        if (rules !== undefined) checkRecurrence(rules, start, time_zone);
        const status = statusFields({ event_type, auto_decline, decline_message, chat_status, working_location, availability: free, visibility: shown, start, end });
        const files = attachments?.length ? attachments.map(attachmentOf) : undefined;
        const api = await calendarApi();
        const id = calendar_id ?? PRIMARY;
        const zone = isLocalTime(start) || isLocalTime(end) ? await zoneForLocal(api, id, time_zone, isLocalTime(start) ? 'start' : 'end') : time_zone;
        const notes = [offsetNote(start, time_zone, 'start'), offsetNote(end, time_zone, 'end')].filter((n): n is string => n !== undefined);
        const res = await api.events.insert({
          calendarId: id,
          sendUpdates: send_updates ?? 'none',
          ...(add_meet === true ? { conferenceDataVersion: 1 } : {}),
          ...(files ? { supportsAttachments: true } : {}),
          requestBody: {
            summary,
            description,
            location,
            start: eventTime(start, zone, 'start'),
            end: eventTime(end, zone, 'end'),
            attendees: attendees?.length ? attendees.map((email) => ({ email })) : undefined,
            ...(rules?.length ? { recurrence: rules } : {}),
            ...(alarms !== undefined ? { reminders: remindersOf(alarms) } : {}),
            ...(add_meet === true ? { conferenceData: meetRequest() } : {}),
            ...(shown !== undefined ? { visibility: shown } : {}),
            ...(color_id !== undefined ? { colorId: color_id } : {}),
            ...(free !== undefined ? { transparency: transparencyOf(free) } : {}),
            ...(files ? { attachments: files } : {}),
            ...status,
          },
        });
        const e = res.data;
        return {
          ...eventSummary(e),
          ...(add_meet === true ? { meet_link: meetLink(e) ?? null, meet_status: e.conferenceData?.createRequest?.status?.statusCode ?? null } : {}),
          ...(rules?.length ? { recurrence: e.recurrence ?? rules } : {}),
          // What the 1.40.0 arguments set, only when they were given, so a 1.7.0 call gets the same answer.
          ...(event_type !== undefined ? { event_type: e.eventType ?? event_type } : {}),
          ...(shown !== undefined || status.visibility ? { visibility: e.visibility ?? shown ?? status.visibility } : {}),
          ...(color_id !== undefined ? { color_id: e.colorId ?? color_id } : {}),
          ...(free !== undefined ? { availability: (e.transparency ?? transparencyOf(free)) === 'transparent' ? 'free' : 'busy' } : {}),
          ...(files ? { attachments: attachmentsOut(e.attachments ?? files) } : {}),
          ...(notes.length ? { time_note: notes.join(' ') } : {}),
        };
      },
    }),
    defineTool({
      name: 'calendar_update_event',
      title: 'Update calendar event',
      description:
        "Change only the fields given (events.patch; matches update_event in Google's Calendar MCP server). If start is given without end, the event keeps its duration (the end moves with it), as Google's does. start and end may be local date-times without an offset, read in time_zone, else in the event's or the calendar's zone. add_attendees and remove_attendees change the guest list and keep the other guests and their responses; attendees, if given, replaces the whole guest list instead. add_attachments and remove_attachments change the attached files and keep the others. add_meet adds a Google Meet link when the event has none. recurrence and reminders replace the old ones. Invitations go out only if send_updates says so; a call that emails the guests asks as a destructive action.",
      kind: 'write',
      // Google's update_event is marked idempotent.
      idempotent: true,
      // Change emails to the guests are a send to other people (the destructive rule).
      destructiveWhen: ({ send_updates }) => emailsPeople(send_updates),
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: {
        calendar_id: calendarId,
        event_id: eventId,
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional().describe('RFC 3339 date-time with offset, a local date-time without one, or YYYY-MM-DD. Without end, the event keeps its duration.'),
        end: z.string().optional().describe('RFC 3339 date-time with offset, a local date-time without one, or YYYY-MM-DD'),
        time_zone: z
          .string()
          .optional()
          .describe("IANA time zone for start and end, for example Europe/Berlin; without an offset they are read in it (default: the event's zone, else the calendar's). Used only with start or end."),
        attendees: z.array(z.string()).optional().describe('Full guest email list; replaces the existing one'),
        send_updates: sendUpdates,
        add_attendees: z.array(z.string()).optional().describe('Guests to add; the existing guests stay. Not with attendees.'),
        remove_attendees: z.array(z.string()).optional().describe('Guests to remove, by email; the others stay. Not with attendees.'),
        add_meet: z.boolean().optional().describe('Add a Google Meet link, unless the event already has one.'),
        recurrence,
        reminders,
        visibility,
        color_id: colorId,
        availability,
        add_attachments: z.array(attachmentArg).max(MAX_ATTACHMENTS).optional().describe('Files to attach, as links; the attached ones stay (at most 25 in all).'),
        remove_attachments: z.array(z.string()).optional().describe('Attached files to remove, by their file_url (calendar_get_event lists them).'),
      },
      async handler({
        calendar_id,
        event_id,
        summary,
        description,
        location,
        start,
        end,
        time_zone,
        attendees,
        send_updates,
        add_attendees,
        remove_attendees,
        add_meet,
        recurrence: rules,
        reminders: alarms,
        visibility: shown,
        color_id,
        availability: free,
        add_attachments,
        remove_attachments,
      }) {
        if (start !== undefined && end !== undefined) checkSameKind(start, end);
        const changesGuests = (add_attendees?.length ?? 0) + (remove_attendees?.length ?? 0) > 0;
        if (attendees !== undefined && changesGuests) {
          throw new Error('Give attendees (the whole new list) or add_attendees / remove_attendees (changes to the list), not both.');
        }
        if (rules !== undefined) checkRecurrence(rules, start, time_zone);
        const changesFiles = (add_attachments?.length ?? 0) + (remove_attachments?.length ?? 0) > 0;
        // Checked before any request: each new link is an https link.
        if (add_attachments?.length) add_attachments.forEach(attachmentOf);
        const patch: calendar_v3.Schema$Event = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (attendees !== undefined) patch.attendees = attendees.map((email) => ({ email }));
        if (rules !== undefined) patch.recurrence = rules;
        if (alarms !== undefined) patch.reminders = remindersOf(alarms);
        if (shown !== undefined) patch.visibility = shown;
        if (color_id !== undefined) patch.colorId = color_id;
        if (free !== undefined) patch.transparency = transparencyOf(free);
        const movesTimes = start !== undefined || end !== undefined;
        if (!Object.keys(patch).length && !movesTimes && !changesGuests && !changesFiles && add_meet !== true) {
          throw new Error(
            'calendar_update_event has nothing to change. Pass at least one of summary, description, location, start, end, attendees, add_attendees, remove_attendees, add_meet, recurrence, reminders, visibility, color_id, availability, add_attachments, remove_attachments (time_zone applies to start and end).',
          );
        }
        const local = (start !== undefined && isLocalTime(start)) || (end !== undefined && isLocalTime(end));
        if (local && time_zone !== undefined) ianaZone(time_zone);
        const keepsDuration = start !== undefined && end === undefined;
        const api = await calendarApi();
        const id = calendar_id ?? PRIMARY;
        // The event as it is: to keep the other guests and their responses, the other attachments, a Meet link (none is
        // added twice), the duration when only start moves, and the zone of a local time.
        const needsCurrent = changesGuests || add_meet === true || changesFiles || keepsDuration || (local && time_zone === undefined);
        const current = needsCurrent ? (await api.events.get({ calendarId: id, eventId: event_id })).data : undefined;
        const zone = local ? (time_zone ?? current?.start?.timeZone ?? (await zoneForLocal(api, id, undefined, start !== undefined && isLocalTime(start) ? 'start' : 'end'))) : time_zone;
        const notes = [start !== undefined ? offsetNote(start, time_zone, 'start') : undefined, end !== undefined ? offsetNote(end, time_zone, 'end') : undefined].filter(
          (n): n is string => n !== undefined,
        );
        if (time_zone !== undefined && !movesTimes) notes.push('time_zone was not used: it applies to start and end, and neither was given.');
        if (start !== undefined) patch.start = eventTime(start, zone, 'start');
        if (end !== undefined) patch.end = eventTime(end, zone, 'end');
        let kept: string | undefined;
        if (keepsDuration && current) {
          const moved = keptEnd(current, start as string, zone);
          patch.end = moved.end;
          kept = moved.kept;
        }
        let guestChange: ReturnType<typeof mergeAttendees> | undefined;
        let fileChange: ReturnType<typeof mergeAttachments> | undefined;
        let meetExisting: string | undefined;
        if (current) {
          if (changesGuests) {
            guestChange = mergeAttendees(current.attendees ?? [], add_attendees ?? [], remove_attendees ?? []);
            patch.attendees = guestChange.attendees;
          }
          if (changesFiles) {
            fileChange = mergeAttachments(current.attachments ?? [], add_attachments ?? [], remove_attachments ?? []);
            patch.attachments = fileChange.attachments;
          }
          if (add_meet === true) {
            meetExisting = meetLink(current);
            if (!meetExisting) patch.conferenceData = meetRequest();
          }
          if (!Object.keys(patch).length) return { ...eventSummary(current), meet_link: meetExisting ?? null, changed: false, note: 'The event already has a Google Meet link; nothing was changed.' };
        }
        const res = await api.events.patch({
          calendarId: id,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
          ...(patch.conferenceData ? { conferenceDataVersion: 1 } : {}),
          ...(changesFiles ? { supportsAttachments: true } : {}),
          requestBody: patch,
        });
        const e = res.data;
        return {
          ...eventSummary(e),
          ...(guestChange
            ? {
                attendees_added: guestChange.added,
                attendees_removed: guestChange.removed,
                ...(guestChange.notFound.length ? { not_guests: guestChange.notFound } : {}),
                attendees_total: e.attendees?.length ?? guestChange.attendees.length,
              }
            : {}),
          ...(add_meet === true ? { meet_link: meetLink(e) ?? meetExisting ?? null } : {}),
          // What the 1.40.0 arguments changed, only when they were given, so a 1.7.0 call gets the same answer.
          ...(kept !== undefined ? { duration_kept: kept } : {}),
          ...(shown !== undefined ? { visibility: e.visibility ?? shown } : {}),
          ...(color_id !== undefined ? { color_id: e.colorId ?? color_id } : {}),
          ...(free !== undefined ? { availability: (e.transparency ?? transparencyOf(free)) === 'transparent' ? 'free' : 'busy' } : {}),
          ...(fileChange
            ? { attachments: attachmentsOut(e.attachments ?? fileChange.attachments), ...(fileChange.notFound.length ? { not_attached: fileChange.notFound } : {}) }
            : {}),
          ...(notes.length ? { time_note: notes.join(' ') } : {}),
        };
      },
    }),
    defineTool({
      name: 'calendar_respond',
      title: 'Respond to an invitation',
      description:
        "Answer an invitation as the signed-in guest: accepted, declined or tentative, with an optional comment (matches respond_to_event in Google's Calendar MCP server). Only your own response changes; the other guests are not sent back. The organizer is emailed only if send_updates says so; a call that emails asks as a destructive action.",
      kind: 'write',
      // Google's respond_to_event is marked idempotent.
      idempotent: true,
      // An answer emailed to the organizer is a send to another person (the destructive rule).
      destructiveWhen: ({ send_updates }) => emailsPeople(send_updates),
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: {
        calendar_id: calendarId,
        event_id: eventId,
        response: z.enum(['accepted', 'declined', 'tentative']).describe('Your answer.'),
        comment: z.string().optional().describe('A note to the organizer with your answer.'),
        send_updates: sendUpdates,
      },
      async handler({ calendar_id, event_id, response, comment, send_updates }) {
        const api = await calendarApi();
        const id = calendar_id ?? PRIMARY;
        const current = (await api.events.get({ calendarId: id, eventId: event_id })).data;
        const self = (current.attendees ?? []).find((a) => a.self);
        if (!self?.email) {
          throw new Error(`You are not a guest of event ${event_id} on calendar ${id} (no guest entry is yours), so there is nothing to answer. calendar_get_event shows the guests.`);
        }
        // attendeesOmitted with only your own entry updates only your response (Event.attendeesOmitted in the Calendar API).
        const res = await api.events.patch({
          calendarId: id,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
          requestBody: { attendeesOmitted: true, attendees: [{ email: self.email, responseStatus: response, ...(comment !== undefined ? { comment } : {}) }] },
        });
        const mine = (res.data.attendees ?? []).find((a) => a.self || sameEmail(a.email, self.email as string));
        return {
          ...eventSummary(res.data),
          you: self.email,
          previous_response: self.responseStatus ?? null,
          response: mine?.responseStatus ?? response,
          ...(comment !== undefined ? { comment } : {}),
        };
      },
    }),

    // ---- destructive (asks for approval before each call) ----
    defineTool({
      name: 'calendar_delete_event',
      title: 'Delete calendar event',
      description:
        "Delete an event from a calendar (matches delete_event in Google's Calendar MCP server). The event ID of one occurrence deletes that occurrence; the ID of a recurring event deletes the whole series. It asks first, and the approval shows the event's title and time and whether it is one event, one occurrence or a whole series. Guests are notified only if send_updates says so.",
      kind: 'destructive',
      // One DELETE (events.delete); Google's delete_event is marked idempotent too.
      idempotent: true,
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: { calendar_id: calendarId, event_id: eventId, send_updates: sendUpdates },
      async prepare({ calendar_id, event_id, send_updates }) {
        return { preview: await deletePreview(await calendarApi(), calendar_id ?? PRIMARY, event_id, send_updates) };
      },
      async preview({ calendar_id, event_id, send_updates }) {
        const api = await calendarApi();
        const res = await api.events.get({ calendarId: calendar_id ?? PRIMARY, eventId: event_id });
        return {
          event_id,
          summary: res.data.summary,
          start: res.data.start?.dateTime ?? res.data.start?.date,
          send_updates: send_updates ?? 'none',
          effect: 'Deletes the event from this calendar.',
        };
      },
      async handler({ calendar_id, event_id, send_updates }) {
        const api = await calendarApi();
        await api.events.delete({
          calendarId: calendar_id ?? PRIMARY,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
        });
        return { deleted: true, event_id };
      },
    }),
  ];
}
