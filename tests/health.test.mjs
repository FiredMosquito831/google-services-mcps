// Health: the identity scope and the recorded account, the offline login state of each kind of group, the health tool
// of a real server process, and the gsm health command. No test calls Google, and every token folder is temporary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const IDENTITY = 'https://www.googleapis.com/auth/userinfo.email';

const { withIdentityScope, accountOfToken, checkGrant } = await import(DIST('core/grant-check.js'));
const { loginHealth, serverHealth } = await import(DIST('core/health.js'));
const { loadConfig } = await import(DIST('core/config.js'));

function tokenFolder(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-health-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
  return dir;
}

test('the identity scope is added once, and never removes the others', () => {
  const scopes = withIdentityScope(['https://www.googleapis.com/auth/gmail.readonly', IDENTITY]);
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/gmail.readonly', IDENTITY]);
  assert.equal(withIdentityScope([]).length, 1);
});

test('accountOfToken reads the email from token info, and is undefined when there is none or Google is unreachable', async () => {
  const withEmail = () => ({ getTokenInfo: async () => ({ email: 'person@example.com' }) });
  assert.equal(await accountOfToken('at', 'id', 'secret', { makeClient: withEmail }), 'person@example.com');
  const noEmail = () => ({ getTokenInfo: async () => ({ scope: 'x' }) });
  assert.equal(await accountOfToken('at', 'id', 'secret', { makeClient: noEmail }), undefined);
  const down = () => ({
    getTokenInfo: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(await accountOfToken('at', 'id', 'secret', { makeClient: down }), undefined);
});

test('checkGrant reports the account from a live check', async () => {
  const dir = tokenFolder({
    'client_secret.json': { installed: { client_id: 'id', client_secret: 'secret' } },
    'workspace-user.token.json': { refresh_token: 'rt-test', scope: IDENTITY },
  });
  const client = () => ({
    setCredentials() {},
    async getAccessToken() {
      return { token: 'at' };
    },
    async getTokenInfo() {
      return { scope: IDENTITY, expires_in: 900, email: 'person@example.com' };
    },
    async revokeToken() {},
  });
  const result = await checkGrant('workspace-user', loadConfig({ GSM_TOKEN_DIR: dir }), { makeClient: client });
  assert.equal(result.state, 'valid');
  assert.equal(result.account, 'person@example.com');
  rmSync(dir, { recursive: true, force: true });
});

test('loginHealth: an OAuth login shows its recorded account; no token file means not logged in', () => {
  const withAccount = tokenFolder({ 'workspace-user.token.json': { refresh_token: 'rt', account: 'person@example.com' } });
  const logged = loginHealth('workspace-user', loadConfig({ GSM_TOKEN_DIR: withAccount }));
  assert.equal(logged.kind, 'oauth');
  assert.equal(logged.loggedIn, true);
  assert.equal(logged.account, 'person@example.com');
  rmSync(withAccount, { recursive: true, force: true });

  const empty = tokenFolder();
  const missing = loginHealth('workspace-user', loadConfig({ GSM_TOKEN_DIR: empty }));
  assert.equal(missing.loggedIn, false);
  assert.match(missing.detail, /login workspace-user/);
  assert.equal(missing.account, undefined);
  rmSync(empty, { recursive: true, force: true });
});

test('loginHealth: each kind of group reports its own kind of login', () => {
  const dir = tokenFolder();
  const cfg = loadConfig({ GSM_TOKEN_DIR: dir, GSM_API_KEY: 'test-key-value' });
  assert.deepEqual([loginHealth('apikey', cfg).kind, loginHealth('apikey', cfg).loggedIn], ['api-key', true]);
  const none = loadConfig({ GSM_TOKEN_DIR: dir });
  assert.equal(loginHealth('apikey', none).loggedIn, false);
  assert.equal(loginHealth('workspace-admin', none).kind, 'service-account');
  assert.equal(loginHealth('cloud', none).kind, 'oauth-or-adc');
  rmSync(dir, { recursive: true, force: true });
});

test('serverHealth: the offline report names the server, its version, its tools, and says live was not asked', async () => {
  const dir = tokenFolder();
  const report = await serverHealth({
    server: 'gmail',
    version: '9.9.9',
    group: 'workspace-user',
    cfg: loadConfig({ GSM_TOKEN_DIR: dir }),
    registered: 4,
    hidden: 40,
    writesAllowed: false,
    live: false,
  });
  assert.equal(report.server, 'gmail');
  assert.equal(report.version, '9.9.9');
  assert.deepEqual(report.tools, { registered: 4, hidden: 40, writesAllowed: false });
  assert.equal(report.live, 'not checked (ask with live: true)');
  rmSync(dir, { recursive: true, force: true });
});

/** Starts a plugin server with a temporary token folder, and talks to it over stdio. */
async function withServer(serverFile, tokenDir, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.GSM_API_KEY;
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => {
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
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn(request);
  } finally {
    child.kill();
  }
}

test('every server has a health tool, and it reports the login without calling Google', async () => {
  const dir = tokenFolder();
  await withServer(join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs'), dir, async (request) => {
    const names = (await request('tools/list', {})).result.tools.map((tool) => tool.name);
    assert.ok(names.includes('health'), 'the health tool is listed before any login');
    const res = await request('tools/call', { name: 'health', arguments: {} });
    const report = JSON.parse(res.result.content[0].text);
    assert.equal(report.server, 'gmail');
    assert.equal(report.group, 'workspace-user');
    assert.equal(report.login.loggedIn, false);
    assert.equal(report.tools.writesAllowed, false);
    assert.equal(report.live, 'not checked (ask with live: true)');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('the health tool of an API key server reports the key state, with no login needed', async () => {
  const dir = tokenFolder();
  await withServer(join(REPO, 'plugins', 'gsearch', 'servers', 'gsearch.mjs'), dir, async (request) => {
    const res = await request('tools/call', { name: 'health', arguments: {} });
    const report = JSON.parse(res.result.content[0].text);
    assert.equal(report.login.kind, 'api-key');
    assert.equal(report.login.loggedIn, false);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('gsm health: one row per server offline, and --json gives the same rows as data', () => {
  const dir = tokenFolder();
  const env = { ...process.env, GSM_TOKEN_DIR: dir };
  delete env.GSM_API_KEY;
  const table = spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), 'health'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /^server\s+group\s+login\s+account\s+tools\s+check/m);
  assert.match(table.stdout, /^gmail\s+workspace-user\s+not logged in/m);
  assert.match(table.stdout, /health: 23 server\(s\), 0 failure\(s\)/);

  const json = spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), 'health', '--json'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(json.status, 0, json.stderr);
  const rows = JSON.parse(json.stdout);
  assert.equal(rows.length, 23);
  assert.ok(rows.every((row) => typeof row.server === 'string' && typeof row.login.loggedIn === 'boolean'));
  assert.equal(rows.find((row) => row.server === 'gmail').login.kind, 'oauth');
  rmSync(dir, { recursive: true, force: true });
});

test('gsm health --plugin names one server, and an unknown server is refused', () => {
  const dir = tokenFolder();
  const env = { ...process.env, GSM_TOKEN_DIR: dir };
  const one = spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), 'health', '--plugin', 'gdrive'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /^gdrive\s+workspace-user/m);
  const unknown = spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), 'health', '--plugin', 'nope'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(unknown.status, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('the built tool maps list health and auth_status as reads, so the hook never asks for them', () => {
  for (const id of ['gmail', 'gcloud', 'gsearch']) {
    const map = JSON.parse(readFileSync(join(REPO, 'plugins', id, 'tool-map.json'), 'utf8'));
    for (const name of ['health']) {
      const entry = map.find((tool) => tool.name === `mcp__plugin_${id}_${id}__${name}`);
      assert.ok(entry, `${id} maps ${name}`);
      assert.equal(entry.kind, 'read');
    }
    const status = map.find((tool) => tool.name === `mcp__plugin_${id}_${id}__auth_status`);
    assert.ok(status, `${id} maps auth_status`);
    assert.equal(status.kind, 'read');
  }
});
