// The Gmail scope rules (config/products.json scopePolicy for gmail) and the opt-in for optional parts (--with, and
// "with" on the chat tool auth_login). The login runs in this process with a fake browser step and a fake Google answer,
// the chat sign-in runs against the built gmail plugin with no browser (GSM_NO_BROWSER=1). Nothing calls Google.
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

const { runLogin } = await import(DIST('cli/login.js'));
const { runScopes } = await import(DIST('cli/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry, serverByName } = await import(DIST('core/registry.js'));
const { registryFromProducts, loadRegistryFile } = await import(DIST('cli/products.js'));
const { resolveScopes, requirementsFor, requirementsForSpecs, heldBackBy, PROFILES } = await import(DIST('core/scopes.js'));
const { withIdentityScope } = await import(DIST('core/grant-check.js'));
const { heldBackOutput, outcomeLines } = await import(DIST('core/inchat-login.js'));
const { UsageError } = await import(DIST('cli/types.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const MAIL = 'https://mail.google.com/';
const EMAIL = G('userinfo.email');
const SHARING = G('gmail.settings.sharing');
const POSTMASTER = [G('postmaster'), G('postmaster.readonly'), G('postmaster.traffic.readonly'), G('postmaster.domain'), G('postmaster.user')];

/** The three registries a login can read: config/servers.json, config/products.json (repo CLI) and the plugin's own map. */
const REGISTRIES = {
  'config/servers.json': () => loadRegistry(DIST('core/registry.js')),
  'config/products.json': () => registryFromProducts(JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')), REPO),
  'plugins/gmail/servers.json': () => loadRegistryFile(join(REPO, 'plugins', 'gmail', 'servers.json')),
};

function tempTokens() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-gmail-scopes-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }) };
}

function capture() {
  const lines = [];
  return { lines, out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

/** A fake browser step that records the scopes asked for and grants them all. */
function fakeGoogle(account = 'person@example.com') {
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

/** What a gmail login asks Google for, from a registry, with gsm login's own code. */
async function gmailLogin(registry, profile, extra = {}) {
  const { dir, cfg } = tempTokens();
  try {
    const google = fakeGoogle();
    const { out, text } = capture();
    const code = await runLogin({ group: 'workspace-user', servers: ['gmail'], profile, ...extra }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    return { scopes: google.seen.scopes, text: text() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sorted = (list) => [...list].sort();

test('gmail readonly asks for gmail.readonly and the email scope only, from every registry', async () => {
  for (const [name, registry] of Object.entries(REGISTRIES)) {
    const { scopes } = await gmailLogin(registry, 'readonly');
    assert.deepEqual(scopes, sorted([G('gmail.readonly'), EMAIL]), name);
  }
});

test('gmail readwrite asks for gmail.modify and gmail.settings.basic, never https://mail.google.com/', async () => {
  for (const [name, registry] of Object.entries(REGISTRIES)) {
    const { scopes, text } = await gmailLogin(registry, 'readwrite');
    assert.deepEqual(scopes, sorted([G('gmail.modify'), G('gmail.settings.basic'), EMAIL]), name);
    // The tools readwrite leaves out say what they need.
    assert.match(text, /Held back: 3 tool\(s\) need https:\/\/mail\.google\.com\/, which only the full profile requests/, name);
    assert.match(text, /gmail\/gmail_users_messages_delete/, name);
    assert.match(text, /gmail\/gmail_users_messages_batch_delete/, name);
  }
});

test('gmail full includes https://mail.google.com/, and still no settings.sharing or Postmaster scope', async () => {
  for (const [name, registry] of Object.entries(REGISTRIES)) {
    const { scopes, text } = await gmailLogin(registry, 'full');
    assert.ok(scopes.includes(MAIL), name);
    assert.deepEqual(scopes, sorted([MAIL, G('gmail.settings.basic'), EMAIL]), name);
    assert.doesNotMatch(text, /which only the full profile requests/, `${name}: nothing waits for full under full`);
  }
});

test('gmail.settings.sharing is never requested by a profile, with or without the optional parts', async () => {
  const reqs = await requirementsFor(['gmail'], tempTokens().cfg, { warn: () => undefined });
  for (const profile of PROFILES) {
    for (const include of [[], ['postmaster']]) {
      assert.ok(!resolveScopes(reqs, profile, include).scopes.includes(SHARING), `${profile} ${include}`);
    }
  }
  const { text } = await gmailLogin(REGISTRIES['config/servers.json'], 'readwrite');
  assert.match(text, /Held back: 8 tool\(s\) need https:\/\/www\.googleapis\.com\/auth\/gmail\.settings\.sharing, which no profile requests/);
});

test('Postmaster scopes come only with the opt-in (--with postmaster)', async () => {
  for (const [name, registry] of Object.entries(REGISTRIES)) {
    for (const profile of PROFILES) {
      const without = await gmailLogin(registry, profile);
      assert.deepEqual(without.scopes.filter((s) => POSTMASTER.includes(s)), [], `${name} ${profile}: no Postmaster scope without the opt-in`);
      assert.match(without.text, /Held back: the optional part "postmaster"/, `${name} ${profile}`);
      const withIt = await gmailLogin(registry, profile, { with: ['postmaster'] });
      assert.ok(withIt.scopes.some((s) => POSTMASTER.includes(s)), `${name} ${profile}: the opt-in asks for Postmaster`);
      assert.doesNotMatch(withIt.text, /optional part "postmaster"/, `${name} ${profile}`);
      assert.match(withIt.text, /Optional parts included: postmaster/);
    }
  }
  // With the opt-in, the Postmaster scopes are the ones today's login asked for (1.1.4), minus the Gmail changes.
  const reqs = await requirementsFor(['gmail'], tempTokens().cfg, { warn: () => undefined });
  assert.deepEqual(resolveScopes(reqs, 'readonly', ['postmaster']).scopes, sorted([G('gmail.readonly'), G('postmaster.readonly'), G('postmaster.traffic.readonly')]));
  assert.deepEqual(resolveScopes(reqs, 'readwrite', ['postmaster']).scopes, sorted([G('gmail.modify'), G('gmail.settings.basic'), G('postmaster'), G('postmaster.readonly')]));
});

test('--with is checked: an unknown part, --with with --scopes, and a group without optional parts are usage errors', async () => {
  const registry = REGISTRIES['config/servers.json'];
  const { dir, cfg } = tempTokens();
  try {
    const { out } = capture();
    await assert.rejects(
      runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readonly', with: ['nothing'] }, registry, out, fakeGoogle().deps(cfg)),
      (err) => err instanceof UsageError && /"nothing" is not an optional part of gmail. Optional parts: postmaster/.test(err.message),
    );
    await assert.rejects(
      runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'custom', customScopes: [EMAIL], with: ['postmaster'] }, registry, out, fakeGoogle().deps(cfg)),
      (err) => err instanceof UsageError && /use --with with a profile, not with --scopes/.test(err.message),
    );
    await assert.rejects(
      runLogin({ group: 'workspace-user', servers: ['gcalendar'], profile: 'readonly', with: ['postmaster'] }, registry, out, fakeGoogle().deps(cfg)),
      (err) => err instanceof UsageError && /gcalendar has no optional parts/.test(err.message),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an account that already holds https://mail.google.com/ and Postmaster scopes keeps them when it is named (merge)', async () => {
  const registry = REGISTRIES['config/servers.json'];
  const { dir, cfg } = tempTokens();
  try {
    const { saveAccount } = await import(DIST('core/accounts.js'));
    const held = [MAIL, G('postmaster.readonly'), EMAIL];
    saveAccount('workspace-user', 'person@example.com', { refresh_token: 'r1', scope: held.join(' ') }, cfg);
    const google = fakeGoogle('person@example.com');
    const { out, text } = capture();
    const code = await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite', account: 'person@example.com' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    for (const scope of held) assert.ok(google.seen.scopes.includes(scope), `kept: ${scope}`);
    // A kept scope covers the tools it covered before, so they are not listed as held back.
    assert.doesNotMatch(text(), /only the full profile requests/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the scope policy marks only gmail requirements; every other server resolves as it did without a policy', async () => {
  const reg = REGISTRIES['config/servers.json']();
  const cfg = tempTokens().cfg;
  const withPolicy = reg.servers.filter((s) => s.scopePolicy).map((s) => s.name);
  assert.deepEqual(withPolicy, ['gmail']);
  for (const spec of reg.servers) {
    if (spec.name === 'gmail') continue;
    const reqs = await requirementsForSpecs([spec], cfg, { warn: () => undefined });
    assert.equal(reqs.filter((r) => 'optional' in r || 'onlyIn' in r).length, 0, spec.name);
    // The same requirements with the policy fields stripped resolve the same way: the policy code path is inert here.
    for (const profile of PROFILES) {
      const plain = reqs.map(({ tool, kind, scopes, gateway }) => ({ tool, kind, scopes, ...(gateway ? { gateway } : {}) }));
      assert.deepEqual(resolveScopes(reqs, profile, ['postmaster']), resolveScopes(plain, profile), `${spec.name} ${profile}`);
      const held = heldBackBy(reqs, profile, [], resolveScopes(reqs, profile).scopes);
      assert.deepEqual(held, { optional: {}, needsProfile: {}, noProfile: { tools: [], scopes: [] } }, `${spec.name} ${profile}`);
    }
  }
});

test('gsm scopes shows the optional parts and the held-back tools for gmail only', async () => {
  const registry = REGISTRIES['config/servers.json']();
  const { out, text } = capture();
  await runScopes({ group: 'workspace-user', servers: ['gmail'], json: false }, registry, out);
  assert.match(text(), /Optional parts \(left out of every profile unless named with --with\): postmaster\./);
  assert.match(text(), /Held back:/);
  const json = capture();
  await runScopes({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite', json: true, with: ['postmaster'] }, registry, json.out);
  const parsed = JSON.parse(json.text());
  assert.deepEqual(parsed.optionalParts, ['postmaster']);
  assert.deepEqual(parsed.with, ['postmaster']);
  assert.ok(parsed.profiles.readwrite.scopes.includes(G('postmaster')));
  const other = capture();
  await runScopes({ group: 'workspace-user', servers: ['gcalendar'], json: false }, registry, other.out);
  assert.doesNotMatch(other.text(), /Held back:|Optional parts/);
});

test('heldBackOutput picks the "Held back:" lines; outcomeLines does not, so a failed sign-in keeps its reason', () => {
  const output = ['Profile readwrite: x.', 'Held back: 3 tool(s) need https://mail.google.com/, which only the full profile requests: a', 'Not saved: y'].join('\r\n');
  assert.deepEqual(heldBackOutput(output), ['Held back: 3 tool(s) need https://mail.google.com/, which only the full profile requests: a']);
  assert.deepEqual(outcomeLines(output), ['Not saved: y']);
});

// ---------------------------------------------------------------------------
// The chat sign-in (auth_login on the built gmail plugin)

const pluginServer = (id) => join(REPO, 'plugins', id, 'servers', `${id}.mjs`);

/** Starts a plugin server with a temporary token folder and no browser. Calls fn with call and tools. */
async function withServer(serverFile, tokenDir, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1' };
  delete env.GSM_API_KEY;
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 60000);
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

/** The scopes in the sign-in URL an auth_login answer carries. */
const askedIn = (answer) => new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ').sort();

test('auth_login on gmail: "with" reaches the login (--with), full reaches https://mail.google.com/, and readwrite says what it holds back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-gmail-inchat-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client-id', client_secret: 'test-secret-value' } }));
  try {
    await withServer(pluginServer('gmail'), dir, async ({ call, tools }) => {
      const login = (await tools()).find((t) => t.name === 'auth_login');
      assert.deepEqual(login.inputSchema.properties.with.items.enum, ['postmaster']);
      assert.deepEqual(login.inputSchema.properties.profile.enum, ['readonly', 'readwrite', 'full']);
      const readwrite = await call('auth_login', { method: 'oauth', profile: 'readwrite' });
      assert.deepEqual(askedIn(readwrite), sorted([G('gmail.modify'), G('gmail.settings.basic'), EMAIL]));
      assert.match(readwrite, /Held back: 3 tool\(s\) need https:\/\/mail\.google\.com\/, which only the full profile requests/);
    });
    await withServer(pluginServer('gmail'), dir, async ({ call }) => {
      const withIt = await call('auth_login', { method: 'oauth', profile: 'readonly', with: ['postmaster'] });
      assert.deepEqual(askedIn(withIt), sorted([G('gmail.readonly'), G('postmaster.readonly'), G('postmaster.traffic.readonly'), EMAIL]));
    });
    await withServer(pluginServer('gmail'), dir, async ({ call }) => {
      const full = await call('auth_login', { method: 'oauth', profile: 'full' });
      assert.ok(askedIn(full).includes(MAIL));
      assert.ok(!askedIn(full).includes(SHARING));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth_login on a server without optional parts has no "with" argument', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-gmail-inchat-other-'));
  try {
    await withServer(pluginServer('gcalendar'), dir, async ({ tools }) => {
      const login = (await tools()).find((t) => t.name === 'auth_login');
      assert.equal(login.inputSchema.properties.with, undefined);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
