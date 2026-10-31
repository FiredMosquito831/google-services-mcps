// The Calendar changes of 1.40.0: local times (no offset) read in time_zone or the calendar's zone, update_event keeping
// the duration when only the start moves, the richer list_events items, create and update visibility, colour,
// availability and attachments, focus time, out of office and working location events, and list_calendars paging.
// The HTTP layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder.
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
const { buildTools, listItem, statusFields, keptEnd, mergeAttachments } = await import(DIST('servers/gcalendar.js'));
const time = await import(DIST('servers/calendar-time.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-calendar-fields-'));
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
/** A calendar whose zone is Europe/Berlin: the zone read (events.list with fields=timeZone), then the event. */
const berlin = (event) => (call) => (call.query.fields === 'timeZone' ? { timeZone: 'Europe/Berlin' } : event);

const EVENT = {
  id: 'ev-1',
  summary: 'Review',
  status: 'confirmed',
  start: { dateTime: '2026-11-02T10:00:00+01:00' },
  end: { dateTime: '2026-11-02T11:30:00+01:00' },
  htmlLink: 'https://calendar.google.com/event?eid=1',
};

// ---------------------------------------------------------------------------
// calendar-time.ts

test('local times: recognised, normalised to seconds, refused when they do not exist, read in a zone across DST', () => {
  assert.equal(time.isLocalTime('2026-11-02T10:00'), true);
  assert.equal(time.isLocalTime('2026-11-02T10:00:30.5'), true);
  assert.equal(time.isLocalTime('2026-11-02T10:00:00Z'), false);
  assert.equal(time.isLocalTime('2026-11-02T10:00:00+01:00'), false);
  assert.equal(time.isLocalTime('2026-11-02'), false);
  assert.equal(time.localTimeText('2026-11-02T10:00', 'start'), '2026-11-02T10:00:00');
  assert.equal(time.localTimeText('2026-11-02T10:00:30', 'start'), '2026-11-02T10:00:30');
  assert.throws(() => time.localTimeText('2026-02-30T10:00', 'start'), /start "2026-02-30T10:00" is not a real date and time/);
  assert.throws(() => time.localTimeText('2026-11-02T25:00', 'end'), /not a real date and time/);
  const berlinZone = time.ianaZone('Europe/Berlin');
  // Summer time ends on 2026-10-25: 09:00 is 07:00Z before and 08:00Z after.
  assert.equal(new Date(time.localToUtc('2026-10-24T09:00', berlinZone, 'x')).toISOString(), '2026-10-24T07:00:00.000Z');
  assert.equal(new Date(time.localToUtc('2026-10-26T09:00:30', berlinZone, 'x')).toISOString(), '2026-10-26T08:00:30.000Z');
  assert.equal(time.formatLocal(Date.parse('2026-07-01T08:00:30Z'), berlinZone), '2026-07-01T10:00:30');
  assert.equal(time.formatWithOffset(Date.parse('2026-07-01T08:00:30Z'), berlinZone), '2026-07-01T10:00:30+02:00');
  assert.equal(time.formatWithOffset(Date.parse('2026-07-01T08:00:00Z'), { kind: 'fixed', minutes: -330 }), '2026-07-01T02:30:00-05:30');
  assert.equal(time.daysBetween('2026-12-24', '2026-12-27'), 3);
  assert.equal(time.addDays('2026-12-31', 1), '2027-01-01');
});

// ---------------------------------------------------------------------------
// create and update with local times

test('create: a local time with time_zone goes as Calendar takes it, dateTime without offset and timeZone; no extra request', async () => {
  reset(() => EVENT);
  await run('calendar_create_event', { summary: 'Sync', start: '2026-11-02T10:00', end: '2026-11-02T10:30', time_zone: 'Europe/Berlin' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.start, { dateTime: '2026-11-02T10:00:00', timeZone: 'Europe/Berlin' });
  assert.deepEqual(calls[0].body.end, { dateTime: '2026-11-02T10:30:00', timeZone: 'Europe/Berlin' });
});

test('create: a local time without time_zone takes the calendar\'s zone (one events.list read of timeZone first)', async () => {
  reset(berlin(EVENT));
  await run('calendar_create_event', { calendar_id: 'team@example.com', summary: 'Sync', start: '2026-11-02T10:00', end: '2026-11-02T10:30' });
  assert.deepEqual(
    calls.map((c) => [c.method, c.path]),
    [
      ['GET', '/calendar/v3/calendars/team%40example.com/events'],
      ['POST', '/calendar/v3/calendars/team%40example.com/events'],
    ],
  );
  assert.deepEqual(calls[0].query, { maxResults: '1', fields: 'timeZone' });
  assert.deepEqual(calls[1].body.start, { dateTime: '2026-11-02T10:00:00', timeZone: 'Europe/Berlin' });

  // The zone cannot be read: an error that says to give time_zone, and nothing is created.
  reset((call) => {
    if (call.method === 'GET') throw Object.assign(new Error('Insufficient Permission'), { code: 403 });
    return EVENT;
  });
  await assert.rejects(run('calendar_create_event', { summary: 'Sync', start: '2026-11-02T10:00', end: '2026-11-02T10:30' }), /local time without an offset.*Give time_zone.*Nothing was changed/);
  assert.deepEqual(calls.map((c) => c.method), ['GET']);
  // A bad time_zone with a local time is refused before any request; a recurring local start needs no time_zone.
  reset(() => EVENT);
  await assert.rejects(run('calendar_create_event', { summary: 'x', start: '2026-11-02T10:00', end: '2026-11-02T11:00', time_zone: 'Mars/Base' }), /not a known IANA time zone/);
  await assert.rejects(run('calendar_create_event', { summary: 'x', start: '2026-02-30T10:00', end: '2026-02-30T11:00', time_zone: 'Europe/Berlin' }), /not a real date and time/);
  assert.equal(calls.length, 0);
  reset(berlin(EVENT));
  await run('calendar_create_event', { summary: 'Weekly', start: '2026-11-02T10:00', end: '2026-11-02T10:30', recurrence: ['RRULE:FREQ=WEEKLY'] });
  assert.equal(calls[1].body.start.timeZone, 'Europe/Berlin', 'the recurrence is expanded in the calendar\'s zone');
});

test('create: an offset that is not time_zone\'s offset keeps its instant, and the answer says so', async () => {
  reset(() => EVENT);
  const out = await run('calendar_create_event', { summary: 'Call', start: '2026-07-01T10:00:00+01:00', end: '2026-07-01T11:00:00+01:00', time_zone: 'Europe/Berlin' });
  assert.deepEqual(calls[0].body.start, { dateTime: '2026-07-01T10:00:00+01:00', timeZone: 'Europe/Berlin' }, 'the request is as before');
  assert.match(out.time_note, /start has the offset \+01:00, which is not the offset of Europe\/Berlin at that time: Calendar keeps the instant the offset gives, 2026-07-01T11:00:00\+02:00 in Europe\/Berlin/);
  reset(() => EVENT);
  const same = await run('calendar_create_event', { summary: 'Call', start: '2026-07-01T10:00:00+02:00', end: '2026-07-01T11:00:00+02:00', time_zone: 'Europe/Berlin' });
  assert.equal(same.time_note, undefined);
});

test('update: only start moves, the event keeps its duration (timed and all-day); a local start reads the event\'s zone', async () => {
  reset((call) => (call.method === 'GET' ? EVENT : EVENT));
  const out = await run('calendar_update_event', { event_id: 'ev-1', start: '2026-11-02T14:00:00+01:00' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.deepEqual(calls[1].body, { start: { dateTime: '2026-11-02T14:00:00+01:00' }, end: { dateTime: '2026-11-02T15:30:00+01:00' } });
  assert.equal(out.duration_kept, '90 minute(s)');

  const allDay = { ...EVENT, start: { date: '2026-12-24' }, end: { date: '2026-12-27' } };
  reset(() => allDay);
  await run('calendar_update_event', { event_id: 'ev-1', start: '2027-01-04' });
  assert.deepEqual(calls[1].body, { start: { date: '2027-01-04' }, end: { date: '2027-01-07' } });

  const zoned = { ...EVENT, start: { dateTime: '2026-11-02T10:00:00+01:00', timeZone: 'Europe/Berlin' }, end: { dateTime: '2026-11-02T10:45:00+01:00', timeZone: 'Europe/Berlin' } };
  reset(() => zoned);
  await run('calendar_update_event', { event_id: 'ev-1', start: '2026-11-03T09:15' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH'], 'the event\'s own zone: no calendar zone read');
  assert.deepEqual(calls[1].body, { start: { dateTime: '2026-11-03T09:15:00', timeZone: 'Europe/Berlin' }, end: { dateTime: '2026-11-03T10:00:00', timeZone: 'Europe/Berlin' } });

  // A date for a timed event (or a time for an all-day one) cannot keep a duration: end is needed, and nothing changes.
  reset(() => EVENT);
  await assert.rejects(run('calendar_update_event', { event_id: 'ev-1', start: '2026-11-05' }), /give end too/);
  assert.deepEqual(calls.map((c) => c.method), ['GET']);

  // start and end both: one PATCH, no read, as before.
  reset(() => EVENT);
  await run('calendar_update_event', { event_id: 'ev-1', start: '2026-11-02T12:00:00+01:00', end: '2026-11-02T13:00:00+01:00' });
  assert.deepEqual(calls.map((c) => c.method), ['PATCH']);
});

test('update: time_zone without start or end is not used, and the answer says so; alone it still has nothing to change', async () => {
  reset(() => EVENT);
  const out = await run('calendar_update_event', { event_id: 'ev-1', summary: 'New', time_zone: 'Europe/Berlin' });
  assert.deepEqual(calls[0].body, { summary: 'New' });
  assert.match(out.time_note, /time_zone was not used/);
  reset(() => EVENT);
  await assert.rejects(run('calendar_update_event', { event_id: 'ev-1', time_zone: 'Europe/Berlin' }), /nothing to change.*time_zone applies to start and end/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// list_events, freebusy and suggest_time with local times

test('list_events: local time_min and time_max are sent as UTC instants, in time_zone or the calendar\'s zone', async () => {
  reset(() => ({ items: [] }));
  await run('calendar_list_events', { time_min: '2026-11-02T00:00', time_max: '2026-11-03T00:00', time_zone: 'Europe/Berlin' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.timeMin, '2026-11-01T23:00:00.000Z');
  assert.equal(calls[0].query.timeMax, '2026-11-02T23:00:00.000Z');
  assert.equal(calls[0].query.timeZone, 'Europe/Berlin');
  reset((call) => (call.query.fields === 'timeZone' ? { timeZone: 'America/New_York' } : { items: [] }));
  await run('calendar_list_events', { time_min: '2026-11-02T00:00' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].query.timeMin, '2026-11-02T05:00:00.000Z');
  assert.equal(calls[1].query.timeZone, undefined, 'no time_zone given: the answer keeps the calendar\'s zone, as before');
});

test('freebusy: local times in time_zone, which also sets the zone of the answer; without time_zone the request is as before', async () => {
  reset(() => ({ calendars: {} }));
  await run('calendar_freebusy', { time_min: '2026-11-02T09:00', time_max: '2026-11-02T17:00', time_zone: 'Europe/Berlin' });
  assert.deepEqual(calls[0].body, { timeMin: '2026-11-02T08:00:00.000Z', timeMax: '2026-11-02T16:00:00.000Z', items: [{ id: 'primary' }], timeZone: 'Europe/Berlin' });
  reset(() => ({ calendars: {} }));
  await run('calendar_freebusy', { time_min: '2026-11-02T09:00:00Z', time_max: '2026-11-02T17:00:00Z' });
  assert.deepEqual(calls[0].body, { timeMin: '2026-11-02T09:00:00Z', timeMax: '2026-11-02T17:00:00Z', items: [{ id: 'primary' }] });
});

test('suggest_time: local start and end without time_zone use the primary calendar\'s zone for the window and the answer', async () => {
  reset((call) => (call.query.fields === 'timeZone' ? { timeZone: 'Europe/Berlin' } : { calendars: {} }));
  const out = await run('calendar_suggest_time', { attendees: ['ana@example.com'], start_time: '2026-11-02T09:00', end_time: '2026-11-02T10:00', include_primary: false });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
  assert.equal(calls[0].path, '/calendar/v3/calendars/primary/events');
  assert.deepEqual(calls[1].body.timeMin, '2026-11-02T08:00:00.000Z');
  assert.equal(out.time_zone, 'Europe/Berlin');
  assert.deepEqual(out.suggestions, [{ start: '2026-11-02T09:00:00+01:00', end: '2026-11-02T09:30:00+01:00' }]);
  reset(() => ({ calendars: {} }));
  await assert.rejects(run('calendar_suggest_time', { attendees: ['a@example.com'], start_time: '2026-11-02T10:00', end_time: '2026-11-02T09:00', time_zone: 'Europe/Berlin' }), /end_time must be after start_time/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// list items

test('list_events items: what each event has beyond its time, and nothing when it has none', () => {
  const plain = listItem(EVENT, false);
  assert.deepEqual(Object.keys(plain), ['id', 'summary', 'status', 'start', 'end', 'location', 'html_link']);
  const rich = listItem(
    {
      ...EVENT,
      eventType: 'workingLocation',
      organizer: { email: 'ana@example.com' },
      attendees: [
        { email: 'me@example.com', self: true, responseStatus: 'needsAction' },
        { email: 'ana@example.com', responseStatus: 'accepted' },
        { email: 'bo@example.com', responseStatus: 'declined' },
        { email: 'cy@example.com', responseStatus: 'tentative' },
      ],
      conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc' }] },
      recurringEventId: 'series-1',
      visibility: 'private',
      transparency: 'transparent',
    },
    false,
  );
  assert.deepEqual(rich, {
    ...plain,
    event_type: 'workingLocation',
    organizer: 'ana@example.com',
    your_response: 'needsAction',
    guests: { total: 4, accepted: 1, tentative: 1, declined: 1, needs_action: 1 },
    meet_link: 'https://meet.google.com/abc',
    recurring_event_id: 'series-1',
    visibility: 'private',
    availability: 'free',
  });
  assert.deepEqual(listItem({ ...EVENT, start: { date: '2026-12-24' }, end: { date: '2026-12-25' }, recurrence: ['RRULE:FREQ=YEARLY'], eventType: 'birthday' }, false), {
    ...listItem({ ...EVENT, start: { date: '2026-12-24' }, end: { date: '2026-12-25' } }, false),
    event_type: 'birthday',
    all_day: true,
    recurring: true,
  });
  assert.equal(listItem(EVENT, true).event_type, 'default', 'with event_types every item carries its type, as before');
});

// ---------------------------------------------------------------------------
// visibility, colour, availability, attachments

test('create: visibility, color_id, availability and attachments (supportsAttachments); the answer names them', async () => {
  reset((call) => ({ ...EVENT, visibility: call.body?.visibility, colorId: call.body?.colorId, transparency: call.body?.transparency, attachments: call.body?.attachments }));
  const out = await run('calendar_create_event', {
    summary: 'Plan',
    start: '2026-11-02T10:00:00Z',
    end: '2026-11-02T11:00:00Z',
    visibility: 'private',
    color_id: '5',
    availability: 'free',
    attachments: [{ file_url: 'https://drive.google.com/file/d/f1/view', title: 'Agenda' }],
  });
  assert.equal(calls[0].query.supportsAttachments, 'true');
  assert.deepEqual(calls[0].body.attachments, [{ fileUrl: 'https://drive.google.com/file/d/f1/view', title: 'Agenda' }]);
  assert.equal(calls[0].body.visibility, 'private');
  assert.equal(calls[0].body.colorId, '5');
  assert.equal(calls[0].body.transparency, 'transparent');
  assert.equal(out.visibility, 'private');
  assert.equal(out.color_id, '5');
  assert.equal(out.availability, 'free');
  assert.deepEqual(out.attachments, [{ title: 'Agenda', file_url: 'https://drive.google.com/file/d/f1/view', file_id: undefined }]);
  reset(() => EVENT);
  await assert.rejects(run('calendar_create_event', { summary: 'x', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z', attachments: [{ file_url: 'file:///C:/secret.txt' }] }), /must be an https link/);
  assert.equal(calls.length, 0);
});

test('update: add_attachments and remove_attachments keep the other files (one read, then the merged list)', async () => {
  const current = { ...EVENT, attachments: [{ fileUrl: 'https://drive.google.com/file/d/a/view', title: 'A' }, { fileUrl: 'https://drive.google.com/file/d/b/view', title: 'B' }] };
  reset((call) => (call.method === 'GET' ? current : { ...current, attachments: call.body.attachments }));
  const out = await run('calendar_update_event', { event_id: 'ev-1', add_attachments: [{ file_url: 'https://drive.google.com/file/d/c/view' }], remove_attachments: ['https://drive.google.com/file/d/a/view', 'https://x.example/none'] });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.equal(calls[1].query.supportsAttachments, 'true');
  assert.deepEqual(calls[1].body, { attachments: [{ fileUrl: 'https://drive.google.com/file/d/b/view', title: 'B' }, { fileUrl: 'https://drive.google.com/file/d/c/view' }] });
  assert.deepEqual(out.not_attached, ['https://x.example/none']);
  assert.throws(() => mergeAttachments([], Array.from({ length: 26 }, (_, i) => ({ file_url: `https://drive.google.com/file/d/${i}/view` })), []), /at most 25 attachments/);
});

// ---------------------------------------------------------------------------
// focus time, out of office, working location

test('event types: focus time and out of office block time with their properties; working location is public and free', async () => {
  reset(() => ({ ...EVENT, eventType: 'focusTime' }));
  const out = await run('calendar_create_event', { summary: 'Focus', start: '2026-11-02T09:00:00Z', end: '2026-11-02T11:00:00Z', event_type: 'focusTime', auto_decline: 'declineOnlyNewConflictingInvitations', decline_message: 'In focus', chat_status: 'doNotDisturb' });
  assert.equal(calls[0].body.eventType, 'focusTime');
  assert.equal(calls[0].body.transparency, 'opaque');
  assert.deepEqual(calls[0].body.focusTimeProperties, { autoDeclineMode: 'declineOnlyNewConflictingInvitations', declineMessage: 'In focus', chatStatus: 'doNotDisturb' });
  assert.equal(out.event_type, 'focusTime');

  assert.deepEqual(statusFields({ event_type: 'outOfOffice', auto_decline: 'declineAllConflictingInvitations', start: '2026-11-02T09:00:00Z', end: '2026-11-06T17:00:00Z' }), {
    eventType: 'outOfOffice',
    transparency: 'opaque',
    outOfOfficeProperties: { autoDeclineMode: 'declineAllConflictingInvitations' },
  });
  assert.deepEqual(statusFields({ event_type: 'workingLocation', working_location: { type: 'homeOffice' }, start: '2026-11-02', end: '2026-11-03' }), {
    eventType: 'workingLocation',
    visibility: 'public',
    transparency: 'transparent',
    workingLocationProperties: { type: 'homeOffice', homeOffice: {} },
  });
  assert.deepEqual(statusFields({ event_type: 'workingLocation', working_location: { type: 'officeLocation', label: 'HQ', building_id: 'b1', desk_id: 'd7' }, start: '2026-11-02T09:00:00Z', end: '2026-11-02T13:00:00Z' }).workingLocationProperties, {
    type: 'officeLocation',
    officeLocation: { label: 'HQ', buildingId: 'b1', deskId: 'd7' },
  });
  assert.deepEqual(statusFields({ event_type: 'workingLocation', working_location: { type: 'customLocation', label: 'Café' }, start: '2026-11-02', end: '2026-11-03' }).workingLocationProperties, {
    type: 'customLocation',
    customLocation: { label: 'Café' },
  });
  assert.deepEqual(statusFields({ start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z' }), {}, 'no event_type: no field, as before');
  for (const [args, message] of [
    [{ event_type: 'focusTime', start: '2026-11-02', end: '2026-11-03' }, /cannot be all-day/],
    [{ event_type: 'outOfOffice', availability: 'free', start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z' }, /blocks time/],
    [{ event_type: 'outOfOffice', chat_status: 'available', start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z' }, /chat_status goes with event_type focusTime/],
    [{ event_type: 'workingLocation', start: '2026-11-02', end: '2026-11-03' }, /needs working_location/],
    [{ event_type: 'workingLocation', working_location: { type: 'homeOffice' }, start: '2026-11-02', end: '2026-11-04' }, /spans exactly one day/],
    [{ event_type: 'workingLocation', working_location: { type: 'homeOffice' }, visibility: 'private', start: '2026-11-02', end: '2026-11-03' }, /is public/],
    [{ event_type: 'workingLocation', working_location: { type: 'homeOffice', label: 'x' }, start: '2026-11-02', end: '2026-11-03' }, /go with an officeLocation or customLocation/],
    [{ auto_decline: 'declineNone', start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z' }, /go with event_type focusTime, outOfOffice or workingLocation/],
  ]) {
    assert.throws(() => statusFields(args), message, JSON.stringify(args));
  }
});

test('keptEnd: the end that keeps an event\'s length, written as the start is', () => {
  const ev = { start: { dateTime: '2026-11-02T10:00:00+01:00' }, end: { dateTime: '2026-11-02T10:20:00+01:00' } };
  assert.deepEqual(keptEnd(ev, '2026-11-02T23:50:00-05:00', undefined), { end: { dateTime: '2026-11-03T00:10:00-05:00', timeZone: undefined }, kept: '20 minute(s)' });
  // A local start: the end is a local time in the same zone, past midnight here.
  assert.deepEqual(keptEnd(ev, '2026-11-02T23:50', 'Europe/Berlin'), { end: { dateTime: '2026-11-03T00:10:00', timeZone: 'Europe/Berlin' }, kept: '20 minute(s)' });
  // An all-day event keeps its number of days; a time for an all-day event (or a date for a timed one) cannot.
  assert.deepEqual(keptEnd({ start: { date: '2026-12-24' }, end: { date: '2026-12-26' } }, '2026-12-30', undefined), { end: { date: '2027-01-01' }, kept: '2 day(s)' });
  assert.throws(() => keptEnd({ start: { date: '2026-12-24' }, end: { date: '2026-12-26' } }, '2026-12-30T10:00:00Z', undefined), /the event is all-day; give end too/);
});

// ---------------------------------------------------------------------------
// list_calendars paging

test('list_calendars: the plain list as before; { calendars, next_page_token } when paging or when Google has more', async () => {
  const item = { id: 'primary-id', summary: 'Me', primary: true, accessRole: 'owner', timeZone: 'Europe/Berlin' };
  reset(() => ({ items: [item] }));
  const plain = await run('calendar_list_calendars', {});
  assert.deepEqual(calls[0].query, { maxResults: '250' });
  assert.deepEqual(plain, [{ id: 'primary-id', summary: 'Me', primary: true, access_role: 'owner', time_zone: 'Europe/Berlin' }]);
  reset(() => ({ items: [item], nextPageToken: 'n2' }));
  const more = await run('calendar_list_calendars', {});
  assert.deepEqual(more, { next_page_token: 'n2', calendars: plain });
  reset(() => ({ items: [item] }));
  const paged = await run('calendar_list_calendars', { page_size: 10, page_token: 'n2' });
  assert.deepEqual(calls[0].query, { maxResults: '10', pageToken: 'n2' });
  assert.deepEqual(paged, { next_page_token: undefined, calendars: plain });
});
