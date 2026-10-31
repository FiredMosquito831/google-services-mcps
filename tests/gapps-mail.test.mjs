// gapps and the full Gmail scope (1.36.0). scripts.run lists twelve scopes, the full Gmail scope among them, and the
// full profile picked it because it is the shortest, so every `--profile full` gapps login asked for read, send and
// delete access to the whole mailbox only to run scripts. Now https://mail.google.com/ is an optional part of gapps
// ("mail": asked for only with --with mail, auth_login "with": ["mail"]), and full prefers userinfo.email for
// scripts.run, as readwrite already picks it (scopePolicy.prefer). readonly and readwrite resolve as before. Scopes an
// account already holds are never taken away. No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
const MAIL = 'https://mail.google.com/';
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
  const dir = tempDir('gsm-gapps-mail-');
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }) };
}
const reqsOf = async (toolset) => requirementsFor(['gapps'], loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-gapps-cfg-') }), { ...quiet, ...(toolset !== 'all' ? { toolset } : {}) });
/** The requirements without the policy fields: how gapps resolved before it had a policy. */
const before = (reqs) => reqs.map(({ optional: _o, onlyIn: _i, policyPrefer: _p, optionalScopes: _s, ...rest }) => rest);

test('the server map: gapps has the optional part mail (the full Gmail scope) and prefers userinfo.email for full', () => {
  const gapps = registry().servers.find((s) => s.name === 'gapps');
  assert.deepEqual(gapps.scopePolicy, { optional: { mail: [MAIL] }, prefer: { full: [EMAIL] } });
  // The plugin's own map (what its server and its CLI read) carries the same policy.
  const plugin = JSON.parse(readFileSync(join(REPO, 'plugins', 'gapps', 'servers.json'), 'utf8')).servers[0];
  assert.deepEqual(plugin.scopePolicy, gapps.scopePolicy);
});

test('readonly and readwrite resolve exactly as before; full no longer asks for https://mail.google.com/ unless mail is named', async () => {
  for (const toolset of ['all', 'google', 'curated']) {
    const reqs = await reqsOf(toolset);
    for (const profile of ['readonly', 'readwrite']) {
      assert.deepEqual(resolveScopes(reqs, profile), resolveScopes(before(reqs), profile), `${toolset} ${profile}`);
    }
    const was = resolveScopes(before(reqs), 'full');
    assert.ok(was.scopes.includes(MAIL), `${toolset}: full asked for the full Gmail scope before`);
    const now = resolveScopes(reqs, 'full');
    assert.equal(now.scopes.includes(MAIL), false, `${toolset}: ${now.scopes.join(' ')}`);
    // The same tools are covered: scripts.run through userinfo.email, as in readwrite.
    assert.deepEqual(now.covered, was.covered, `${toolset}: coverage`);
    assert.deepEqual(now.scopes, [...was.scopes.filter((s) => s !== MAIL), EMAIL].sort(), `${toolset}: mail replaced by userinfo.email`);
    assert.deepEqual(now.scopes, resolveScopes(reqs, 'readwrite').scopes, `${toolset}: full is readwrite for gapps`);
    // Named, full asks for it again, beside userinfo.email; readwrite asks for it too.
    const named = resolveScopes(reqs, 'full', ['mail']);
    assert.ok(named.scopes.includes(MAIL) && named.scopes.includes(EMAIL), `${toolset}: ${named.scopes.join(' ')}`);
    assert.ok(resolveScopes(reqs, 'readwrite', ['mail']).scopes.includes(MAIL));
  }
});

test('pinned: gapps full with every toolset; the held-back line names the part', async () => {
  const all = await reqsOf('all');
  assert.deepEqual(resolveScopes(all, 'full').scopes, [G('appsmarketplace.license'), G('script.deployments'), G('script.metrics'), G('script.processes'), G('script.projects'), EMAIL]);
  const held = heldBackBy(all, 'full', [], resolveScopes(all, 'full').scopes);
  assert.deepEqual(Object.keys(held.optionalScopes ?? {}), ['mail']);
  assert.deepEqual(held.optionalScopes.mail.scopes, [MAIL]);
  const lines = [];
  await runScopes({ group: 'workspace-user', servers: ['gapps'], json: false, profile: 'full' }, registry(), { log: (t) => lines.push(t), warn: () => undefined });
  assert.match(lines.join('\n'), /Held back:[^\n]*mail[^\n]*--with mail/);
});

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

test('an account that holds https://mail.google.com/ keeps it: a named login merges it; an unnamed one saves nothing', async () => {
  const { cfg } = tempTokens();
  const universe = await groupScopeUniverse(registry(), 'workspace-user', cfg, [], []);
  assert.ok(universe.has(MAIL), 'the full Gmail scope is a scope of the group');

  const named = tempTokens();
  saveAccount('workspace-user', 'me@example.com', { refresh_token: 'r', scope: `${MAIL} ${G('script.projects')} ${EMAIL}` }, named.cfg);
  const google = fakeGoogle('me@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gapps'], profile: 'full', account: 'me@example.com' }, registry, run.out, google.deps(named.cfg)), 0, run.text());
  assert.ok(google.seen.scopes.includes(MAIL), google.seen.scopes.join(' '));
  assert.ok(storedScopes(named.cfg, 'me@example.com').includes(MAIL));

  const unnamed = tempTokens();
  saveAccount('workspace-user', 'me@example.com', { refresh_token: 'r', scope: `${MAIL} ${G('script.projects')} ${EMAIL}` }, unnamed.cfg);
  const was = storedScopes(unnamed.cfg, 'me@example.com');
  const other = fakeGoogle('me@example.com');
  const refused = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gapps'], profile: 'full' }, registry, refused.out, other.deps(unnamed.cfg)), 1);
  assert.equal(other.seen.scopes.includes(MAIL), false);
  assert.match(refused.text(), /Not saved: me@example\.com is already signed in/);
  assert.deepEqual(storedScopes(unnamed.cfg, 'me@example.com'), was, 'the stored token is unchanged');

  // --with mail asks for it in a new login.
  const fresh = tempTokens();
  const withMail = fakeGoogle('new@example.com');
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gapps'], profile: 'full', with: ['mail'] }, registry, capture().out, withMail.deps(fresh.cfg)), 0);
  assert.ok(withMail.seen.scopes.includes(MAIL));
});

test('auth_login on the built gapps server offers "with": ["mail"]; full asks for the full Gmail scope only when named', async () => {
  const { dir } = tempTokens();
  const server = join(REPO, 'plugins', 'gapps', 'servers', 'gapps.mjs');
  const env = { ...process.env, GSM_TOKEN_DIR: dir, GSM_NO_BROWSER: '1' };
  delete env.GSM_API_KEY;
  delete env.GSM_TOOLSET;
  const { spawn } = await import('node:child_process');
  const { createInterface } = await import('node:readline');
  const run = async (fn) => {
    const child = spawn(process.execPath, [server], { env, stdio: ['pipe', 'pipe', 'pipe'] });
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
    try {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return await fn({
        tools: async () => (await request('tools/list', {})).result.tools,
        call: async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result.content[0].text,
      });
    } finally {
      child.stdin.end();
      child.kill();
    }
  };
  const askedIn = (answer) => new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ').sort();
  await run(async ({ tools, call }) => {
    const login = (await tools()).find((t) => t.name === 'auth_login');
    assert.deepEqual(login.inputSchema.properties.with.items.enum, ['mail']);
    const answer = await call('auth_login', { method: 'oauth', profile: 'full' });
    assert.equal(askedIn(answer).includes(MAIL), false, answer);
    assert.match(answer, /Held back: the optional part "mail"/);
  });
  await run(async ({ call }) => {
    assert.ok(askedIn(await call('auth_login', { method: 'oauth', profile: 'full', with: ['mail'] })).includes(MAIL));
  });
});
