// ga_annotation_create through the real approval gate: a runServer child with the curated Analytics tools, driven by
// the MCP client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a
// file, so nothing reaches Google. The prepare step checks the dates and builds the annotation without a request; the
// approval shows it; declined, nothing is posted. A report (ga_run_report) never asks.
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
      `  let data = {};`,
      `  if (url.pathname.endsWith('/reportingDataAnnotations')) data = { name: 'properties/123/reportingDataAnnotations/9', ...opts.data };`,
      `  if (url.pathname.endsWith(':runReport')) data = { rowCount: 0 };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/ganalytics.js'))});`,
      `await runServer({ name: 'ganalytics', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-analytics-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'business.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
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
  const client = new Client({ name: 'analytics-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const auditOf = (tokens) => (existsSync(join(tokens, 'audit.log')) ? readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);

test('ga_annotation_create declined: nothing is posted; the approval shows the exact annotation; a bad date is refused without asking; a report never asks', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    const create = tools.find((t) => t.name === 'ga_annotation_create');
    assert.ok(create, 'listed when writes are on');
    assert.equal(create.annotations.readOnlyHint, false);
    assert.equal(create.inputSchema.properties.confirm, undefined, 'no model-controlled confirm');
    for (const name of ['ga_run_report', 'ga_run_realtime_report', 'ga_run_funnel_report', 'ga_annotations_list']) {
      assert.equal(tools.find((t) => t.name === name).annotations.readOnlyHint, true, name);
    }

    const declined = await client.callTool({ name: 'ga_annotation_create', arguments: { property_id: '123', title: 'Spring sale', start_date: '2026-03-01', end_date: '2026-03-15', color: 'GREEN' } });
    assert.equal(declined.isError, true);
    assert.match(declined.content[0].text, /You declined this action\. Nothing was changed\./);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'nothing was sent before the approval');
    assert.match(asked[0].message, /ga_annotation_create/);
    assert.match(asked[0].message, /Spring sale/);
    assert.match(asked[0].message, /properties\/123/);
    assert.match(asked[0].message, /GREEN/);
    assert.equal(callsIn(s.callsFile).length, 0, 'nothing posted');

    const badDate = await client.callTool({ name: 'ga_annotation_create', arguments: { property_id: '123', title: 'x', start_date: '2026-02-30' } });
    assert.equal(badDate.isError, true);
    assert.match(badDate.content[0].text, /not a date in the form YYYY-MM-DD/);
    assert.equal(asked.length, 1, 'a bad date is refused before the approval');

    const report = await client.callTool({ name: 'ga_run_report', arguments: { property_id: '123', date_ranges: [{ start_date: 'today', end_date: 'today' }], metrics: ['activeUsers'] } });
    assert.notEqual(report.isError, true, report.content[0].text);
    assert.equal(asked.length, 1, 'a report does not ask');
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.outcome]), [['ga_annotation_create', 'declined']]);
  } finally {
    await client.close();
  }
});

test('ga_annotation_create approved: one POST, after the approval, with the annotation that was shown', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'ga_annotation_create', arguments: { property_id: 'properties/123', title: 'Launch', start_date: '2026-10-01', description: 'New site' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0);
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => [c.method, c.path]), [['POST', '/v1alpha/properties/123/reportingDataAnnotations']]);
    assert.deepEqual(calls[0].body, { title: 'Launch', description: 'New site', color: 'PURPLE', annotationDate: { year: 2026, month: 10, day: 1 } });
    assert.deepEqual(JSON.parse(res.content[0].text).created, { name: 'properties/123/reportingDataAnnotations/9', title: 'Launch', description: 'New site', date: '2026-10-01', color: 'PURPLE' });
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['ga_annotation_create', 'modify', 'approved']]);
  } finally {
    await client.close();
  }
});
