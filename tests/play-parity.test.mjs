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
  const call = {
    method: String(opts.method ?? 'GET').toUpperCase(),
    url: `${url.origin}${url.pathname}`,
    query: Object.fromEntries(url.searchParams),
    ...(opts.data !== undefined ? { body: opts.data } : {}),
  };
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
  const management = [...tools.keys()].filter((n) => n.startsWith('androidmgmt_')).sort();
  assert.deepEqual(management, Object.keys(OFFICIAL).sort());
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

test('androidpub_upload_bundle: the bundle uploaded, the track release written, and the commit only when asked', async () => {
  const { createHash } = await import('node:crypto');
  const aab = join(root, 'app-release.aab');
  const bytes = Buffer.from('an Android App Bundle');
  writeFileSync(aab, bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const tool = tools.get('androidpub_upload_bundle');
  assert.equal(tool.kind, 'write');
  assert.deepEqual(tool.scopes, ['https://www.googleapis.com/auth/androidpublisher']);
  // Committing publishes the release, so that call is destructive; the rest is a write.
  assert.equal(tool.destructiveWhen({ commit: true }), true);
  assert.equal(tool.destructiveWhen({ track: 'beta' }), false);

  reset((call) => {
    if (call.method === 'POST' && call.url.endsWith('/edits')) return { id: 'edit-1' };
    if (call.url.includes('/upload/')) return { versionCode: 42, sha256: 'google-sha' };
    if (call.method === 'GET' && call.url.includes('/tracks/beta')) return { track: 'beta', releases: [{ versionCodes: ['41'], status: 'completed' }] };
    return { track: 'beta' };
  });
  const out = await run('androidpub_upload_bundle', { package_name: 'com.example.app', bundle_path: aab, track: 'beta', release_name: '1.4.0' });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url}`),
    [
      'POST https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits',
      'POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/com.example.app/edits/edit-1/bundles',
      'GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits/edit-1/tracks/beta',
      'PUT https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits/edit-1/tracks/beta',
    ],
  );
  assert.equal(calls[1].query.uploadType, 'media', 'one media upload, not a multipart body');
  assert.equal(typeof calls[1].body.pipe, 'function', 'the bundle goes as a stream, not read into memory');
  assert.deepEqual(calls[3].body, {
    track: 'beta',
    // The release being replaced is kept, not cleared: an update that drops it would take it off the track.
    releases: [{ name: '1.4.0', versionCodes: ['42'], status: 'draft' }, { versionCodes: ['41'], status: 'completed' }],
  });
  assert.deepEqual(out, {
    package_name: 'com.example.app',
    edit_id: 'edit-1',
    version_code: 42,
    sha256: 'google-sha',
    size_bytes: bytes.length,
    track: 'beta',
    release_status: 'draft',
    releases_on_the_track: 2,
    committed: false,
    note: 'The edit is open. androidpub_edits_commit commits it (a release is then published), and androidpub_edits_delete drops it; Google discards an edit that is never committed.',
  });

  // A given edit is used, a staged rollout carries its user fraction, and commit adds the commit call.
  reset((call) => {
    if (call.method === 'GET') return { track: 'production' };
    if (call.url.includes('/upload/')) return { versionCode: 43 };
    return {};
  });
  const committed = await run('androidpub_upload_bundle', {
    package_name: 'com.example.app',
    bundle_path: aab,
    edit_id: 'edit-9',
    track: 'production',
    release_status: 'inProgress',
    user_fraction: 0.1,
    release_notes: [{ language: 'en-US', text: 'Faster start.' }],
    commit: true,
  });
  // The track is read twice: once by prepare (the approval shows it) and once by the handler, which merges the release
  // it finds into the body it writes. Both are reads.
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'GET', 'PUT', 'POST']);
  assert.equal(calls[4].url, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits/edit-9:commit');
  assert.deepEqual(calls[3].body.releases, [{ versionCodes: ['43'], status: 'inProgress', userFraction: 0.1, releaseNotes: [{ language: 'en-US', text: 'Faster start.' }] }]);
  assert.equal(committed.committed, true);
  assert.equal(committed.note, undefined);

  // Without a track nothing is written to one, and the edit stays open.
  reset((call) => (call.url.endsWith('/edits') ? { id: 'edit-2' } : { versionCode: 44 }));
  const plain = await run('androidpub_upload_bundle', { package_name: 'com.example.app', bundle_path: aab });
  assert.deepEqual(calls.map((c) => c.method), ['POST', 'POST']);
  assert.equal(plain.track, undefined);
  assert.equal(plain.edit_id, 'edit-2');
});

test('androidpub_upload_bundle: the approval names the file, its hash, the track and its releases; bad input is refused before any request', async () => {
  const { createHash } = await import('node:crypto');
  const aab = join(root, 'preview.aab');
  const bytes = Buffer.from('preview bundle');
  writeFileSync(aab, bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const tool = tools.get('androidpub_upload_bundle');

  // No edit id: nothing is read, and the preview says the track starts empty.
  reset();
  const plan = await tool.prepare({ package_name: 'com.example.app', bundle_path: aab, track: 'beta' }, ctx);
  assert.equal(calls.length, 0, 'prepare reads nothing when a new edit starts empty');
  assert.deepEqual(plan.preview, {
    package: 'com.example.app',
    edit: 'a new edit',
    bundle: aab,
    size_bytes: bytes.length,
    sha256: sha,
    track: 'beta',
    releases_on_the_track_now: 'unknown: a new edit starts empty',
    release: { status: 'draft' },
    effect: 'Uploads the bundle and puts it on the track as this release, in the open edit. Nothing is published until androidpub_edits_commit.',
  });

  // A given edit: the track is read, so the form shows the releases it holds, and commit is named as publishing.
  reset(() => ({ track: 'beta', releases: [{ versionCodes: ['41'], status: 'completed' }] }));
  const withEdit = await tool.prepare({ package_name: 'com.example.app', bundle_path: aab, edit_id: 'edit-1', track: 'beta', commit: true }, ctx);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/edits/edit-1/tracks/beta']);
  assert.deepEqual(withEdit.preview.releases_on_the_track_now, [{ version_codes: ['41'], status: 'completed' }]);
  assert.match(withEdit.preview.effect, /commits the edit: the release is published/);

  reset();
  const wrongType = join(root, 'app.apk');
  writeFileSync(wrongType, 'not a bundle');
  await assert.rejects(tool.prepare({ package_name: 'com.example.app', bundle_path: wrongType }, ctx), /is not an Android App Bundle/);
  await assert.rejects(tool.prepare({ package_name: 'com.example.app', bundle_path: aab, release_status: 'inProgress' }, ctx), /needs user_fraction/);
  await assert.rejects(tool.prepare({ package_name: 'com.example.app', bundle_path: aab, user_fraction: 0.5 }, ctx), /applies to a staged rollout only/);
  await assert.rejects(tool.prepare({ package_name: 'com.example.app', bundle_path: join(root, 'nope.aab') }, ctx), /was not found/);
  assert.equal(calls.length, 0, 'everything is refused before any request');
});

test('a list answer puts the page token first, so a long page never loses it (the shaping of 1.28.0)', async () => {
  const { shapeResult } = await import(DIST('core/result-shape.js'));
  reset(() => ({ devices: [{ name: 'enterprises/LC0123abcd/devices/d1', state: 'ACTIVE' }], nextPageToken: 'p2' }));
  const answer = await run('androidmgmt_list_devices', { enterprise: 'LC0123abcd', page_size: 1 });
  assert.deepEqual(Object.keys(answer), ['devices', 'next_page_token'], 'the tool builds its own object, items first…');
  const shaped = JSON.parse(shapeResult(answer, 25_000));
  assert.deepEqual(Object.keys(shaped), ['next_page_token', 'devices'], '…and the runtime moves the page token first');
  assert.equal(shaped.next_page_token, 'p2');
});

test("the gplay google list: Google's nine Android Management tools and a lean Play publishing set", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gplay.toolsets.google;
  for (const [name, official] of Object.entries(OFFICIAL)) assert.deepEqual(google.matches[name], [official], name);
  const publishing = google.tools.filter((t) => !t.startsWith('androidmgmt_'));
  assert.deepEqual(publishing, [
    'androidpub_reviews_list',
    'androidpub_reviews_reply',
    'androidpub_tracks_releases_list',
    'androidpub_edits_tracks_list',
    'androidpu_purchases_subscriptionsv2_get',
    'androidpub_monetization_subs_list',
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
