// gbusiness scopes (1.24.1): Google's Business Profile Discovery documents list no OAuth scope, so no gbusiness tool
// declared one: the tools registered before any login, and no login asked for business.manage. config/products.json
// now declares the scope as data (scopeOverrides), applied when the tools are generated, for methods whose document lists
// none. Fake tokens in temp folders only; tools/list only, nothing is sent to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { generateDiscoveryTools, discoveryToolsFor } = await import(DIST('core/discovery/tools.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { requirementsFor, resolveScopes } = await import(DIST('core/scopes.js'));
const { loadRegistry, serverByName, scopesForServer } = await import(DIST('core/registry.js'));
const { registryFromProducts } = await import(DIST('cli/products.js'));

const BM = 'https://www.googleapis.com/auth/business.manage';
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

test('the data: gbusiness declares business.manage for each of its generated APIs, and no other product declares overrides', () => {
  const products = readJson('config', 'products.json').products;
  const apis = products.gbusiness.generated.map((a) => a.api);
  assert.deepEqual(Object.keys(products.gbusiness.scopeOverrides).sort(), [...apis].sort());
  for (const api of apis) assert.deepEqual(products.gbusiness.scopeOverrides[api], [BM], api);
  for (const [id, p] of Object.entries(products)) if (id !== 'gbusiness') assert.equal(p.scopeOverrides, undefined, id);
  // The three copies carry it: config/servers.json, the plugin's servers.json and the CLI's conversion of products.json.
  const map = readJson('config', 'servers.json').servers.find((s) => s.name === 'gbusiness');
  assert.deepEqual(map.scopeOverrides, products.gbusiness.scopeOverrides);
  assert.deepEqual(readJson('plugins', 'gbusiness', 'servers.json').servers[0].scopeOverrides, products.gbusiness.scopeOverrides);
  assert.deepEqual(registryFromProducts(readJson('config', 'products.json'), REPO).servers.find((s) => s.name === 'gbusiness').scopeOverrides, products.gbusiness.scopeOverrides);
  assert.ok(scopesForServer(loadRegistry(DIST('core/registry.js')), 'gbusiness').includes(BM));
});

test('generation: a method without scopes takes the declared ones; a method with its own keeps them; without a declaration nothing changes', () => {
  const doc = {
    rootUrl: 'https://x.googleapis.com/',
    servicePath: '',
    schemas: {},
    resources: {
      things: {
        methods: {
          list: { id: 'x.things.list', httpMethod: 'GET', path: 'v1/things', parameters: [], scopes: [] },
          get: { id: 'x.things.get', httpMethod: 'GET', path: 'v1/things/{id}', parameters: [{ name: 'id', location: 'path', type: 'string', required: true }], scopes: ['https://www.googleapis.com/auth/own'] },
        },
      },
    },
  };
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-bm-gen-') });
  const kinds = { overrides: {}, notes: {} };
  const scopesOf = (sources) => Object.fromEntries(generateDiscoveryTools('gx', 'business', sources, kinds, cfg).tools.filter((t) => t.methodId).map((t) => [t.methodId, t.scopes]));
  assert.deepEqual(scopesOf([{ apiName: 'x', apiVersion: 'v1', doc, scopesWhenNone: [BM] }]), { 'x.things.list': [BM], 'x.things.get': ['https://www.googleapis.com/auth/own'] });
  assert.deepEqual(scopesOf([{ apiName: 'x', apiVersion: 'v1', doc }]), { 'x.things.list': undefined, 'x.things.get': ['https://www.googleapis.com/auth/own'] });
});

test('every generated gbusiness tool declares business.manage; the tool map says so', async () => {
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-bm-tools-') });
  const tools = (await discoveryToolsFor('gbusiness', cfg)).filter((t) => t.methodId);
  assert.equal(tools.length, readJson('config', 'products.json').products.gbusiness.generatedToolCount);
  for (const t of tools) assert.deepEqual(t.scopes, [BM], t.name);
  const map = readJson('plugins', 'gbusiness', 'tool-map.json');
  for (const t of map.filter((e) => e.methodId)) assert.deepEqual(t.scopes, [BM], t.name);
});

test('a business login resolves to business.manage for readwrite; it has no read-only form, so readonly covers no gbusiness tool', async () => {
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-bm-req-') });
  const reqs = await requirementsFor(['gbusiness'], cfg, { warn: () => undefined });
  assert.deepEqual(resolveScopes(reqs, 'readwrite').scopes, [BM]);
  assert.deepEqual(resolveScopes(reqs, 'full').scopes, [BM]);
  const readonly = resolveScopes(reqs, 'readonly');
  assert.deepEqual(readonly.scopes, []);
  assert.equal(readonly.uncovered.length, reqs.filter((r) => r.scopes.length > 0).length);
  // The whole business group (the terminal login without --servers) now asks for it with readwrite.
  const group = loadRegistry(DIST('core/registry.js')).servers.filter((s) => s.group === 'business').map((s) => s.name);
  assert.ok(resolveScopes(await requirementsFor(group, cfg, { warn: () => undefined }), 'readwrite').scopes.includes(BM));
  assert.equal(serverByName(loadRegistry(DIST('core/registry.js')), 'gbusiness').group, 'business');
});

/** tools/list of the bundled gbusiness server with a token folder: no login, or a fake business token holding `scope`. */
async function listGbusiness(scope) {
  const dir = tempDir('gsm-bm-run-');
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  if (scope !== undefined) writeFileSync(join(tokenDir, 'business.token.json'), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', expiry_date: Date.now() + 3600_000, scope }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  Object.assign(env, { GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud') });
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(REPO, 'plugins', 'gbusiness', 'servers', 'gbusiness.mjs')], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-bm-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    return (await client.listTools()).tools.map((t) => t.name).sort();
  } finally {
    await client.close();
  }
}

test('pre-login: gbusiness lists only its scope-free tools until a business login holds business.manage', async () => {
  const runtime = ['account_remove', 'account_set_default', 'accounts_list', 'api_methods', 'auth_login', 'auth_setup_client', 'auth_status', 'health'];
  assert.deepEqual(await listGbusiness(undefined), runtime, 'no login: no Business Profile tool (they all registered before 1.24.1)');
  assert.deepEqual(await listGbusiness('https://www.googleapis.com/auth/analytics.readonly'), runtime, 'a business login without business.manage');
  const all = await listGbusiness(`${BM} https://www.googleapis.com/auth/userinfo.email`);
  const generated = readJson('plugins', 'gbusiness', 'tool-map.json').filter((t) => t.methodId).map((t) => t.name.split('__').pop());
  for (const name of generated) assert.ok(all.includes(name), name);
});

test('gen-servers: scopeOverrides only for a generated API of the product, as a list of scope URLs', () => {
  const run = (scopeOverrides) => {
    const root = tempDir('gsm-gen-bm-');
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    const product = { title: 'X', description: 'X.', group: 'business', server: { name: 'gx', curated: null }, generated: [{ api: 'gmail', version: 'v1' }], scopeOverrides };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: product } }));
    const res = spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
    return { ...res, map: res.status === 0 ? JSON.parse(readFileSync(join(root, 'config', 'servers.json'), 'utf8')) : undefined };
  };
  const ok = run({ gmail: [BM] });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.map.servers[0].scopeOverrides, { gmail: [BM] });
  for (const [value, message] of [
    [{ drive: [BM] }, /"drive" is not a generated API of the product/],
    [{ gmail: [] }, /must be a non-empty list of scope URLs/],
    [{ gmail: ['business.manage'] }, /must be a non-empty list of scope URLs/],
    [{}, /must be a non-empty object/],
    [[BM], /must be a non-empty object/],
  ]) {
    const res = run(value);
    assert.notEqual(res.status, 0, JSON.stringify(value));
    assert.match(res.stderr, message);
  }
});
