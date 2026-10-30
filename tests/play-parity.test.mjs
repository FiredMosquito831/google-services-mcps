// The Android Management parity tools of gplay (1.24.0): the 9 tools of Google's Android Device Management MCP server,
// all reads, through the service-account key. The HTTP layer is stubbed (OAuth2Client.prototype.request, which the
// key's JWT client inherits), so nothing leaves the machine. A throwaway key in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const play = await import(DIST('servers/gplay.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-play-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyFile = join(root, 'key.json');
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
writeFileSync(join(tokenDir, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-30T00:00:00Z' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir });
const tools = new Map(play.buildTools(cfg).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query: Object.fromEntries(url.searchParams) };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const AM = 'https://androidmanagement.googleapis.com/v1';
const OFFICIAL = {
  androidmgmt_list_enterprises: 'list_enterprises',
  androidmgmt_get_enterprise: 'get_enterprise',
  androidmgmt_get_application: 'get_application',
  androidmgmt_list_devices: 'list_devices',
  androidmgmt_get_device: 'get_device',
  androidmgmt_list_policies: 'list_policies',
  androidmgmt_get_policy: 'get_policy',
  androidmgmt_list_web_apps: 'list_web_apps',
  androidmgmt_get_web_app: 'get_web_app',
};

test("nine tools, all reads with the androidmanagement scope; each names the Google tool it matches", () => {
  assert.deepEqual([...tools.keys()].sort(), Object.keys(OFFICIAL).sort());
  for (const [name, google] of Object.entries(OFFICIAL)) {
    const t = tools.get(name);
    assert.equal(t.kind, 'read', name);
    assert.deepEqual(t.scopes, ['https://www.googleapis.com/auth/androidmanagement'], name);
    assert.ok(t.description.includes(`matches ${google} in Google's Android Device Management MCP server`), name);
    assert.equal(t.inputSchema.confirm, undefined, `${name}: no model-controlled confirm`);
    assert.ok(name.length <= 49 - 'gplay'.length * 2, `${name} fits the name budget`);
  }
});

test('resource names: ids or full names; anything that would change the path is refused before any request', () => {
  assert.equal(play.enterpriseName('LC0123abcd'), 'enterprises/LC0123abcd');
  assert.equal(play.enterpriseName(' enterprises/LC0123abcd '), 'enterprises/LC0123abcd');
  for (const bad of ['', 'enterprises/', 'LC01/../x', 'a b', 'enterprises/a/devices/b']) assert.throws(() => play.enterpriseName(bad), /is not an enterprise/, bad);
  assert.equal(play.childName('LC1', 'devices', '3a1b', 'device'), 'enterprises/LC1/devices/3a1b');
  assert.equal(play.childName(undefined, 'policies', 'enterprises/LC1/policies/default', 'policy'), 'enterprises/LC1/policies/default');
  assert.throws(() => play.childName(undefined, 'devices', '3a1b', 'device'), /Give enterprise with the device id/);
  assert.throws(() => play.childName('LC1', 'webApps', 'w/1', 'web app'), /is not a web app id/);
  assert.throws(() => play.childName('LC1', 'devices', 'enterprises/LC1/policies/p', 'device'), /is not a device id/, 'a full name of another collection');
});

test('the requests: GET on the enterprise and its collections, paging and the project in the query', async () => {
  reset((call) => (call.url.endsWith('/devices') ? { devices: [{ name: 'enterprises/LC1/devices/d1' }], nextPageToken: 'n2' } : { name: 'x' }));
  assert.deepEqual(await run('androidmgmt_list_devices', { enterprise: 'LC1', page_size: 5, page_token: 'n1' }), { devices: [{ name: 'enterprises/LC1/devices/d1' }], next_page_token: 'n2' });
  assert.deepEqual(calls, [{ method: 'GET', url: `${AM}/enterprises/LC1/devices`, query: { pageSize: '5', pageToken: 'n1' } }]);
  reset(() => ({}));
  assert.deepEqual(await run('androidmgmt_list_enterprises', { project_id: 'my-emm-project', view: 'BASIC' }), { enterprises: [], next_page_token: undefined });
  assert.deepEqual(calls, [{ method: 'GET', url: `${AM}/enterprises`, query: { projectId: 'my-emm-project', view: 'BASIC' } }]);
  const cases = [
    ['androidmgmt_get_enterprise', { enterprise: 'LC1' }, `${AM}/enterprises/LC1`, {}],
    ['androidmgmt_get_application', { enterprise: 'LC1', package_name: 'com.google.android.gm', language_code: 'de' }, `${AM}/enterprises/LC1/applications/com.google.android.gm`, { languageCode: 'de' }],
    ['androidmgmt_get_device', { device: 'enterprises/LC1/devices/d1' }, `${AM}/enterprises/LC1/devices/d1`, {}],
    ['androidmgmt_get_policy', { enterprise: 'LC1', policy: 'default' }, `${AM}/enterprises/LC1/policies/default`, {}],
    ['androidmgmt_list_policies', { enterprise: 'LC1' }, `${AM}/enterprises/LC1/policies`, {}],
    ['androidmgmt_list_web_apps', { enterprise: 'LC1' }, `${AM}/enterprises/LC1/webApps`, {}],
    ['androidmgmt_get_web_app', { enterprise: 'LC1', web_app: 'w1' }, `${AM}/enterprises/LC1/webApps/w1`, {}],
  ];
  for (const [name, args, url, query] of cases) {
    reset(() => ({ name: 'n' }));
    await run(name, args);
    assert.deepEqual(calls, [{ method: 'GET', url, query }], name);
  }
  reset();
  await assert.rejects(run('androidmgmt_get_device', { device: 'd1' }), /Give enterprise/);
  await assert.rejects(run('androidmgmt_get_application', { enterprise: 'LC1', package_name: 'gm' }));
  assert.equal(calls.length, 0, 'refused before any request');
});

test("the gplay google list: Google's nine Android Management tools and a lean Play publishing set", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gplay.toolsets.google;
  for (const [name, official] of Object.entries(OFFICIAL)) assert.deepEqual(google.matches[name], [official], name);
  const publishing = google.tools.filter((t) => !t.startsWith('androidmgmt_'));
  assert.deepEqual(publishing, [
    'androidpub_reviews_list',
    'androidpub_reviews_reply',
    'androidpub_applica_tracks_releases_list',
    'androidpub_edits_tracks_list',
    'androidpub_purchases_subscriptionsv_get',
    'androidpub_monetizatio_subscriptio_list',
    'androidpub_orders_get',
  ]);
  for (const tool of publishing) {
    assert.deepEqual(google.matches[tool], [], tool);
    assert.ok(typeof google.notes[tool] === 'string' && google.notes[tool].length > 10, tool);
  }
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gplay', 'tool-map.json'), 'utf8'));
  const kind = (name) => map.find((t) => t.name === `mcp__plugin_gplay_gplay__${name}`)?.kind;
  for (const name of google.tools) assert.equal(kind(name), name === 'androidpub_reviews_reply' ? 'write' : 'read', name);
});
