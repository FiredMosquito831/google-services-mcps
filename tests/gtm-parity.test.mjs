// The curated Tag Manager tool (2.14.0): gtm_publish_version. Publishing is destructive since 1.26.3, but the generated
// tool's approval showed one path, and under confirmation "destructive-only" it ran with no prompt at all (adversarial
// review of gtm, F1). This tool reads the container, the version and the live version in prepare, shows what changes,
// and publishes exactly the version path it approved. The Google client is stubbed, so nothing leaves the machine, and
// the token is a fake value.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const gtm = await import(DIST('servers/gtm.js'));

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-gtm-parity-'));
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'business.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
after(() => rmSync(tokenDir, { recursive: true, force: true }));

const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tool = gtm.buildTools(cfg).find((t) => t.name === 'gtm_publish_version');
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async (opts) => {
  const url = new URL(opts.url);
  const query = { ...Object.fromEntries(url.searchParams), ...(opts.params ?? {}) };
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: `${url.origin}${url.pathname}`, query, body: opts.data };
  calls.push(call);
  const data = respond(call);
  if (data instanceof Error) throw data;
  return { data, status: 200, headers: new Headers(), config: opts };
};
const reset = (responder) => {
  calls = [];
  respond = responder ?? (() => ({}));
};

const CONTAINER = 'accounts/1/containers/2';
const VERSION_PATH = `${CONTAINER}/versions/7`;

/** The three reads of one publish plan: the container, the version and what is live now. */
function googleWith({ container = { name: 'Shop', publicId: 'GTM-ABCDEF' }, version, live, fail = {} } = {}) {
  return (call) => {
    if (call.path.endsWith('/versions:live')) return fail.live ?? live ?? { containerVersionId: '6', tag: [], trigger: [], variable: [] };
    if (call.path.endsWith('/versions/7')) return fail.version ?? version ?? { containerVersionId: '7', fingerprint: 'fp-7', tag: [], trigger: [], variable: [] };
    if (call.path.endsWith('/containers/2')) return fail.container ?? container;
    return {};
  };
}

test('the paths: a container path and a version id or path, refused with a message that says what to send', () => {
  assert.equal(gtm.containerPathOf('accounts/1/containers/2'), CONTAINER);
  assert.equal(gtm.containerPathOf('/accounts/1/containers/2/'), CONTAINER);
  assert.throws(() => gtm.containerPathOf('accounts/1'), /is not a container path/);
  assert.throws(() => gtm.containerPathOf('1'), /is not a container path/);
  assert.equal(gtm.versionPathOf(CONTAINER, '7'), VERSION_PATH);
  assert.equal(gtm.versionPathOf(CONTAINER, VERSION_PATH), VERSION_PATH);
  assert.throws(() => gtm.versionPathOf(CONTAINER, 'live'), /is not a version id or a version path/);
  assert.throws(() => gtm.versionPathOf(CONTAINER, 'accounts/1/containers/9/versions/7'), /is not a version of accounts\/1\/containers\/2/);
});

test('diffVersions: what is added, removed and changed against the live version, ignoring fields that carry no change', () => {
  const version = {
    tag: [
      { tagId: '1', name: 'Changed', type: 'gaawe', path: 'accounts/1/containers/2/versions/7/tags/1' },
      { tagId: '2', name: 'New', type: 'html' },
    ],
    trigger: [{ triggerId: '5', name: 'Same', type: 'pageview', fingerprint: 'x' }],
    variable: [],
  };
  const live = {
    tag: [
      { tagId: '1', name: 'Changed', type: 'gaawe', parameter: [{ type: 'template', value: 'old' }], path: 'accounts/1/containers/2/versions/6/tags/1' },
      { tagId: '3', name: 'Gone', type: 'gaawe' },
    ],
    trigger: [{ triggerId: '5', name: 'Same', type: 'pageview', fingerprint: 'y' }],
    variable: [{ variableId: '9', name: 'Removed var', type: 'c' }],
  };
  const diff = gtm.diffVersions(version, live);
  assert.deepEqual(diff.added, { tag: ['New'], trigger: [], variable: [] });
  assert.deepEqual(diff.removed, { tag: ['Gone'], trigger: [], variable: ['Removed var'] });
  // Tag 1 differs (the live one carries a parameter the new one does not); the trigger's fingerprint is not a change.
  assert.deepEqual(diff.changed, { tag: ['Changed'], trigger: [], variable: [] });
  assert.deepEqual(diff.counts, { tag: 2, trigger: 1, variable: 0 });
});

test('customCode: the Custom HTML tags and Custom JavaScript variables a publish would put on the page', () => {
  const code = gtm.customCode({
    tag: [{ tagId: '1', name: 'Pixel', type: 'html' }, { tagId: '2', name: 'GA4', type: 'gaawe' }],
    variable: [{ variableId: '3', name: 'Js', type: 'jsm' }, { variableId: '4', name: 'URL', type: 'u' }],
  });
  assert.deepEqual(code, [
    { kind: 'custom HTML tag', name: 'Pixel' },
    { kind: 'custom JavaScript variable', name: 'Js' },
  ]);
  assert.deepEqual(gtm.customCode(undefined), []);
});

test('prepare: the approval names the container, the version, what changes and the exact publish request', async () => {
  reset(
    googleWith({
      version: {
        containerVersionId: '7',
        name: 'Release 7',
        description: 'New consent banner',
        fingerprint: 'fp-7',
        tag: [{ tagId: '2', name: 'Consent', type: 'html' }],
        trigger: [],
        variable: [],
      },
      live: { containerVersionId: '6', name: 'Release 6', tag: [{ tagId: '1', name: 'Old pixel', type: 'html' }], trigger: [], variable: [] },
    }),
  );
  const { preview } = await tool.prepare({ container: CONTAINER, version: '7' }, ctx);
  assert.equal(preview.container_path, CONTAINER);
  assert.equal(preview.version_path, VERSION_PATH);
  assert.deepEqual(preview.container, { name: 'Shop', public_id: 'GTM-ABCDEF' });
  assert.deepEqual(preview.version, { container_version_id: '7', name: 'Release 7', description: 'New consent banner' });
  assert.deepEqual(preview.live, { container_version_id: '6', name: 'Release 6' });
  assert.deepEqual(preview.changes.added.tag, ['Consent']);
  assert.deepEqual(preview.changes.removed.tag, ['Old pixel']);
  assert.deepEqual(preview.custom_code, [{ kind: 'custom HTML tag', name: 'Consent' }]);
  // The fingerprint comes from the version that was read, so a version that changed after the approval is refused.
  assert.deepEqual(preview.publish_request, { method: 'POST', path: `${VERSION_PATH}:publish`, fingerprint: 'fp-7' });
  assert.equal(preview.unread, undefined);
  // Prepare reads only: three GETs, and nothing else.
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'GET', 'GET']);
});

test('handler: it publishes exactly the path it approved, with the approved fingerprint', async () => {
  reset(googleWith({ version: { containerVersionId: '7', name: 'Release 7', fingerprint: 'fp-7', tag: [], trigger: [], variable: [] } }));
  const prepared = await tool.prepare({ container: CONTAINER, version: '7' }, ctx);
  calls = [];
  reset((call) => (call.method === 'POST' ? { containerVersionId: '7', name: 'Release 7', path: VERSION_PATH } : { containerVersionId: '7', fingerprint: 'fp-7', tag: [], trigger: [], variable: [] }));
  const answer = await tool.handler({ container: CONTAINER, version: '7' }, ctx, prepared);
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'the publish was sent');
  assert.equal(post.path, `https://tagmanager.googleapis.com/tagmanager/v2/${VERSION_PATH}:publish`);
  assert.equal(post.query.fingerprint, 'fp-7');
  assert.equal(answer.published, true);
  assert.deepEqual(answer.version, { container_version_id: '7', name: 'Release 7', path: VERSION_PATH });
  assert.match(answer.note, /now the one every page or app loading the container runs/);
});

test('a caller fingerprint wins, and a login that cannot read still knows exactly what it publishes', async () => {
  reset(googleWith({ fail: { container: Object.assign(new Error('HTTP 403: The caller does not have permission'), { code: 403 }), version: Object.assign(new Error('HTTP 403'), { code: 403 }), live: Object.assign(new Error('HTTP 403'), { code: 403 }) } }));
  const prepared = await tool.prepare({ container: CONTAINER, version: '7', fingerprint: 'mine' }, ctx);
  // Every read failed, so the approval says so instead of failing the call, and the publish request is still exact.
  assert.equal(prepared.preview.unread.length, 3);
  assert.deepEqual(prepared.preview.publish_request, { method: 'POST', path: `${VERSION_PATH}:publish`, fingerprint: 'mine' });
  assert.equal('changes' in prepared.preview, false);
  assert.equal('custom_code' in prepared.preview, false);
  assert.match(prepared.preview.unread[0], /HTTP 403/);
});

test('bad arguments are refused before any request', async () => {
  reset(googleWith());
  await assert.rejects(() => tool.handler({ container: 'nope', version: '7' }, ctx), /is not a container path/);
  await assert.rejects(() => tool.handler({ container: CONTAINER, version: 'x' }, ctx), /is not a version id or a version path/);
  assert.equal(calls.length, 0);
});

test('the tool is destructive and needs the publish scope only', () => {
  assert.equal(tool.kind, 'destructive');
  assert.deepEqual(tool.scopes, ['https://www.googleapis.com/auth/tagmanager.publish']);
  assert.match(tool.description, /asks twice/);
});
