// Application Default Credentials as a sign-in route: the ADC file is read without its secrets, a login the suite makes
// is recorded for one group, a group without accounts of its own uses that login, the live check and health report it,
// and auth_login asks which route to use before it signs in. No test calls Google: the ADC files are fake, and the
// gcloud CLI is a fake script that prints a URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_SERVER = join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs');
const CLOUD_SERVER = join(REPO, 'plugins', 'gcloud', 'servers', 'gcloud.mjs');

const adc = await import(DIST('core/adc.js'));
const auth = await import(DIST('core/auth.js'));
const accounts = await import(DIST('core/accounts.js'));
const grant = await import(DIST('core/grant-check.js'));
const { loadConfig } = await import(DIST('core/config.js'));

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-adc-'));
  writeFileSync(
    join(dir, 'client_secret.json'),
    JSON.stringify({ installed: { client_id: 'test-client-id.apps.googleusercontent.com', client_secret: 'test-secret' } }),
  );
  return dir;
}

/** An authorized_user ADC file (or a service account key) with a fake refresh token. */
function writeAdcFile(dir, { refresh = 'rt-adc-test', quota, type = 'authorized_user' } = {}) {
  const file = join(dir, 'adc.json');
  const body =
    type === 'service_account'
      ? { type, client_email: 'sa@example.iam.gserviceaccount.com', private_key: 'not-a-real-key' }
      : { type, client_id: 'adc-client', client_secret: 'adc-secret', refresh_token: refresh, ...(quota ? { quota_project_id: quota } : {}) };
  writeFileSync(file, JSON.stringify(body));
  return file;
}

/** Runs fn with GOOGLE_APPLICATION_CREDENTIALS set to file, then restores it. */
async function withAdcEnv(file, fn) {
  const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = previous;
  }
}

/** A gcloud stand-in: prints the sign-in URL the way gcloud does, and exits 0. */
function fakeGcloud(dir) {
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  if (process.platform === 'win32') {
    writeFileSync(
      join(bin, 'gcloud.cmd'),
      '@echo off\r\necho Your browser has been opened to visit:\r\necho.\r\necho     https://accounts.google.com/o/oauth2/auth?fake=1\r\nexit /b 0\r\n',
    );
  } else {
    const file = join(bin, 'gcloud');
    writeFileSync(file, '#!/bin/sh\necho "Your browser has been opened to visit:"\necho "    https://accounts.google.com/o/oauth2/auth?fake=1"\nexit 0\n');
    chmodSync(file, 0o755);
  }
  return bin;
}

/** The environment of a server process: its own token folder and an empty gcloud install location. */
function serverEnv(dir, extra = {}) {
  const appdata = join(dir, 'appdata');
  mkdirSync(appdata, { recursive: true });
  return {
    ...process.env,
    GSM_TOKEN_DIR: dir,
    GSM_NO_BROWSER: '1',
    APPDATA: appdata,
    GOOGLE_APPLICATION_CREDENTIALS: join(dir, 'missing-adc.json'),
    ...extra,
  };
}

async function waitUntil(check, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/** Starts a plugin server with the given environment, and talks to it over stdio. */
async function withServer(serverFile, env, fn) {
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
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result.content[0].text;
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ request, call });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

test('the ADC file is read for its type and quota project only; the refresh token never comes back', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { quota: 'my-quota' });
    const state = await withAdcEnv(file, () => adc.readAdcState(cfg));
    assert.equal(state.present, true);
    assert.equal(state.type, 'authorized_user');
    assert.equal(state.quotaProject, 'my-quota');
    assert.equal(state.group, 'cloud', 'a login with no record is gcloud\'s built-in cloud login');
    assert.deepEqual(state.scopes, adc.GCLOUD_DEFAULT_SCOPES);
    assert.equal(state.recorded, false);
    assert.ok(!JSON.stringify(state).includes('rt-adc-test'), 'the refresh token is never returned');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a login the suite made is recorded for its group, and a replaced file no longer matches the record', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { refresh: 'rt-one' });
    adc.saveAdcRecord(cfg, { group: 'workspace-user', scopes: [GMAIL_SCOPE], fingerprint: adc.fingerprintOf('rt-one') });
    await withAdcEnv(file, () => {
      const state = adc.readAdcState(cfg);
      assert.equal(state.group, 'workspace-user');
      assert.deepEqual(state.scopes, [GMAIL_SCOPE]);
      assert.equal(state.recorded, true);
      assert.ok(adc.adcGrantFor('workspace-user', cfg));
      assert.equal(adc.adcGrantFor('cloud', cfg), null, 'the login covers its own group only');
    });
    // Another login written into the same file (made by hand, say) does not match the record.
    writeAdcFile(dir, { refresh: 'rt-two' });
    await withAdcEnv(file, () => {
      const state = adc.readAdcState(cfg);
      assert.equal(state.group, 'cloud');
      assert.equal(state.recorded, false);
    });
    const record = JSON.parse(readFileSync(join(dir, 'adc.scopes.json'), 'utf8'));
    assert.ok(!JSON.stringify(record).includes('rt-one'), 'the record holds a hash, not the token');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a service-account ADC key covers the cloud group only', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { type: 'service_account' });
    await withAdcEnv(file, () => {
      const state = adc.readAdcState(cfg);
      assert.equal(state.group, 'cloud');
      assert.deepEqual(state.scopes, ['https://www.googleapis.com/auth/cloud-platform']);
      assert.equal(adc.adcGrantFor('workspace-user', cfg), null);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a group with accounts of its own never uses ADC; a group without them uses the ADC login recorded for it', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { refresh: 'rt-one' });
    adc.saveAdcRecord(cfg, { group: 'workspace-user', scopes: [GMAIL_SCOPE], fingerprint: adc.fingerprintOf('rt-one') });
    await withAdcEnv(file, () => {
      assert.equal(auth.loginSourceOf('workspace-user', cfg), 'adc');
      assert.equal(auth.isLoggedIn('workspace-user', cfg), true);
      assert.deepEqual(auth.grantedScopes('workspace-user', cfg), [GMAIL_SCOPE]);
      assert.equal(auth.grantedScopes('business', cfg), null);
      assert.equal(auth.isLoggedIn('business', cfg), false);
      assert.equal(auth.loginSourceOf('cloud', cfg), undefined, 'an ADC login covers the group it was made for, and no other');
    });
    accounts.saveAccount('workspace-user', 'own@example.com', { refresh_token: 'rt-own', scope: GMAIL_SCOPE }, cfg);
    await withAdcEnv(file, () => {
      assert.equal(auth.loginSourceOf('workspace-user', cfg), 'oauth', 'an account of the group wins over ADC');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getAuthClient uses the ADC login when no account is signed in, and refuses when there is none', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { refresh: 'rt-one' });
    adc.saveAdcRecord(cfg, { group: 'workspace-user', scopes: [GMAIL_SCOPE], fingerprint: adc.fingerprintOf('rt-one') });
    auth.forgetAdcClients();
    const client = await withAdcEnv(file, () => auth.getAuthClient('workspace-user', cfg));
    assert.equal(typeof client.request, 'function');
    auth.forgetAdcClients();
    await assert.rejects(
      () => withAdcEnv(join(dir, 'missing-adc.json'), () => auth.getAuthClient('business', cfg)),
      auth.AuthRequiredError,
    );
  } finally {
    auth.forgetAdcClients();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the live check of an ADC login asks Google the same way, and names the account', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { refresh: 'rt-one' });
    adc.saveAdcRecord(cfg, {
      group: 'workspace-user',
      scopes: [GMAIL_SCOPE, 'https://www.googleapis.com/auth/calendar.readonly'],
      fingerprint: adc.fingerprintOf('rt-one'),
    });
    const valid = {
      makeAdcClient: async () => ({
        getAccessToken: async () => ({ token: 'ya29.fake' }),
        getTokenInfo: async () => ({
          scope: `openid https://www.googleapis.com/auth/userinfo.email ${GMAIL_SCOPE}`,
          email: 'me@example.com',
          expires_in: 3000,
        }),
        setCredentials() {},
        revokeToken: async () => {},
      }),
    };
    const check = await withAdcEnv(file, () => grant.checkGrant('workspace-user', cfg, valid));
    assert.equal(check.state, 'valid');
    assert.equal(check.account, 'me@example.com');
    assert.deepEqual(check.missingScopes, ['https://www.googleapis.com/auth/calendar.readonly']);

    const refused = {
      makeAdcClient: async () => ({
        getAccessToken: async () => {
          throw new Error('invalid_grant: Token has been expired or revoked.');
        },
        getTokenInfo: async () => ({}),
        setCredentials() {},
        revokeToken: async () => {},
      }),
    };
    const expired = await withAdcEnv(file, () => grant.checkGrant('workspace-user', cfg, refused));
    assert.equal(expired.state, 'expired');
    assert.match(expired.detail, /Application Default Credentials/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('token info is read in both shapes: the library returns scopes and expiry_date, the raw endpoint returns scope and expires_in', async () => {
  const now = 1_000_000;
  assert.deepEqual(grant.readTokenInfo({ scopes: ['a', 'b'], expiry_date: now + 90_000 }, now), { scopes: ['a', 'b'], expiresInSeconds: 90 });
  assert.deepEqual(grant.readTokenInfo({ scope: 'a b', expires_in: 60 }, now), { scopes: ['a', 'b'], expiresInSeconds: 60 });
  assert.deepEqual(grant.readTokenInfo({ scopes: ['a'], expiry_date: now - 5_000 }, now), { scopes: ['a'], expiresInSeconds: 0 });
  assert.deepEqual(grant.readTokenInfo({}, now), { scopes: [], expiresInSeconds: undefined });
});

test('the live check of an ADC login reads the scopes the library reports, so a granted scope is not called missing', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    const file = writeAdcFile(dir, { refresh: 'rt-shape' });
    adc.saveAdcRecord(cfg, { group: 'workspace-user', scopes: [GMAIL_SCOPE], fingerprint: adc.fingerprintOf('rt-shape') });
    const libraryShape = {
      makeAdcClient: async () => ({
        getAccessToken: async () => ({ token: 'ya29.fake-shape' }),
        // google-auth-library's shape: scopes as an array, expiry_date in milliseconds.
        getTokenInfo: async () => ({ scopes: [GMAIL_SCOPE, 'https://www.googleapis.com/auth/userinfo.email'], expiry_date: Date.now() + 600_000, email: 'me@example.com' }),
        setCredentials() {},
        revokeToken: async () => {},
      }),
    };
    const check = await withAdcEnv(file, () => grant.checkGrant('workspace-user', cfg, libraryShape));
    assert.equal(check.state, 'valid');
    assert.deepEqual(check.missingScopes, [], 'the granted scope is found');
    assert.ok(check.expiresInSeconds > 0 && check.expiresInSeconds <= 600, 'the time left is read from expiry_date');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth_login asks which way to sign in, then signs in with ADC through gcloud and records the group', async () => {
  const dir = folder();
  try {
    const file = writeAdcFile(dir, { refresh: 'rt-server-test' });
    const bin = fakeGcloud(dir);
    const env = serverEnv(dir, { GOOGLE_APPLICATION_CREDENTIALS: file, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` });
    await withServer(GMAIL_SERVER, env, async ({ call }) => {
      const choice = await call('auth_login');
      assert.match(choice, /Two ways to sign in to "workspace-user"/);
      assert.match(choice, /with method "oauth" or "adc"/);
      assert.match(choice, /replaces the old one/);

      const started = await call('auth_login', { method: 'adc' });
      assert.match(started, /https:\/\/accounts\.google\.com\//);
      assert.ok(await waitUntil(() => existsSync(join(dir, 'adc.scopes.json'))), 'the ADC login is recorded after gcloud exits');

      const status = await call('auth_status');
      assert.match(status, /Signed in for "workspace-user" with Application Default Credentials/);
      const record = JSON.parse(readFileSync(join(dir, 'adc.scopes.json'), 'utf8'));
      assert.equal(record.group, 'workspace-user');
      assert.ok(record.scopes.includes(GMAIL_SCOPE));
      assert.ok(!JSON.stringify(record).includes('rt-server-test'), 'the record holds a hash, not the token');

      const health = JSON.parse(await call('health'));
      assert.equal(health.login.loggedIn, true);
      assert.match(health.login.detail, /Application Default Credentials/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without the gcloud CLI, the ADC route says so and the OAuth route is still offered', async () => {
  const dir = folder();
  const home = join(dir, 'home');
  const programs = join(dir, 'programs');
  mkdirSync(home);
  mkdirSync(programs);
  const env = serverEnv(dir, {
    GOOGLE_APPLICATION_CREDENTIALS: join(dir, 'missing-adc.json'),
    USERPROFILE: home,
    HOME: home,
    LOCALAPPDATA: programs,
    ProgramFiles: programs,
    'ProgramFiles(x86)': programs,
    PATH: '',
  });
  try {
    await withServer(GMAIL_SERVER, env, async ({ call }) => {
      const started = await call('auth_login', { method: 'adc' });
      assert.match(started, /gcloud CLI is not installed/);
      const choice = await call('auth_login');
      assert.match(choice, /gcloud is not installed on this machine/);
      assert.match(choice, /method "oauth"/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('health of the cloud group shows an ADC login, and says when that login has no quota project', async () => {
  const dir = folder();
  try {
    const file = writeAdcFile(dir, { refresh: 'rt-cloud' });
    await withServer(CLOUD_SERVER, serverEnv(dir, { GOOGLE_APPLICATION_CREDENTIALS: file }), async ({ call }) => {
      const health = JSON.parse(await call('health'));
      assert.equal(health.group, 'cloud');
      assert.equal(health.login.loggedIn, true);
      assert.match(health.login.detail, /Application Default Credentials/);
      assert.match(health.login.detail, /set-quota-project/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
