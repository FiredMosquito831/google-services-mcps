// An optional part that names a scope (1.35.0): YouTube's yt-analytics-monetary.readonly (revenue metrics) is asked for only
// with --with monetary (auth_login "with"). Unnamed, no profile asks for it and nothing else changes; named, it is asked for
// first, for the tools that accept it. Scopes an account already holds are kept (merge). No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { resolveScopes, requirementsFor, heldBackBy, policyFields, nothingHeldBack } = await import(DIST('core/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { runLogin } = await import(DIST('cli/login.js'));
const { heldBackLines } = await import(DIST('cli/scopes.js'));
const { saveAccount } = await import(DIST('core/accounts.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
const MONETARY = G('yt-analytics-monetary.readonly');
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
  const dir = tempDir('gsm-scope-part-');
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }) };
}
const plain = (reqs) => reqs.map(({ optionalScopes: _s, ...rest }) => rest);

test('policyFields: a part entry that is a scope URL becomes optionalScopes; an API entry stays a part of its API', () => {
  const policy = { optional: { money: [G('money.readonly')], extra: ['extraapi'] } };
  assert.deepEqual(policyFields(policy, 'someapi'), { optionalScopes: { money: [G('money.readonly')] } });
  assert.deepEqual(policyFields(policy, 'extraapi'), { optional: 'extra', optionalScopes: { money: [G('money.readonly')] } });
  assert.deepEqual(policyFields({ optional: { postmaster: ['gmailpostmastertools'] } }, 'gmail'), {});
  // One object per policy, so the requirements of a product share it.
  assert.equal(policyFields(policy, 'a').optionalScopes, policyFields(policy, 'b').optionalScopes);
});

test('resolveScopes: an unnamed part scope is never picked, even when the greedy rule would pick it; named, it is asked for first', () => {
  const optionalScopes = { money: [G('a.money.readonly')] };
  // The part scope is shorter and covers as much, so the greedy rule alone would pick it.
  const reqs = [
    { tool: 'p/report', kind: 'read', scopes: [G('a.money.readonly'), G('a.analytics.readonly')], optionalScopes },
    { tool: 'p/other', kind: 'read', scopes: [G('a.analytics.readonly')], optionalScopes },
  ];
  assert.deepEqual(resolveScopes(plain(reqs), 'readonly').scopes, [G('a.analytics.readonly')]);
  const short = [{ tool: 'p/report', kind: 'read', scopes: [G('m.readonly'), G('analytics.readonly')], optionalScopes: { money: [G('m.readonly')] } }];
  assert.deepEqual(resolveScopes(plain(short), 'readonly').scopes, [G('m.readonly')], 'without the policy the shorter scope wins');
  assert.deepEqual(resolveScopes(short, 'readonly').scopes, [G('analytics.readonly')], 'unnamed, the part scope is not picked');
  assert.deepEqual(resolveScopes(short, 'readonly', ['money']).scopes, [G('m.readonly')]);
  // Named, it is asked for and closes its tools; the greedy rule covers the rest.
  assert.deepEqual(resolveScopes(reqs, 'readonly', ['money']).scopes, [G('a.analytics.readonly'), G('a.money.readonly')]);
  // A tool that only the part scope covers stays uncovered until the part is named, and is reported with the part.
  const only = [{ tool: 'p/money', kind: 'read', scopes: [G('a.money.readonly')], optionalScopes }];
  assert.deepEqual(resolveScopes(only, 'readonly').scopes, []);
  const held = heldBackBy(only, 'readonly', [], []);
  assert.deepEqual(held.optionalScopes, { money: { tools: ['p/money'], scopes: [G('a.money.readonly')] } });
  assert.deepEqual(held.noProfile, { tools: [], scopes: [] }, 'not reported as a scope no profile requests');
  assert.equal(nothingHeldBack(held), false);
  assert.equal(heldBackBy(only, 'readonly', ['money'], [G('a.money.readonly')]).optionalScopes, undefined);
});

test('gyoutube: without --with monetary every profile and toolset resolves as before; with it, monetary is asked for', async () => {
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-scope-part-cfg-') });
  for (const toolset of ['all', 'google', 'curated']) {
    const reqs = await requirementsFor(['gyoutube'], cfg, { ...quiet, ...(toolset !== 'all' ? { toolset } : {}) });
    for (const profile of PROFILES) {
      const without = resolveScopes(reqs, profile);
      assert.deepEqual(without, resolveScopes(plain(reqs), profile), `${toolset} ${profile}`);
      assert.equal(without.scopes.includes(MONETARY), false);
      const withIt = resolveScopes(reqs, profile, ['monetary']);
      assert.ok(withIt.scopes.includes(MONETARY), `${toolset} ${profile}: ${withIt.scopes.join(' ')}`);
      // Nothing the login covered before is lost: monetary also covers the non-monetary reports.
      const covered = new Set(withIt.covered);
      assert.deepEqual(without.covered.filter((t) => !covered.has(t)), [], `${toolset} ${profile}`);
      const lines = heldBackLines(reqs, profile, [], without.scopes);
      assert.equal(lines.length, 1, lines.join('\n'));
      assert.match(lines[0], /^Held back: the optional part "monetary" \(the scope https:\/\/www\.googleapis\.com\/auth\/yt-analytics-monetary\.readonly, which \d+ tool\(s\) also accept\)\. Add it with --with monetary/);
      assert.deepEqual(heldBackLines(reqs, profile, ['monetary'], withIt.scopes), []);
    }
  }
  const all = await requirementsFor(['gyoutube'], cfg, quiet);
  assert.deepEqual(resolveScopes(all, 'readonly', ['monetary']).scopes, [G('blogger.readonly'), G('youtube.readonly'), MONETARY]);
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
        return { access_token: 'a', refresh_token: 'r', scope: scopes.join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}
const capture = () => {
  const lines = [];
  return { out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
};

test('gsm login --with monetary asks for it; a named account that holds it keeps it', async () => {
  const a = tempTokens();
  const google = fakeGoogle('me@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'business', servers: ['gyoutube'], profile: 'readonly', with: ['monetary'] }, registry, run.out, google.deps(a.cfg)), 0, run.text());
  assert.ok(google.seen.scopes.includes(MONETARY));

  const b = tempTokens();
  saveAccount('business', 'me@example.com', { refresh_token: 'r', scope: `${MONETARY} ${G('youtube.readonly')} ${EMAIL}` }, b.cfg);
  const kept = fakeGoogle('me@example.com');
  await runLogin({ group: 'business', servers: ['gyoutube'], profile: 'readonly', account: 'me@example.com' }, registry, capture().out, kept.deps(b.cfg));
  assert.ok(kept.seen.scopes.includes(MONETARY), 'merged from the stored token');
});

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

test('auth_login on gyoutube offers "with": ["monetary"], says what it adds, and asks for the scope only when named', async () => {
  const { dir } = tempTokens();
  const server = join(REPO, 'plugins', 'gyoutube', 'servers', 'gyoutube.mjs');
  await withServer(server, dir, async ({ call, tools }) => {
    const login = (await tools()).find((t) => t.name === 'auth_login');
    assert.deepEqual(login.inputSchema.properties.with.items.enum, ['monetary']);
    assert.match(login.inputSchema.properties.with.description, /monetary adds a scope to tools that load without it/);
    const answer = await call('auth_login', { method: 'oauth', profile: 'readonly' });
    assert.equal(askedIn(answer).includes(MONETARY), false);
    assert.match(answer, /Held back: the optional part "monetary"/);
  });
  await withServer(server, dir, async ({ call }) => {
    assert.ok(askedIn(await call('auth_login', { method: 'oauth', profile: 'readonly', with: ['monetary'] })).includes(MONETARY));
  });
});

test('the gmail auth_login description is unchanged (its part names an API)', async () => {
  const { dir } = tempTokens();
  await withServer(join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs'), dir, async ({ tools }) => {
    const login = (await tools()).find((t) => t.name === 'auth_login');
    assert.equal(
      login.inputSchema.properties.with.description,
      'Optional parts of this server to add to the sign-in. They are left out unless named here: postmaster. Their tools load only when the login holds their scopes.',
    );
  });
});

test('the server maps carry the part: config/servers.json and the gyoutube plugin', () => {
  const part = { monetary: [MONETARY] };
  assert.deepEqual(registry().servers.find((s) => s.name === 'gyoutube').scopePolicy, { optional: part });
  const own = JSON.parse(readFileSync(join(REPO, 'plugins', 'gyoutube', 'servers.json'), 'utf8')).servers[0];
  assert.deepEqual(own.scopePolicy, { optional: part });
});
