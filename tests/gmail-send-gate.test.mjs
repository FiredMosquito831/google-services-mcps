// gmail_send and gmail_reply through the real approval gate: a runServer child process with the curated Gmail tools,
// driven by the MCP client, which answers the approval form. The child's HTTP layer is stubbed and records every request
// to a file, so nothing reaches Google. The approval must show the exact message (recipients, subject, attachment names
// and sizes) and must come before any send; a declined approval sends nothing.
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

/** The child: the stubbed HTTP layer (requests appended to CALLS_FILE), then runServer with the curated Gmail tools. */
function writeEntry(dir) {
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(REPO, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `const original = { id: 'orig-1', threadId: 'thr-9', payload: { mimeType: 'text/plain', headers: [`,
      `  { name: 'From', value: 'Ana <ana@example.com>' }, { name: 'To', value: 'me@example.com' }, { name: 'Subject', value: 'Meeting' },`,
      `  { name: 'Message-ID', value: '<m2@mail.example.com>' } ], body: { data: '' } } };`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  const method = String(opts.method ?? 'GET').toUpperCase();`,
      `  const raw = opts.data && typeof opts.data.raw === 'string' ? Buffer.from(opts.data.raw, 'base64url').toString('latin1') : undefined;`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method, path: url.pathname, threadId: opts.data?.threadId, raw }) + '\\n');`,
      `  let data = {};`,
      `  if (url.pathname.endsWith('/profile')) data = { emailAddress: 'me@example.com' };`,
      `  else if (url.pathname.endsWith('/messages/orig-1')) data = original;`,
      `  else if (url.pathname.endsWith('/messages/send')) data = { id: 'sent-1', threadId: opts.data?.threadId ?? 'new', labelIds: ['SENT'] };`,
      `  return { data, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/gmail.js'))});`,
      `await runServer({ name: 'gmail', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-gmail-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const attachment = join(dir, 'report.pdf');
  writeFileSync(attachment, Buffer.alloc(1234, 1));
  return { dir, tokens, entry: writeEntry(dir), callsFile: join(dir, 'calls.jsonl'), attachment };
}

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sends = (file) => callsIn(file).filter((c) => c.method === 'POST' && c.path.endsWith('/messages/send'));

function childEnv(s, extra) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
  );
  return { ...base, GSM_TOKEN_DIR: s.tokens, GSM_ALLOW_WRITES: 'true', CALLS_FILE: s.callsFile, APPDATA: join(s.dir, 'appdata'), ...extra };
}

/** Connects the MCP client. Each approval request records its text and the sends made before it, then gives `answer`. */
async function connect(s, env, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [s.entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gmail-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, sendsBefore: sends(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

const auditOf = (tokens) => readFileSync(join(tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('gmail_reply: the approval shows the worked-out recipients, subject and threading; declined, nothing is sent (hook active)', async () => {
  const s = setup();
  const { client, asked } = await connect(s, childEnv(s, { GSM_HOOK_ACTIVE: '1' }), { action: 'decline' });
  try {
    const { tools } = await client.listTools();
    const reply = tools.find((t) => t.name === 'gmail_reply');
    assert.ok(reply, 'gmail_reply is listed when writes are on');
    assert.equal(reply.annotations.destructiveHint, true);
    assert.equal(reply.inputSchema.properties.confirm, undefined, 'no model-controlled confirm');

    const res = await client.callTool({ name: 'gmail_reply', arguments: { message_id: 'orig-1', body_text: 'Thursday works.' } });
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
    assert.equal(asked.length, 1, 'a send asks even when the hook is active (destructive)');
    const text = asked[0].message;
    assert.match(text, /^About to permanently change or delete Google data: gmail_reply/);
    assert.match(text, /"action": "Sends this email now\. Sending cannot be undone\."/);
    assert.match(text, /"to": \[\s*"Ana <ana@example\.com>"\s*\]/);
    assert.match(text, /"subject": "Re: Meeting"/);
    assert.match(text, /"thread_id": "thr-9"/);
    assert.match(text, /"body_excerpt": "Thursday works\."/);
    assert.equal(sends(s.callsFile).length, 0, 'declined: no send request');
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.outcome]), [['gmail_reply', 'declined']]);
    assert.doesNotMatch(readFileSync(join(s.tokens, 'audit.log'), 'utf8'), /ana@example\.com|Thursday/, 'the audit line holds no values');
  } finally {
    await client.close();
  }
});

test('gmail_send: approved, it sends once, after the approval, the exact message the approval described', async () => {
  const s = setup();
  const { client, asked } = await connect(s, childEnv(s, {}), { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({
      name: 'gmail_send',
      arguments: { to: ['bo@example.com'], subject: 'Quarterly report', body_text: 'Attached.', attachments: [s.attachment] },
    });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].sendsBefore, 0, 'the approval came before any send');
    const text = asked[0].message;
    assert.match(text, /"name": "report\.pdf"/);
    assert.match(text, /"size_bytes": 1234/);
    assert.match(text, /"subject": "Quarterly report"/);
    const sent = sends(s.callsFile);
    assert.equal(sent.length, 1);
    const size = Number(/"message_size_bytes": (\d+)/.exec(text)[1]);
    assert.equal(Buffer.byteLength(sent[0].raw, 'latin1'), size, 'the message sent is the size the approval showed');
    assert.match(sent[0].raw, /^To: bo@example\.com\r\nSubject: Quarterly report\r\n/);
    assert.match(sent[0].raw, /filename="report\.pdf"/);
    assert.deepEqual(auditOf(s.tokens).map((l) => [l.tool, l.risk, l.outcome]), [['gmail_send', 'destructive', 'approved']]);

    const reply = await client.callTool({ name: 'gmail_reply', arguments: { message_id: 'orig-1', body_text: 'ok' } });
    assert.notEqual(reply.isError, true, reply.content[0].text);
    const last = sends(s.callsFile).at(-1);
    assert.equal(last.threadId, 'thr-9');
    assert.match(last.raw, /\r\nIn-Reply-To: <m2@mail\.example\.com>\r\nReferences: <m2@mail\.example\.com>\r\n/);
  } finally {
    await client.close();
  }
});
