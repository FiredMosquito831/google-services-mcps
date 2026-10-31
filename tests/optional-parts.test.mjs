// Optional parts (1.34.0), the mechanism Gmail's Postmaster Tools uses since 1.2.0: Google Keep in gtasks, the Google Health
// API and Data Portability in gcontacts, and the Indexing API in gsc are left out of every profile unless the login names
// them (--with, auth_login "with"). Named, the login asks for exactly what it asked for before. Scopes an account already
// holds are never taken away (merge). Also the validation of scopePolicy in scripts/gen-servers.mjs. No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { resolveScopes, requirementsFor, heldBackBy } = await import(DIST('core/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { runLogin } = await import(DIST('cli/login.js'));
const { runScopes, groupScopeUniverse } = await import(DIST('cli/scopes.js'));
const { saveAccount, accountTokenFile } = await import(DIST('core/accounts.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
const PROFILES = ['readonly', 'readwrite', 'full'];
const registry = () => loadRegistry(DIST('core/registry.js'));
const quiet = { warn: () => undefined };

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
function tempTokens() {
  const dir = tempDir('gsm-optional-');
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }) };
}
const reqsOf = (name, toolset, cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-optional-cfg-') })) =>
  requirementsFor([name], cfg, { ...quiet, ...(toolset !== 'all' ? { toolset } : {}) });
/** The requirements without their optional part: how they resolved before the part existed. */
const plain = (reqs) => reqs.map(({ optional: _o, ...rest }) => rest);

const PARTS = { gtasks: ['keep'], gcontacts: ['health', 'portability'], gsc: ['indexing'] };
/** The scopes a part's APIs bring, which no login asks for unless the part is named. */
const PART_SCOPE = { gtasks: /\/auth\/keep/, gcontacts: /\/auth\/(googlehealth|dataportability|cloud-platform$)/, gsc: /\/auth\/indexing$/ };

test('the server map lists the parts: keep (gtasks), health and portability (gcontacts), indexing (gsc)', () => {
  const reg = registry();
  for (const [name, parts] of Object.entries(PARTS)) {
    assert.deepEqual(Object.keys(reg.servers.find((s) => s.name === name).scopePolicy.optional).sort(), [...parts].sort(), name);
  }
  assert.deepEqual(reg.servers.find((s) => s.name === 'gtasks').scopePolicy.optional, { keep: ['keep'] });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gcontacts').scopePolicy.optional, { health: ['health'], portability: ['dataportability'] });
  assert.deepEqual(reg.servers.find((s) => s.name === 'gsc').scopePolicy.optional, { indexing: ['indexing'] });
});

test('without --with no profile asks for a scope of the parts; with every part named, the login asks what it asked before', async () => {
  for (const [name, parts] of Object.entries(PARTS)) {
    for (const toolset of ['all', 'google', 'curated']) {
      const reqs = await reqsOf(name, toolset);
      for (const profile of PROFILES) {
        const without = resolveScopes(reqs, profile).scopes;
        assert.deepEqual(without.filter((s) => PART_SCOPE[name].test(s)), [], `${name} ${toolset} ${profile}: ${without.join(' ')}`);
        assert.deepEqual(resolveScopes(reqs, profile, parts), resolveScopes(plain(reqs), profile), `${name} ${toolset} ${profile} with ${parts}`);
      }
    }
  }
});

test('pinned lists: gtasks, gcontacts and gsc with and without their parts', async () => {
  const gtasks = await reqsOf('gtasks', 'all');
  assert.deepEqual(resolveScopes(gtasks, 'readonly').scopes, [G('tasks.readonly')]);
  assert.deepEqual(resolveScopes(gtasks, 'readwrite').scopes, [G('tasks')]);
  assert.deepEqual(resolveScopes(gtasks, 'readonly', ['keep']).scopes, [G('keep.readonly'), G('tasks.readonly')]);
  assert.deepEqual(resolveScopes(gtasks, 'readwrite', ['keep']).scopes, [G('keep'), G('tasks')]);

  const gcontacts = await reqsOf('gcontacts', 'all');
  // userinfo.profile since 1.35.1 (profile_me's name).
  assert.deepEqual(resolveScopes(gcontacts, 'readonly').scopes, [G('contacts.other.readonly'), G('contacts.readonly'), G('directory.readonly'), G('userinfo.profile')]);
  assert.deepEqual(resolveScopes(gcontacts, 'readwrite').scopes, [G('contacts'), G('contacts.other.readonly'), G('directory.readonly'), G('userinfo.profile')]);
  // The Health part brings its own scopes; the subscriber methods list only cloud-platform, so readwrite asks for it there.
  const health = resolveScopes(gcontacts, 'readwrite', ['health']).scopes;
  assert.ok(health.includes(G('cloud-platform')) && health.includes(G('googlehealth.sleep.writeonly')), health.join(' '));
  assert.equal(health.some((s) => s.includes('dataportability')), false);
  assert.ok(resolveScopes(gcontacts, 'readwrite', ['portability']).scopes.includes(G('dataportability.nest.user')));

  const gsc = await reqsOf('gsc', 'all');
  assert.deepEqual(resolveScopes(gsc, 'readwrite').scopes, [G('siteverification'), G('webmasters')]);
  assert.deepEqual(resolveScopes(gsc, 'readwrite', ['indexing']).scopes, [G('indexing'), G('siteverification'), G('webmasters')]);
});

test('the held-back lines name the part and how to add it; no other line changes', async () => {
  const gtasks = await reqsOf('gtasks', 'all');
  const held = heldBackBy(gtasks, 'readwrite', [], resolveScopes(gtasks, 'readwrite').scopes);
  assert.deepEqual(Object.keys(held.optional), ['keep']);
  assert.equal(held.optional.keep.tools.length, 7);
  assert.deepEqual(held.needsProfile, {});
  const lines = [];
  await runScopes({ group: 'workspace-user', servers: ['gtasks'], json: false, profile: 'readwrite' }, registry(), { log: (t) => lines.push(t), warn: () => undefined });
  const text = lines.join('\n');
  assert.match(text, /Held back: the optional part "keep" \(7 tool\(s\)\)\. Add it with --with keep \(in the chat: auth_login with "with": \["keep"\]\)\./);
  assert.match(text, /Optional parts \(left out of every profile unless named with --with\): keep\./);
});

// ---------------------------------------------------------------------------
// Stored scopes are never taken away

/** A fake browser step that grants what was asked for. */
function fakeGoogle(account) {
  const seen = {};
  return {
    seen,
    deps: (cfg) => ({
      cfg,
      loopback: async (_id, _secret, scopes) => {
        seen.scopes = [...scopes].sort();
        return { access_token: 'fake-access', refresh_token: 'fake-refresh', scope: scopes.join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}
const capture = () => {
  const lines = [];
  return { out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
};
const storedScopes = (cfg, email) => JSON.parse(readFileSync(accountTokenFile('workspace-user', email, cfg), 'utf8')).scope.split(' ').sort();

test('an account that holds Keep, Health or Indexing scopes keeps them: a named login merges them; an unnamed one saves nothing', async () => {
  // The scopes of the parts are scopes of the group, so a stored one is never "foreign".
  const { cfg } = tempTokens();
  const universe = await groupScopeUniverse(registry(), 'workspace-user', cfg, [], []);
  for (const scope of [G('keep'), G('keep.readonly'), G('googlehealth.profile.readonly'), G('cloud-platform'), G('dataportability.nest.user')]) assert.ok(universe.has(scope), scope);
  const sc = await groupScopeUniverse(registry(), 'searchconsole', cfg, [], []);
  assert.ok(sc.has(G('indexing')));

  // Named: the stored Keep scope is asked for again and saved.
  const named = tempTokens();
  saveAccount('workspace-user', 'me@example.com', { refresh_token: 'r', scope: `${G('keep.readonly')} ${G('tasks.readonly')} ${EMAIL}` }, named.cfg);
  const google = fakeGoogle('me@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gtasks'], profile: 'readonly', account: 'me@example.com' }, registry, run.out, google.deps(named.cfg)), 0, run.text());
  assert.ok(google.seen.scopes.includes(G('keep.readonly')), google.seen.scopes.join(' '));
  assert.ok(storedScopes(named.cfg, 'me@example.com').includes(G('keep.readonly')));

  // Not named: the login asks only for its own scopes, and saving would drop keep.readonly, so nothing is saved.
  const unnamed = tempTokens();
  saveAccount('workspace-user', 'me@example.com', { refresh_token: 'r', scope: `${G('keep.readonly')} ${G('tasks.readonly')} ${EMAIL}` }, unnamed.cfg);
  const before = storedScopes(unnamed.cfg, 'me@example.com');
  const other = fakeGoogle('me@example.com');
  const refused = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gtasks'], profile: 'readonly' }, registry, refused.out, other.deps(unnamed.cfg)), 1);
  assert.equal(other.seen.scopes.includes(G('keep.readonly')), false);
  assert.match(refused.text(), /Not saved: me@example\.com is already signed in/);
  assert.deepEqual(storedScopes(unnamed.cfg, 'me@example.com'), before, 'the stored token is unchanged');

  // gsc: a named account that holds indexing keeps it.
  const gscDir = tempTokens();
  saveAccount('searchconsole', 'me@example.com', { refresh_token: 'r', scope: `${G('indexing')} ${G('webmasters')} ${EMAIL}` }, gscDir.cfg);
  const gscGoogle = fakeGoogle('me@example.com');
  await runLogin({ group: 'searchconsole', servers: ['gsc'], profile: 'readwrite', account: 'me@example.com' }, registry, capture().out, gscGoogle.deps(gscDir.cfg));
  assert.ok(gscGoogle.seen.scopes.includes(G('indexing')));
});

test('gsm login --with keep asks for the Keep scopes; --with checks the part names of the server', async () => {
  const { cfg } = tempTokens();
  const google = fakeGoogle('me@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gtasks'], profile: 'readwrite', with: ['keep'] }, registry, run.out, google.deps(cfg)), 0, run.text());
  assert.deepEqual(google.seen.scopes, [G('keep'), G('tasks'), EMAIL].sort());
  assert.match(run.text(), /Optional parts included: keep\./);
  await assert.rejects(
    runLogin({ group: 'workspace-user', servers: ['gtasks'], profile: 'readwrite', with: ['health'] }, registry, capture().out, fakeGoogle('x@example.com').deps(cfg)),
    /"health" is not an optional part of gtasks\. Optional parts: keep/,
  );
});

// ---------------------------------------------------------------------------
// The chat sign-in on the built gtasks plugin

async function withServer(serverFile, tokenDir, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1' };
  delete env.GSM_API_KEY;
  delete env.GSM_TOOLSET;
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  });
  let nextId = 1;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 120000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result.content[0].text;
  const tools = async () => (await request('tools/list', {})).result.tools;
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ call, tools });
  } finally {
    child.stdin.end();
    child.kill();
  }
}
const askedIn = (answer) => new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ').sort();

test('auth_login on gtasks offers "with": ["keep"]; without it no Keep scope is asked for, with it keep.readonly is', async () => {
  const { dir } = tempTokens();
  const server = join(REPO, 'plugins', 'gtasks', 'servers', 'gtasks.mjs');
  await withServer(server, dir, async ({ call, tools }) => {
    const login = (await tools()).find((t) => t.name === 'auth_login');
    assert.deepEqual(login.inputSchema.properties.with.items.enum, ['keep']);
    const answer = await call('auth_login', { method: 'oauth', profile: 'readonly' });
    assert.deepEqual(askedIn(answer), [G('tasks.readonly'), EMAIL].sort());
    assert.match(answer, /Held back: the optional part "keep"/);
  });
  await withServer(server, dir, async ({ call }) => {
    assert.deepEqual(askedIn(await call('auth_login', { method: 'oauth', profile: 'readonly', with: ['keep'] })), [G('keep.readonly'), G('tasks.readonly'), EMAIL].sort());
  });
});

// ---------------------------------------------------------------------------
// scripts/gen-servers.mjs checks scopePolicy

/** A copy of what gen-servers.mjs reads, with one product changed, run in a temp folder. */
function genServersWith(id, change) {
  const tree = tempDir('gsm-optional-gen-');
  mkdirSync(join(tree, 'scripts'));
  mkdirSync(join(tree, 'config'));
  mkdirSync(join(tree, 'src', 'servers'), { recursive: true });
  copyFileSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(tree, 'scripts', 'gen-servers.mjs'));
  for (const name of readdirSync(join(REPO, 'src', 'servers'))) writeFileSync(join(tree, 'src', 'servers', name), '');
  mkdirSync(join(tree, 'plugins', id), { recursive: true });
  copyFileSync(join(REPO, 'plugins', id, 'tool-map.json'), join(tree, 'plugins', id, 'tool-map.json'));
  const products = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8'));
  change(products.products[id]);
  writeFileSync(join(tree, 'config', 'products.json'), JSON.stringify(products, null, 2));
  const res = spawnSync(process.execPath, [join(tree, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8', timeout: 120_000 });
  return { ...res, servers: existsSync(join(tree, 'config', 'servers.json')) ? JSON.parse(readFileSync(join(tree, 'config', 'servers.json'), 'utf8')) : undefined };
}

test('gen-servers copies the parts and the preferences, and refuses a part of an unknown API and a bad preference', () => {
  const ok = genServersWith('gmeet', () => undefined);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.servers.servers.find((s) => s.name === 'gtasks').scopePolicy, { optional: { keep: ['keep'] } });
  assert.deepEqual(ok.servers.servers.find((s) => s.name === 'gmeet').scopePolicy.prefer.readwrite, [G('meetings.space.readonly')]);

  const unknownApi = genServersWith('gtasks', (p) => (p.scopePolicy.optional.keep = ['nokeep']));
  assert.notEqual(unknownApi.status, 0);
  assert.match(unknownApi.stderr, /scopePolicy\.optional\["keep"\] must list APIs of the product/);

  const unused = genServersWith('gmeet', (p) => p.scopePolicy.prefer.readwrite.push(G('drive')));
  assert.notEqual(unused.status, 0);
  assert.match(unused.stderr, /scopePolicy\.prefer\.readwrite: no tool of the product accepts https:\/\/www\.googleapis\.com\/auth\/drive/);

  const notViewOnly = genServersWith('gmeet', (p) => (p.scopePolicy.prefer.readonly = [G('meetings.space.created')]));
  assert.notEqual(notViewOnly.status, 0);
  assert.match(notViewOnly.stderr, /scopePolicy\.prefer\.readonly may hold only read-only or view-only scopes/);

  const badProfile = genServersWith('gmeet', (p) => (p.scopePolicy.prefer.admin = [G('meetings.space.readonly')]));
  assert.notEqual(badProfile.status, 0);
  assert.match(badProfile.stderr, /scopePolicy\.prefer: "admin" is not a profile/);

  const twice = genServersWith('gmeet', (p) => p.scopePolicy.prefer.full.push(G('meetings.space.readonly')));
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /scopePolicy\.prefer\.full lists a scope twice/);
});

test('gen-servers copies a part that names a scope a tool accepts (1.35.0), and refuses one no tool accepts', () => {
  const ok = genServersWith('gyoutube', () => undefined);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.servers.servers.find((s) => s.name === 'gyoutube').scopePolicy, { optional: { monetary: [G('yt-analytics-monetary.readonly')] } });
  const unused = genServersWith('gyoutube', (p) => p.scopePolicy.optional.monetary.push(G('drive')));
  assert.notEqual(unused.status, 0);
  assert.match(unused.stderr, /scopePolicy\.optional\["monetary"\]: no tool of the product accepts https:\/\/www\.googleapis\.com\/auth\/drive/);
});
