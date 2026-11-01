// The curated Meet tools (2.6.0): meet_find_conference and meet_get_transcript, from the adversarial review of gmeet
// (F3). They replace a run of generated calls and return names instead of resource ids. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const meet = await import(DIST('servers/meet.js'));
const { conferenceFilter, spaceNameOf, participantName, entryOf, MEET_RECORDS_MAX, MEET_PARTICIPANTS_MAX, TRANSCRIPT_ENTRY_CHARS } = meet;

const root = mkdtempSync(join(tmpdir(), 'gsm-meet-tools-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await meet.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = key in query ? [].concat(query[key], value) : value;
  calls.push({ method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data });
  return { data: await respond({ method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data }), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;

// ---------------------------------------------------------------------------
// Kinds, scopes and the pure helpers

test('both tools are reads with the two Meet scope families, and neither changes anything', () => {
  assert.deepEqual([...tools.keys()].sort(), ['meet_find_conference', 'meet_get_transcript']);
  for (const t of tools.values()) {
    assert.equal(t.kind, 'read', t.name);
    assert.deepEqual(t.scopes, [G('meetings.space.created'), G('meetings.space.readonly')], t.name);
    assert.equal(t.prepare, undefined, `${t.name} has no prepare: a read has nothing to approve`);
    assert.ok(t.description.length <= 2048, `${t.name}: ${t.description.length} characters`);
  }
});

test('conferenceFilter: Discovery\'s own field names and syntax, a meeting code against a space name, joined with AND', () => {
  // A meeting code always holds a dash; a space id never does (Discovery's `name` text).
  assert.equal(conferenceFilter('abc-mnop-xyz', undefined, undefined), 'space.meeting_code = "abc-mnop-xyz"');
  assert.equal(conferenceFilter('ABC-MNOP-XYZ', undefined, undefined), 'space.meeting_code = "abc-mnop-xyz"');
  assert.equal(conferenceFilter('jQCFfuBOdN5z', undefined, undefined), 'space.name = "spaces/jQCFfuBOdN5z"');
  assert.equal(conferenceFilter('spaces/jQCFfuBOdN5z', undefined, undefined), 'space.name = "spaces/jQCFfuBOdN5z"');
  assert.equal(
    conferenceFilter('abc-mnop-xyz', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
    'space.meeting_code = "abc-mnop-xyz" AND start_time >= "2026-10-01T00:00:00Z" AND start_time <= "2026-10-02T00:00:00Z"',
  );
  assert.equal(conferenceFilter(undefined, '2026-10-01T00:00:00Z', undefined), 'start_time >= "2026-10-01T00:00:00Z"');
  assert.equal(conferenceFilter(undefined, undefined, undefined), undefined, 'no filter lists the newest records');
  assert.equal(conferenceFilter('  ', undefined, undefined), undefined);
});

test('spaceNameOf: a code, an id or a name all become a spaces/ resource (spaces.get takes a meeting code there)', () => {
  assert.equal(spaceNameOf('abc-mnop-xyz'), 'spaces/abc-mnop-xyz');
  assert.equal(spaceNameOf('spaces/abc-mnop-xyz'), 'spaces/abc-mnop-xyz');
  assert.equal(spaceNameOf(' jQCFfuBOdN5z '), 'spaces/jQCFfuBOdN5z');
});

test('participantName reads whichever way the person joined; entryOf names the speaker and cuts the text', () => {
  assert.equal(participantName({ signedinUser: { displayName: 'Ana' } }), 'Ana');
  assert.equal(participantName({ anonymousUser: { displayName: 'Guest' } }), 'Guest');
  assert.equal(participantName({ phoneUser: { displayName: '+1 555' } }), '+1 555');
  assert.equal(participantName({}), undefined);
  const names = new Map([['conferenceRecords/c1/participants/p1', 'Ana']]);
  const e = entryOf({ participant: 'conferenceRecords/c1/participants/p1', startTime: '2026-10-30T09:05:00Z', text: 'Hello' }, names, undefined, 800);
  assert.deepEqual([e.speaker, e.text, e.start], ['Ana', 'Hello', '2026-10-30T09:05:00Z']);
  const long = entryOf({ participant: 'conferenceRecords/c1/participants/p9', startTime: '2026-10-30T09:05:00Z', text: 'x'.repeat(900) }, names, undefined, 800);
  assert.equal(long.speaker, 'unknown speaker');
  assert.equal(long.participant, 'conferenceRecords/c1/participants/p9', 'a speaker whose name is not known keeps the id');
  assert.equal(long.text.length, 803);
  assert.equal(long.text_truncated, true);
  assert.equal(long.text_chars, 900);
});

// ---------------------------------------------------------------------------
// meet_find_conference

const record = (n, extra = {}) => ({
  name: `conferenceRecords/c${n}`,
  space: 'spaces/AAA',
  startTime: `2026-10-0${n}T09:00:00Z`,
  endTime: `2026-10-0${n}T10:00:00Z`,
  expireTime: `2026-11-0${n}T09:00:00Z`,
  ...extra,
});

test('meet_find_conference: the records, one space read each, the participants named, and the page token', async () => {
  reset((call) => {
    if (call.path === '/v2/conferenceRecords') return { conferenceRecords: [record(1), record(2)], nextPageToken: 'p2' };
    if (call.path === '/v2/spaces/AAA') return { name: 'spaces/AAA', meetingCode: 'abc-mnop-xyz', meetingUri: 'https://meet.google.com/abc-mnop-xyz' };
    if (call.path === '/v2/conferenceRecords/c1/participants')
      return {
        participants: [
          { name: 'conferenceRecords/c1/participants/p1', signedinUser: { displayName: 'Ana' }, earliestStartTime: '2026-10-31T09:00:01Z', latestEndTime: '2026-10-31T09:59:00Z' },
          { name: 'conferenceRecords/c1/participants/p2', anonymousUser: { displayName: 'Guest' }, earliestStartTime: '2026-10-31T09:10:00Z' },
        ],
      };
    if (call.path === '/v2/conferenceRecords/c2/participants') return { participants: [{ name: 'conferenceRecords/c2/participants/p3', phoneUser: { displayName: '+1 555' }, earliestStartTime: '2026-10-31T10:00:00Z' }] };
    return {};
  });
  const answer = await run('meet_find_conference', { space: 'abc-mnop-xyz', page_size: 2 });
  const list = calls.find((c) => c.path === '/v2/conferenceRecords');
  assert.deepEqual(list.query, { filter: 'space.meeting_code = "abc-mnop-xyz"', pageSize: '2' });
  // One spaces.get per distinct space, not one per record.
  assert.deepEqual(calls.filter((c) => c.path === '/v2/spaces/AAA').length, 1);
  assert.deepEqual(answer.conferences[0].meeting_code, 'abc-mnop-xyz');
  assert.deepEqual(answer.conferences[0].meeting_uri, 'https://meet.google.com/abc-mnop-xyz');
  assert.deepEqual(answer.conferences[0].participants, [
    { name: 'Ana', joined: '2026-10-31T09:00:01Z', left: '2026-10-31T09:59:00Z' },
    { name: 'Guest', joined: '2026-10-31T09:10:00Z' },
  ]);
  assert.deepEqual(answer.conferences[1].participants, [{ name: '+1 555', joined: '2026-10-31T10:00:00Z' }]);
  assert.equal(answer.conferences[0].ongoing, false);
  assert.equal(answer.next_page_token, 'p2');
  // Every call is a GET: both tools only read.
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('meet_find_conference: no participants on request, a space that cannot be read, and an ongoing meeting', async () => {
  reset((call) => {
    if (call.path === '/v2/conferenceRecords') return { conferenceRecords: [record(3, { endTime: undefined })] };
    if (call.path === '/v2/spaces/AAA') throw Object.assign(new Error('forbidden'), { code: 403 });
    return {};
  });
  const answer = await run('meet_find_conference', { include_participants: false, time_zone: 'Europe/Berlin' });
  assert.equal(calls.filter((c) => c.path.endsWith('/participants')).length, 0, 'no participant request');
  assert.equal(answer.conferences[0].meeting_code, undefined, 'the record is still shown without its space');
  assert.equal(answer.conferences[0].ongoing, true);
  // A zone is applied to the times shown (Europe/Berlin is +02:00 in October).
  assert.equal(answer.conferences[0].start, '2026-10-03T11:00:00+02:00');
  assert.equal(answer.next_page_token, undefined);
});

test('meet_find_conference: Discovery\'s pageSize maximum is the tool\'s', () => {
  assert.equal(MEET_RECORDS_MAX, 100);
  assert.equal(MEET_PARTICIPANTS_MAX, 25);
});

// ---------------------------------------------------------------------------
// meet_get_transcript

const TRANSCRIPT = { name: 'conferenceRecords/c1/transcripts/t1', state: 'ENDED', startTime: '2026-10-31T09:00:00Z', docsDestination: { document: 'doc-1', exportUri: 'https://docs.google.com/document/d/doc-1' } };
const transcriptCall = (call) => {
  if (call.path === '/v2/conferenceRecords/c1/transcripts') return { transcripts: [TRANSCRIPT] };
  if (call.path === '/v2/conferenceRecords/c1/participants')
    return { participants: [{ name: 'conferenceRecords/c1/participants/p1', signedinUser: { displayName: 'Ana' } }] };
  if (call.path === '/v2/conferenceRecords/c1/transcripts/t1/entries')
    return {
      transcriptEntries: [
        { name: 'conferenceRecords/c1/transcripts/t1/entries/e1', participant: 'conferenceRecords/c1/participants/p1', startTime: '2026-10-31T09:05:00Z', text: 'Hello all' },
        { name: 'conferenceRecords/c1/transcripts/t1/entries/e2', participant: 'conferenceRecords/c1/participants/p2', startTime: '2026-10-31T09:06:00Z', text: 'Hi' },
      ],
      nextPageToken: 'n2',
    };
  return {};
};

test('meet_get_transcript: the entries with their speakers, the Doc id, and the page token', async () => {
  reset(transcriptCall);
  const answer = await run('meet_get_transcript', { conference: 'conferenceRecords/c1', page_size: 2, max_chars: 500 });
  assert.deepEqual(calls.find((c) => c.path.endsWith('/entries')).query, { pageSize: '2' });
  assert.equal(answer.conference, 'conferenceRecords/c1');
  assert.equal(answer.transcript, TRANSCRIPT.name);
  assert.deepEqual(answer.entries, [
    { start: '2026-10-31T09:05:00Z', speaker: 'Ana', text: 'Hello all' },
    { start: '2026-10-31T09:06:00Z', speaker: 'unknown speaker', participant: 'conferenceRecords/c1/participants/p2', text: 'Hi' },
  ]);
  assert.deepEqual(answer.transcripts[0].doc, { document_id: 'doc-1', export_uri: 'https://docs.google.com/document/d/doc-1' });
  assert.equal(answer.next_page_token, 'n2');
  assert.ok(answer.next_note);
});

test('meet_get_transcript: a bare record id is accepted, and a page token is passed through', async () => {
  reset(transcriptCall);
  const answer = await run('meet_get_transcript', { conference: 'c1', page_token: 'n2' });
  assert.equal(answer.conference, 'conferenceRecords/c1');
  assert.deepEqual(calls.find((c) => c.path.endsWith('/entries')).query, { pageSize: '20', pageToken: 'n2' });
  assert.equal(answer.next_page_token, 'n2');
});

test('meet_get_transcript: a meeting code or space reads the newest conference of that space', async () => {
  reset((call) => {
    if (call.path === '/v2/conferenceRecords') {
      assert.deepEqual(call.query, { filter: 'space.name = "spaces/abc-def-ghi"', pageSize: '10' });
      return { conferenceRecords: [record(4)] };
    }
    if (call.path === '/v2/conferenceRecords/c4/transcripts') return { transcripts: [TRANSCRIPT] };
    if (call.path === '/v2/conferenceRecords/c4/participants') return { participants: [] };
    return {};
  });
  const answer = await run('meet_get_transcript', { space: 'abc-def-ghi' });
  assert.equal(answer.conference, 'conferenceRecords/c4');
  assert.deepEqual(answer.entries, []);
});

test('meet_get_transcript: no transcript, no conference, and an unknown transcript each say what to do', async () => {
  reset(() => ({ transcripts: [] }));
  const none = await run('meet_get_transcript', { conference: 'conferenceRecords/c1' });
  assert.deepEqual(none.transcripts, []);
  assert.match(none.note, /no transcript/);

  reset(() => ({ conferenceRecords: [] }));
  await assert.rejects(() => run('meet_get_transcript', { space: 'abc-mnop-xyz' }), /No conference record for spaces\/abc-mnop-xyz/);
  await assert.rejects(() => run('meet_get_transcript', {}), /Give conference .* or space/);

  reset(transcriptCall);
  await assert.rejects(() => run('meet_get_transcript', { conference: 'conferenceRecords/c1', transcript: 'conferenceRecords/c1/transcripts/t9' }), /No transcript conferenceRecords\/c1\/transcripts\/t9/);
});

test('meet_get_transcript: the transcript entry cap is the tool\'s, and the default is a page that fits the result limit', () => {
  const e = tools.get('meet_get_transcript');
  assert.equal(TRANSCRIPT_ENTRY_CHARS, 800);
  const size = e.inputSchema.page_size;
  const chars = e.inputSchema.max_chars;
  assert.equal(size.safeParse(101).success, false, 'at most 100 entries, as Discovery says');
  assert.equal(chars.safeParse(5000).success, false);
  assert.equal(size.safeParse(20).success, true);
  assert.equal(chars.safeParse(800).success, true);
});

// ---------------------------------------------------------------------------
// The plugin's files: the curated toolset and the google list

test('the bundled gmeet plugin registers both tools, lists them in google, and the curated toolset holds them', () => {
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gmeet', 'tool-map.json'), 'utf8'));
  const names = map.map((e) => e.name.replace('mcp__plugin_gmeet_gmeet__', ''));
  assert.ok(names.includes('meet_find_conference'));
  assert.ok(names.includes('meet_get_transcript'));
  for (const name of ['meet_find_conference', 'meet_get_transcript']) assert.equal(map.find((e) => e.name.endsWith(`__${name}`)).kind, 'read', name);
  const servers = JSON.parse(readFileSync(join(REPO, 'plugins', 'gmeet', 'servers.json'), 'utf8'));
  const entry = servers.servers[0];
  assert.equal(entry.curated, 'src/servers/meet.ts');
  const google = entry.toolsets.google;
  assert.ok(google.includes('meet_find_conference') && google.includes('meet_get_transcript'));
  assert.ok(!google.includes('meet_conference_records_smart_notes_get'), 'the smart notes get left the list: the list returns the same fields');
  assert.equal(google.length, 11);
});
