// The Firebase parity tools (1.20.0): firestore_get_document, firestore_list_documents, firestore_query_collection,
// remoteconfig_get_template and auth_get_users. They match tools of Google's Firebase MCP server. All five are reads.
// The HTTP layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp
// folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const fb = await import(DIST('servers/gfirebase.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-firebase-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'developer.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await fb.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;
const DOCS = 'https://firestore.googleapis.com/v1/projects/my-app-1234/databases/(default)/documents';

const DOC = {
  name: 'projects/my-app-1234/databases/(default)/documents/users/alice',
  fields: {
    name: { stringValue: 'Alice' },
    age: { integerValue: '42' },
    big: { integerValue: '9007199254740993' },
    score: { doubleValue: 1.5 },
    active: { booleanValue: true },
    nothing: { nullValue: 'NULL_VALUE' },
    joined: { timestampValue: '2026-10-30T08:00:00Z' },
    home: { geoPointValue: { latitude: 48.85, longitude: 2.35 } },
    manager: { referenceValue: 'projects/my-app-1234/databases/(default)/documents/users/bob' },
    tags: { arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '1' }] } },
    address: { mapValue: { fields: { city: { stringValue: 'Paris' } } } },
    empty: { arrayValue: {} },
  },
  createTime: '2026-10-01T00:00:00Z',
  updateTime: '2026-10-02T00:00:00Z',
};
const PLAIN = {
  name: 'Alice',
  age: 42,
  big: '9007199254740993',
  score: 1.5,
  active: true,
  nothing: null,
  joined: '2026-10-30T08:00:00Z',
  home: { latitude: 48.85, longitude: 2.35 },
  manager: 'projects/my-app-1234/databases/(default)/documents/users/bob',
  tags: ['a', 1],
  address: { city: 'Paris' },
  empty: [],
};

test('five tools, all reads; scopes as Discovery lists them; each names the Google tool it matches', () => {
  assert.deepEqual(
    [...tools.values()].map((t) => [t.name, t.kind]),
    [
      ['firestore_get_document', 'read'],
      ['firestore_list_documents', 'read'],
      ['firestore_query_collection', 'read'],
      ['remoteconfig_get_template', 'read'],
      ['auth_get_users', 'read'],
    ],
  );
  for (const name of ['firestore_get_document', 'firestore_list_documents', 'firestore_query_collection']) assert.deepEqual(tools.get(name).scopes, [G('cloud-platform'), G('datastore')], name);
  assert.deepEqual(tools.get('remoteconfig_get_template').scopes, [G('cloud-platform')]);
  // accounts.lookup lists only cloud-platform, so that is the one scope both of auth_get_users' methods accept.
  assert.deepEqual(tools.get('auth_get_users').scopes, [G('cloud-platform')]);
  for (const t of tools.values()) {
    assert.ok(t.description.includes(`matches ${t.name} in Google's Firebase MCP server`), t.name);
    assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
    assert.ok(t.name.length <= 49 - 'gfirebase'.length * 2, `${t.name} fits the name budget`);
  }
  assert.match(tools.get('auth_get_users').description, /Not the sign-in of this server: that is auth_login/);
});

test('paths: a document has an even number of parts, a collection an odd one; ids are checked before any request', () => {
  assert.equal(fb.documentPath('my-app-1234', undefined, 'users/alice'), 'projects/my-app-1234/databases/(default)/documents/users/alice');
  assert.equal(fb.documentPath('my-app-1234', 'other', '/users/a b/'), 'projects/my-app-1234/databases/other/documents/users/a%20b');
  assert.deepEqual(fb.collectionOf('my-app-1234', '', 'users'), { parent: 'projects/my-app-1234/databases/(default)/documents', collectionId: 'users' });
  assert.deepEqual(fb.collectionOf('my-app-1234', undefined, 'users/alice/orders'), { parent: 'projects/my-app-1234/databases/(default)/documents/users/alice', collectionId: 'orders' });
  assert.throws(() => fb.documentPath('my-app-1234', undefined, 'users'), /names a collection, not a document/);
  assert.throws(() => fb.collectionOf('my-app-1234', undefined, 'users/alice'), /names a document, not a collection/);
  for (const bad of ['', '/', 'users//alice', 'users/../x']) assert.throws(() => fb.documentPath('my-app-1234', undefined, bad), /is not a path/, bad);
  assert.equal(fb.projectIdOf(' example.com:my-app '), 'example.com:my-app');
  for (const bad of ['', 'my/app', 'My App', 'a?b']) assert.throws(() => fb.projectIdOf(bad), /is not a Google Cloud project id/, bad);
});

test('Firestore values: plain JSON in both directions; large integers stay exact as strings; typed values pass through', () => {
  assert.deepEqual(fb.documentSummary(DOC).fields, PLAIN);
  assert.deepEqual(fb.documentSummary(DOC, true).fields, DOC.fields, 'raw values as Google sent them');
  assert.deepEqual(fb.toFirestoreValue('x'), { stringValue: 'x' });
  assert.deepEqual(fb.toFirestoreValue(7), { integerValue: '7' });
  assert.deepEqual(fb.toFirestoreValue(1.25), { doubleValue: 1.25 });
  assert.deepEqual(fb.toFirestoreValue(false), { booleanValue: false });
  assert.deepEqual(fb.toFirestoreValue(null), { nullValue: 'NULL_VALUE' });
  assert.deepEqual(fb.toFirestoreValue(['a', 2]), { arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '2' }] } });
  assert.deepEqual(fb.toFirestoreValue({ city: 'Paris' }), { mapValue: { fields: { city: { stringValue: 'Paris' } } } });
  assert.deepEqual(fb.toFirestoreValue({ timestampValue: '2026-10-30T00:00:00Z' }), { timestampValue: '2026-10-30T00:00:00Z' });
  // Two keys, or a key that is no Firestore value kind: a map.
  assert.deepEqual(fb.toFirestoreValue({ stringValue: 'a', other: 1 }), { mapValue: { fields: { stringValue: { stringValue: 'a' }, other: { integerValue: '1' } } } });
});

test('firestore_get_document: GET of the document with a repeated field mask; fields as plain JSON', async () => {
  reset(() => DOC);
  const out = await run('firestore_get_document', { project_id: 'my-app-1234', document_path: 'users/alice', field_paths: ['name', 'address.city'] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${DOCS}/users/alice`);
  assert.deepEqual(calls[0].query, { 'mask.fieldPaths': ['name', 'address.city'] });
  assert.deepEqual(out, { path: 'users/alice', id: 'alice', fields: PLAIN, create_time: '2026-10-01T00:00:00Z', update_time: '2026-10-02T00:00:00Z' });
  reset(() => DOC);
  const raw = await run('firestore_get_document', { project_id: 'my-app-1234', database: 'db2', document_path: 'users/alice', raw_values: true });
  assert.equal(calls[0].url, 'https://firestore.googleapis.com/v1/projects/my-app-1234/databases/db2/documents/users/alice');
  assert.deepEqual(calls[0].query, {});
  assert.deepEqual(raw.fields, DOC.fields);
});

test('firestore_list_documents: the collection id in the path, the page arguments in the query, next_page_token', async () => {
  reset(() => ({ documents: [DOC], nextPageToken: 'n2' }));
  const out = await run('firestore_list_documents', { project_id: 'my-app-1234', collection_path: 'users/alice/orders', page_size: 2, page_token: 'n1', order_by: 'total desc', show_missing: true });
  assert.equal(calls[0].url, `${DOCS}/users/alice/orders`);
  assert.deepEqual(calls[0].query, { pageSize: '2', pageToken: 'n1', orderBy: 'total desc', showMissing: 'true' });
  assert.equal(out.next_page_token, 'n2');
  assert.deepEqual(out.documents[0].fields, PLAIN);
  reset(() => ({}));
  assert.deepEqual(await run('firestore_list_documents', { project_id: 'my-app-1234', collection_path: 'users' }), { documents: [], next_page_token: undefined });
  await assert.rejects(run('firestore_list_documents', { project_id: 'my-app-1234', collection_path: 'users/alice' }), /names a document/);
  assert.equal(calls.length, 1, 'a document path is refused before any request');
});

test('firestore_query_collection: runQuery with the filters joined with AND, the order and the limit; documents as plain JSON', async () => {
  reset(() => [{ readTime: '2026-10-30T00:00:00Z' }, { document: DOC, readTime: '2026-10-30T00:00:00Z' }, { done: true }]);
  const out = await run('firestore_query_collection', {
    project_id: 'my-app-1234',
    collection_path: 'users/alice/orders',
    filters: [
      { field: 'status', op: 'EQUAL', value: 'paid' },
      { field: 'total', op: 'GREATER_THAN', value: 10.5 },
      { field: 'tags', op: 'IN', value: ['a', 'b'] },
      { field: 'deletedAt', op: 'IS_NULL' },
    ],
    order_by: [{ field: 'total', direction: 'DESCENDING' }, { field: 'status' }],
    limit: 3,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${DOCS}/users/alice:runQuery`);
  assert.deepEqual(calls[0].body, {
    structuredQuery: {
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'paid' } } },
            { fieldFilter: { field: { fieldPath: 'total' }, op: 'GREATER_THAN', value: { doubleValue: 10.5 } } },
            { fieldFilter: { field: { fieldPath: 'tags' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } } } },
            { unaryFilter: { field: { fieldPath: 'deletedAt' }, op: 'IS_NULL' } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'total' }, direction: 'DESCENDING' }, { field: { fieldPath: 'status' } }],
      limit: 3,
    },
  });
  assert.deepEqual(out, { documents: [{ path: 'users/alice', id: 'alice', fields: PLAIN, create_time: '2026-10-01T00:00:00Z', update_time: '2026-10-02T00:00:00Z' }], count: 1 });

  // One filter is sent as itself, not inside a composite filter; no filter means no where; a collection group query.
  reset(() => []);
  await run('firestore_query_collection', { project_id: 'my-app-1234', collection_path: 'users', filters: [{ field: 'age', op: 'LESS_THAN', value: 30 }] });
  assert.deepEqual(calls[0].body.structuredQuery, { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'age' }, op: 'LESS_THAN', value: { integerValue: '30' } } } });
  reset(() => []);
  assert.deepEqual(await run('firestore_query_collection', { project_id: 'my-app-1234', collection_path: 'orders', all_descendants: true }), { documents: [], count: 0 });
  assert.deepEqual(calls[0].body.structuredQuery, { from: [{ collectionId: 'orders', allDescendants: true }] });
});

test('firestore_query_collection: a filter that does not fit its operator is refused, and nothing is sent', async () => {
  reset(() => []);
  const bad = [
    [{ field: 'a', op: 'EQUAL' }, /EQUAL needs a value/],
    [{ field: 'a', op: 'IS_NULL', value: 1 }, /IS_NULL takes no value/],
    [{ field: 'a', op: 'IN', value: 'x' }, /IN needs a list of values/],
    [{ field: 'a', op: 'NOT_IN', value: 1 }, /NOT_IN needs a list of values/],
  ];
  for (const [filter, message] of bad) await assert.rejects(run('firestore_query_collection', { project_id: 'my-app-1234', collection_path: 'users', filters: [filter] }), message);
  assert.equal(z.object(tools.get('firestore_query_collection').inputSchema).safeParse({ project_id: 'p', collection_path: 'c', filters: [{ field: 'a', op: 'LIKE', value: 1 }] }).success, false);
  assert.equal(calls.length, 0);
});

test('remoteconfig_get_template: GET of the project template, a version on request', async () => {
  reset(() => ({ parameters: { welcome: { defaultValue: { value: 'hi' } } }, version: { versionNumber: '7' } }));
  const out = await run('remoteconfig_get_template', { project_id: 'my-app-1234', version_number: 7 });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://firebaseremoteconfig.googleapis.com/v1/projects/my-app-1234/remoteConfig');
  assert.deepEqual(calls[0].query, { versionNumber: '7' });
  assert.deepEqual(out.version, { versionNumber: '7' });
  reset(() => ({}));
  await run('remoteconfig_get_template', { project_id: 'my-app-1234' });
  assert.deepEqual(calls[0].query, {});
});

test('auth_get_users: lookup by uid, email and phone; a page of users otherwise; password hashes and salts never come back', async () => {
  const user = { localId: 'u1', email: 'a@example.com', passwordHash: 'SECRET-HASH', salt: 'SECRET-SALT', providerUserInfo: [{ providerId: 'password' }], disabled: false };
  reset(() => ({ users: [user] }));
  const looked = await run('auth_get_users', { project_id: 'my-app-1234', uids: ['u1'], emails: ['a@example.com'], phone_numbers: ['+15555550100'] });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://identitytoolkit.googleapis.com/v1/projects/my-app-1234/accounts:lookup');
  assert.deepEqual(calls[0].body, { localId: ['u1'], email: ['a@example.com'], phoneNumber: ['+15555550100'] });
  assert.deepEqual(looked, { users: [{ localId: 'u1', email: 'a@example.com', providerUserInfo: [{ providerId: 'password' }], disabled: false }], count: 1 });
  assert.equal(JSON.stringify(looked).includes('SECRET'), false);

  reset(() => ({ userInfo: [user], recordsCount: '1' }));
  const page = await run('auth_get_users', { project_id: 'my-app-1234', limit: 20 });
  assert.equal(calls[0].url, 'https://identitytoolkit.googleapis.com/v1/projects/my-app-1234/accounts:query');
  assert.deepEqual(calls[0].body, { returnUserInfo: true, limit: '20' });
  assert.equal(JSON.stringify(page).includes('SECRET'), false);
  assert.equal(page.count, 1);
  reset(() => ({}));
  await run('auth_get_users', { project_id: 'my-app-1234', uids: [] });
  assert.deepEqual(calls[0].body, { returnUserInfo: true }, 'an empty list is no lookup');
  assert.equal(z.object(tools.get('auth_get_users').inputSchema).safeParse({ project_id: 'p', limit: 501 }).success, false, "Google's limit is 500");
});

/** The official tools of Google's Firebase MCP server that call an API, and what covers each here. */
const FIREBASE_OFFICIAL = [
  'firebase_get_project',
  'firebase_list_apps',
  'firebase_list_projects',
  'firebase_get_sdk_config',
  'firebase_create_project',
  'firebase_create_app',
  'firebase_create_android_sha',
  'firebase_get_security_rules',
  'firebase_validate_security_rules',
  'apphosting_list_backends',
  'apphosting_fetch_logs',
  'crashlytics_create_note',
  'crashlytics_delete_note',
  'crashlytics_get_issue',
  'crashlytics_list_events',
  'crashlytics_batch_get_events',
  'crashlytics_list_notes',
  'crashlytics_get_report',
  'crashlytics_update_issue',
  'dataconnect_list_services',
  'dataconnect_list_locations',
  'dataconnect_execute_graphql',
  'dataconnect_execute_graphql_read',
  'dataconnect_generate_query',
  'dataconnect_generate_schema',
  'messaging_send_message',
  'firestore_get_document',
  'firestore_list_documents',
  'firestore_query_collection',
  'remoteconfig_get_template',
  'auth_get_users',
];

test("the gfirebase google list covers Google's Firebase tools that call an API, and no local CLI tool", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gfirebase.toolsets.google;
  const official = new Set(Object.values(google.matches).flat());
  for (const name of FIREBASE_OFFICIAL) assert.ok(official.has(name), `no tool of ours matches ${name}`);
  assert.equal(official.size, FIREBASE_OFFICIAL.length);
  for (const local of ['firebase_init', 'firebase_deploy', 'firebase_deploy_status', 'firebase_update_environment', 'dataconnect_build', 'dataconnect_execute_in_emulator']) {
    assert.equal(official.has(local), false, local);
  }
  assert.equal(google.tools.includes('api_call'), false, 'no gateway method counts toward its scopes');
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gfirebase', 'tool-map.json'), 'utf8'));
  const kind = (name) => map.find((t) => t.name === `mcp__plugin_gfirebase_gfirebase__${name}`)?.kind;
  const writes = [
    'firebase_projects_add_firebase',
    'firebase_project_web_app_create',
    'firebase_project_android_create',
    'firebase_project_ios_app_create',
    'firebase_proje_andro_sha_create',
    'firebaseru_projects_test',
    'firebasecr_proj_apps_issu_patch',
    'firebasecr_pro_app_iss_not_crea',
    'firebaseda_pro_loc_ser_exe_1fce',
    'firebaseda_pro_loc_ser_exe_3072',
    'firebaseda_pro_loc_ser_gen_8f53',
    'firebaseda_pro_loc_ser_gen_cf40',
  ];
  const destructive = ['firebasecr_pro_app_iss_not_dele', 'fcm_projects_messages_send'];
  for (const name of google.tools) assert.equal(kind(name), writes.includes(name) ? 'write' : destructive.includes(name) ? 'destructive' : 'read', name);
  // The POST reads Google marks read-only keep today's kind; changing it is item D2, and each says so.
  for (const name of ['firebaseru_projects_test', 'firebaseda_pro_loc_ser_exe_3072', 'firebaseda_pro_loc_ser_gen_8f53', 'firebaseda_pro_loc_ser_gen_cf40']) assert.match(google.notes[name], /D2/, name);
});
