// The new Drive and Sheets tools through the real approval gate: a runServer child with the curated gdrive tools, driven
// by the MCP client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a
// file, so nothing reaches Google. drive_create_file, sheets_write_values and sheets_insert_rows ask before any request;
// declined, nothing is uploaded or written. drive_download and sheets_get_values never ask.
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
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, alt: url.searchParams.get('alt') ?? opts.params?.alt ?? null, upload }) + '\\n');`,
      `  const data = (opts.params?.alt === 'media') ? Buffer.from('hello') : { id: 'f1', name: 'a.txt', mimeType: 'text/plain', size: '5' };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/gdrive.js'))});`,
      `await runServer({ name: 'gdrive', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-drive-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const file = join(dir, 'report.txt');
  writeFileSync(file, 'quarterly numbers');
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
  const client = new Client({ name: 'drive-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

test('declined: drive_create_file, sheets_write_values and sheets_insert_rows send nothing; reads never ask', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    for (const name of ['drive_create_file', 'sheets_write_values', 'sheets_insert_rows']) {
      const t = tools.find((x) => x.name === name);
      assert.ok(t, `${name} is listed when writes are on`);
      assert.equal(t.annotations.readOnlyHint, false, name);
      assert.equal(t.inputSchema.properties.confirm, undefined, `${name}: no model-controlled confirm`);
    }
    for (const name of ['drive_download', 'drive_list_recent', 'sheets_get_values']) assert.equal(tools.find((x) => x.name === name).annotations.readOnlyHint, true, name);

    const writes = [
      ['drive_create_file', { name: 'report.txt', local_path: s.file }],
      ['sheets_write_values', { spreadsheet_id: 's1', range: 'A1', values: [['x']], value_input: 'data' }],
      ['sheets_insert_rows', { spreadsheet_id: 's1', sheet_id: 0, start_index: 1, end_index: 2 }],
    ];
    for (const [name, args] of writes) {
      const res = await client.callTool({ name, arguments: args });
      assert.equal(res.isError, true, name);
      assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
    }
    assert.equal(asked.length, 3);
    assert.match(asked[0].message, /report\.txt/);
    assert.equal(callsIn(s.callsFile).length, 0, 'declined: no request at all');

    const read = await client.callTool({ name: 'drive_download', arguments: { file_id: 'f1' } });
    assert.notEqual(read.isError, true, read.content[0].text);
    assert.equal(JSON.parse(read.content[0].text).data_base64, Buffer.from('hello').toString('base64'));
    assert.equal(asked.length, 3, 'a read does not ask');
  } finally {
    await client.close();
  }
});

test('approved: drive_create_file uploads the local file once, after the approval', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'drive_create_file', arguments: { name: 'report.txt', local_path: s.file, google_type: 'document' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'the approval came before any request');
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => [c.method, c.path]), [['POST', '/upload/drive/v3/files']]);
    assert.ok(calls[0].upload > 'quarterly numbers'.length, 'the multipart body carries the file');
  } finally {
    await client.close();
  }
});
