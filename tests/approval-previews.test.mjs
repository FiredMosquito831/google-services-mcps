// Exact approval previews (1.27.0, spec 2026-10-30-adversarial-review, owner decision 2).
//   - calendar_delete_event reads the event first: title, time, and whether the ID is one event, one occurrence or a
//     whole recurring series. chat_send_message names the people of a direct message and shows up to 1,500 characters.
//   - A generated write or destructive tool whose method names one resource, with a GET of that resource in the same API,
//     reads it first and adds a few fields that name it to the approval (src/core/target-preview.ts). Without such a GET,
//     or when the read fails, the approval text is exactly what it was.
// The previews are approval text only: what the tool sends does not change, and a declined approval sends nothing.
// Server children stub their HTTP layer and point any other request at a closed loopback port. No network call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { flattenMethods } = await import(dist('core/discovery/methods.js'));
const { targetGetFor, targetFieldsOf, settleWithin, TARGET_FIELDS, TARGET_MAX_FIELDS, TARGET_VALUE_CHARS, TARGET_PREVIEW_KEY } = await import(dist('core/target-preview.js'));
const { formMayShow } = await import(dist('core/tools.js'));
const { decide, describeAction } = await import(dist('core/policy.js'));
const { CREDENTIAL_FIELDS } = await import(dist('core/credential-fields.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const kindsFile = readJson('config', 'tool-kinds.json');
const overrides = Object.fromEntries(Object.entries(kindsFile).filter(([key]) => key !== 'notes'));
const snapshot = (key) => readJson('data', 'discovery', `${key}.json`);
const methodsOf = (key, api, version) => flattenMethods(snapshot(key), api, version, overrides);
const byId = (list, id) => list.find((m) => m.fullId === id);

// ---------------------------------------------------------------------------
// 1. Which GET reads a write's target

test('targetGetFor: the GET of the same resource, same path parameters, a read; never for a create', () => {
  const tasks = methodsOf('tasks.v1', 'tasks', 'v1');
  assert.equal(targetGetFor(byId(tasks, 'tasks.tasks.delete'), tasks)?.fullId, 'tasks.tasks.get');
  assert.equal(targetGetFor(byId(tasks, 'tasks.tasks.patch'), tasks)?.fullId, 'tasks.tasks.get');
  assert.equal(targetGetFor(byId(tasks, 'tasks.tasks.insert'), tasks), undefined, 'a create names its parent list, not the new task');
  assert.equal(targetGetFor(byId(tasks, 'tasks.tasks.clear'), tasks), undefined, 'clear acts on a list, with no list get in the tasks resource');
  assert.equal(targetGetFor(byId(tasks, 'tasks.tasks.get'), tasks), undefined, 'a read has no preview');
  const meet = methodsOf('meet.v2', 'meet', 'v2');
  assert.equal(targetGetFor(byId(meet, 'meet.spaces.endActiveConference'), meet)?.fullId, 'meet.spaces.get');
  const drive = methodsOf('drive.v3', 'drive', 'v3');
  assert.equal(targetGetFor(byId(drive, 'drive.permissions.update'), drive)?.fullId, 'drive.permissions.get');
  assert.equal(targetGetFor(byId(drive, 'drive.permissions.create'), drive), undefined);
});

test('targetGetFor never reads through a credential reveal or a GET that writes, in any snapshot', () => {
  // A fake API with a credential reveal named get (a write in config/tool-kinds.json) beside its delete.
  const doc = {
    name: 'androidmanagement',
    version: 'v1',
    rootUrl: 'https://androidmanagement.googleapis.com/',
    servicePath: '',
    schemas: {},
    resources: {
      enterprises: {
        resources: {
          enrollmentTokens: {
            methods: {
              get: { id: 'androidmanagement.enterprises.enrollmentTokens.get', path: 'v1/{+name}', httpMethod: 'GET', parameters: [{ name: 'name', location: 'path', required: true }] },
              delete: { id: 'androidmanagement.enterprises.enrollmentTokens.delete', path: 'v1/{+name}', httpMethod: 'DELETE', parameters: [{ name: 'name', location: 'path', required: true }] },
            },
          },
        },
      },
    },
  };
  const list = flattenMethods(doc, 'androidmanagement', 'v1', overrides);
  assert.equal(byId(list, 'androidmanagement.enterprises.enrollmentTokens.get').kind, 'write');
  assert.equal(targetGetFor(byId(list, 'androidmanagement.enterprises.enrollmentTokens.delete'), list), undefined);
  // A get that needs more than the path (a required readMask, say) would fail, so it is not used.
  const path = [{ name: 'name', location: 'path', required: true }];
  const masked = {
    name: 'example',
    version: 'v1',
    rootUrl: 'https://example.googleapis.com/',
    servicePath: '',
    schemas: {},
    resources: {
      things: {
        methods: {
          get: { id: 'example.things.get', path: 'v1/{+name}', httpMethod: 'GET', parameters: [...path, { name: 'readMask', location: 'query', required: true }] },
          patch: { id: 'example.things.patch', path: 'v1/{+name}', httpMethod: 'PATCH', parameters: path },
        },
      },
    },
  };
  const maskedList = flattenMethods(masked, 'example', 'v1', overrides);
  assert.equal(targetGetFor(byId(maskedList, 'example.things.patch'), maskedList), undefined);
  masked.resources.things.methods.get.parameters[1].required = false;
  const optionalList = flattenMethods(masked, 'example', 'v1', overrides);
  assert.equal(targetGetFor(byId(optionalList, 'example.things.patch'), optionalList)?.fullId, 'example.things.get', 'an optional query parameter is fine');
  // Every pairing over every snapshot: the GET is a read named get, with no required query parameter.
  let pairs = 0;
  for (const file of readdirSync(join(ROOT, 'data', 'discovery')).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    const d = readJson('data', 'discovery', file);
    const all = flattenMethods(d, d.name, d.version, overrides);
    for (const m of all) {
      const g = targetGetFor(m, all);
      if (!g) continue;
      pairs++;
      assert.equal(g.kind, 'read', `${m.fullId} <- ${g.fullId}`);
      assert.equal(g.httpMethod, 'GET', g.fullId);
      assert.equal(kindsFile[g.fullId], undefined, `${g.fullId} has no override (no credential reveal, no GET that writes)`);
      assert.equal(g.parameters.some((p) => p.location !== 'path' && p.required), false, `${g.fullId} needs nothing but the path`);
      assert.ok(m.kind === 'write' || m.kind === 'destructive', m.fullId);
    }
  }
  assert.ok(pairs > 500, `pairs found: ${pairs}`);
});

test('targetFieldsOf: top-level strings of the listed fields only, at most four, each cut to 200 characters; no credential field is one of them', () => {
  assert.equal(targetFieldsOf(null), undefined);
  assert.equal(targetFieldsOf([{ title: 'x' }]), undefined);
  assert.equal(targetFieldsOf({ snippet: { title: 'nested' }, id: '1' }), undefined, 'nested and other fields are not shown');
  assert.deepEqual(targetFieldsOf({ title: 'Renew passport', id: 't1', notes: 'at the town hall', due: '2026-11-06' }), { title: 'Renew passport' });
  const many = { email: 'e@example.com', name: 'n', subject: 's', summary: 'm', displayName: 'd', title: 't'.repeat(500) };
  const shown = targetFieldsOf(many);
  assert.deepEqual(Object.keys(shown), ['title', 'displayName', 'summary', 'subject'], `at most ${TARGET_MAX_FIELDS}, in the listed order`);
  assert.equal(shown.title, `${'t'.repeat(TARGET_VALUE_CHARS)}...`);
  assert.deepEqual(targetFieldsOf({ title: '', name: 7, displayName: 'D' }), { displayName: 'D' }, 'empty and non-string values are skipped');
  // The GET result passes the credential list first (discovery/tools.ts); no listed credential field is a target field.
  for (const rule of CREDENTIAL_FIELDS) assert.equal(TARGET_FIELDS.includes(rule.field), false, `${rule.api} ${rule.schema}.${rule.field}`);
  assert.equal(TARGET_PREVIEW_KEY, 'target (read from Google now, not sent)');
});

test('settleWithin gives up on a slow or failed read; formMayShow skips a read nobody would see', async () => {
  assert.equal(await settleWithin(new Promise((r) => setTimeout(() => r('late'), 200)), 20), undefined);
  assert.equal(await settleWithin(Promise.reject(new Error('404')), 1000), undefined);
  assert.equal(await settleWithin(Promise.resolve('ok'), 1000), 'ok');
  const cfg = (o) => ({ hookActive: false, confirmation: 'every-change', confirmationFromEnv: false, ...o });
  assert.equal(formMayShow('destructive', cfg({ hookActive: true })), true, 'the form asks a destructive call even with the hook');
  assert.equal(formMayShow('write', cfg({ hookActive: true })), false, 'the hook asks about a change');
  assert.equal(formMayShow('write', cfg({})), true, 'no hook: the form asks');
  assert.equal(formMayShow('write', cfg({ confirmation: 'destructive-only', confirmationFromEnv: true })), false);
  assert.equal(formMayShow('destructive', cfg({ confirmation: 'destructive-only', confirmationFromEnv: true })), true);
  assert.equal(formMayShow('destructive', cfg({ confirmation: 'off', confirmationFromEnv: true })), false);
});

// ---------------------------------------------------------------------------
// 2. Server children

/**
 * A runServer child. `body` is the server's buildTools line; the stub answers with `responder(method, path)` (a
 * function in the child, given as source text), records each request, and throws for { status } answers.
 */
function childServer(name, group, buildLine, responderSource) {
  const dir = tempDir(`gsm-previews-${name}-`);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(ROOT, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `const respond = ${responderSource};`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  const method = String(opts.method ?? 'GET').toUpperCase();`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, query: { ...Object.fromEntries(url.searchParams), ...(opts.params ?? {}) } }) + '\\n');`,
      `  const data = respond(method, url.pathname);`,
      `  if (data && data.httpError) { const err = new Error('HTTP ' + data.httpError); err.code = data.httpError; err.response = { status: data.httpError, data: {} }; throw err; }`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      buildLine,
      '',
    ].join('\n'),
  );
  return { dir, tokens, entry, callsFile: join(dir, 'calls.jsonl') };
}

const curatedLine = (module, server) =>
  `const { buildTools } = await import(${JSON.stringify(dist(`servers/${module}.js`))}); await runServer({ name: '${server}', version: '0.0.0', buildTools });`;
const generatedLine = (server) =>
  [
    `const { withOrigin } = await import(${JSON.stringify(dist('core/toolset.js'))});`,
    `const { discoveryToolsFor } = await import(${JSON.stringify(dist('core/discovery/tools.js'))});`,
    `await runServer({ name: '${server}', version: '0.0.0', buildTools: async (cfg) => withOrigin('generated', await discoveryToolsFor('${server}', cfg, [])) });`,
  ].join('\n');

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

function serverEnv(s, extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return {
    ...base,
    GSM_TOKEN_DIR: s.tokens,
    GSM_ALLOW_WRITES: 'true',
    CALLS_FILE: s.callsFile,
    APPDATA: join(s.dir, 'appdata'),
    CLOUDSDK_CONFIG: join(s.dir, 'gcloud'),
    HTTPS_PROXY: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    NODE_USE_ENV_PROXY: '1',
    ...extra,
  };
}

async function withClient(s, env, answer, run) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [s.entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-previews-test', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return typeof answer === 'function' ? answer(asked.length) : answer;
  });
  await client.connect(transport);
  try {
    return await run(client, asked);
  } finally {
    await client.close();
  }
}

const DECLINE = { action: 'decline' };
const APPROVE = { action: 'accept', content: { approve: true } };

/** The approval text as before 1.27.0 for these arguments: the gate's reason and describeAction over the raw arguments. */
function plainApproval(toolName, methodId, kind, args) {
  const risk = kind === 'write' ? 'modify' : 'destructive';
  const { reason } = decide({ toolName, methodId, risk, policy: { confirmation: 'every-change', rules: [] } });
  return describeAction({ toolName, methodId, risk, args, reason });
}

test('calendar_delete_event: the approval names the event, says one occurrence or the whole series, and declined, deletes nothing', async () => {
  const responder = `(method, path) => {
    if (method !== 'GET') return {};
    const id = decodeURIComponent(path.split('/').pop());
    const base = { summary: 'Weekly review', start: { dateTime: '2026-11-02T10:00:00+01:00' }, end: { dateTime: '2026-11-02T11:00:00+01:00' }, organizer: { email: 'me@example.com' },
      attendees: [{ email: 'me@example.com', self: true }, { email: 'ana@example.com' }, { email: 'room@resource.calendar.google.com', resource: true }, { email: 'lee@example.com' }] };
    if (id === 'series-1') return { ...base, id, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] };
    if (id === 'series-1_20261109T090000Z') return { ...base, id, recurringEventId: 'series-1', start: { dateTime: '2026-11-09T10:00:00+01:00' } };
    if (id === 'single-1') return { ...base, id, summary: 'Dentist', attendees: [] };
    return { httpError: 404 };
  }`;
  const s = childServer('gcalendar', 'workspace-user', curatedLine('gcalendar', 'gcalendar'), responder);
  await withClient(s, serverEnv(s), DECLINE, async (client, asked) => {
    const del = (args) => client.callTool({ name: 'calendar_delete_event', arguments: args });
    let res = await del({ event_id: 'series-1', send_updates: 'all' });
    assert.equal(res.isError, true);
    assert.match(asked[0].message, /"title": "Weekly review"/);
    assert.match(asked[0].message, /"start": "2026-11-02T10:00:00\+01:00"/);
    assert.match(asked[0].message, /"deletes": "the whole recurring series: every occurrence"/);
    assert.match(asked[0].message, /"guests": 2/, 'you and the room are not counted');
    assert.match(asked[0].message, /Google emails a cancellation to the 2 guest\(s\)/);

    res = await del({ event_id: 'series-1_20261109T090000Z' });
    assert.match(asked[1].message, /"deletes": "one occurrence of a recurring event \(series series-1\); the other occurrences stay"/);
    assert.match(asked[1].message, /"start": "2026-11-09T10:00:00\+01:00"/);
    assert.match(asked[1].message, /Deletes it\. Nobody is emailed\./);

    res = await del({ event_id: 'single-1' });
    assert.match(asked[2].message, /"title": "Dentist"/);
    assert.match(asked[2].message, /"deletes": "one event"/);

    // An event that cannot be read: its ids and the reason, and it still asks.
    res = await del({ event_id: 'gone-1' });
    assert.equal(asked.length, 4);
    assert.match(asked[3].message, /"event_id": "gone-1"/);
    assert.match(asked[3].message, /The event could not be read first, so only its ids are shown/);

    assert.deepEqual(
      callsIn(s.callsFile).map((c) => c.method),
      ['GET', 'GET', 'GET', 'GET'],
      'four reads, no delete',
    );
  });

  const t = childServer('gcalendar', 'workspace-user', curatedLine('gcalendar', 'gcalendar'), responder);
  await withClient(t, serverEnv(t), APPROVE, async (client, asked) => {
    const res = await client.callTool({ name: 'calendar_delete_event', arguments: { event_id: 'series-1' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked[0].callsBefore, 1, 'only the read came before the approval');
    assert.deepEqual(callsIn(t.callsFile).map((c) => [c.method, c.path, c.query.sendUpdates]), [
      ['GET', '/calendar/v3/calendars/primary/events/series-1', undefined],
      ['DELETE', '/calendar/v3/calendars/primary/events/series-1', 'none'],
    ]);
  });
});

test('chat_send_message: a direct message is named by its people; the text is shown up to 1,500 characters with its length', async () => {
  const responder = `(method, path) => {
    if (method === 'GET' && path === '/v1/spaces/DM1') return { name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' };
    if (method === 'GET' && path === '/v1/spaces/DM1/members') return { memberships: [{ member: { name: 'users/1', displayName: 'Ana Lopez', email: 'ana@example.com', type: 'HUMAN' } }, { member: { name: 'users/2', displayName: 'Me', type: 'HUMAN' } }, { member: { name: 'users/app', type: 'BOT' } }] };
    if (method === 'GET' && path === '/v1/spaces/DM2') return { name: 'spaces/DM2', spaceType: 'DIRECT_MESSAGE' };
    if (method === 'GET' && path === '/v1/spaces/DM2/members') return { httpError: 403 };
    if (method === 'GET') return { name: 'spaces/AAA', displayName: 'Launch team', spaceType: 'SPACE' };
    return { name: 'spaces/AAA/messages/new' };
  }`;
  const s = childServer('gchat', 'workspace-user', curatedLine('gchat', 'gchat'), responder);
  const long = `${'a'.repeat(1500)}${'Z'.repeat(1500)}`;
  await withClient(s, serverEnv(s), DECLINE, async (client, asked) => {
    await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/DM1', text: 'See you at 3' } });
    assert.match(asked[0].message, /"conversation": "a direct message"/);
    assert.match(asked[0].message, /"people": \[\s*"Ana Lopez <ana@example\.com>",\s*"Me"\s*\]/);
    assert.match(asked[0].message, /"text": "See you at 3"/);

    await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/DM2', text: 'hi' } });
    assert.match(asked[1].message, /"people": "\(the members are not readable with this sign-in\)"/);

    await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/AAA', text: long } });
    assert.match(asked[2].message, /"conversation": "Launch team"/);
    assert.doesNotMatch(asked[2].message, /"people"/, 'a named space shows its name only');
    assert.match(asked[2].message, /"text_chars": 3000/);
    assert.ok(asked[2].message.includes(`${'a'.repeat(1500)}...`), 'the first 1,500 characters');
    assert.equal(asked[2].message.includes('Z'), false, 'nothing after them');
    assert.deepEqual(
      callsIn(s.callsFile).filter((c) => c.method !== 'GET'),
      [],
      'declined: nothing posted',
    );
  });
});

test('generated tools: the approval names the target read first; declined, nothing is changed; approved, the same request as before', async () => {
  const responder = `(method, path) => {
    if (method === 'GET' && path === '/tasks/v1/lists/L1/tasks/T1') return { id: 'T1', title: 'Renew passport', notes: 'town hall', status: 'needsAction' };
    if (method === 'GET' && path === '/tasks/v1/lists/L1/tasks/T2') return { id: 'T2', title: 'x'.repeat(500), name: 'n', displayName: 'Task two', summary: 'S', subject: 'J', email: 'e@example.com' };
    if (method === 'GET') return { httpError: 404 };
    return {};
  }`;
  const s = childServer('gtasks', 'workspace-user', generatedLine('gtasks'), responder);
  await withClient(s, serverEnv(s), DECLINE, async (client, asked) => {
    const del = (task) => client.callTool({ name: 'tasks_tasks_delete', arguments: { tasklist: 'L1', task } });
    const res = await del('T1');
    assert.equal(res.isError, true);
    assert.equal(asked.length, 1);
    assert.ok(asked[0].message.includes(`"${TARGET_PREVIEW_KEY}": {\n    "title": "Renew passport"\n  }`), asked[0].message);
    assert.match(asked[0].message, /"tasklist": "L1"/);
    assert.match(asked[0].message, /"task": "T1"/);
    assert.deepEqual(callsIn(s.callsFile).map((c) => [c.method, c.path]), [['GET', '/tasks/v1/lists/L1/tasks/T1']], 'the read only; no delete');

    // The cap: four fields in the listed order, each value cut to 200 characters.
    await del('T2');
    const block = asked[1].message.slice(asked[1].message.indexOf(TARGET_PREVIEW_KEY), asked[1].message.indexOf('"tasklist"'));
    assert.ok(block.includes(`"title": "${'x'.repeat(200)}..."`), block);
    assert.match(block, /"displayName": "Task two"[\s\S]*"summary": "S"[\s\S]*"subject": "J"/);
    assert.doesNotMatch(block, /"name": "n"|e@example\.com/, 'at most four fields');

    // A target that cannot be read: the approval is exactly the text it was before 1.27.0.
    await del('T404');
    // The arguments as the server receives them, in its schema's order (the path parameters as Discovery lists them).
    assert.equal(asked[2].message, plainApproval('tasks_tasks_delete', 'tasks.tasks.delete', 'destructive', { task: 'T404', tasklist: 'L1' }));

    // A tool whose method names no single resource (a create): no read, the same text as before.
    const before = callsIn(s.callsFile).length;
    await client.callTool({ name: 'tasks_tasks_insert', arguments: { tasklist: 'L1', body: { title: 'New' } } });
    assert.equal(asked[3].message, plainApproval('tasks_tasks_insert', 'tasks.tasks.insert', 'write', { tasklist: 'L1', body: { title: 'New' } }));
    assert.equal(callsIn(s.callsFile).length, before, 'no read for a create');
  });

  const t = childServer('gtasks', 'workspace-user', generatedLine('gtasks'), responder);
  await withClient(t, serverEnv(t), APPROVE, async (client, asked) => {
    const res = await client.callTool({ name: 'tasks_tasks_delete', arguments: { tasklist: 'L1', task: 'T1' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked[0].callsBefore, 1);
    assert.deepEqual(callsIn(t.callsFile).map((c) => [c.method, c.path]), [
      ['GET', '/tasks/v1/lists/L1/tasks/T1'],
      ['DELETE', '/tasks/v1/lists/L1/tasks/T1'],
    ]);
  });
});

test('generated tools: no target read when the form cannot be shown (a change with the hook active); the change runs as asked', async () => {
  const responder = `(method) => (method === 'GET' ? { title: 'should not be read' } : { id: 'T1', title: 'Renamed' })`;
  const s = childServer('gtasks', 'workspace-user', generatedLine('gtasks'), responder);
  await withClient(s, serverEnv(s, { GSM_HOOK_ACTIVE: '1' }), DECLINE, async (client, asked) => {
    const res = await client.callTool({ name: 'tasks_tasks_patch', arguments: { tasklist: 'L1', task: 'T1', body: { title: 'Renamed' } } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 0, 'the hook asked about the change; the server does not');
    assert.deepEqual(callsIn(s.callsFile).map((c) => c.method), ['PATCH'], 'no read for a preview nobody sees');
  });
});
