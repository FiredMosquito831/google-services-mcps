// The curated Workspace admin tools through their handlers, with the HTTP layer stubbed (OAuth2Client.prototype.request
// and JWT.prototype.request), so nothing leaves the machine: a throwaway service account key and subject in a temp
// folder only. 2.4.0: the four destructive tools work their approval out in `prepare`, so the form names the user, the
// group, the member or the org unit instead of its raw id (a preview alone never reaches the gate); and admin_user_get
// declares the group scopes its groups.list call needs, while a sign-in with only the user scopes still returns the user.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JWT, OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const admin = await import(DIST('servers/workspace-admin.js'));

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-admin-tools-'));
after(() => rmSync(tokenDir, { recursive: true, force: true }));
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyFile = join(tokenDir, 'sa-key.json');
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', GSM_SERVICE_ACCOUNT_KEY_FILE: keyFile, GSM_ADMIN_SUBJECT: 'admin@example.com' });
const tools = new Map((await admin.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

let calls = [];
let respond = () => ({});
async function fakeRequest(opts) {
  const url = new URL(opts.url);
  // Decoded, so a user key with @ in it matches the path as written below.
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: decodeURIComponent(url.pathname), query: Object.fromEntries(url.searchParams), body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
}
OAuth2Client.prototype.request = fakeRequest;
if (Object.prototype.hasOwnProperty.call(JWT.prototype, 'request')) JWT.prototype.request = fakeRequest;
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};

const USER = { id: '123', primaryEmail: 'ana@example.com', name: { fullName: 'Ana Silva' }, orgUnitPath: '/Sales', password: 'never-returned' };
const forbidden = (message = 'Not Authorized to access this resource/api') => Object.assign(new Error(message), { code: 403, response: { status: 403, data: { error: { code: 403, message } } } });

test('the four destructive admin tools work their approval out in prepare, reading only', async () => {
  const cases = [
    {
      name: 'admin_user_delete',
      args: { user_key: 'ana@example.com' },
      read: '/admin/directory/v1/users/ana@example.com',
      answer: USER,
      del: '/admin/directory/v1/users/ana@example.com',
      check: (preview) => assert.equal(preview.email, 'ana@example.com'),
    },
    {
      name: 'admin_group_delete',
      args: { group_key: 'team@example.com' },
      read: '/admin/directory/v1/groups/team@example.com',
      answer: { id: 'g1', email: 'team@example.com', name: 'Team', directMembersCount: 3 },
      del: '/admin/directory/v1/groups/team@example.com',
      check: (preview) => assert.equal(preview.directMembersCount, 3),
    },
    {
      name: 'admin_member_remove',
      args: { group_key: 'team@example.com', member_key: 'bo@example.com' },
      read: '/admin/directory/v1/groups/team@example.com/members/bo@example.com',
      answer: { id: 'm1', email: 'bo@example.com', role: 'MEMBER' },
      del: '/admin/directory/v1/groups/team@example.com/members/bo@example.com',
      check: (preview) => assert.equal(preview.member.email, 'bo@example.com'),
    },
    {
      name: 'admin_orgunit_delete',
      args: { org_unit_path: '/Sales' },
      // The prepare lists the unit's children and its users, so the form can say what the delete would face.
      read: '/admin/directory/v1/customer/my_customer/orgunits',
      answer: { organizationUnits: [] },
      del: '/admin/directory/v1/customer/my_customer/orgunits/Sales',
      check: (preview) => {
        assert.equal(preview.orgUnitPath, '/Sales');
        assert.deepEqual(preview.childOrgUnits, []);
        assert.deepEqual(preview.usersInOrgUnit, []);
      },
    },
  ];
  for (const { name, args, read, answer, del, check } of cases) {
    const tool = tools.get(name);
    assert.equal(typeof tool.prepare, 'function', `${name} has a prepare step`);
    assert.equal(tool.preview, undefined, `${name} no longer has a preview the gate never showed`);
    reset((call) => (call.method === 'GET' && call.path === read ? answer : {}));
    const prepared = await tool.prepare(args, ctx);
    assert.ok(calls.every((c) => c.method === 'GET'), `${name}: prepare only reads`);
    assert.ok(calls.some((c) => c.method === 'GET' && c.path === read), `${name}: prepare reads the resource`);
    check(prepared.preview);
    reset(() => ({}));
    await tool.handler(args, ctx, prepared);
    assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === del), `${name}: the handler deletes what was approved`);
  }
});

test('admin_user_get declares the group scopes its groups.list call needs', () => {
  const scopes = tools.get('admin_user_get').scopes;
  for (const scope of ['admin.directory.user', 'admin.directory.user.readonly', 'admin.directory.group', 'admin.directory.group.readonly']) {
    assert.ok(scopes.includes(`https://www.googleapis.com/auth/${scope}`), scope);
  }
});

test('admin_user_get: the user comes back with groups; a sign-in without a group scope keeps the user and says why', async () => {
  reset(() => ({ ...USER }));
  const full = await tools.get('admin_user_get').handler({ user_key: 'ana@example.com' }, ctx);
  assert.equal(full.primaryEmail, 'ana@example.com');
  assert.equal(full.password, undefined, 'the password is stripped');
  assert.deepEqual(full.groups, []);
  assert.equal(full.groupsMore, false);
  assert.equal(full.note, undefined);
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [
    ['GET', '/admin/directory/v1/users/ana@example.com'],
    ['GET', '/admin/directory/v1/groups'],
  ]);
  // A 403 on the second call: the groups are left out with a note, and the user is still returned.
  reset((call) => {
    if (call.path === '/admin/directory/v1/groups') throw forbidden();
    return { ...USER };
  });
  const partial = await tools.get('admin_user_get').handler({ user_key: 'ana@example.com' }, ctx);
  assert.equal(partial.primaryEmail, 'ana@example.com');
  assert.equal(partial.groups, null);
  assert.match(partial.note, /lacks an admin\.directory\.group scope/);
  assert.equal(partial.groupsMore, undefined, 'no page flag when the groups were not read');
  // Any other failure still fails the call: only a missing scope is softened.
  reset((call) => {
    if (call.path === '/admin/directory/v1/groups') throw Object.assign(new Error('Server Error'), { code: 500 });
    return { ...USER };
  });
  await assert.rejects(tools.get('admin_user_get').handler({ user_key: 'ana@example.com' }, ctx), /Server Error/);
});

test('the gadmin google list names the two read tools 2.4.0 added, and they are real tools', () => {
  const products = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8'));
  const google = products.products.gadmin.toolsets.google;
  for (const name of ['admin_group_get', 'admin_orgunit_get']) {
    assert.ok(google.tools.includes(name), `${name} in the google list`);
    assert.deepEqual(google.matches[name], [], `${name}: no official tool to match`);
    assert.ok(google.notes[name], `${name} has a note`);
    assert.ok(tools.has(name), `${name} is a tool of this module`);
    assert.equal(tools.get(name).kind, 'read', `${name} is a read`);
  }
});
