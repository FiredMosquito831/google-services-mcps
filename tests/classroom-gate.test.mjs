// The Classroom writes through the real approval gate: a runServer child with the curated Classroom tools, driven by
// the MCP client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a
// file, so nothing reaches Google. A write (create announcement, topic or rubric) asks before any request; declined,
// nothing is sent. A read (classroom_list_courses) never asks.
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
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  const method = String(opts.method ?? 'GET').toUpperCase();`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, body: opts.data }) + '\\n');`,
      `  const data = method === 'POST' ? { id: 'new-1', state: opts.data?.state, topicId: 't9', name: opts.data?.name } : { courses: [{ id: '10', name: 'Biology' }] };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/gclassroom.js'))});`,
      `await runServer({ name: 'gclassroom', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-classroom-gate-'));
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
  const client = new Client({ name: 'classroom-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const auditOf = (tokens) => readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('Classroom writes declined: nothing is sent; the approval shows the announcement text; a read never asks', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    for (const name of ['classroom_create_topic', 'classroom_create_announcement', 'classroom_create_rubric']) {
      const t = tools.find((x) => x.name === name);
      assert.ok(t, `${name} is listed when writes are on`);
      assert.equal(t.annotations.readOnlyHint, false, name);
      assert.equal(t.inputSchema.properties.confirm, undefined, `${name}: no model-controlled confirm`);
    }
    const ann = await client.callTool({ name: 'classroom_create_announcement', arguments: { course_id: '10', text: 'Lab on Friday', publish: true } });
    assert.equal(ann.isError, true);
    assert.match(ann.content[0].text, /You declined this action\. Nothing was changed\./);
    const topic = await client.callTool({ name: 'classroom_create_topic', arguments: { course_id: '10', name: 'Unit 3' } });
    assert.equal(topic.isError, true);
    const rubric = await client.callTool({ name: 'classroom_create_rubric', arguments: { course_id: '10', coursework_id: 'w1', criteria: [{ title: 'Clarity', levels: [{ title: 'Good', points: 2 }] }] } });
    assert.equal(rubric.isError, true);
    assert.equal(asked.length, 3);
    assert.match(asked[0].message, /classroom_create_announcement/);
    assert.match(asked[0].message, /Lab on Friday/);
    assert.equal(callsIn(s.callsFile).length, 0, 'declined: no request at all');

    const read = await client.callTool({ name: 'classroom_list_courses', arguments: {} });
    assert.notEqual(read.isError, true, read.content[0].text);
    assert.equal(asked.length, 3, 'a read does not ask');
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.outcome]), [
      ['classroom_create_announcement', 'declined'],
      ['classroom_create_topic', 'declined'],
      ['classroom_create_rubric', 'declined'],
    ]);
  } finally {
    await client.close();
  }
});

test('classroom_create_announcement approved: one POST after the approval, a draft by default', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'classroom_create_announcement', arguments: { course_id: '10', text: 'Quiz next week' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'the approval came before any request');
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => [c.method, c.path, c.body.state]), [['POST', '/v1/courses/10/announcements', 'DRAFT']]);
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['classroom_create_announcement', 'modify', 'approved']]);
  } finally {
    await client.close();
  }
});
