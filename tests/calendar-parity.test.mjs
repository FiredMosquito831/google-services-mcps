// The Calendar parity tools (1.8.0): calendar_suggest_time, calendar_respond, and the new options of
// calendar_create_event, calendar_update_event, calendar_list_events and calendar_get_event. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools, mergeAttendees } = await import(DIST('servers/gcalendar.js'));
const time = await import(DIST('servers/calendar-time.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-calendar-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = Array.isArray(value) ? value.map(String) : String(value);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};

const EVENT = {
  id: 'ev-1',
  summary: 'Review',
  status: 'confirmed',
  start: { dateTime: '2026-11-02T10:00:00+01:00' },
  end: { dateTime: '2026-11-02T11:00:00+01:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
  attendees: [
    { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
    { email: 'Ana@example.com', responseStatus: 'accepted', comment: 'ok' },
    { email: 'bo@example.com', responseStatus: 'declined', optional: true },
  ],
};

// ---------------------------------------------------------------------------
// Kinds and scopes

test('kinds: suggest_time a read (as calendar_freebusy), respond a write (events.patch), create and update writes', () => {
  assert.equal(tools.get('calendar_suggest_time').kind, 'read');
  assert.equal(tools.get('calendar_freebusy').kind, 'read');
  assert.equal(tools.get('calendar_respond').kind, classifyMethod('PATCH', 'patch', 'calendar.events.patch'));
  assert.equal(tools.get('calendar_respond').kind, 'write');
  assert.equal(tools.get('calendar_create_event').kind, classifyMethod('POST', 'insert', 'calendar.events.insert'));
  assert.equal(tools.get('calendar_update_event').kind, 'write');
  const G = (s) => `https://www.googleapis.com/auth/${s}`;
  assert.deepEqual(tools.get('calendar_suggest_time').scopes, tools.get('calendar_freebusy').scopes, 'the scopes of free/busy, nothing new');
  assert.deepEqual(tools.get('calendar_respond').scopes, [G('calendar'), G('calendar.events')]);
  assert.equal([...tools.values()].some((t) => t.prepare), false, 'no Calendar tool needs a prepare step');
  for (const t of tools.values()) assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
});

// ---------------------------------------------------------------------------
// calendar-time.ts

test('time zones: offsets, wall-clock times across a DST change, RFC 3339 output', () => {
  assert.deepEqual(time.zoneOfTime('2026-11-02T10:00:00+05:30'), { kind: 'fixed', minutes: 330 });
  assert.deepEqual(time.zoneOfTime('2026-11-02T10:00:00Z'), { kind: 'fixed', minutes: 0 });
  assert.deepEqual(time.zoneOfTime('2026-11-02T10:00:00-03:00'), { kind: 'fixed', minutes: -180 });
  assert.throws(() => time.ianaZone('Mars/Olympus'), /not a known IANA time zone/);
  const berlin = time.ianaZone('Europe/Berlin');
  // Summer time ends on 2026-10-25: 09:00 local is 07:00Z before and 08:00Z after.
  assert.equal(new Date(time.zonedToUtc(2026, 10, 24, 9 * 60, berlin)).toISOString(), '2026-10-24T07:00:00.000Z');
  assert.equal(new Date(time.zonedToUtc(2026, 10, 26, 9 * 60, berlin)).toISOString(), '2026-10-26T08:00:00.000Z');
  assert.equal(time.formatInZone(Date.parse('2026-10-26T08:00:00Z'), berlin), '2026-10-26T09:00:00+01:00');
  assert.equal(time.formatInZone(Date.parse('2026-07-01T08:00:00Z'), berlin), '2026-07-01T10:00:00+02:00');
  assert.equal(time.formatInZone(Date.parse('2026-07-01T08:00:00Z'), { kind: 'fixed', minutes: -330 }), '2026-07-01T02:30:00-05:30');
  assert.equal(time.minuteOfDay('09:30', 'x'), 570);
  assert.throws(() => time.minuteOfDay('9:30', 'working_hours.start'), /working_hours\.start must be HH:MM/);
  assert.throws(() => time.minuteOfDay('10:75', 'x'), /HH:MM/);
});

test('freeSlots: busy periods of every calendar merged, working hours, weekdays, step and duration', () => {
  const z = time.ianaZone('Europe/Berlin');
  const at = (s) => Date.parse(s);
  // Fri 2026-11-06 08:00 to Mon 2026-11-09 18:00 Berlin (UTC+1).
  const base = {
    from: at('2026-11-06T07:00:00Z'),
    to: at('2026-11-09T17:00:00Z'),
    busy: [
      { start: at('2026-11-06T08:00:00Z'), end: at('2026-11-06T09:10:00Z') }, // 09:00-10:10 local
      { start: at('2026-11-06T09:00:00Z'), end: at('2026-11-06T10:00:00Z') }, // overlaps: busy until 11:00 local
      { start: at('2026-11-09T08:00:00Z'), end: at('2026-11-09T16:00:00Z') }, // Monday 09:00-17:00 local
    ],
    durationMinutes: 30,
    zone: z,
    workingHours: { start: 9 * 60, end: 17 * 60 },
    weekdaysOnly: true,
    stepMinutes: 15,
    maxSuggestions: 5,
  };
  const r = time.freeSlots(base);
  const show = (i) => [time.formatInZone(i.start, z), time.formatInZone(i.end, z)];
  // Friday after 11:00; Saturday and Sunday skipped; Monday fully busy.
  assert.deepEqual(r.periods.map(show), [['2026-11-06T11:00:00+01:00', '2026-11-06T17:00:00+01:00']]);
  assert.deepEqual(r.suggestions.map(show), [['2026-11-06T11:00:00+01:00', '2026-11-06T11:30:00+01:00']]);

  // Without weekdays_only, the weekend days are free all working day: one suggestion per free period.
  const weekend = time.freeSlots({ ...base, weekdaysOnly: false });
  assert.deepEqual(weekend.suggestions.map((s) => show(s)[0]), ['2026-11-06T11:00:00+01:00', '2026-11-07T09:00:00+01:00', '2026-11-08T09:00:00+01:00']);

  // A gap shorter than the duration is not a period; a start between steps rounds up to the next quarter hour.
  const tight = time.freeSlots({
    ...base,
    workingHours: undefined,
    weekdaysOnly: false,
    from: at('2026-11-06T08:00:00Z'),
    to: at('2026-11-06T12:00:00Z'),
    busy: [
      { start: at('2026-11-06T08:00:00Z'), end: at('2026-11-06T08:50:00Z') },
      { start: at('2026-11-06T09:10:00Z'), end: at('2026-11-06T10:07:00Z') },
    ],
    durationMinutes: 45,
  });
  assert.deepEqual(tight.suggestions.map(show), [['2026-11-06T11:15:00+01:00', '2026-11-06T12:00:00+01:00']]);
  assert.equal(time.freeSlots({ ...base, maxSuggestions: 1, weekdaysOnly: false }).suggestions.length, 1);
});

// ---------------------------------------------------------------------------
// calendar_suggest_time

test('suggest_time: one free/busy request for the attendees and primary, then free periods and suggestions in the zone', async () => {
  reset((call) =>
    call.path.endsWith('/freeBusy')
      ? {
          calendars: {
            primary: { busy: [{ start: '2026-11-02T08:00:00Z', end: '2026-11-02T09:00:00Z' }] },
            'ana@example.com': { busy: [{ start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:30:00Z' }] },
            'ext@other.com': { errors: [{ domain: 'global', reason: 'notFound' }] },
          },
        }
      : {},
  );
  const out = await run('calendar_suggest_time', {
    attendees: ['ana@example.com', 'ext@other.com', 'ana@example.com'],
    start_time: '2026-11-02T09:00:00+01:00',
    end_time: '2026-11-02T17:00:00+01:00',
    duration_minutes: 60,
    max_suggestions: 3,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, {
    timeMin: '2026-11-02T08:00:00.000Z',
    timeMax: '2026-11-02T16:00:00.000Z',
    items: [{ id: 'primary' }, { id: 'ana@example.com' }, { id: 'ext@other.com' }],
  });
  assert.equal(out.time_zone, '+01:00', 'default: the offset of start_time');
  assert.deepEqual(out.suggestions, [{ start: '2026-11-02T11:30:00+01:00', end: '2026-11-02T12:30:00+01:00' }]);
  assert.deepEqual(out.free_periods, [{ start: '2026-11-02T11:30:00+01:00', end: '2026-11-02T17:00:00+01:00', minutes: 330 }]);
  assert.deepEqual(out.unavailable, [{ calendar: 'ext@other.com', reason: 'notFound' }]);
  assert.match(out.note, /not counted/);

  reset(() => ({ calendars: {} }));
  const mine = await run('calendar_suggest_time', { attendees: ['ana@example.com'], start_time: '2026-11-02T09:00:00Z', end_time: '2026-11-02T10:00:00Z', include_primary: false, time_zone: 'America/New_York' });
  assert.deepEqual(calls[0].body.items, [{ id: 'ana@example.com' }]);
  assert.equal(out.duration_minutes, 60);
  assert.equal(mine.duration_minutes, 30, 'default duration');
  assert.equal(mine.time_zone, 'America/New_York');
  assert.deepEqual(mine.suggestions, [{ start: '2026-11-02T04:00:00-05:00', end: '2026-11-02T04:30:00-05:00' }]);
});

test('suggest_time: bad windows, hours and zones are refused before any request', async () => {
  const base = { attendees: ['a@example.com'], start_time: '2026-11-02T09:00:00Z', end_time: '2026-11-02T17:00:00Z' };
  const refused = [
    [{ ...base, end_time: '2026-11-02T09:00:00Z' }, /end_time must be after start_time/],
    [{ ...base, working_hours: { start: '17:00', end: '09:00' } }, /working_hours\.end must be after working_hours\.start/],
    [{ ...base, working_hours: { start: '9', end: '17:00' } }, /HH:MM/],
    [{ ...base, time_zone: 'Nowhere/City' }, /not a known IANA time zone/],
  ];
  for (const [args, message] of refused) {
    reset();
    await assert.rejects(run('calendar_suggest_time', args), message);
    assert.equal(calls.length, 0, JSON.stringify(args));
  }
});

// ---------------------------------------------------------------------------
// calendar_respond

test('respond: only your own entry is sent, with attendeesOmitted; the other guests are not sent back', async () => {
  reset((call) => (call.method === 'GET' ? EVENT : { ...EVENT, attendees: [{ email: 'me@example.com', self: true, responseStatus: 'tentative' }] }));
  const out = await run('calendar_respond', { event_id: 'ev-1', response: 'tentative', comment: 'Maybe late' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.equal(calls[1].path, '/calendar/v3/calendars/primary/events/ev-1');
  assert.deepEqual(calls[1].body, { attendeesOmitted: true, attendees: [{ email: 'me@example.com', responseStatus: 'tentative', comment: 'Maybe late' }] });
  assert.equal(calls[1].query.sendUpdates, 'none');
  assert.equal(out.you, 'me@example.com');
  assert.equal(out.previous_response, 'needsAction');
  assert.equal(out.response, 'tentative');

  reset((call) => (call.method === 'GET' ? EVENT : EVENT));
  await run('calendar_respond', { calendar_id: 'team@example.com', event_id: 'ev-1', response: 'declined', send_updates: 'all' });
  assert.deepEqual(calls[1].body, { attendeesOmitted: true, attendees: [{ email: 'me@example.com', responseStatus: 'declined' }] }, 'no comment key without a comment');
  assert.equal(calls[1].query.sendUpdates, 'all');
  assert.match(calls[1].path, /calendars\/team%40example\.com\/events/);
});

test('respond: not a guest of the event is an error, and nothing is changed', async () => {
  reset(() => ({ ...EVENT, attendees: [{ email: 'ana@example.com' }] }));
  await assert.rejects(run('calendar_respond', { event_id: 'ev-1', response: 'accepted' }), /You are not a guest of event ev-1/);
  assert.deepEqual(calls.map((c) => c.method), ['GET']);
});

// ---------------------------------------------------------------------------
// calendar_update_event: add and remove guests, Meet

test('mergeAttendees: keeps the other guests and their entries, removes and adds without case, refuses an address on both lists', () => {
  const r = mergeAttendees(EVENT.attendees, ['carl@example.com', 'ANA@example.com', 'carl@example.com'], ['BO@example.com', 'zed@example.com']);
  assert.deepEqual(r.attendees, [EVENT.attendees[0], EVENT.attendees[1], { email: 'carl@example.com' }]);
  assert.deepEqual(r.added, ['carl@example.com']);
  assert.deepEqual(r.removed, ['BO@example.com']);
  assert.deepEqual(r.notFound, ['zed@example.com']);
  assert.throws(() => mergeAttendees(EVENT.attendees, ['x@example.com'], ['X@example.com']), /both added and removed: x@example\.com/);
});

test('update: add_attendees / remove_attendees read the event and patch the merged list; attendees still replaces without a read', async () => {
  reset((call) => (call.method === 'GET' ? EVENT : { ...EVENT, attendees: [EVENT.attendees[0], EVENT.attendees[1], { email: 'carl@example.com' }] }));
  const out = await run('calendar_update_event', { event_id: 'ev-1', add_attendees: ['carl@example.com'], remove_attendees: ['bo@example.com'], send_updates: 'all' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.deepEqual(calls[1].body, {
    attendees: [
      { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
      { email: 'Ana@example.com', responseStatus: 'accepted', comment: 'ok' },
      { email: 'carl@example.com' },
    ],
  });
  assert.equal(calls[1].query.conferenceDataVersion, undefined);
  assert.deepEqual(out.attendees_added, ['carl@example.com']);
  assert.deepEqual(out.attendees_removed, ['bo@example.com']);
  assert.equal(out.attendees_total, 3);

  // The 1.7.0 call: one PATCH, the same body as before, no read.
  reset(() => EVENT);
  const old = await run('calendar_update_event', { event_id: 'ev-1', summary: 'New', attendees: ['a@example.com'] });
  assert.deepEqual(calls.map((c) => c.method), ['PATCH']);
  assert.deepEqual(calls[0].body, { summary: 'New', attendees: [{ email: 'a@example.com' }] });
  assert.deepEqual(Object.keys(calls[0].query).sort(), ['sendUpdates']);
  assert.deepEqual(Object.keys(old).sort(), ['end', 'html_link', 'id', 'location', 'start', 'status', 'summary'], 'the 1.7.0 answer');

  reset(() => EVENT);
  await assert.rejects(run('calendar_update_event', { event_id: 'ev-1', attendees: ['a@example.com'], add_attendees: ['b@example.com'] }), /not both/);
  await assert.rejects(run('calendar_update_event', { event_id: 'ev-1' }), /nothing to change/);
  assert.equal(calls.length, 0);
});

test('Meet: create asks for a hangoutsMeet conference with conferenceDataVersion=1; update adds one only when the event has none', async () => {
  reset(() => ({ ...EVENT, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }], createRequest: { status: { statusCode: 'success' } } } }));
  const created = await run('calendar_create_event', { summary: 'Sync', start: '2026-11-02T10:00:00+01:00', end: '2026-11-02T10:30:00+01:00', add_meet: true });
  assert.equal(calls[0].query.conferenceDataVersion, '1');
  const req = calls[0].body.conferenceData.createRequest;
  assert.deepEqual(req.conferenceSolutionKey, { type: 'hangoutsMeet' });
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(created.meet_link, 'https://meet.google.com/abc-defg-hij');
  assert.equal(created.meet_status, 'success');

  // Two creates never share a request id (Google ignores a repeated one).
  reset(() => EVENT);
  await run('calendar_create_event', { summary: 'Sync', start: '2026-11-02T10:00:00+01:00', end: '2026-11-02T10:30:00+01:00', add_meet: true });
  assert.notEqual(calls[0].body.conferenceData.createRequest.requestId, req.requestId);

  // The event has a Meet link already: nothing is changed.
  reset(() => ({ ...EVENT, hangoutLink: 'https://meet.google.com/old-link' }));
  const same = await run('calendar_update_event', { event_id: 'ev-1', add_meet: true });
  assert.deepEqual(calls.map((c) => c.method), ['GET']);
  assert.equal(same.changed, false);
  assert.equal(same.meet_link, 'https://meet.google.com/old-link');

  reset(() => EVENT);
  await run('calendar_update_event', { event_id: 'ev-1', add_meet: true, summary: 'With Meet' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.equal(calls[1].query.conferenceDataVersion, '1');
  assert.equal(calls[1].body.summary, 'With Meet');
  assert.deepEqual(calls[1].body.conferenceData.createRequest.conferenceSolutionKey, { type: 'hangoutsMeet' });
});

test('create: recurrence and reminders; a 1.7.0 call sends the same request as before', async () => {
  reset(() => EVENT);
  await run('calendar_create_event', {
    summary: 'Weekly',
    start: '2026-11-02T10:00:00+01:00',
    end: '2026-11-02T10:30:00+01:00',
    time_zone: 'Europe/Berlin',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10', 'EXDATE;TZID=Europe/Berlin:20261109T100000'],
    reminders: [{ method: 'popup', minutes: 10 }],
  });
  assert.deepEqual(calls[0].body.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10', 'EXDATE;TZID=Europe/Berlin:20261109T100000']);
  assert.deepEqual(calls[0].body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] });
  assert.equal(calls[0].query.conferenceDataVersion, undefined);

  reset(() => EVENT);
  await run('calendar_create_event', { summary: 'Quiet', start: '2026-11-02', end: '2026-11-03', reminders: [] });
  assert.deepEqual(calls[0].body.reminders, { useDefault: false, overrides: [] }, 'an empty list turns reminders off');

  reset(() => EVENT);
  const out = await run('calendar_create_event', { summary: 'Review', start: '2026-11-02T10:00:00+01:00', end: '2026-11-02T11:00:00+01:00', attendees: ['a@example.com'] });
  assert.deepEqual(calls[0].body, {
    summary: 'Review',
    start: { dateTime: '2026-11-02T10:00:00+01:00' },
    end: { dateTime: '2026-11-02T11:00:00+01:00' },
    attendees: [{ email: 'a@example.com' }],
  });
  assert.deepEqual(calls[0].query, { sendUpdates: 'none' });
  assert.deepEqual(Object.keys(out).sort(), ['end', 'html_link', 'id', 'location', 'start', 'status', 'summary']);

  reset();
  await assert.rejects(run('calendar_create_event', { summary: 'x', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z', recurrence: ['FREQ=DAILY'] }), /recurrence lines start with RRULE/);
  await assert.rejects(run('calendar_create_event', { summary: 'x', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z', recurrence: ['RRULE:FREQ=DAILY'] }), /needs time_zone/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// calendar_list_events and calendar_get_event

test('list_events: from now by default (as before), no lower bound with include_past, event types, time zone, order', async () => {
  reset(() => ({ items: [{ ...EVENT, eventType: 'outOfOffice' }], timeZone: 'Europe/Berlin' }));
  const before = Date.now();
  const plain = await run('calendar_list_events', {});
  assert.ok(Date.parse(calls[0].query.timeMin) >= before - 1000, 'timeMin is now');
  assert.deepEqual(Object.keys(calls[0].query).sort(), ['maxResults', 'orderBy', 'singleEvents', 'timeMin']);
  assert.equal('event_type' in plain.events[0], false, 'the 1.7.0 answer has no event_type');

  reset(() => ({ items: [{ ...EVENT, eventType: 'outOfOffice' }, { ...EVENT, id: 'ev-2' }] }));
  const typed = await run('calendar_list_events', { include_past: true, event_types: ['outOfOffice', 'default'], time_zone: 'Europe/Zurich', order_by: 'updated' });
  assert.equal(calls[0].query.timeMin, undefined, 'include_past: no lower bound');
  assert.deepEqual(calls[0].query.eventTypes, ['outOfOffice', 'default']);
  assert.equal(calls[0].query.timeZone, 'Europe/Zurich');
  assert.equal(calls[0].query.orderBy, 'updated');
  assert.deepEqual(typed.events.map((e) => e.event_type), ['outOfOffice', 'default']);

  reset();
  await run('calendar_list_events', { include_past: true, time_min: '2026-01-01T00:00:00Z' });
  assert.equal(calls[0].query.timeMin, '2026-01-01T00:00:00Z', 'a given time_min wins');
  reset();
  await assert.rejects(run('calendar_list_events', { single_events: false, order_by: 'startTime' }), /order_by startTime needs single_events/);
  await assert.rejects(run('calendar_list_events', { time_zone: 'Bad/Zone' }), /not a known IANA time zone/);
  assert.equal(calls.length, 0);
});

test('get_event: adds the Meet link, reminders, attachments, event type, creator, visibility and availability', async () => {
  reset(() => ({
    ...EVENT,
    eventType: 'default',
    creator: { email: 'ana@example.com' },
    transparency: 'transparent',
    conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:+1' }, { entryPointType: 'video', uri: 'https://meet.google.com/xyz' }] },
    reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 30 }] },
    attachments: [{ title: 'Agenda', fileUrl: 'https://drive.google.com/file/d/f1', fileId: 'f1', mimeType: 'application/pdf' }],
  }));
  const out = await run('calendar_get_event', { event_id: 'ev-1' });
  assert.equal(out.meet_link, 'https://meet.google.com/xyz');
  assert.deepEqual(out.reminders, { use_default: false, overrides: [{ method: 'email', minutes: 30 }] });
  assert.deepEqual(out.attachments, [{ title: 'Agenda', file_url: 'https://drive.google.com/file/d/f1', file_id: 'f1', mime_type: 'application/pdf' }]);
  assert.equal(out.event_type, 'default');
  assert.equal(out.creator, 'ana@example.com');
  assert.equal(out.availability, 'free');
  assert.equal(out.visibility, 'default');
  // The 1.7.0 fields are unchanged.
  assert.equal(out.attendees_total, 3);
  assert.equal(out.organizer, undefined);
  assert.deepEqual(out.attendees[1], { email: 'Ana@example.com', response_status: 'accepted', optional: false, organizer: false });
});
