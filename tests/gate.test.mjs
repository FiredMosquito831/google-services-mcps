// Tests for the approval gate, consent settings and the gateway's scope and API-key handling. Run after compiling (npm test does).
// Unit tests use a fake server: the gate only calls server.server.getClientCapabilities and elicitInput.
// The end-to-end tests start a real runServer child process and talk to it with the MCP client, answering
// elicitations from the test. Every test uses its own temp folders; no network call is made.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const require = createRequire(import.meta.url);

const { createGate, DeniedError, ApprovalUnavailableError } = await import(dist('core/approval.js'));
const { loadConfig } = await import(dist('core/config.js'));
const { resolveScopes, isReadonlyScope } = await import(dist('core/scopes.js'));
const { isGranted } = await import(dist('core/tools.js'));
const gw = await import(dist('core/gateway.js'));
const ak = await import(dist('core/discovery/apikey-client.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;

// ---------------------------------------------------------------------------
// Fixtures

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * A stand-in for McpServer. `caps` is what the client declared. `answer` is what the user answers,
 * `fail` makes elicitInput throw. Every elicitation is recorded in `elicits`.
 */
function fakeServer({ caps = { elicitation: { form: {} } }, answer = { action: 'accept', content: { approve: true } }, fail } = {}) {
  const elicits = [];
  const mcp = {
    server: {
      getClientCapabilities: () => caps,
      elicitInput: async (params) => {
        elicits.push(params);
        if (fail) throw fail;
        return answer;
      },
    },
  };
  return { mcp, elicits };
}

/** A config for the gate: a fresh token folder, writes on, and the given environment settings. */
function gateConfig(env = {}) {
  const tokenDir = track(tempDir('gsm-gate-'));
  return { tokenDir, cfg: loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', ...env }) };
}

function writePolicy(tokenDir, policy) {
  writeFileSync(join(tokenDir, 'policy.json'), JSON.stringify(policy));
}

function auditLines(tokenDir) {
  const file = join(tokenDir, 'audit.log');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const created = [];
afterEach(() => {
  gw.setRequestForTests(undefined);
  gw.setFetchForTests(undefined);
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function track(dir) {
  created.push(dir);
  return dir;
}

// A small gateway product: one read method (scope demo.readonly) and one write method (no scope listed).
const ITEMS_SCOPE = G('demo.readonly');
const discovery = {
  name: 'demoapi',
  version: 'v1',
  rootUrl: 'https://demo.example.googleapis.com/',
  servicePath: '',
  parameters: {},
  schemas: { Item: { id: 'Item', type: 'object', properties: { displayName: { type: 'string' } } } },
  resources: {
    items: {
      methods: {
        list: {
          id: 'demoapi.items.list',
          path: 'v1/projects/{projectId}/items',
          httpMethod: 'GET',
          parameters: {
            projectId: { type: 'string', location: 'path', required: true },
            pageSize: { type: 'integer', location: 'query' },
          },
          response: { $ref: 'Item' },
        },
        create: {
          id: 'demoapi.items.create',
          path: 'v1/projects/{projectId}/items',
          httpMethod: 'POST',
          parameters: { projectId: { type: 'string', location: 'path', required: true } },
          request: { $ref: 'Item' },
          response: { $ref: 'Item' },
        },
      },
    },
  },
};

/** Catalog, Discovery cache and config for the gateway tests. */
function gatewaySetup({ apiKey } = {}) {
  const dataDir = track(tempDir('gsm-gate-data-'));
  const tokenDir = track(tempDir('gsm-gate-token-'));
  writeFileSync(
    join(dataDir, 'catalog.json'),
    JSON.stringify({
      apis: [
        {
          name: 'demoapi',
          version: 'v1',
          title: 'Demo API',
          description: 'Demo.',
          rootUrl: 'https://demo.example.googleapis.com/',
          servicePath: '',
          methods: [
            ['demoapi.items.list', 'GET', 'v1/projects/{projectId}/items', [ITEMS_SCOPE], ''],
            ['demoapi.items.create', 'POST', 'v1/projects/{projectId}/items', [], ''],
          ],
        },
      ],
    }),
  );
  mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
  writeFileSync(join(tokenDir, 'discovery-cache', 'demoapi.v1.json'), JSON.stringify(discovery));
  process.env.GSM_DATA_DIR = dataDir;
  const env = apiKey ? { GSM_API_KEY: apiKey } : {};
  return { tokenDir, cfg: loadConfig({ GSM_TOKEN_DIR: tokenDir, ...env }) };
}

function gatewayTools(cfg, group = 'workspace-user') {
  return Object.fromEntries(
    gw.gatewayTools({ product: 'demo', group, apis: [{ api: 'demoapi', version: 'v1' }], cfg }).map((t) => [t.name, t]),
  );
}

// ---------------------------------------------------------------------------
// (a) reads are never gated

test('(a) a read is never gated: no elicitation, no audit line, under the default settings', async () => {
  const { cfg, tokenDir } = gateConfig();
  const { mcp, elicits } = fakeServer();
  const gate = createGate({ server: mcp, cfg });
  await gate({ kind: 'read', target: 'demo_list' });
  assert.equal(elicits.length, 0);
  assert.deepEqual(auditLines(tokenDir), []);
});

test('(a) the gateway reads through api_call call no gate', async () => {
  const { cfg } = gatewaySetup();
  const tools = gatewayTools(cfg);
  gw.setRequestForTests(async () => ({ status: 200, data: { items: [] } }));
  const gateCalls = [];
  const ctx = { gate: async (input) => gateCalls.push(input), grantedScopes: [ITEMS_SCOPE], hasScope: (anyOf) => isGranted({ scopes: anyOf }, [ITEMS_SCOPE]) };
  await tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, ctx);
  assert.equal(gateCalls.length, 0);
});

// ---------------------------------------------------------------------------
// (b) to (d) modify and destructive under the hook setting

test('(b) a change under the default mode, without the hook, asks once and runs only on approve true', async () => {
  const { cfg, tokenDir } = gateConfig();
  const yes = fakeServer();
  await createGate({ server: yes.mcp, cfg })({ kind: 'write', target: 'demo_create', args: { name: 'Box' } });
  assert.equal(yes.elicits.length, 1);
  const text = yes.elicits[0].message;
  assert.match(text, /About to change Google data: demo_create/);
  assert.match(text, /Arguments:/);
  assert.match(text, /"name": "Box"/);
  assert.match(text, /You can turn these confirmations off/, 'the footer says how to turn confirmations off');
  assert.deepEqual(Object.keys(yes.elicits[0].requestedSchema.properties), ['approve']);
  assert.deepEqual(auditLines(tokenDir).map((l) => l.outcome), ['approved']);

  const no = fakeServer({ answer: { action: 'accept', content: { approve: false } } });
  await assert.rejects(createGate({ server: no.mcp, cfg })({ kind: 'write', target: 'demo_create' }), (err) => {
    assert.ok(err instanceof DeniedError);
    assert.equal(err.message, 'You declined this action. Nothing was changed.');
    return true;
  });
});

test('(c) a change with the hook active does not elicit, because the plugin hook has asked', async () => {
  const { cfg, tokenDir } = gateConfig({ GSM_HOOK_ACTIVE: '1' });
  const { mcp, elicits } = fakeServer();
  await createGate({ server: mcp, cfg })({ kind: 'write', target: 'demo_create' });
  assert.equal(elicits.length, 0);
  assert.deepEqual(auditLines(tokenDir).map((l) => l.outcome), ['hook']);
});

test('(d) a destructive action always elicits, even with the hook active', async () => {
  const { cfg } = gateConfig({ GSM_HOOK_ACTIVE: '1' });
  const { mcp, elicits } = fakeServer();
  await createGate({ server: mcp, cfg })({ kind: 'destructive', target: 'demo_delete' });
  assert.equal(elicits.length, 1);
  assert.match(elicits[0].message, /permanently change or delete Google data: demo_delete/);
  assert.match(elicits[0].message, /This may be irreversible/);
});

// ---------------------------------------------------------------------------
// (e) decline, (f) unsupported client, (g) confirmation off, (h) deny rule

test('(e) a declined or cancelled answer throws, and the action is not run', async () => {
  const { cfg } = gateConfig();
  let ran = false;
  // The runServer order: the gate first, then the handler.
  const run = async (gate, input) => {
    await gate(input);
    ran = true;
  };
  for (const answer of [{ action: 'decline' }, { action: 'cancel' }]) {
    const { mcp } = fakeServer({ answer });
    await assert.rejects(run(createGate({ server: mcp, cfg }), { kind: 'destructive', target: 'demo_delete' }), DeniedError);
  }
  assert.equal(ran, false, 'the handler never runs after a decline');
});

test('(f) a client without elicitation throws ApprovalUnavailableError and nothing is asked', async () => {
  const { cfg, tokenDir } = gateConfig();
  const { mcp, elicits } = fakeServer({ caps: {} });
  await assert.rejects(createGate({ server: mcp, cfg })({ kind: 'write', target: 'demo_create' }), (err) => {
    assert.ok(err instanceof ApprovalUnavailableError);
    assert.match(err.message, /cannot ask for confirmation, so the action was not run/);
    assert.match(err.message, /set confirmation to 'off'/);
    return true;
  });
  assert.equal(elicits.length, 0);
  assert.deepEqual(auditLines(tokenDir).map((l) => l.outcome), ['unavailable']);
});

test('(g) confirmation off never elicits, for changes and for destructive actions', async () => {
  const { cfg } = gateConfig({ GSM_CONFIRMATION: 'off' });
  const { mcp, elicits } = fakeServer();
  const gate = createGate({ server: mcp, cfg });
  await gate({ kind: 'write', target: 'demo_create' });
  await gate({ kind: 'destructive', target: 'demo_delete' });
  assert.equal(elicits.length, 0);
});

test('(g) the policy file sets the mode when GSM_CONFIRMATION is unset, and the environment wins when it is set', async () => {
  const off = gateConfig();
  writePolicy(off.tokenDir, { confirmation: 'off' });
  const quiet = fakeServer();
  await createGate({ server: quiet.mcp, cfg: off.cfg })({ kind: 'write', target: 'demo_create' });
  assert.equal(quiet.elicits.length, 0, 'policy confirmation off, no environment setting');

  const envWins = gateConfig({ GSM_CONFIRMATION: 'every-change' });
  writePolicy(envWins.tokenDir, { confirmation: 'off' });
  const asked = fakeServer();
  await createGate({ server: asked.mcp, cfg: envWins.cfg })({ kind: 'write', target: 'demo_create' });
  assert.equal(asked.elicits.length, 1, 'a valid environment setting overrides the policy file');
});

test('(h) a deny rule throws without eliciting, even when confirmation is off', async () => {
  const { cfg, tokenDir } = gateConfig({ GSM_CONFIRMATION: 'off' });
  writePolicy(tokenDir, { confirmation: 'off', rules: [{ match: 'demo_*', action: 'deny' }] });
  const { mcp, elicits } = fakeServer();
  await assert.rejects(createGate({ server: mcp, cfg })({ kind: 'destructive', target: 'demo_delete' }), (err) => {
    assert.ok(err instanceof DeniedError);
    assert.match(err.message, /Denied by policy rule "demo_\*"\. Nothing was changed\./);
    return true;
  });
  assert.equal(elicits.length, 0);
  assert.deepEqual(auditLines(tokenDir).map((l) => l.outcome), ['denied']);
});

test('(h) a deny rule also matches the method id, and writes are refused when GSM_ALLOW_WRITES is not true', async () => {
  const { cfg, tokenDir } = gateConfig();
  writePolicy(tokenDir, { rules: [{ match: 'demoapi.items.delete', action: 'deny' }] });
  const { mcp, elicits } = fakeServer();
  await assert.rejects(
    createGate({ server: mcp, cfg })({ kind: 'destructive', target: 'api_call', methodId: 'demoapi.items.delete' }),
    /Denied by policy rule "demoapi\.items\.delete"/,
  );
  assert.equal(elicits.length, 0);

  const closed = gateConfig({ GSM_ALLOW_WRITES: 'false' });
  const none = fakeServer();
  await assert.rejects(createGate({ server: none.mcp, cfg: closed.cfg })({ kind: 'write', target: 'demo_create' }), /GSM_ALLOW_WRITES is not "true"/);
  assert.equal(none.elicits.length, 0);
});

test('a broken policy file asks, with the load error in the reason', async () => {
  const { cfg, tokenDir } = gateConfig();
  writeFileSync(join(tokenDir, 'policy.json'), '{ "confirmation": ');
  const { mcp, elicits } = fakeServer();
  await createGate({ server: mcp, cfg })({ kind: 'write', target: 'demo_create' });
  assert.equal(elicits.length, 1);
  assert.match(elicits[0].message, /could not be read, so asking to be safe/);
  assert.match(elicits[0].message, /Invalid policy file/);
});

// ---------------------------------------------------------------------------
// (i) audit

test('(i) the audit log gets one line per gated action, with no argument values', async () => {
  const { cfg, tokenDir } = gateConfig();
  const secret = 'SECRET-ARG-VALUE-123';
  const gate = createGate({ server: fakeServer({ answer: { action: 'decline' } }).mcp, cfg });
  await assert.rejects(gate({ kind: 'destructive', target: 'demo_delete', methodId: 'demo.items.delete', args: { name: secret } }));
  const quiet = createGate({ server: fakeServer().mcp, cfg: loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_CONFIRMATION: 'off', GSM_ALLOW_WRITES: 'true' }) });
  await quiet({ kind: 'write', target: 'demo_create', args: { name: secret } });

  const text = readFileSync(join(tokenDir, 'audit.log'), 'utf8');
  assert.doesNotMatch(text, new RegExp(secret), 'no argument value is written');
  const lines = auditLines(tokenDir);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((l) => [l.tool, l.methodId, l.risk, l.decision, l.outcome]),
    [
      ['demo_delete', 'demo.items.delete', 'destructive', 'ask', 'declined'],
      ['demo_create', undefined, 'modify', 'allow', 'allowed'],
    ],
  );
  for (const line of lines) {
    assert.match(line.argsSha256, /^[0-9a-f]{16}$/, 'a 16-character digest of the arguments');
    assert.ok(!Number.isNaN(Date.parse(line.time)));
  }
});

test('an audit write failure never blocks the action', async () => {
  const { cfg, tokenDir } = gateConfig({ GSM_CONFIRMATION: 'off' });
  // A file where the token folder should be makes every audit write fail.
  const blocked = join(tokenDir, 'blocked');
  writeFileSync(blocked, 'not a folder');
  const gate = createGate({ server: fakeServer().mcp, cfg: { ...cfg, tokenDir: blocked } });
  const errors = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    errors.push(String(chunk));
    return true;
  };
  try {
    await gate({ kind: 'write', target: 'demo_create' });
  } finally {
    process.stderr.write = original;
  }
  assert.ok(errors.some((text) => text.includes('[audit] could not write')), 'the failure is reported on stderr');
});

// ---------------------------------------------------------------------------
// (j) gateway scope check before the gate and before any network call

test('(j) the gateway refuses a method whose scopes the stored grant lacks, before the gate and any request', async () => {
  const { cfg } = gatewaySetup();
  const tools = gatewayTools(cfg);
  const granted = [G('gmail.readonly')];
  const gateCalls = [];
  const requests = [];
  const fetches = [];
  gw.setRequestForTests(async (req) => {
    requests.push(req);
    return { status: 200, data: {} };
  });
  gw.setFetchForTests(async (url) => {
    fetches.push(String(url));
    return new Response('{}', { status: 500 });
  });
  const ctx = {
    gate: async (input) => gateCalls.push(input),
    grantedScopes: granted,
    hasScope: (anyOf) => isGranted({ scopes: anyOf }, granted),
  };

  await assert.rejects(tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, ctx), (err) => {
    assert.match(err.message, /holds none of the scopes demoapi\.items\.list needs \(https:\/\/www\.googleapis\.com\/auth\/demo\.readonly\)/);
    assert.match(err.message, /node gsm\.mjs login workspace-user --profile readwrite/);
    return true;
  });
  assert.equal(requests.length, 0, 'no API request');
  assert.equal(fetches.length, 0, 'no Discovery fetch either, the document is cached');
  assert.equal(gateCalls.length, 0, 'no approval is asked for a call that cannot run');

  // With the scope held, the same call runs.
  const held = { ...ctx, hasScope: (anyOf) => isGranted({ scopes: anyOf }, [ITEMS_SCOPE]) };
  await tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, held);
  assert.equal(requests.length, 1);
});

test('(j) with no grant known (null), the scope check passes, so the auth error is the one the user sees', async () => {
  const { cfg } = gatewaySetup();
  const tools = gatewayTools(cfg);
  const requests = [];
  gw.setRequestForTests(async (req) => {
    requests.push(req);
    return { status: 200, data: {} };
  });
  const ctx = { gate: async () => {}, grantedScopes: null, hasScope: (anyOf) => isGranted({ scopes: anyOf }, null) };
  await tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, ctx);
  assert.equal(requests.length, 1);
});

// ---------------------------------------------------------------------------
// (k) readonly resolution

test('(k) the readonly profile uses only read-only scopes, and a read tool without one is uncovered', () => {
  const reqs = [
    { tool: 'a/read-modify', kind: 'read', scopes: [G('gmail.modify')] },
    { tool: 'a/read-both', kind: 'read', scopes: [G('gmail.modify'), G('gmail.readonly')] },
    { tool: 'a/read-open', kind: 'read', scopes: [] },
    { tool: 'a/write', kind: 'write', scopes: [G('gmail.compose')] },
  ];
  const r = resolveScopes(reqs, 'readonly');
  assert.deepEqual(r.scopes, [G('gmail.readonly')]);
  assert.ok(r.scopes.every(isReadonlyScope));
  assert.deepEqual(r.covered, ['a/read-both', 'a/read-open']);
  assert.deepEqual(r.uncovered, ['a/read-modify', 'a/write']);
});

test('isReadonlyScope: the last path segment decides', () => {
  for (const scope of [G('gmail.readonly'), G('cloud-platform.read-only'), G('readonly'), G('read-only'), G('admin.directory.user.readonly')]) {
    assert.equal(isReadonlyScope(scope), true, scope);
  }
  for (const scope of [G('gmail.modify'), G('drive'), 'https://mail.google.com/', G('readonlyish'), G('cloud-platform.read'), G('readonly-extra')]) {
    assert.equal(isReadonlyScope(scope), false, scope);
  }
});

// ---------------------------------------------------------------------------
// The apikey group, and the configuration it reads

test('apikey: the key goes out as the key query parameter, is never echoed, and the scope check does not apply', async () => {
  const { cfg } = gatewaySetup({ apiKey: 'SECRET-KEY-VALUE' });
  const tools = gatewayTools(cfg, 'apikey');
  gw.setRequestForTests(undefined);
  // The API key client sends the request, so the fetch seam sees the real URL and the real error text.
  const urls = [];
  let reply = { status: 200, body: '{}' };
  ak.setFetchForTests(async (url) => {
    urls.push(String(url));
    return new Response(reply.body, { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  const ctx = { gate: async () => {}, grantedScopes: null, hasScope: () => false };
  try {
    await tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' }, query: { pageSize: 5 } }, ctx);
    const sent = new URL(urls[0]);
    assert.equal(sent.searchParams.get('key'), 'SECRET-KEY-VALUE');
    assert.equal(sent.searchParams.get('pageSize'), '5');

    reply = { status: 400, body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) };
    await assert.rejects(tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, ctx), (err) => {
      assert.doesNotMatch(err.message, /SECRET-KEY-VALUE/);
      assert.match(err.message, /400/);
      return true;
    });
  } finally {
    ak.setFetchForTests(undefined);
  }
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' }, query: { key: 'mine' } }, ctx),
    /set by the gateway/,
    'a caller cannot set the key',
  );
});

test('config: apikey.json is read, GSM_API_KEY wins, and GSM_CONFIRMATION accepts only valid modes', () => {
  const dir = track(tempDir('gsm-gate-cfg-'));
  writeFileSync(join(dir, 'apikey.json'), JSON.stringify({ apiKey: 'FILE-KEY' }), { mode: 0o600 });
  assert.equal(loadConfig({ GSM_TOKEN_DIR: dir }).apiKey, 'FILE-KEY');
  assert.equal(loadConfig({ GSM_TOKEN_DIR: dir, GSM_API_KEY: 'ENV-KEY' }).apiKey, 'ENV-KEY');

  const defaults = loadConfig({ GSM_TOKEN_DIR: dir });
  assert.equal(defaults.confirmation, 'every-change');
  assert.equal(defaults.confirmationFromEnv, false);
  assert.equal(defaults.hookActive, false);

  const invalid = loadConfig({ GSM_TOKEN_DIR: dir, GSM_CONFIRMATION: 'sometimes' });
  assert.equal(invalid.confirmation, 'every-change');
  assert.equal(invalid.confirmationFromEnv, false);

  const off = loadConfig({ GSM_TOKEN_DIR: dir, GSM_CONFIRMATION: ' OFF ', GSM_HOOK_ACTIVE: '1' });
  assert.equal(off.confirmation, 'off');
  assert.equal(off.confirmationFromEnv, true);
  assert.equal(off.hookActive, true);
});

// ---------------------------------------------------------------------------
// End to end: a real runServer child process, driven by the MCP client

/** The entry the bundler would write: three tools of each kind, plus a dynamic one that gates its own write. */
function writeEntry(dir) {
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { join } from 'node:path';`,
      `import { writeFileSync } from 'node:fs';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `const mark = (name) => writeFileSync(join(process.env.GATE_E2E_DIR, name), 'yes');`,
      `await runServer({`,
      `  name: 'gate-e2e',`,
      `  version: '0.0.0',`,
      `  buildTools: () => [`,
      `    { name: 'demo_read', title: 'Demo read', description: 'Reads.', kind: 'read', inputSchema: {}, handler: async () => ({ ok: true }) },`,
      `    { name: 'demo_write', title: 'Demo write', description: 'Writes.', kind: 'write', inputSchema: {}, handler: async () => { mark('write.done'); return { ok: true }; } },`,
      `    { name: 'demo_delete', title: 'Demo delete', description: 'Deletes.', kind: 'destructive', inputSchema: {}, handler: async () => { mark('delete.done'); return { ok: true }; } },`,
      `    { name: 'demo_dynamic', title: 'Demo dynamic', description: 'Gates its own write.', kind: 'dynamic', inputSchema: {}, handler: async (args, ctx) => { await ctx.gate({ kind: 'write', target: 'demo_dynamic', args }); mark('dynamic.done'); return { ok: true }; } },`,
      `  ],`,
      `});`,
      '',
    ].join('\n'),
  );
  return entry;
}

/** The child's environment: the parent's, minus every GSM and plugin setting, plus the given ones. */
function childEnv(dir, extra) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_')));
  return { ...base, GSM_TOKEN_DIR: join(dir, 'tokens'), GSM_ALLOW_WRITES: 'true', GATE_E2E_DIR: dir, ...extra };
}

async function connect(entry, env, { elicitation, answer }) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gate-e2e', version: '0.0.0' }, { capabilities: elicitation ? { elicitation: { form: {} } } : {} });
  const asked = [];
  if (elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      asked.push(request.params.message);
      return answer;
    });
  }
  await client.connect(transport);
  return { client, asked };
}

test('end to end: with the hook active a write runs without asking, and a destructive call asks and is declined', async () => {
  const dir = track(tempDir('gsm-gate-e2e-'));
  const entry = writeEntry(dir);
  const { client, asked } = await connect(entry, childEnv(dir, { GSM_HOOK_ACTIVE: '1' }), {
    elicitation: true,
    answer: { action: 'decline' },
  });
  try {
    const { tools } = await client.listTools();
    const del = tools.find((t) => t.name === 'demo_delete');
    assert.ok(del, 'the destructive tool is registered when writes are on');
    assert.equal(del.inputSchema.properties?.confirm, undefined, 'the model cannot pass a confirm flag');

    const write = await client.callTool({ name: 'demo_write', arguments: {} });
    assert.notEqual(write.isError, true);
    assert.ok(existsSync(join(dir, 'write.done')), 'the hook asked, so the write ran');
    assert.equal(asked.length, 0, 'no elicitation for a change while the hook is active');

    const deleted = await client.callTool({ name: 'demo_delete', arguments: {} });
    assert.equal(deleted.isError, true);
    assert.match(deleted.content[0].text, /You declined this action\. Nothing was changed\./);
    assert.equal(existsSync(join(dir, 'delete.done')), false, 'the handler did not run');
    assert.equal(asked.length, 1);
    assert.match(asked[0], /About to permanently change or delete Google data: demo_delete/);

    const dynamic = await client.callTool({ name: 'demo_dynamic', arguments: {} });
    assert.notEqual(dynamic.isError, true);
    assert.ok(existsSync(join(dir, 'dynamic.done')));
    assert.deepEqual(
      auditLines(join(dir, 'tokens')).map((l) => l.outcome),
      ['hook', 'declined', 'hook'],
      'one audit line per gated action',
    );
  } finally {
    await client.close();
  }
});

test('end to end: without the hook, a change asks, runs on approve, and the dynamic tool asks for its own write', async () => {
  const dir = track(tempDir('gsm-gate-e2e-'));
  const entry = writeEntry(dir);
  const { client, asked } = await connect(entry, childEnv(dir, {}), {
    elicitation: true,
    answer: { action: 'accept', content: { approve: true } },
  });
  try {
    assert.notEqual((await client.callTool({ name: 'demo_write', arguments: {} })).isError, true);
    assert.ok(existsSync(join(dir, 'write.done')));
    assert.notEqual((await client.callTool({ name: 'demo_delete', arguments: {} })).isError, true);
    assert.ok(existsSync(join(dir, 'delete.done')));
    assert.notEqual((await client.callTool({ name: 'demo_dynamic', arguments: {} })).isError, true);
    assert.ok(existsSync(join(dir, 'dynamic.done')));
    assert.equal(asked.length, 3, 'write, destructive and dynamic each asked once');
    assert.deepEqual(
      auditLines(join(dir, 'tokens')).map((l) => l.outcome),
      ['approved', 'approved', 'approved'],
    );
  } finally {
    await client.close();
  }
});

test('end to end: a client that cannot elicit gets an error for a change, and the change does not run', async () => {
  const dir = track(tempDir('gsm-gate-e2e-'));
  const entry = writeEntry(dir);
  const { client } = await connect(entry, childEnv(dir, {}), { elicitation: false });
  try {
    const write = await client.callTool({ name: 'demo_write', arguments: {} });
    assert.equal(write.isError, true);
    assert.match(write.content[0].text, /This client cannot ask for confirmation, so the action was not run/);
    assert.equal(existsSync(join(dir, 'write.done')), false);
    assert.notEqual((await client.callTool({ name: 'demo_read', arguments: {} })).isError, true, 'reads still run');
  } finally {
    await client.close();
  }
});

test('--dump-tools prints the tool map with dynamic tools listed as write, and starts no transport', () => {
  const dir = track(tempDir('gsm-gate-dump-'));
  const entry = writeEntry(dir);
  const result = spawnSync(process.execPath, [entry, '--dump-tools'], { env: childEnv(dir, {}), encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  const { tools } = JSON.parse(result.stdout);
  // The runtime tools (health, the sign-in tools) are added by runServer to every map. The demo tools are checked on their own.
  assert.ok(tools.some((t) => t.name === 'health' && t.kind === 'read'));
  assert.deepEqual(
    tools.filter((t) => !['health', 'auth_status', 'auth_setup_client', 'auth_login', 'auth_setup_admin', 'accounts_list', 'account_set_default', 'account_remove'].includes(t.name)).map((t) => [t.name, t.kind]),
    [
      ['demo_delete', 'destructive'],
      ['demo_dynamic', 'dynamic'],
      ['demo_read', 'read'],
      ['demo_write', 'write'],
    ],
  );
});
