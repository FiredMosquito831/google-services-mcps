/**
 * Curated Calendar tools (calendar_*), served by the workspace-user server (MCP name "gws-user").
 * Read: list calendars, list events, get event, free/busy, suggest times. Write: create event, update event, respond.
 * Destructive: delete event (asks for approval first). A create, update or respond call that emails guests or the
 * organizer (send_updates all or externalOnly) sends to other people, so that call is gated as destructive
 * (destructiveWhen; the destructive rule, docs/SECURITY.md).
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
import { formatInZone, freeSlots, ianaZone, minuteOfDay, zoneOfTime, type Interval, type Zone } from './calendar-time.js';

type Auth = OAuth2Client | JWT;

// The account is chosen per call (see account-context.ts), so the client is not cached here.
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('workspace-user', cfg);
}

const PRIMARY = 'primary';
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const rfc3339 = (field: string) =>
  z
    .string()
    .regex(RFC3339_RE, `${field} must be RFC 3339 with an offset, for example 2026-10-13T09:00:00+02:00 or 2026-10-13T07:00:00Z`);

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

/** A date (YYYY-MM-DD) makes an all-day time; an RFC 3339 string with an offset makes a timed one. */
function eventTime(value: string, timeZone: string | undefined, field: string): calendar_v3.Schema$EventDateTime {
  if (DATE_RE.test(value)) return { date: value };
  if (RFC3339_RE.test(value)) return { dateTime: value, timeZone };
  throw new Error(`${field} must be YYYY-MM-DD (all-day) or RFC 3339 with an offset, got "${value}".`);
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
  // Calendar expands a timed recurring event in the start's time zone, so it needs one (Event.start.timeZone).
  if (lines.length && start !== undefined && !DATE_RE.test(start) && !timeZone) {
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

const calendarId = z.string().optional().describe('Calendar ID. Default "primary".');
const eventId = z.string().describe('Event ID, as returned by calendar_list_events.');
const sendUpdates = z
  .enum(['all', 'externalOnly', 'none'])
  .optional()
  .describe('Who gets invitation or change emails: all, externalOnly, or none. Default none.');
const recurrence = z
  .array(z.string())
  .optional()
  .describe('Recurrence lines (RFC 5545), for example ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"]. A timed recurring event needs time_zone.');
const reminders = z
  .array(z.object({ method: z.enum(['email', 'popup']), minutes: z.number().int().min(0).max(40320) }))
  .max(5)
  .optional()
  .describe("Reminders in place of the calendar's defaults, at most 5, minutes before the start (0 to 40320). An empty list: no reminders.");
const EVENT_TYPES = ['default', 'outOfOffice', 'focusTime', 'workingLocation', 'fromGmail', 'birthday'] as const;

/** True when send_updates makes Google email guests or the organizer: such a call sends to other people. */
export const emailsPeople = (sendUpdates: string | undefined): boolean => sendUpdates === 'all' || sendUpdates === 'externalOnly';

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const calendarApi = async () => calendar({ version: 'v3', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'calendar_list_calendars',
      title: 'List calendars',
      description:
        "List calendars in the account list, with id, summary, primary flag and access role (matches list_calendars in Google's Calendar MCP server). Use an id as calendar_id in the other tools.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.calendarlist', 'calendar.calendarlist.readonly', 'calendar.readonly'),
      inputSchema: {},
      async handler() {
        const api = await calendarApi();
        const res = await api.calendarList.list({ maxResults: 250 });
        return (res.data.items ?? []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary ?? false,
          access_role: c.accessRole,
          time_zone: c.timeZone,
        }));
      },
    }),
    defineTool({
      name: 'calendar_list_events',
      title: 'List calendar events',
      description:
        "List events, earliest first (matches list_events in Google's Calendar MCP server; q is the keyword search that stands in for its search_events, which is a semantic search with no public API). Recurring events are expanded into instances by default. Without time_min the list starts now; Google's server sets no lower bound unless asked, which include_past does here. event_types filters by type (Google's default is default, outOfOffice, focusTime and fromGmail).",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events', 'calendar.events.readonly', 'calendar.readonly'),
      inputSchema: {
        calendar_id: calendarId,
        time_min: rfc3339('time_min').optional().describe('Start of range, RFC 3339. Default: now (or no lower bound with include_past).'),
        time_max: rfc3339('time_max').optional().describe('End of range, RFC 3339. Default: no end.'),
        q: z.string().optional().describe('Free-text search over events: title, description, location and attendees. Every word must match.'),
        max_results: z.number().int().min(1).max(250).optional().describe('1 to 250. Default 50.'),
        single_events: z.boolean().optional().describe('Expand recurring events into instances. Default true.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
        include_past: z
          .boolean()
          .optional()
          .describe('When time_min is not given: true lists from the earliest event (no lower bound), as Google\'s list_events does. Default false: from now.'),
        event_types: z.array(z.enum(EVENT_TYPES)).optional().describe('Only these event types. Each event then carries its event_type.'),
        time_zone: z.string().optional().describe("IANA time zone for the times in the answer, for example Europe/Zurich. Default: the calendar's."),
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
        const res = await api.events.list({
          calendarId: calendar_id ?? PRIMARY,
          timeMin: time_min ?? (include_past === true ? undefined : new Date().toISOString()),
          timeMax: time_max,
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
          events: (res.data.items ?? []).map((e) => (withType ? { ...eventSummary(e), event_type: e.eventType ?? 'default' } : eventSummary(e))),
          time_zone: res.data.timeZone,
          next_page_token: res.data.nextPageToken ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'calendar_get_event',
      title: 'Get calendar event',
      description:
        "Read one event (matches get_event in Google's Calendar MCP server): description, organizer, creator, attendees and their responses, the Google Meet link, attachments, reminders, recurrence, event type, visibility and availability.",
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
        };
      },
    }),
    defineTool({
      name: 'calendar_freebusy',
      title: 'Check free/busy',
      description: 'Return busy periods for one or more calendars in a time range. Event titles are not included.',
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events.freebusy', 'calendar.freebusy', 'calendar.readonly'),
      inputSchema: {
        time_min: rfc3339('time_min'),
        time_max: rfc3339('time_max'),
        calendar_ids: z.array(z.string()).optional().describe('Calendar IDs. Default ["primary"].'),
      },
      async handler({ time_min, time_max, calendar_ids }) {
        const api = await calendarApi();
        const items = (calendar_ids?.length ? calendar_ids : [PRIMARY]).map((id) => ({ id }));
        const res = await api.freebusy.query({ requestBody: { timeMin: time_min, timeMax: time_max, items } });
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
        "Find times when everyone is free (matches suggest_time in Google's Calendar MCP server). Reads the free/busy periods of the attendees' calendars (and yours, unless include_primary is false) in the window, removes them, and returns the free periods long enough for the meeting, with one suggested meeting time per free period. working_hours and weekdays_only limit the search to those hours, in time_zone. A calendar Google cannot show (not shared, or outside your organisation) is listed under unavailable, and its busy time is not counted. Then create the event with calendar_create_event.",
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events.freebusy', 'calendar.freebusy', 'calendar.readonly'),
      inputSchema: {
        attendees: z.array(z.string()).min(1).max(50).describe('Email addresses or calendar IDs of the people to meet (Google answers for at most 50 calendars).'),
        start_time: rfc3339('start_time').describe('Start of the search window, RFC 3339 with an offset.'),
        end_time: rfc3339('end_time').describe('End of the search window, RFC 3339 with an offset.'),
        duration_minutes: z.number().int().min(1).max(1440).optional().describe('Length of the meeting in minutes. Default 30.'),
        time_zone: z.string().optional().describe('IANA time zone for working_hours and the answer, for example Europe/Zurich. Default: the offset of start_time.'),
        working_hours: z
          .object({ start: z.string().describe('HH:MM, for example 09:00'), end: z.string().describe('HH:MM, for example 17:00') })
          .optional()
          .describe('Only suggest times inside these hours of each day, in time_zone. Default: any time of day.'),
        weekdays_only: z.boolean().optional().describe('Skip Saturdays and Sundays (in time_zone). Default false.'),
        include_primary: z.boolean().optional().describe('Also count your primary calendar. Default true.'),
        max_suggestions: z.number().int().min(1).max(50).optional().describe('How many meeting times to suggest, 1 to 50. Default 5.'),
      },
      async handler({ attendees, start_time, end_time, duration_minutes, time_zone, working_hours, weekdays_only, include_primary, max_suggestions }) {
        const from = Date.parse(start_time);
        const to = Date.parse(end_time);
        if (!(to > from)) throw new Error('end_time must be after start_time.');
        const zone: Zone = time_zone !== undefined ? ianaZone(time_zone) : zoneOfTime(start_time);
        const hours = working_hours ? { start: minuteOfDay(working_hours.start, 'working_hours.start'), end: minuteOfDay(working_hours.end, 'working_hours.end') } : undefined;
        if (hours && hours.end <= hours.start) throw new Error('working_hours.end must be after working_hours.start on the same day.');
        const ids = [...new Set(attendees.map((a) => a.trim()).filter(Boolean))];
        if (include_primary !== false && !ids.includes(PRIMARY)) ids.unshift(PRIMARY);
        if (ids.length > 50) throw new Error('Google answers free/busy for at most 50 calendars at once.');

        const api = await calendarApi();
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
        "Create an event (matches create_event in Google's Calendar MCP server). start and end are RFC 3339 date-times with an offset, or YYYY-MM-DD for an all-day event. add_meet adds a Google Meet link; recurrence makes it repeat (RRULE lines); reminders replace the calendar's defaults. Invitations go out only if send_updates says so; a call that emails invitations to attendees asks as a destructive action.",
      kind: 'write',
      // Invitations emailed to the attendees are a send to other people (the destructive rule).
      destructiveWhen: ({ send_updates, attendees }) => emailsPeople(send_updates) && (attendees?.length ?? 0) > 0,
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: {
        calendar_id: calendarId,
        summary: z.string(),
        start: z.string().describe('RFC 3339 date-time with offset, or YYYY-MM-DD for all-day'),
        end: z.string().describe('RFC 3339 date-time with offset, or YYYY-MM-DD for all-day (end date is exclusive for all-day)'),
        time_zone: z.string().optional().describe('IANA time zone, for example Europe/Berlin'),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional().describe('Guest email addresses'),
        send_updates: sendUpdates,
        add_meet: z.boolean().optional().describe('Create a Google Meet link for the event. Default false.'),
        recurrence,
        reminders,
      },
      async handler({ calendar_id, summary, start, end, time_zone, description, location, attendees, send_updates, add_meet, recurrence: rules, reminders: alarms }) {
        checkSameKind(start, end);
        if (rules !== undefined) checkRecurrence(rules, start, time_zone);
        const api = await calendarApi();
        const res = await api.events.insert({
          calendarId: calendar_id ?? PRIMARY,
          sendUpdates: send_updates ?? 'none',
          ...(add_meet === true ? { conferenceDataVersion: 1 } : {}),
          requestBody: {
            summary,
            description,
            location,
            start: eventTime(start, time_zone, 'start'),
            end: eventTime(end, time_zone, 'end'),
            attendees: attendees?.length ? attendees.map((email) => ({ email })) : undefined,
            ...(rules?.length ? { recurrence: rules } : {}),
            ...(alarms !== undefined ? { reminders: remindersOf(alarms) } : {}),
            ...(add_meet === true ? { conferenceData: meetRequest() } : {}),
          },
        });
        return {
          ...eventSummary(res.data),
          ...(add_meet === true ? { meet_link: meetLink(res.data) ?? null, meet_status: res.data.conferenceData?.createRequest?.status?.statusCode ?? null } : {}),
          ...(rules?.length ? { recurrence: res.data.recurrence ?? rules } : {}),
        };
      },
    }),
    defineTool({
      name: 'calendar_update_event',
      title: 'Update calendar event',
      description:
        "Change only the fields given (events.patch; matches update_event in Google's Calendar MCP server). add_attendees and remove_attendees change the guest list and keep the other guests and their responses; attendees, if given, replaces the whole guest list instead. add_meet adds a Google Meet link when the event has none. recurrence and reminders replace the old ones. Invitations go out only if send_updates says so; a call that emails the guests asks as a destructive action.",
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
        start: z.string().optional().describe('RFC 3339 date-time with offset, or YYYY-MM-DD'),
        end: z.string().optional().describe('RFC 3339 date-time with offset, or YYYY-MM-DD'),
        time_zone: z.string().optional(),
        attendees: z.array(z.string()).optional().describe('Full guest email list; replaces the existing one'),
        send_updates: sendUpdates,
        add_attendees: z.array(z.string()).optional().describe('Guests to add; the existing guests stay. Not with attendees.'),
        remove_attendees: z.array(z.string()).optional().describe('Guests to remove, by email; the others stay. Not with attendees.'),
        add_meet: z.boolean().optional().describe('Add a Google Meet link, unless the event already has one.'),
        recurrence,
        reminders,
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
      }) {
        if (start !== undefined && end !== undefined) checkSameKind(start, end);
        const changesGuests = (add_attendees?.length ?? 0) + (remove_attendees?.length ?? 0) > 0;
        if (attendees !== undefined && changesGuests) {
          throw new Error('Give attendees (the whole new list) or add_attendees / remove_attendees (changes to the list), not both.');
        }
        if (rules !== undefined) checkRecurrence(rules, start, time_zone);
        const patch: calendar_v3.Schema$Event = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (start !== undefined) patch.start = eventTime(start, time_zone, 'start');
        if (end !== undefined) patch.end = eventTime(end, time_zone, 'end');
        if (attendees !== undefined) patch.attendees = attendees.map((email) => ({ email }));
        if (rules !== undefined) patch.recurrence = rules;
        if (alarms !== undefined) patch.reminders = remindersOf(alarms);
        if (!Object.keys(patch).length && !changesGuests && add_meet !== true) {
          throw new Error(
            'calendar_update_event has nothing to change. Pass at least one of summary, description, location, start, end, attendees, add_attendees, remove_attendees, add_meet, recurrence, reminders.',
          );
        }
        const api = await calendarApi();
        const id = calendar_id ?? PRIMARY;
        let guestChange: ReturnType<typeof mergeAttendees> | undefined;
        let meetExisting: string | undefined;
        if (changesGuests || add_meet === true) {
          // The current guests (to keep them and their responses) and Meet link (to add none twice).
          const current = (await api.events.get({ calendarId: id, eventId: event_id })).data;
          if (changesGuests) {
            guestChange = mergeAttendees(current.attendees ?? [], add_attendees ?? [], remove_attendees ?? []);
            patch.attendees = guestChange.attendees;
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
          requestBody: patch,
        });
        return {
          ...eventSummary(res.data),
          ...(guestChange
            ? {
                attendees_added: guestChange.added,
                attendees_removed: guestChange.removed,
                ...(guestChange.notFound.length ? { not_guests: guestChange.notFound } : {}),
                attendees_total: res.data.attendees?.length ?? guestChange.attendees.length,
              }
            : {}),
          ...(add_meet === true ? { meet_link: meetLink(res.data) ?? meetExisting ?? null } : {}),
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
        "Delete an event from a calendar (matches delete_event in Google's Calendar MCP server). It asks first. Guests are notified only if send_updates says so.",
      kind: 'destructive',
      // One DELETE (events.delete); Google's delete_event is marked idempotent too.
      idempotent: true,
      scopes: googleScopes('calendar', 'calendar.events'),
      inputSchema: { calendar_id: calendarId, event_id: eventId, send_updates: sendUpdates },
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
