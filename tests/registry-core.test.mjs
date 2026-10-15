// Tests for the registry types (gatewayApis) and the API key client. Run after compiling:
//   npx tsc -p tsconfig.json && node --test tests/registry-core.test.mjs
// Temp folders hold the server map and the token folder. The network is never used: fetch is injected.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { loadRegistry } = await import(new URL('../dist/core/registry.js', import.meta.url).href);
const { loadConfig } = await import(new URL('../dist/core/config.js', import.meta.url).href);
const { authFor } = await import(new URL('../dist/core/discovery/tools.js', import.meta.url).href);
const { ApiKeyClient, setFetchForTests } = await import(new URL('../dist/core/discovery/apikey-client.js', import.meta.url).href);

// A fake key in the shape of a Google API key. It must never appear in any error or returned value.
const KEY = 'AIzaSyFAKEKEY0123456789abcdefghijklmno';
const SETUP_MESSAGE = 'This API needs an API key. Run: gsm setup-apikey';
const ENDPOINT = 'https://demo.example.googleapis.com/v1/items';

const SERVER = {
  name: 'demo-gateway',
  plugin: 'google-demo',
  group: 'apikey',
  kind: 'discovery',
  gatewayApis: [
    { api: 'demoapi', version: 'v1' },
    { api: 'otherapi', version: 'v2' },
  ],
  label: 'Demo',
};

const temps = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-registry-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  setFetchForTests(undefined);
});

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('ServerSpec accepts gatewayApis, and loadRegistry returns it from servers.json', () => {
  const root = tempDir();
  writeFileSync(
    join(root, 'servers.json'),
    JSON.stringify({ plugins: { 'google-demo': '1.0.0' }, groups: { apikey: 'API key' }, servers: [SERVER] }),
  );

  // The loader walks up from the module URL until it finds servers.json or config/servers.json.
  const reg = loadRegistry(pathToFileURL(join(root, 'dist', 'core', 'registry.js')).href);
  assert.equal(reg.dataRoot, root);
  assert.deepEqual(reg.servers[0].gatewayApis, SERVER.gatewayApis);
  assert.equal(reg.servers[0].apis, undefined);
  assert.deepEqual(reg.plugins, { 'google-demo': '1.0.0' });
  assert.deepEqual(reg.groups, { apikey: 'API key' });
});

test('loadRegistry reads gatewayApis from the repo layout (config/servers.json)', () => {
  const repo = tempDir();
  mkdirSync(join(repo, 'config'));
  writeFileSync(join(repo, 'config', 'servers.json'), JSON.stringify({ servers: [SERVER] }));

  const reg = loadRegistry(pathToFileURL(join(repo, 'dist', 'core', 'registry.js')).href);
  assert.equal(reg.dataRoot, repo);
  assert.deepEqual(reg.servers[0].gatewayApis, SERVER.gatewayApis);
  assert.deepEqual(reg.plugins, {});
  assert.deepEqual(reg.groups, {});
});

test('authFor("apikey") returns an ApiKeyClient whose request puts the key in the query string', async () => {
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir(), GSM_API_KEY: KEY });
  const client = await authFor('apikey', cfg);
  assert.ok(client instanceof ApiKeyClient);

  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({ items: [{ id: 1 }] });
  });

  const res = await client.request({ url: ENDPOINT, params: { pageSize: 5, ids: ['a', 'b'] } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { items: [{ id: 1 }] });
  const query = new URL(sent[0].url).searchParams;
  assert.equal(query.get('key'), KEY);
  assert.equal(query.get('pageSize'), '5');
  assert.deepEqual(query.getAll('ids'), ['a', 'b']);

  await client.request({ url: `${ENDPOINT}:batchGet`, method: 'POST', data: { names: ['x'] } });
  assert.equal(sent[1].init.method, 'POST');
  assert.equal(sent[1].init.headers['content-type'], 'application/json');
  assert.equal(sent[1].init.body, '{"names":["x"]}');

  setFetchForTests(async () => new Response('plain text', { status: 200 }));
  const text = await client.request({ url: ENDPOINT });
  assert.equal(text.data, 'plain text');
});

test('the API key never appears in an error or in a returned value', async () => {
  const client = new ApiKeyClient(loadConfig({ GSM_TOKEN_DIR: tempDir(), GSM_API_KEY: KEY }));

  // Google's message echoes the key: the error must show it redacted, with the status and the message.
  setFetchForTests(async () =>
    json({ error: { code: 403, status: 'PERMISSION_DENIED', message: `API key not valid: ${KEY}. Pass a valid key.` } }, 403),
  );
  const httpErr = await client.request({ url: ENDPOINT }).then(
    () => assert.fail('a 403 must throw'),
    (err) => err,
  );
  assert.match(httpErr.message, /^HTTP 403 \(PERMISSION_DENIED\): API key not valid: \[redacted\]\. Pass a valid key\.$/);
  assert.equal(httpErr.message.includes(KEY), false);

  // A network error that names the URL: the key in it is redacted too.
  setFetchForTests(async (url) => {
    throw new Error(`connect failed for ${url}`);
  });
  const netErr = await client.request({ url: ENDPOINT }).then(
    () => assert.fail('a network error must throw'),
    (err) => err,
  );
  assert.equal(netErr.message.includes(KEY), false);
  assert.match(netErr.message, /failed/);

  // A successful response that echoes the key: the returned value shows it redacted.
  setFetchForTests(async () => json({ echoed: KEY, nested: [KEY] }));
  const ok = await client.request({ url: ENDPOINT });
  assert.deepEqual(ok.data, { echoed: '[redacted]', nested: ['[redacted]'] });
  assert.equal(JSON.stringify(ok).includes(KEY), false);
});

test('ApiKeyClient throws the setup message when no API key is configured, and sends nothing', async () => {
  // No GSM_API_KEY in the env and no apikey.json in the token folder.
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir() });
  assert.equal(cfg.apiKey, undefined);

  let called = false;
  setFetchForTests(async () => {
    called = true;
    return json({});
  });
  const client = new ApiKeyClient(cfg);
  await assert.rejects(client.request({ url: ENDPOINT }), (err) => err instanceof Error && err.message === SETUP_MESSAGE);
  assert.equal(called, false);
});
