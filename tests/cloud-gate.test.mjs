// The new gcloud tools through the real approval gate: a runServer child with the curated cloud tools, driven by the MCP
// client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a file, so
// nothing reaches Google. gcs_write_text asks before any request and its approval shows the destination, size and
// overwrite choice; declined, nothing is written. The reads (logs, PromQL, roles, prices, object content) never ask.
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
      `  let upload = 0;`,
      `  if (opts.data && typeof opts.data.pipe === 'function') { for await (const c of opts.data) upload += Buffer.from(c).length; }`,
      `  else if (typeof opts.data === 'string') upload = Buffer.byteLength(opts.data);`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), upload }) + '\\n');`,
      `  const media = url.searchParams.get('alt') === 'media';`,
      `  const data = media ? Buffer.from('hello') : url.pathname.includes('/prometheus/') ? { status: 'success', data: { resultType: 'vector', result: [] } } : { name: 'o', size: '5', contentType: 'text/plain', generation: '3', entries: [], roles: [] };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/cloud.js'))});`,
      `await runServer({ name: 'gcloud', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-cloud-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'cloud.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const file = join(dir, 'report.csv');
  writeFileSync(file, 'a,b\n1,2\n');
  return { dir, tokens, file, entry: writeEntry(dir), callsFile: join(dir, 'calls.jsonl') };
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
  const client = new Client({ name: 'cloud-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const READS = [
  ['logging_entries_list', { project_id: 'my-project-123', severity: 'ERROR' }],
  ['monitoring_query_promql', { project_id: 'my-project-123', query: 'up' }],
  ['monitoring_dashboards_list', { project_id: 'my-project-123' }],
  ['iam_roles_list', {}],
  ['billing_price_lookup', { sku_id: 'D041-B8A1-6E0B' }],
  ['gcs_read_text', { bucket: 'my-bucket', object: 'a.txt' }],
  ['gcs_read_object', { bucket: 'my-bucket', object: 'a.txt' }],
];

test('declined: gcs_write_text writes nothing, and its approval shows destination, size and overwrite; reads never ask', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    const write = tools.find((x) => x.name === 'gcs_write_text');
    assert.ok(write, 'gcs_write_text is listed when writes are on');
    assert.equal(write.annotations.readOnlyHint, false);
    assert.equal(write.inputSchema.properties.confirm, undefined, 'no model-controlled confirm');
    for (const [name] of READS) assert.equal(tools.find((x) => x.name === name)?.annotations.readOnlyHint, true, name);

    for (const args of [
      { bucket: 'my-bucket', object: 'notes/a.txt', text: 'hello' },
      { bucket: 'my-bucket', object: 'r/report.csv', local_path: s.file, overwrite: true },
    ]) {
      const res = await client.callTool({ name: 'gcs_write_text', arguments: args });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
    }
    assert.equal(asked.length, 2);
    assert.match(asked[0].message, /gs:\/\/my-bucket\/notes\/a\.txt/);
    assert.match(asked[0].message, /"bytes":\s*5/);
    assert.match(asked[0].message, /"overwrite":\s*false/);
    assert.match(asked[1].message, /"overwrite":\s*true/);
    assert.doesNotMatch(asked[0].message, /"text":/, 'the approval shows the prepared preview, not the raw arguments');
    assert.match(asked[1].message, /report\.csv/);
    assert.equal(callsIn(s.callsFile).length, 0, 'declined: no request at all');

    for (const [name, args] of READS) {
      const res = await client.callTool({ name, arguments: args });
      assert.notEqual(res.isError, true, `${name}: ${res.content[0].text}`);
    }
    assert.equal(asked.length, 2, 'a read does not ask');
    assert.ok(callsIn(s.callsFile).length >= READS.length);
  } finally {
    await client.close();
  }
});

test('approved: gcs_write_text uploads once, after the approval, with the no-overwrite precondition', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'gcs_write_text', arguments: { bucket: 'my-bucket', object: 'r/report.csv', local_path: s.file } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'the approval came before any request');
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => [c.method, c.path, c.query.uploadType, c.query.ifGenerationMatch]), [['POST', '/upload/storage/v1/b/my-bucket/o', 'media', '0']]);
    assert.equal(calls[0].upload, 'a,b\n1,2\n'.length, 'the body is the file');
  } finally {
    await client.close();
  }
});
