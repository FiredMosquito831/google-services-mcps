// D4 (1.24.3): every tool carries the four MCP annotation hints (schema 2025-11-25): readOnlyHint, destructiveHint,
// idempotentHint and openWorldHint. readOnlyHint and destructiveHint follow the kind as before; idempotentHint and
// openWorldHint follow the rules in src/core/tools.ts (toolAnnotations, RUNTIME_TOOL_HINTS). Run after compiling
// (npm test does). The last test starts every bundled server with a fake sign-in (fake values, never sent) and checks
// every tool it lists. No network call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { toolAnnotations, RUNTIME_TOOL_HINTS } = await import(dist('core/tools.js'));
const { generateDiscoveryTools } = await import(dist('core/discovery/tools.js'));
const gw = await import(dist('core/gateway.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];
const RUNTIME = ['health', 'auth_status', 'accounts_list', 'auth_setup_client', 'auth_login', 'account_set_default', 'account_remove', 'auth_setup_admin', 'auth_setup_service_account'];

test('toolAnnotations: the four hints per kind, and a declaration wins for idempotentHint and openWorldHint', () => {
  const of = (kind, extra = {}) => toolAnnotations({ kind, ...extra });
  assert.deepEqual(of('read'), { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
  assert.deepEqual(of('write'), { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
  assert.deepEqual(of('destructive'), { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
  // A dynamic tool (api_call, the Ads mutate) may delete, so it stays marked destructive, as before.
  assert.deepEqual(of('dynamic'), { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
  assert.equal(of('write', { idempotent: true }).idempotentHint, true);
  assert.equal(of('read', { idempotent: false }).idempotentHint, false);
  assert.equal(of('read', { openWorld: false }).openWorldHint, false);
  for (const kind of ['read', 'write', 'destructive', 'dynamic']) assert.deepEqual(Object.keys(of(kind)), HINTS, kind);
});

test('the runtime tools: each has its four hints; only health, auth_login and account_remove can reach Google', () => {
  assert.deepEqual(Object.keys(RUNTIME_TOOL_HINTS).sort(), [...RUNTIME].sort());
  for (const [name, hints] of Object.entries(RUNTIME_TOOL_HINTS)) {
    assert.deepEqual(Object.keys(hints), HINTS, name);
    for (const h of HINTS) assert.equal(typeof hints[h], 'boolean', `${name} ${h}`);
  }
  const reads = Object.entries(RUNTIME_TOOL_HINTS).filter(([, h]) => h.readOnlyHint).map(([n]) => n).sort();
  assert.deepEqual(reads, ['accounts_list', 'auth_status', 'health'], 'the reads, as in the tool map (dumpTools)');
  const open = Object.entries(RUNTIME_TOOL_HINTS).filter(([, h]) => h.openWorldHint).map(([n]) => n).sort();
  assert.deepEqual(open, ['account_remove', 'auth_login', 'health']);
  const destructive = Object.entries(RUNTIME_TOOL_HINTS).filter(([, h]) => h.destructiveHint).map(([n]) => n).sort();
  assert.deepEqual(destructive, ['account_remove', 'auth_setup_admin', 'auth_setup_client', 'auth_setup_service_account']);
  assert.equal(RUNTIME_TOOL_HINTS.auth_login.idempotentHint, false, 'each sign-in makes a new token');
});

test('generated tools: idempotent for a read and for GET, PUT and DELETE; not for a POST or PATCH write; api_methods is local', () => {
  // The trimmed snapshot shape of data/discovery: parameters are a list.
  const method = (httpMethod, path) => ({ id: `demoapi.items.${path}`, path: `v1/items:${path}`, httpMethod, parameters: [] });
  const doc = {
    name: 'demoapi',
    version: 'v1',
    rootUrl: 'https://demo.example.googleapis.com/',
    servicePath: '',
    schemas: {},
    resources: {
      items: {
        methods: {
          list: method('GET', 'list'),
          search: method('POST', 'search'),
          create: method('POST', 'create'),
          update: method('PUT', 'update'),
          patch: method('PATCH', 'patch'),
          delete: method('DELETE', 'delete'),
          move: method('GET', 'move'),
        },
      },
    },
  };
  const kinds = { overrides: { 'demoapi.items.move': 'write' }, notes: {} };
  const { tools } = generateDiscoveryTools('demo', 'workspace-user', [{ apiName: 'demoapi', apiVersion: 'v1', doc }], kinds, { allowWrites: true, tokenDir: tempDir('gsm-ann-gen-') });
  const byMethod = Object.fromEntries(tools.filter((t) => t.methodId).map((t) => [t.methodId.split('.').pop(), toolAnnotations(t)]));
  const expect = {
    list: [true, false, true],
    search: [true, false, true],
    create: [false, false, false],
    update: [false, false, true],
    patch: [false, false, false],
    delete: [false, true, true],
    move: [false, false, true],
  };
  for (const [name, [readOnly, destructive, idempotent]] of Object.entries(expect)) {
    assert.deepEqual(byMethod[name], { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: true }, name);
  }
  const list = tools.find((t) => t.name === 'api_methods');
  assert.deepEqual(toolAnnotations(list), { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
});

test('gateway tools: api_search reads the local catalog; api_describe and api_call can reach Google', () => {
  const tools = Object.fromEntries(gw.gatewayTools({ product: 'demo', group: 'workspace-user', apis: [], cfg: { tokenDir: tempDir('gsm-ann-gw-') } }).map((t) => [t.name, toolAnnotations(t)]));
  assert.deepEqual(tools.api_search, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  assert.deepEqual(tools.api_describe, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
  assert.deepEqual(tools.api_call, { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });
});

/** The curated writes declared idempotent: one PUT, DELETE or GET method, or Google's matching tool says so. */
const CURATED_IDEMPOTENT = [
  'admin_group_delete',
  'admin_member_remove',
  'admin_orgunit_delete',
  'admin_user_delete',
  'calendar_delete_event',
  'calendar_respond',
  'calendar_update_event',
  'chat_mark_read',
  'chat_mark_unread',
  'cloud_apikey_delete',
  'cloud_apikey_reveal',
  'cloud_project_delete',
  'gmail_label',
  'gmail_unlabel',
  'sc_site_add',
  'sc_site_delete',
  'sc_sitemap_delete',
  'sc_sitemap_submit',
  'sheets_write_values',
];

test('curated tools: every one calls Google (openWorldHint true); the writes declared idempotent are exactly the listed ones', async () => {
  const MODULES = ['cloud', 'gmail', 'gdrive', 'gcalendar', 'workspace-admin', 'searchconsole', 'gchat', 'gcontacts', 'gclassroom', 'ganalytics', 'gfirebase', 'gai', 'gmaps', 'gplay', 'gads'];
  const dir = tempDir('gsm-ann-curated-');
  const cfg = { allowWrites: true, tokenDir: dir, clientSecretFile: join(dir, 'client.json'), maxResultChars: 100000 };
  const declared = [];
  let curated = 0;
  for (const name of MODULES) {
    const mod = await import(dist(`servers/${name}.js`));
    for (const tool of await mod.buildTools(cfg)) {
      curated += 1;
      const hints = toolAnnotations(tool);
      assert.equal(hints.openWorldHint, true, `${tool.name} calls a Google API`);
      if (tool.kind === 'read') assert.equal(hints.idempotentHint, true, tool.name);
      else if (hints.idempotentHint) declared.push(tool.name);
    }
  }
  assert.ok(curated > 100, `${curated} curated tools`);
  assert.deepEqual(declared.sort(), CURATED_IDEMPOTENT);
});

// ---- every bundled server, over stdio ----

const keyDir = tempDir('gsm-ann-key-');
const keyFile = join(keyDir, 'key.json');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));

/** A token folder with a fake sign-in for the plugin's group, holding every scope its tool map lists. Fake values only. */
function fakeSignIn(plugin, map) {
  const group = readJson('plugins', plugin, 'servers.json').servers[0].group;
  const scopes = [...new Set(map.flatMap((t) => t.scopes ?? []))].sort();
  const dir = tempDir(`gsm-ann-${plugin}-`);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens, { recursive: true });
  const env = {};
  if (group === 'apikey') env.GSM_API_KEY = 'fake-key-never-sent';
  else if (group === 'service-account') writeFileSync(join(tokens, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-30T00:00:00Z' }));
  else if (group === 'workspace-admin') writeFileSync(join(tokens, 'workspace-admin.scopes.json'), JSON.stringify({ subject: 'admin@example.com', scopes, profile: 'custom', keyFile }));
  else writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, ...env, GSM_TOKEN_DIR: tokens, GSM_ALLOW_WRITES: 'true', HOME: dir, USERPROFILE: dir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud') };
}

async function listedTools(plugin, env) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'plugins', plugin, 'servers', `${plugin}.mjs`)], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-annotations-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const tools = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  } finally {
    await client.close();
  }
}

let everyServer;
/** Every bundled server's tools/list (writes on, a fake sign-in), listed once for the tests below. */
function everyServerTools() {
  everyServer ??= (async () => {
    const plugins = readdirSync(join(ROOT, 'plugins')).sort();
    const out = [];
    for (const plugin of plugins) {
      const map = readJson('plugins', plugin, 'tool-map.json');
      out.push({ plugin, map, tools: await listedTools(plugin, fakeSignIn(plugin, map)) });
    }
    return out;
  })();
  return everyServer;
}

test('every tool of every bundled server lists all four hints as booleans, and they agree with the kind in its tool map', { timeout: 600_000 }, async () => {
  const servers = await everyServerTools();
  assert.equal(servers.length, 23);
  let checked = 0;
  for (const { plugin, map, tools } of servers) {
    const kindOf = new Map(map.map((t) => [t.name.slice(t.name.lastIndexOf('__') + 2), t.kind]));
    assert.ok(tools.length > 5, `${plugin} lists its tools`);
    for (const tool of tools) {
      const at = `${plugin}/${tool.name}`;
      assert.deepEqual(Object.keys(tool.annotations ?? {}).sort(), [...HINTS].sort(), `${at} has the four hints`);
      for (const h of HINTS) assert.equal(typeof tool.annotations[h], 'boolean', `${at} ${h}`);
      const kind = kindOf.get(tool.name);
      assert.ok(kind, `${at} is in the tool map`);
      if (RUNTIME.includes(tool.name)) {
        assert.deepEqual(tool.annotations, RUNTIME_TOOL_HINTS[tool.name], at);
        continue;
      }
      assert.equal(tool.annotations.readOnlyHint, kind === 'read', `${at} readOnlyHint follows the kind ${kind}`);
      assert.equal(tool.annotations.destructiveHint, kind === 'destructive' || kind === 'dynamic', `${at} destructiveHint follows the kind ${kind}`);
      if (kind === 'read') assert.equal(tool.annotations.idempotentHint, true, `${at} a read is idempotent`);
      if (kind === 'dynamic') assert.equal(tool.annotations.idempotentHint, false, at);
      assert.equal(tool.annotations.openWorldHint, !['api_methods', 'api_search'].includes(tool.name), `${at} openWorldHint`);
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `${checked} tools checked`);
});

// 1.29.1: the snapshots keep longer method descriptions, and a generated tool's description is cut to TOOL_DESCRIPTION_MAX
// with its note and method line kept. Claude Code cut longer descriptions before 2.1.296; other clients may still.
test('every tool description of every bundled server is at most 2,048 characters', { timeout: 600_000 }, async () => {
  const { TOOL_DESCRIPTION_MAX } = await import(dist('core/discovery/tools.js'));
  assert.equal(TOOL_DESCRIPTION_MAX, 2048);
  const servers = await everyServerTools();
  let checked = 0;
  let longest = 0;
  for (const { plugin, tools } of servers) {
    for (const tool of tools) {
      const length = (tool.description ?? '').length;
      assert.ok(length > 0, `${plugin}/${tool.name} has a description`);
      assert.ok(length <= TOOL_DESCRIPTION_MAX, `${plugin}/${tool.name}: ${length} characters`);
      longest = Math.max(longest, length);
      checked += 1;
    }
  }
  assert.ok(checked > 3000, `${checked} tools checked`);
  assert.ok(longest > 1000, `the longest description (${longest}) shows the longer snapshot texts`);
});

// 1.38.3: key terms first. Claude Code cuts a description past its limit, and "When tool search matches Claude's query
// against a tool's description, it reads only the part within the shorter limit, so put the words Claude would search for
// near the start too" (code.claude.com/docs/en/mcp). Every description is within 2,048 characters (above); here, each one
// starts with what the tool does: a generated tool with Google's description of its method, before this suite's note and
// its method line; every other tool (curated, gateway, runtime) with a sentence, not a note.
test('every tool description starts with what the tool does; a generated tool puts its notes and method line after it', { timeout: 600_000 }, async () => {
  const servers = await everyServerTools();
  let generated = 0;
  let other = 0;
  for (const { plugin, map, tools } of servers) {
    const methodOf = new Map(map.map((t) => [t.name.slice(t.name.lastIndexOf('__') + 2), t.methodId]));
    for (const tool of tools) {
      // Some Discovery descriptions begin with a space (Business Profile Performance); the words still come first.
      const text = (tool.description ?? '').trimStart();
      const at = `${plugin}/${tool.name}`;
      assert.ok(text.length > 0, `${at}: has a description`);
      const methodId = methodOf.get(tool.name);
      if (methodId) {
        const line = text.lastIndexOf(`Method ${methodId}: `);
        assert.ok(line > 0, `${at}: Google's description comes before the method line`);
        const lead = text.slice(0, line);
        const note = lead.lastIndexOf(' Note: ');
        assert.ok(lead.slice(0, note >= 0 ? note : undefined).trim().length > 0, `${at}: a description before the note`);
        generated += 1;
      } else {
        assert.match(text, /^[A-Z`"]/, `${at}: starts with a sentence`);
        assert.ok(!/^(Note|Warning)\b/.test(text), `${at}: not with a note`);
        other += 1;
      }
    }
  }
  assert.ok(generated > 2500 && other > 300, `${generated} generated and ${other} other tools checked`);
});
