/**
 * Curated Calendar tools (calendar_*), served by the workspace-user server (MCP name "gws-user").
 * Read: list calendars, list events, get event, free/busy. Write: create event, update event.
 * Destructive: delete event (asks for approval first).
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { calendar, type calendar_v3 } from '@googleapis/calendar';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';

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

const calendarId = z.string().optional().describe('Calendar ID. Default "primary".');
const eventId = z.string().describe('Event ID, as returned by calendar_list_events.');
const sendUpdates = z
  .enum(['all', 'externalOnly', 'none'])
  .optional()
  .describe('Who gets invitation or change emails: all, externalOnly, or none. Default none.');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const calendarApi = async () => calendar({ version: 'v3', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'calendar_list_calendars',
      title: 'List calendars',
      description: 'List calendars in the account list, with id, summary, primary flag and access role.',
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
      description: 'List events in a time range, earliest first. Recurring events are expanded into instances by default.',
      kind: 'read',
      scopes: googleScopes('calendar', 'calendar.events', 'calendar.events.readonly', 'calendar.readonly'),
      inputSchema: {
        calendar_id: calendarId,
        time_min: rfc3339('time_min').optional().describe('Start of range, RFC 3339. Default: now.'),
        time_max: rfc3339('time_max').optional().describe('End of range, RFC 3339. Default: no end.'),
        q: z.string().optional().describe('Free-text search over events'),
        max_results: z.number().int().min(1).max(250).optional().describe('1 to 250. Default 50.'),
        single_events: z.boolean().optional().describe('Expand recurring events into instances. Default true.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ calendar_id, time_min, time_max, q, max_results, single_events, page_token }) {
        const api = await calendarApi();
        const expand = single_events ?? true;
        const res = await api.events.list({
          calendarId: calendar_id ?? PRIMARY,
          timeMin: time_min ?? new Date().toISOString(),
          timeMax: time_max,
          q,
          maxResults: max_results ?? 50,
          singleEvents: expand,
          // startTime ordering is only allowed when recurring events are expanded.
          orderBy: expand ? 'startTime' : undefined,
          pageToken: page_token,
        });
        return {
          events: (res.data.items ?? []).map(eventSummary),
          time_zone: res.data.timeZone,
          next_page_token: res.data.nextPageToken ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'calendar_get_event',
      title: 'Get calendar event',
      description: 'Read one event with description, organizer, attendees and response status.',
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

    // ---- write ----
    defineTool({
      name: 'calendar_create_event',
      title: 'Create calendar event',
      description:
        'Create an event. start and end are RFC 3339 date-times with an offset, or YYYY-MM-DD for an all-day event. Invitations go out only if send_updates says so.',
      kind: 'write',
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
      },
      async handler({ calendar_id, summary, start, end, time_zone, description, location, attendees, send_updates }) {
        checkSameKind(start, end);
        const api = await calendarApi();
        const res = await api.events.insert({
          calendarId: calendar_id ?? PRIMARY,
          sendUpdates: send_updates ?? 'none',
          requestBody: {
            summary,
            description,
            location,
            start: eventTime(start, time_zone, 'start'),
            end: eventTime(end, time_zone, 'end'),
            attendees: attendees?.length ? attendees.map((email) => ({ email })) : undefined,
          },
        });
        return eventSummary(res.data);
      },
    }),
    defineTool({
      name: 'calendar_update_event',
      title: 'Update calendar event',
      description:
        'Change only the fields given (events.patch). attendees, if given, replaces the whole guest list. Invitations go out only if send_updates says so.',
      kind: 'write',
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
      },
      async handler({ calendar_id, event_id, summary, description, location, start, end, time_zone, attendees, send_updates }) {
        if (start !== undefined && end !== undefined) checkSameKind(start, end);
        const patch: calendar_v3.Schema$Event = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (start !== undefined) patch.start = eventTime(start, time_zone, 'start');
        if (end !== undefined) patch.end = eventTime(end, time_zone, 'end');
        if (attendees !== undefined) patch.attendees = attendees.map((email) => ({ email }));
        if (!Object.keys(patch).length) {
          throw new Error('calendar_update_event has nothing to change. Pass at least one of summary, description, location, start, end, attendees.');
        }
        const api = await calendarApi();
        const res = await api.events.patch({
          calendarId: calendar_id ?? PRIMARY,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
          requestBody: patch,
        });
        return eventSummary(res.data);
      },
    }),

    // ---- destructive (asks for approval before each call) ----
    defineTool({
      name: 'calendar_delete_event',
      title: 'Delete calendar event',
      description: 'Delete an event from a calendar. Guests are notified only if send_updates says so.',
      kind: 'destructive',
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
