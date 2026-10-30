// The Chat writes through the real approval gate: a runServer child with the curated Chat tools, driven by the MCP
// client, which answers the approval form. The child's HTTP layer is stubbed and records every request to a file, so
// nothing reaches Google. chat_send_message reads the conversation's name (its prepare step), then asks; declined,
// nothing is posted. chat_mark_read asks before any request. A read (chat_search_messages) never asks.
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
      `  if (method === 'GET' && url.pathname === '/v1/spaces/AAA') data = { name: 'spaces/AAA', displayName: 'Launch team', spaceType: 'SPACE' };`,
      `  if (method === 'POST' && url.pathname === '/v1/spaces/AAA/messages') data = { name: 'spaces/AAA/messages/new', text: opts.data.text, thread: { name: 'spaces/AAA/threads/n' } };`,
      `  if (method === 'PATCH') data = { lastReadTime: '2026-10-30T09:00:00Z' };`,
      `  if (url.pathname.endsWith(':search')) data = { results: [] };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/gchat.js'))});`,
      `await runServer({ name: 'gchat', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-chat-gate-'));
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
  const client = new Client({ name: 'chat-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const auditOf = (tokens) => readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('chat_send_message and chat_mark_read declined: nothing is posted or changed; the approval names the conversation; a search never asks', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    for (const name of ['chat_send_message', 'chat_mark_read', 'chat_mark_unread']) {
      const t = tools.find((x) => x.name === name);
      assert.ok(t, `${name} is listed when writes are on`);
      assert.equal(t.annotations.readOnlyHint, false, name);
      assert.equal(t.inputSchema.properties.confirm, undefined, `${name}: no model-controlled confirm`);
    }
    for (const name of ['chat_search_conversations', 'chat_list_messages', 'chat_search_messages', 'chat_list_members']) {
      assert.equal(tools.find((x) => x.name === name).annotations.readOnlyHint, true, name);
    }

    const sent = await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/AAA', text: 'Ship it on Friday' } });
    assert.equal(sent.isError, true);
    assert.match(sent.content[0].text, /You declined this action\. Nothing was changed\./);
    assert.equal(asked.length, 1);
    assert.match(asked[0].message, /chat_send_message/);
    assert.match(asked[0].message, /Launch team/, 'the approval shows the conversation name from the prepare step');
    assert.match(asked[0].message, /Ship it on Friday/);
    assert.deepEqual(callsIn(s.callsFile).map((c) => [c.method, c.path]), [['GET', '/v1/spaces/AAA']], 'only the read of the name; nothing posted');

    const mark = await client.callTool({ name: 'chat_mark_read', arguments: { conversation_ids: ['spaces/AAA'] } });
    assert.equal(mark.isError, true);
    assert.equal(asked.length, 2);
    assert.equal(asked[1].callsBefore, 1, 'mark_read asked before any request of its own');
    assert.equal(callsIn(s.callsFile).length, 1);

    const read = await client.callTool({ name: 'chat_search_messages', arguments: { query: 'launch' } });
    assert.notEqual(read.isError, true, read.content[0].text);
    assert.equal(asked.length, 2, 'a read does not ask');
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.outcome]), [['chat_send_message', 'declined'], ['chat_mark_read', 'declined']]);
  } finally {
    await client.close();
  }
});

test('chat_send_message approved: one POST, after the approval, with the text that was shown', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'chat_send_message', arguments: { conversation_id: 'spaces/AAA', text: '**Done**', thread_id: 'spaces/AAA/threads/t1' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 1, 'only the prepare read came before the approval');
    const calls = callsIn(s.callsFile);
    assert.deepEqual(calls.map((c) => [c.method, c.path]), [['GET', '/v1/spaces/AAA'], ['POST', '/v1/spaces/AAA/messages']]);
    assert.deepEqual(calls[1].body, { text: '**Done**', markupSyntax: 'MARKUP_SYNTAX_MARKDOWN', thread: { name: 'spaces/AAA/threads/t1' } });
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['chat_send_message', 'modify', 'approved']]);
  } finally {
    await client.close();
  }
});
