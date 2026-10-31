// Write methods that are destructive for some request bodies only (1.38.4): config/products.json destructiveWhen, per
// generated API of a product, { methods: { "<method id>": { field, values } }, source, reason }. Gmail's messages.modify,
// threads.modify and messages.batchModify that add TRASH or SPAM move mail out of the mailbox, as messages.trash does
// (destructive), so such a call is gated as destructive: it asks even under confirmation destructive-only. The tool map
// keeps the method's own kind (write), as for a curated tool's destructiveWhen (callKind in src/core/tools.ts).
// Nothing leaves the machine: the server child stubs its HTTP layer, and a declined approval sends nothing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const { loadConfig } = await import(DIST('core/config.js'));
const { bodyMeetsRule, discoveryToolsFor, generateDiscoveryTools } = await import(DIST('core/discovery/tools.js'));
const { callKind } = await import(DIST('core/tools.js'));

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-destructive-when-'), GSM_ALLOW_WRITES: 'true' });

const MODIFY = ['gmail.users.messages.modify', 'gmail.users.threads.modify', 'gmail.users.messages.batchModify'];

test('bodyMeetsRule: the field is a list that holds one of the values; anything else does not meet it', () => {
  const rule = { field: 'addLabelIds', values: ['TRASH', 'SPAM'] };
  assert.equal(bodyMeetsRule({ addLabelIds: ['TRASH'] }, rule), true);
  assert.equal(bodyMeetsRule({ addLabelIds: ['STARRED', 'SPAM'] }, rule), true);
  assert.equal(bodyMeetsRule({ addLabelIds: ['STARRED', 'INBOX'] }, rule), false);
  assert.equal(bodyMeetsRule({ removeLabelIds: ['TRASH'] }, rule), false, 'taking mail out of Trash is not the rule');
  assert.equal(bodyMeetsRule({ addLabelIds: 'TRASH' }, rule), false, 'not a list');
  assert.equal(bodyMeetsRule({ addLabelIds: ['trash'] }, rule), false, 'label ids compare exactly, as Gmail takes them');
  for (const body of [undefined, null, 'TRASH', ['TRASH'], {}]) assert.equal(bodyMeetsRule(body, rule), false, JSON.stringify(body));
});

test('gmail: the three modify tools raise a call that adds TRASH or SPAM to destructive; their kind stays write', async () => {
  const product = readJson('config', 'products.json').products.gmail;
  assert.deepEqual(Object.keys(product.destructiveWhen.gmail.methods).sort(), [...MODIFY].sort());
  const tools = await discoveryToolsFor('gmail', cfg);
  for (const id of MODIFY) {
    const tool = tools.find((t) => t.methodId === id);
    assert.ok(tool, `${id} is a tool`);
    assert.equal(tool.kind, 'write', `${id}: the tool map keeps write`);
    assert.equal(typeof tool.destructiveWhen, 'function', `${id} has a body rule`);
    const ids = id.endsWith('batchModify') ? { ids: ['m1', 'm2'] } : {};
    const call = (body) => ({ userId: 'me', ...(id.endsWith('batchModify') ? {} : { id: 'm1' }), body: { ...ids, ...body } });
    assert.equal(callKind(tool, call({ addLabelIds: ['TRASH'] })), 'destructive', `${id} TRASH`);
    assert.equal(callKind(tool, call({ addLabelIds: ['SPAM'] })), 'destructive', `${id} SPAM`);
    assert.equal(callKind(tool, call({ addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD'] })), 'write', `${id} other labels`);
    assert.equal(callKind(tool, call({ removeLabelIds: ['TRASH', 'SPAM'] })), 'write', `${id} out of Trash or Spam`);
    assert.equal(callKind(tool, { userId: 'me', id: 'm1' }), 'write', `${id} no body`);
    assert.ok(tool.description.includes('adds TRASH or SPAM'), `${id}: the description says so`);
  }
  // No other generated Gmail tool has a body rule.
  assert.deepEqual(
    tools.filter((t) => t.destructiveWhen).map((t) => t.methodId).sort(),
    [...MODIFY].sort(),
  );
  // The plugin's server map carries the rule unchanged, and config/servers.json too.
  assert.deepEqual(readJson('plugins', 'gmail', 'servers.json').servers[0].destructiveWhen, product.destructiveWhen);
  assert.deepEqual(readJson('config', 'servers.json').servers.find((s) => s.name === 'gmail').destructiveWhen, product.destructiveWhen);
});

test('every product rule names a write tool of the product, with a body', async () => {
  const products = readJson('config', 'products.json').products;
  for (const [id, product] of Object.entries(products)) {
    if (!product.destructiveWhen) continue;
    const tools = await discoveryToolsFor(product.server.name, cfg);
    for (const entry of Object.values(product.destructiveWhen)) {
      for (const method of Object.keys(entry.methods)) {
        const tool = tools.find((t) => t.methodId === method);
        assert.ok(tool, `${id}: ${method} is a tool`);
        assert.equal(tool.kind, 'write', `${id}: ${method} is a write (a destructive tool asks anyway, a read never)`);
        assert.equal(typeof tool.destructiveWhen, 'function', `${id}: ${method}`);
      }
    }
  }
});

test('the generator: a rule on a write gives its tool a destructiveWhen; without rules every tool is as before', () => {
  const doc = readJson('data', 'discovery', 'gmail.v1.json');
  const kinds = { overrides: {}, notes: {} };
  const rule = { field: 'addLabelIds', values: ['TRASH'] };
  const src = { apiName: 'gmail', apiVersion: 'v1', doc, destructiveWhen: { 'gmail.users.threads.modify': rule, 'gmail.users.messages.get': rule } };
  const { tools } = generateDiscoveryTools('gx', 'workspace-user', [src], kinds, cfg);
  const modify = tools.find((t) => t.methodId === 'gmail.users.threads.modify');
  assert.equal(modify.destructiveWhen({ userId: 'me', id: 't1', body: { addLabelIds: ['TRASH'] } }), true);
  assert.equal(modify.destructiveWhen({ userId: 'me', id: 't1', body: { addLabelIds: ['SPAM'] } }), false, 'only the values of this rule');
  assert.equal(tools.find((t) => t.methodId === 'gmail.users.messages.get').destructiveWhen, undefined, 'a read never gets one');
  const plain = generateDiscoveryTools('gx', 'workspace-user', [{ ...src, destructiveWhen: undefined }], kinds, cfg).tools;
  assert.equal(plain.filter((t) => t.destructiveWhen).length, 0);
  assert.deepEqual(
    plain.map((t) => [t.name, t.kind, t.description, Object.keys(t.inputSchema)]),
    tools.map((t) => [t.name, t.kind, t.description, Object.keys(t.inputSchema)]),
    'the rule changes nothing else of any tool',
  );
});

test('gen-servers: destructiveWhen names write methods of a generated API with a list field of their request', () => {
  const run = (destructiveWhen) => {
    const root = tempDir('gsm-gen-destructive-');
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    mkdirSync(join(root, 'data', 'discovery'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    cpSync(join(REPO, 'data', 'discovery', 'gmail.v1.json'), join(root, 'data', 'discovery', 'gmail.v1.json'));
    const product = { title: 'X', description: 'X.', group: 'workspace-user', server: { name: 'gx', curated: null }, generated: [{ api: 'gmail', version: 'v1' }], destructiveWhen };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: product } }));
    const res = spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
    return { ...res, servers: res.status === 0 ? JSON.parse(readFileSync(join(root, 'config', 'servers.json'), 'utf8')).servers : undefined };
  };
  const rule = { field: 'addLabelIds', values: ['TRASH', 'SPAM'] };
  const entry = (over) => ({ gmail: { source: 'https://example.com', reason: 'Google says so.', methods: { 'gmail.users.messages.modify': rule }, ...over } });
  const ok = run(entry());
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.servers[0].destructiveWhen, entry());
  assert.equal('destructiveWhen' in run(undefined).servers[0], false, 'a product without rules gets no key');
  for (const [value, message] of [
    [{ drive: entry().gmail }, /"drive" is not a generated API of the product/],
    [entry({ methods: { 'gmail.users.nothing.modify': rule } }), /"gmail\.users\.nothing\.modify" is not a method of the gmail snapshot/],
    [entry({ methods: { 'gmail.users.messages.get': rule } }), /a GET method has no request body/],
    [entry({ methods: { 'gmail.users.messages.modify': { field: 'labelIds', values: ['TRASH'] } } }), /"labelIds" is not a list field of the method's request \(ModifyMessageRequest\)/],
    [entry({ methods: { 'gmail.users.messages.modify': { field: 'addLabelIds', values: [] } } }), /values must be a non-empty list of different values/],
    [entry({ methods: { 'gmail.users.messages.modify': { field: 'addLabelIds', values: ['TRASH', 'TRASH'] } } }), /values must be a non-empty list of different values/],
    [entry({ methods: { 'gmail.users.messages.modify': { values: ['TRASH'] } } }), /needs a field/],
    [entry({ methods: {} }), /methods must be a non-empty object/],
    [entry({ source: '' }), /needs a source and a reason/],
  ]) {
    const res = run(value);
    assert.notEqual(res.status, 0, JSON.stringify(value));
    assert.match(res.stderr, message);
  }
});

// ---------------------------------------------------------------------------
// Through a running server: runServer with the generated Gmail tools, the HTTP layer stubbed (requests appended to a
// file), driven by the MCP client, which answers the approval form.

function serverSetup() {
  const dir = tempDir('gsm-destructive-when-run-');
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
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
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, body: opts.data }) + '\\n');`,
      `  return { data: { id: 'm1', threadId: 't1', labelIds: ['INBOX'] }, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(DIST('core/tools.js'))});`,
      `const { discoveryToolsFor } = await import(${JSON.stringify(DIST('core/discovery/tools.js'))});`,
      `await runServer({ name: 'gmail', version: '0.0.0', buildTools: (cfg) => discoveryToolsFor('gmail', cfg) });`,
      '',
    ].join('\n'),
  );
  return { dir, tokens, entry, callsFile: join(dir, 'calls.jsonl') };
}

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const changes = (file) => callsIn(file).filter((c) => c.method === 'POST');

async function connect(s, extraEnv, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  const env = { ...base, GSM_TOKEN_DIR: s.tokens, GSM_ALLOW_WRITES: 'true', CALLS_FILE: s.callsFile, APPDATA: join(s.dir, 'appdata'), ...extraEnv };
  const transport = new StdioClientTransport({ command: process.execPath, args: [s.entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'destructive-when', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, changesBefore: changes(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

test('a running gmail server under destructive-only: adding TRASH or SPAM asks as destructive; other label changes run unasked', async () => {
  const s = serverSetup();
  const { client, asked } = await connect(s, { GSM_CONFIRMATION: 'destructive-only' }, { action: 'decline' });
  try {
    const trash = await client.callTool({ name: 'gmail_users_messages_modify', arguments: { userId: 'me', id: 'm1', body: { addLabelIds: ['TRASH'] } } });
    assert.equal(trash.isError, true);
    assert.match(trash.content[0].text, /You declined this action\. Nothing was changed\./);
    assert.equal(asked.length, 1, 'adding TRASH asks under destructive-only');
    assert.match(asked[0].message, /^About to permanently change or delete Google data: gmail_users_messages_modify/);
    assert.match(asked[0].message, /Method: gmail\.users\.messages\.modify/);
    const spam = await client.callTool({ name: 'gmail_users_messages_batch_modify', arguments: { userId: 'me', body: { ids: ['m1', 'm2'], addLabelIds: ['SPAM'] } } });
    assert.equal(spam.isError, true);
    assert.equal(asked.length, 2, 'adding SPAM to many messages asks too');
    const threads = await client.callTool({ name: 'gmail_users_threads_modify', arguments: { userId: 'me', id: 't1', body: { addLabelIds: ['TRASH'] } } });
    assert.equal(threads.isError, true);
    assert.equal(asked.length, 3);
    assert.equal(changes(s.callsFile).length, 0, 'declined: nothing was changed');

    const star = await client.callTool({ name: 'gmail_users_messages_modify', arguments: { userId: 'me', id: 'm1', body: { addLabelIds: ['STARRED'] } } });
    assert.notEqual(star.isError, true, star.content[0].text);
    const out = await client.callTool({ name: 'gmail_users_threads_modify', arguments: { userId: 'me', id: 't1', body: { removeLabelIds: ['TRASH'] } } });
    assert.notEqual(out.isError, true, out.content[0].text);
    assert.equal(asked.length, 3, 'a write runs unasked under destructive-only, as before');
    assert.deepEqual(
      changes(s.callsFile).map((c) => [c.path, c.body]),
      [
        ['/gmail/v1/users/me/messages/m1/modify', { addLabelIds: ['STARRED'] }],
        ['/gmail/v1/users/me/threads/t1/modify', { removeLabelIds: ['TRASH'] }],
      ],
    );
  } finally {
    await client.close();
  }
});

test('a running gmail server, default confirmation: the TRASH call asks as destructive, a plain label change as a change', async () => {
  const s = serverSetup();
  const { client, asked } = await connect(s, {}, { action: 'accept', content: { approve: true } });
  try {
    const trash = await client.callTool({ name: 'gmail_users_messages_modify', arguments: { userId: 'me', id: 'm1', body: { addLabelIds: ['TRASH'] } } });
    assert.notEqual(trash.isError, true, trash.content[0].text);
    const star = await client.callTool({ name: 'gmail_users_messages_modify', arguments: { userId: 'me', id: 'm1', body: { addLabelIds: ['STARRED'] } } });
    assert.notEqual(star.isError, true, star.content[0].text);
    assert.equal(asked.length, 2);
    assert.match(asked[0].message, /^About to permanently change or delete Google data: gmail_users_messages_modify/);
    assert.match(asked[1].message, /^About to change Google data: gmail_users_messages_modify/);
    assert.equal(asked[0].changesBefore, 0, 'the approval came before the change');
    assert.equal(changes(s.callsFile).length, 2);
    const audit = readFileSync(join(s.tokens, 'audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(audit.map((l) => [l.tool, l.risk, l.outcome]), [
      ['gmail_users_messages_modify', 'destructive', 'approved'],
      ['gmail_users_messages_modify', 'modify', 'approved'],
    ]);
  } finally {
    await client.close();
  }
});
