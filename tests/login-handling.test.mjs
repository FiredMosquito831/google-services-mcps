// Login handling: Google's reason for a refused login (reauthentication told apart, error and subtype shown), the OAuth
// client cache that follows a new sign-in, the refresh listener that never recreates or overwrites a token file, the OS
// store cache, atomic token writes, the auth_status totals and the live health labels. No test calls Google: errors and
// clients are fakes, and every token folder is temporary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const auth = await import(DIST('core/auth.js'));
const { describeError } = await import(DIST('core/tools.js'));
const { checkGrant } = await import(DIST('core/grant-check.js'));
const { liveHealth, ACCESS_TOKEN_NOTE } = await import(DIST('core/health.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const secretFiles = await import(DIST('core/secret-files.js'));
const secretStore = await import(DIST('core/secret-store.js'));

const WINDOWS = process.platform === 'win32';
const REAUTH = /requires signing in to Google Cloud again \(an admin session policy; Google's default is 16 hours\)/;

/** google-auth-library's error for a refused refresh: invalid_grant, its answer as JSON in the message (oauth2client.js). */
function refusal(data, status = 400) {
  const err = new Error(JSON.stringify(data));
  err.response = { status, data };
  return err;
}
const RAPT = { error: 'invalid_grant', error_description: 'reauth related error (invalid_rapt)', error_subtype: 'invalid_rapt' };

function tokenDir({ refresh = 'rt-one' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-login-handling-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client-id', client_secret: 'test-client-secret' } }));
  if (refresh) writeFileSync(join(dir, 'workspace-user.token.json'), JSON.stringify({ refresh_token: refresh, access_token: 'at-one', scope: 'https://www.googleapis.com/auth/gmail.readonly' }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }), file: join(dir, 'workspace-user.token.json') };
}

// ---- Google's reason ----

test('an invalid_rapt refusal gets the reauthentication message, with auth_login first and the terminal command second', () => {
  const err = new auth.GrantExpiredError('cloud', { cause: refusal(RAPT) });
  assert.match(err.message, REAUTH);
  const chat = err.message.indexOf('auth_login');
  const terminal = err.message.indexOf('login cloud');
  assert.ok(chat >= 0 && terminal > chat, 'the chat sign-in is named before the terminal command');
  assert.doesNotMatch(err.message, /7 days/, 'a reauthentication is not blamed on the Testing limit');
  // rapt_required, and a description that only says ReAuth, are reauthentication too.
  assert.equal(auth.grantRefusalOf(refusal({ error: 'invalid_grant', error_subtype: 'rapt_required' })).reauth, true);
  assert.equal(auth.grantRefusalOf(refusal({ error: 'invalid_grant', error_description: 'ReAuth required' })).reauth, true);
  // The library may leave the answer in the message only.
  assert.equal(auth.grantRefusalOf(new Error(JSON.stringify(RAPT))).reauth, true);
});

test('another refusal names Google\'s error and subtype, and keeps the Testing limit as one possibility', () => {
  const err = new auth.GrantExpiredError('workspace-user', { cause: refusal({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) });
  assert.doesNotMatch(err.message, REAUTH);
  assert.match(err.message, /Google: error invalid_grant/);
  assert.match(err.message, /7 days/);
  assert.match(err.message, /auth_login/);
  assert.match(err.message, /login workspace-user/);
  const sub = auth.refusalMessage('business', auth.grantRefusalOf(refusal({ error: 'invalid_grant', error_subtype: 'something_else' })));
  assert.match(sub, /Google: error invalid_grant, subtype something_else/);
  const unauthorized = auth.refusalMessage('business', auth.grantRefusalOf({ message: 'Request failed', response: { status: 401, data: { error: { code: 401 } } } }));
  assert.match(unauthorized, /HTTP 401/);
});

test('the reason never carries a token: values that are not short codes are left out', () => {
  const r = auth.grantRefusalOf(refusal({ error: 'invalid_grant', error_subtype: '1//0gSECRET-refresh-token/with/slashes' }));
  assert.equal(r.subtype, undefined);
  assert.ok(!auth.refusalMessage('cloud', r).includes('SECRET'));
});

test('a tool call whose token Google refuses with invalid_rapt reports the reauthentication message', async () => {
  const { dir, cfg } = tokenDir();
  const original = OAuth2Client.prototype.request;
  OAuth2Client.prototype.request = async () => {
    throw refusal(RAPT);
  };
  try {
    auth.forgetUserClients();
    const client = await auth.getAuthClient('workspace-user', cfg);
    const err = await client.request({ url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile' }).then(
      () => assert.fail('the call must fail'),
      (e) => e,
    );
    assert.ok(err instanceof auth.GrantExpiredError);
    assert.match(describeError(err, 'workspace-user'), REAUTH);
  } finally {
    OAuth2Client.prototype.request = original;
    auth.forgetUserClients();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkGrant reports an invalid_rapt refresh as expired, with the reauthentication message', async () => {
  const { dir, cfg } = tokenDir();
  try {
    const makeClient = () => ({
      setCredentials() {},
      async getAccessToken() {
        throw refusal(RAPT);
      },
      async getTokenInfo() {
        return {};
      },
      async revokeToken() {},
    });
    const result = await checkGrant('workspace-user', cfg, { makeClient });
    assert.equal(result.state, 'expired');
    assert.match(result.detail, REAUTH);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the client cache ----

test('getAuthClient keeps one client per account, rebuilds it after a new sign-in, and forgetUserClients drops it', async () => {
  const { dir, cfg, file } = tokenDir();
  try {
    auth.forgetUserClients();
    const first = await auth.getAuthClient('workspace-user', cfg);
    assert.equal(await auth.getAuthClient('workspace-user', cfg), first, 'the same client while the token is the same');
    // A refresh writes a new access token but keeps the refresh token: still the same client.
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), access_token: 'at-two' }));
    assert.equal(await auth.getAuthClient('workspace-user', cfg), first);
    // A new sign-in (another process) writes another refresh token: a new client.
    writeFileSync(file, JSON.stringify({ refresh_token: 'rt-two', access_token: 'at-new' }));
    const second = await auth.getAuthClient('workspace-user', cfg);
    assert.notEqual(second, first, 'a new refresh token gives a new client');
    assert.equal(second.credentials.refresh_token, 'rt-two');
    auth.forgetUserClients();
    assert.notEqual(await auth.getAuthClient('workspace-user', cfg), second, 'forgetUserClients drops the cached client');
  } finally {
    auth.forgetUserClients();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the refresh listener saves a refreshed token, never recreates a removed file, and never overwrites a newer sign-in', async () => {
  const { dir, cfg, file } = tokenDir();
  try {
    auth.forgetUserClients();
    const client = await auth.getAuthClient('workspace-user', cfg);
    client.emit('tokens', { access_token: 'at-refreshed' });
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.access_token, 'at-refreshed');
    assert.equal(saved.refresh_token, 'rt-one', 'the refresh token is kept');

    // A newer sign-in replaced the file: the old client's refresh does not touch it.
    writeFileSync(file, JSON.stringify({ refresh_token: 'rt-newer', access_token: 'at-newer', scope: 'x' }));
    client.emit('tokens', { access_token: 'at-old-client', scope: 'old' });
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { refresh_token: 'rt-newer', access_token: 'at-newer', scope: 'x' });

    // Signed out: the file is gone, and a late refresh does not create it again.
    rmSync(file);
    client.emit('tokens', { access_token: 'at-late' });
    assert.equal(existsSync(file), false, 'the token file is not recreated');
  } finally {
    auth.forgetUserClients();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the secret files ----

test('a plain token write replaces the file in one step and leaves no temporary file', () => {
  const { dir, cfg, file } = tokenDir();
  try {
    secretFiles.writeSecretText(cfg, file, '{"refresh_token":"rt-written"}', { GSM_TOKEN_STORE: 'file' });
    assert.equal(readFileSync(file, 'utf8'), '{"refresh_token":"rt-written"}');
    secretFiles.writeSecretText(cfg, file, '{"refresh_token":"rt-again"}', { GSM_TOKEN_STORE: 'file' });
    assert.equal(readFileSync(file, 'utf8'), '{"refresh_token":"rt-again"}');
    assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith('.tmp')), [], 'no temporary file is left');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with the OS store, a token another process stores later is seen, and forgetCachedSecrets drops what was read', { skip: !WINDOWS && 'DPAPI is Windows only' }, () => {
  const { dir, cfg } = tokenDir({ refresh: null });
  const env = { ...process.env, GSM_TOKEN_STORE: 'dpapi' };
  const file = join(dir, 'workspace-user.someone_example.com.token.json');
  const name = secretFiles.secretNameOf(file);
  try {
    assert.equal(secretFiles.readSecretText(cfg, file, env), undefined, 'nothing stored yet');
    // Another process (the in-chat sign-in) stores the token; this process's cache is not told.
    secretStore.putSecretSync('dpapi', dir, name, '{"refresh_token":"rt-from-child"}');
    assert.equal(secretFiles.readSecretText(cfg, file, env), '{"refresh_token":"rt-from-child"}', 'a missing token is not remembered as missing');
    secretStore.putSecretSync('dpapi', dir, name, '{"refresh_token":"rt-second-sign-in"}');
    assert.equal(secretFiles.readSecretText(cfg, file, env), '{"refresh_token":"rt-from-child"}', 'a found value is cached');
    secretFiles.forgetCachedSecrets();
    assert.equal(secretFiles.readSecretText(cfg, file, env), '{"refresh_token":"rt-second-sign-in"}', 'after forgetting, the store is read again');
  } finally {
    secretFiles.forgetCachedSecrets();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- health and auth_status ----

test('live health labels the access token time, and keeps expiresInSeconds for existing readers', async () => {
  const { dir, cfg } = tokenDir();
  try {
    const makeClient = () => ({
      setCredentials() {},
      async getAccessToken() {
        return { token: 'at-test' };
      },
      async getTokenInfo() {
        return { scopes: ['https://www.googleapis.com/auth/gmail.readonly'], expiry_date: Date.now() + 1_800_000 };
      },
      async revokeToken() {},
    });
    const live = await liveHealth('workspace-user', cfg, { makeClient });
    assert.equal(live.state, 'valid');
    assert.ok(live.expiresInSeconds > 1700 && live.expiresInSeconds <= 1800);
    assert.equal(live.accessTokenExpiresInSeconds, live.expiresInSeconds);
    assert.equal(live.expiresNote, ACCESS_TOKEN_NOTE);
    assert.match(ACCESS_TOKEN_NOTE, /not say how long the login itself lasts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth_status says how many tools are registered in total, and how many it loaded now', async () => {
  const { dir } = tokenDir({ refresh: null });
  const child = spawn(process.execPath, [join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs')], {
    env: { ...process.env, GSM_TOKEN_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && waiting.has(msg.id)) waiting.get(msg.id)(msg);
    } catch {
      // not a message
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
    const before = (await request('tools/list')).result.tools.length;
    const registeredNow = async () => JSON.parse((await request('tools/call', { name: 'health', arguments: {} })).result.content[0].text).tools.registered;
    const none = (await request('tools/call', { name: 'auth_status', arguments: {} })).result.content[0].text;
    assert.match(none, new RegExp(`Not signed in for "workspace-user"\\. ${await registeredNow()} tool\\(s\\) registered in total\\.`), 'the same count as health');
    writeFileSync(join(dir, 'workspace-user.token.json'), JSON.stringify({ refresh_token: 'rt-test', scope: 'https://www.googleapis.com/auth/gmail.readonly' }));
    const loaded = (await request('tools/call', { name: 'auth_status', arguments: {} })).result.content[0].text;
    const match = loaded.match(/(\d+) tool\(s\) loaded now, (\d+) registered in total\./);
    assert.ok(match, loaded);
    const after = (await request('tools/list')).result.tools.length;
    assert.ok(Number(match[1]) > 0);
    assert.ok(Number(match[2]) >= Number(match[1]));
    // The total is health's count: the tools the scope gate registered (health and the sign-in tools are apart).
    assert.equal(Number(match[2]), await registeredNow());
    assert.ok(after > before);
    const again = (await request('tools/call', { name: 'auth_status', arguments: {} })).result.content[0].text;
    assert.match(again, new RegExp(`0 tool\\(s\\) loaded now, ${match[2]} registered in total\\.`), 'a second call loads nothing and keeps the total');
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    rmSync(dir, { recursive: true, force: true });
  }
});
