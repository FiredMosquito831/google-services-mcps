// The new Calendar tools through the real approval gate: a runServer child with the curated Calendar tools, driven by
// the MCP client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a
// file, so nothing reaches Google. A write (calendar_respond, calendar_update_event with guest changes) asks before any
// request; declined, nothing is read or changed. A read (calendar_suggest_time) never asks.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function writeEntry(dir) {
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(REPO, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `const event = { id: 'ev-1', summary: 'Review', start: { dateTime: '2026-11-02T10:00:00Z' }, end: { dateTime: '2026-11-02T11:00:00Z' },`,
      `  attendees: [{ email: 'me@example.com', self: true, responseStatus: 'needsAction' }, { email: 'ana@example.com', responseStatus: 'accepted' }] };`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  const method = String(opts.method ?? 'GET').toUpperCase();`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, body: opts.data }) + '\\n');`,
      `  const data = url.pathname.endsWith('/freeBusy') ? { calendars: { primary: { busy: [] } } } : event;`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/gcalendar.js'))});`,
      `await runServer({ name: 'gcalendar', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-calendar-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  return { dir, tokens, entry: writeEntry(dir), callsFile: join(dir, 'calls.jsonl') };
}

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function childEnv(s) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
  );
  return { ...base, GSM_TOKEN_DIR: s.tokens, GSM_ALLOW_WRITES: 'true', CALLS_FILE: s.callsFile, APPDATA: join(s.dir, 'appdata') };
}

async function connect(s, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [s.entry], env: childEnv(s), stderr: 'pipe' });
  const client = new Client({ name: 'calendar-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const auditOf = (tokens) => readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('calendar_respond and calendar_update_event: declined, nothing is read or changed; suggest_time never asks', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    for (const name of ['calendar_respond', 'calendar_update_event', 'calendar_create_event']) {
      const t = tools.find((x) => x.name === name);
      assert.ok(t, `${name} is listed when writes are on`);
      assert.equal(t.annotations.readOnlyHint, false, name);
      assert.equal(t.inputSchema.properties.confirm, undefined, `${name}: no model-controlled confirm`);
    }
    assert.equal(tools.find((x) => x.name === 'calendar_suggest_time').annotations.readOnlyHint, true);

    const res = await client.callTool({ name: 'calendar_respond', arguments: { event_id: 'ev-1', response: 'accepted' } });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
    const upd = await client.callTool({ name: 'calendar_update_event', arguments: { event_id: 'ev-1', add_attendees: ['carl@example.com'] } });
    assert.equal(upd.isError, true);
    assert.equal(asked.length, 2);
    assert.match(asked[0].message, /calendar_respond/);
    assert.match(asked[1].message, /carl@example\.com/);
    assert.equal(callsIn(s.callsFile).length, 0, 'declined: not even the read of the event');

    const read = await client.callTool({ name: 'calendar_suggest_time', arguments: { attendees: ['ana@example.com'], start_time: '2026-11-02T09:00:00Z', end_time: '2026-11-02T10:00:00Z' } });
    assert.notEqual(read.isError, true, read.content[0].text);
    assert.equal(asked.length, 2, 'a read does not ask');
    assert.deepEqual(callsIn(s.callsFile).map((c) => c.method), ['POST']);
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.outcome]), [['calendar_respond', 'declined'], ['calendar_update_event', 'declined']]);
  } finally {
    await client.close();
  }
});

test('calendar_respond approved: the event is read and patched once, after the approval', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'calendar_respond', arguments: { event_id: 'ev-1', response: 'declined', comment: 'Away' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'the approval came before any request');
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
    assert.deepEqual(calls[1].body, { attendeesOmitted: true, attendees: [{ email: 'me@example.com', responseStatus: 'declined', comment: 'Away' }] });
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['calendar_respond', 'modify', 'approved']]);
  } finally {
    await client.close();
  }
});
