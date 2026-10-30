// The Contacts and profile parity tools (1.13.0): contacts_search_directory, contacts_search and profile_me. The HTTP
// layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
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
const contacts = await import(DIST('servers/gcontacts.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-contacts-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await contacts.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);
const parse = (name, args) => z.object(tools.get(name).inputSchema).safeParse(args);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = key in query ? [].concat(query[key], value) : value;
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), host: url.host, path: url.pathname, query };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;

const ANA = {
  resourceName: 'people/1',
  etag: 'e',
  names: [{ displayName: 'Ana M', metadata: { primary: false } }, { displayName: 'Ana Moreau', metadata: { primary: true } }],
  emailAddresses: [{ value: 'ana@old.example' }, { value: 'ana@example.com', metadata: { primary: true } }],
  phoneNumbers: [{ value: '+1 555 0100', canonicalForm: '+15550100' }],
  organizations: [{ name: 'Example', title: 'Engineer', department: 'R&D' }],
};

test('three reads; the scopes of the People methods; profile_me has the userinfo scopes as Discovery spells them', () => {
  for (const t of tools.values()) {
    assert.equal(t.kind, 'read', t.name);
    assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
    assert.match(t.description, /Google's People MCP server/, `${t.name} names the official tool it matches`);
  }
  assert.deepEqual([...tools.keys()], ['contacts_search_directory', 'contacts_search', 'profile_me']);
  assert.deepEqual(tools.get('contacts_search_directory').scopes, [G('directory.readonly')]);
  assert.deepEqual(tools.get('contacts_search').scopes, [G('contacts'), G('contacts.readonly')]);
  // The same strings as the generated oauth2_userinfo_get: openid is a bare name, not https://www.googleapis.com/auth/openid.
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gcontacts', 'tool-map.json'), 'utf8'));
  const generated = map.find((t) => t.name.endsWith('__oauth2_userinfo_get'));
  assert.deepEqual([...tools.get('profile_me').scopes].sort(), [...generated.scopes].sort());
  assert.ok(tools.get('profile_me').scopes.includes('openid'));
});

test("both searches carry Google's caution: confirm the person before a result goes into another tool", () => {
  for (const name of ['contacts_search_directory', 'contacts_search']) {
    const d = tools.get(name).description;
    assert.match(d, /If more than one person matches, show them and ask which one is meant/, name);
    assert.match(d, /never pass a result on without that confirmation/, name);
  }
});

test('readMask: names, email addresses, phone numbers and organizations by default; fields asked for, each once', () => {
  assert.equal(contacts.readMaskOf(undefined), 'names,emailAddresses,phoneNumbers,organizations');
  assert.equal(contacts.readMaskOf([]), 'names,emailAddresses,phoneNumbers,organizations');
  assert.equal(contacts.readMaskOf(['photos', 'names', 'photos']), 'photos,names');
  assert.equal(parse('contacts_search', { query: 'a', fields: ['notAField'] }).success, false);
});

test('search_directory: one request with the default readMask and domain profiles, 10 a page; contact source and paging', async () => {
  reset(() => ({ people: [ANA, { resourceName: 'people/2', names: [{ givenName: 'Bo', familyName: 'Lee' }] }], nextPageToken: 'n' }));
  const res = await run('contacts_search_directory', { query: 'an' });
  assert.deepEqual(calls.map((c) => [c.host, c.path]), [['people.googleapis.com', '/v1/people:searchDirectoryPeople']]);
  assert.deepEqual(calls[0].query, { sources: 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE', query: 'an', readMask: 'names,emailAddresses,phoneNumbers,organizations', pageSize: '10' });
  assert.deepEqual(res.people[0], {
    resource_name: 'people/1',
    name: 'Ana Moreau',
    emails: ['ana@example.com', 'ana@old.example'],
    phones: ['+15550100'],
    organization: { name: 'Example', title: 'Engineer', department: 'R&D' },
  });
  assert.deepEqual(res.people[1], { resource_name: 'people/2', name: 'Bo Lee' });
  assert.match(res.note, /Several people match/);
  assert.equal(res.next_page_token, 'n');

  reset(() => ({ people: [ANA] }));
  const one = await run('contacts_search_directory', { query: 'ana', sources: ['profile', 'contact'], fields: ['names', 'photos'], page_size: 500, page_token: 'p' });
  assert.deepEqual(calls[0].query.sources, ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE', 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT']);
  assert.deepEqual([calls[0].query.readMask, calls[0].query.pageSize, calls[0].query.pageToken], ['names,photos', '500', 'p']);
  assert.equal(one.note, undefined, 'one match: no note, but the caution stays in the description');
  assert.equal(parse('contacts_search_directory', { query: 'a', page_size: 501 }).success, false);
  assert.equal(parse('contacts_search_directory', { query: '' }).success, false);
});

test('search: the empty warm-up request first, then the search, with the same readMask; at most 30 results', async () => {
  reset((call) => (call.query.query === '' ? {} : { results: [{ person: ANA }, {}] }));
  const res = await run('contacts_search', { query: 'ana' });
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [
    ['/v1/people:searchContacts', { query: '', readMask: 'names,emailAddresses,phoneNumbers,organizations' }],
    ['/v1/people:searchContacts', { query: 'ana', readMask: 'names,emailAddresses,phoneNumbers,organizations', pageSize: '10' }],
  ]);
  assert.deepEqual(res.people.map((p) => p.name), ['Ana Moreau']);
  reset(() => ({}));
  await run('contacts_search', { query: 'bo', max_results: 30, fields: ['nicknames'] });
  assert.deepEqual(calls.map((c) => c.query.readMask), ['nicknames', 'nicknames']);
  assert.equal(calls[1].query.pageSize, '30');
  assert.equal(parse('contacts_search', { query: 'bo', max_results: 31 }).success, false);
});

test("profile_me: name, email and picture from userinfo; without the profile scope, the email and a note", async () => {
  reset(() => ({ email: 'me@example.com', name: 'Me Myself', picture: 'https://lh3/p', verified_email: true, id: '1' }));
  assert.deepEqual(await run('profile_me', {}), { name: 'Me Myself', email: 'me@example.com', picture: 'https://lh3/p' });
  assert.deepEqual(calls.map((c) => [c.host, c.path]), [['www.googleapis.com', '/oauth2/v2/userinfo']]);
  reset(() => ({ email: 'me@example.com', id: '1' }));
  const bare = await run('profile_me', {});
  assert.equal(bare.email, 'me@example.com');
  assert.match(bare.note, /lacks the userinfo\.profile scope/);
});
