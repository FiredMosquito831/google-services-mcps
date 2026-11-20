// OD13a: the narrow Street View Publish key + bearer route. Run after compiling:
//   npx tsc -p tsconfig.json && node --test tests/streetview-credentials.test.mjs
// No network, sign-in or token file: both the bearer and the HTTP fetch are injected test seams.
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url);
const { loadConfig } = await import(new URL('../dist/core/config.js', import.meta.url).href);
const { sendAuthorized, setBearerForTests } = await import(new URL('../dist/core/discovery/tools.js', import.meta.url).href);
const { setFetchForTests } = await import(new URL('../dist/core/discovery/apikey-client.js', import.meta.url).href);
const gw = await import(new URL('../dist/core/gateway.js', import.meta.url).href);

const KEY = 'AIzaSyFAKEKEY0123456789abcdefghijklmno';
const TOKEN = 'fake-access-token-od13a';
const ROUTE = 'streetview-key-plus-bearer';
const SCOPE = 'https://www.googleapis.com/auth/streetviewpublish';
const HOST = 'streetviewpublish.googleapis.com';
const METHOD = 'streetviewpublish.photos.list';
const URL_OK = `https://${HOST}/v1/photos`;

const temps = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'gsm-od13a-'));
  temps.push(root);
  const tokenDir = join(root, 'tokens');
  const cache = join(tokenDir, 'discovery-cache');
  mkdirSync(cache, { recursive: true });
  copyFileSync(new URL('data/discovery/streetviewpublish.v1.json', ROOT), join(cache, 'streetviewpublish.v1.json'));
  const cfg = { ...loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: KEY }), server: 'gmaps' };
  return { cfg, tokenDir };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  setFetchForTests(undefined);
  setBearerForTests(undefined);
  gw.setFetchForTests(undefined);
  gw.setRequestForTests(undefined);
});

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

test('the approved route sends the existing key in the query and the user bearer in a header', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({ photos: [] });
  });
  const res = await sendAuthorized('apikey', cfg, {
    url: URL_OK,
    method: 'GET',
    authMethodId: METHOD,
    credentialRoute: ROUTE,
  });
  assert.deepEqual(res, { status: 200, data: { photos: [] } });
  assert.equal(sent.length, 1);
  assert.equal(new URL(sent[0].url).searchParams.get('key'), KEY);
  assert.equal(sent[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(sent[0].init.headers['X-Goog-Api-Key'], undefined, 'the key keeps its existing query placement');
});

test('neither credential is echoed in a refused answer on the dual route', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  setFetchForTests(async () => json({ error: { message: `bad ${KEY} ${TOKEN}` } }, 403));
  await assert.rejects(
    sendAuthorized('apikey', cfg, { url: URL_OK, method: 'GET', authMethodId: METHOD, credentialRoute: ROUTE }),
    (err) => {
      const text = JSON.stringify(err);
      assert.doesNotMatch(text, new RegExp(KEY));
      assert.doesNotMatch(text, new RegExp(TOKEN));
      assert.match(text, /\[redacted\]/);
      return true;
    },
  );
});

test('a forged route, wrong group, wrong host, unapproved id or missing id fails closed without sending', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({});
  });
  const cases = [
    { group: 'workspace-user', req: { url: URL_OK, method: 'GET', authMethodId: METHOD, credentialRoute: ROUTE } },
    { group: 'apikey', req: { url: 'https://other.example.googleapis.com/v1/photos', method: 'GET', authMethodId: METHOD, credentialRoute: ROUTE } },
    { group: 'apikey', req: { url: URL_OK, method: 'GET', authMethodId: 'places.places.get', credentialRoute: ROUTE } },
    { group: 'apikey', req: { url: URL_OK, method: 'GET', credentialRoute: ROUTE } },
    { group: 'apikey', req: { url: URL_OK, method: 'GET', authMethodId: METHOD } },
  ];
  for (const { group, req } of cases) {
    await assert.rejects(sendAuthorized(group, cfg, req), /credential route refused/);
  }
  assert.equal(sent.length, 0);
  assert.equal(readScope(cfg), SCOPE, 'the declared scope stays data-declared, not widened');
});

function readScope(cfg) {
  // The declaration is read from the generated server map, not from a second list in the code.
  const { serverByName, loadRegistry } = registry;
  return serverByName(loadRegistry(), cfg.server).credentialOverrides.streetviewpublish.scope;
}

const registry = await import(new URL('../dist/core/registry.js', import.meta.url).href);

test('a non-Street View gmaps request and a gsearch request stay key-only', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({ ok: true });
  });
  await sendAuthorized('apikey', cfg, { url: 'https://places.googleapis.com/v1/places:searchText', method: 'POST', authMethodId: 'places.places.searchText' });
  const search = { ...loadConfig({ GSM_TOKEN_DIR: cfg.tokenDir, GSM_API_KEY: KEY }), server: 'gsearch' };
  await sendAuthorized('apikey', search, { url: 'https://kgsearch.googleapis.com/v1/entities:search', method: 'GET' });
  assert.equal(sent.length, 2);
  for (const call of sent) {
    assert.equal(call.init.headers.Authorization, undefined);
    assert.ok(new URL(call.url).searchParams.get('key'));
  }
});

test('gateway api_call on an approved method goes through the same dual-credential path', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({ photos: [] });
  });
  const tools = Object.fromEntries(
    gw.gatewayTools({ product: 'gmaps', group: 'apikey', apis: [{ api: 'streetviewpublish', version: 'v1' }], cfg }).map((t) => [t.name, t]),
  );
  const out = await tools.api_call.handler({ method: METHOD }, {});
  assert.deepEqual(out, { status: 200, data: { photos: [] } });
  assert.equal(sent.length, 1, 'the gateway used sendAuthorized, not its request-override seam');
  assert.equal(new URL(sent[0].url).searchParams.get('key'), KEY);
  assert.equal(sent[0].init.headers.Authorization, `Bearer ${TOKEN}`);
});

test('gateway api_call for another group never gains the route fields', async () => {
  const { cfg } = setup();
  setBearerForTests(TOKEN);
  const sent = [];
  setFetchForTests(async (url, init) => {
    sent.push({ url, init });
    return json({ photos: [] });
  });
  const tools = Object.fromEntries(
    gw.gatewayTools({ product: 'gmaps', group: 'workspace-user', apis: [{ api: 'streetviewpublish', version: 'v1' }], cfg }).map((t) => [t.name, t]),
  );
  await assert.rejects(tools.api_call.handler({ method: METHOD }, {}), /credential route refused|Not logged in/);
  assert.equal(sent.length, 0);
});


const require = createRequire(import.meta.url);

/** Lists the bundled server's tools with a given token folder and write setting. No Google call is made. */
async function listedNames(tokenDir, allowWrites, plugin = 'gmaps') {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL(`plugins/${plugin}/servers/${plugin}.mjs`, ROOT))],
    env: { ...base, GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: KEY, GSM_ALLOW_WRITES: allowWrites ? 'true' : 'false' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gsm-od13a-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return new Set(tools.map((t) => t.name));
  } finally {
    await client.close();
  }
}

test('question 8: registration before and after the approved scope, with writes off and on', async () => {
  const { tokenDir } = setup();
  const toolMap = JSON.parse((await import('node:fs')).readFileSync(new URL('plugins/gmaps/tool-map.json', ROOT), 'utf8'));
  const shortName = (name) => name.slice(name.lastIndexOf('__') + 2);
  const hidden = toolMap.filter((t) => t.methodId?.startsWith('streetviewpublish.')).map((t) => shortName(t.name));
  assert.equal(hidden.length, 14);
  for (const writes of [false, true]) {
    const before = await listedNames(tokenDir, writes);
    for (const name of hidden) assert.ok(!before.has(name), `hidden before sign-in (writes=${writes}): ${name}`);
  }
  // A gsearch baseline with the same (unrelated) token folder, to prove its registration does not move.
  const gsearchBefore = await listedNames(tokenDir, true, 'gsearch');
  // The existing user OAuth profile now holds the declared scope: exactly the 14 route tools appear.
  writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: SCOPE }));
  for (const writes of [false, true]) {
    const after = await listedNames(tokenDir, writes);
    const reads = hidden.filter((name) => toolMap.find((t) => shortName(t.name) === name).kind === 'read');
    for (const name of hidden) {
      const expected = writes || reads.includes(name);
      assert.equal(after.has(name), expected, `${name}: writes=${writes}, expected ${expected}`);
    }
  }
  // The other groups' registration does not depend on this token file: gsearch stays key-only.
  assert.deepEqual(await listedNames(tokenDir, true, 'gsearch'), gsearchBefore);
});

test('OD13a CLI login: standalone plugins/gmaps/bin/gsm.mjs login workspace-user with streetviewpublish scope starts cleanly and saves groupScopes', async () => {
  const serversJson = JSON.parse((await import('node:fs')).readFileSync(new URL('plugins/gmaps/servers.json', ROOT), 'utf8'));
  assert.ok(Array.isArray(serversJson.groupScopes?.['workspace-user']), 'gmaps plugin carries workspace-user groupScopes');
  assert.ok(serversJson.groupScopes['workspace-user'].includes(SCOPE), 'streetviewpublish is included in workspace-user groupScopes');

  const { runLogin } = await import(new URL('../dist/cli/login.js', import.meta.url).href);
  const { loadRegistryFile } = await import(new URL('../dist/cli/products.js', import.meta.url).href);
  const { tokenDir, cfg } = setup();
  writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'cid', client_secret: 'csec' } }));
  const lines = [];
  const code = await runLogin(
    { group: 'workspace-user', profile: 'custom', customScopes: [SCOPE], noBrowser: true },
    () => loadRegistryFile(fileURLToPath(new URL('plugins/gmaps/servers.json', ROOT))),
    { log: (l) => lines.push(l), warn: (l) => lines.push(l) },
    {
      cfg,
      loopback: async (_id, _secret, scopes) => {
        assert.ok(scopes.includes(SCOPE), 'login asks Google for streetviewpublish scope');
        return { access_token: 'at', refresh_token: 'rt', scope: `${SCOPE} https://www.googleapis.com/auth/userinfo.email`, expiry_date: Date.now() + 3600_000 };
      },
      accountOf: async () => 'driver@example.com',
    },
  );
  assert.equal(code, 0, lines.join('\n'));
  const saved = JSON.parse((await import('node:fs')).readFileSync(join(tokenDir, 'workspace-user.driver_example.com.token.json'), 'utf8'));
  assert.ok(saved.scope.split(' ').includes(SCOPE), 'streetviewpublish scope is NOT dropped as foreign during merge/save');
});
