// The service-account group (setup, validation, in-chat setup), the Maps API key, the plain-file secret store, and the
// `gsm protect` move into the operating system's store. The DPAPI tests run on Windows only; everything else runs on any
// platform. Every folder is temporary. No test calls Google, and no test touches the real token folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const GSM = join(REPO, 'gsm.mjs');
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const WINDOWS = process.platform === 'win32';

const { loadConfig } = await import(DIST('core/config.js'));
const { saveAccount } = await import(DIST('core/accounts.js'));
const secretFiles = await import(DIST('core/secret-files.js'));
const secretStore = await import(DIST('core/secret-store.js'));

const work = [];
function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-protect-'));
  work.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client.apps.googleusercontent.com', client_secret: 'test-client-secret' } }));
  return dir;
}

function cleanup() {
  for (const dir of work.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** A fake service account key: correct shape, fake key material. Google would refuse it; no test sends it anywhere. */
function fakeServiceKey(dir, { name = 'service-key', type = 'service_account', omitType = false, privateKey = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n', email = 'play-bot@test-project.iam.gserviceaccount.com' } = {}) {
  const file = join(dir, `${name}.json`);
  const body = { type, project_id: 'test-project', client_email: email, private_key: privateKey, private_key_id: 'abc123' };
  if (omitType) delete body.type;
  writeFileSync(file, JSON.stringify(body));
  return file;
}

function gsm(args, env, timeout = 120_000) {
  return spawnSync(process.execPath, [GSM, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout });
}

/**
 * The environment of a child process: its token folder is `dir`. The fake home is a subfolder of it, so the profile data
 * that PowerShell writes under the user folder (for the DPAPI helper) stays in the temporary folder.
 */
function tokenDirEnv(dir, extra = {}) {
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return { GSM_TOKEN_DIR: dir, APPDATA: join(home, 'AppData', 'Roaming'), HOME: home, USERPROFILE: home, GSM_NO_BROWSER: '1', ...extra };
}

async function withServer(serverFile, env, fn) {
  const child = spawn(process.execPath, [serverFile], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 90_000);
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

// ---- The service-account group

test('setup-service-account records the key by path, shows only the account, and --remove forgets it', () => {
  const dir = folder();
  try {
    const key = fakeServiceKey(dir);
    const env = tokenDirEnv(dir);
    const set = gsm(['setup-service-account', '--key-file', key], env);
    assert.equal(set.status, 0, set.stderr);
    assert.match(set.stdout, /Account: play-bot@test-project\.iam\.gserviceaccount\.com/);
    assert.ok(!set.stdout.includes('BEGIN PRIVATE KEY'), 'the key material is never printed');
    const record = JSON.parse(readFileSync(join(dir, 'service-account.json'), 'utf8'));
    assert.equal(record.keyFile, key, 'the key is referenced by its path');
    assert.equal(record.clientEmail, 'play-bot@test-project.iam.gserviceaccount.com');
    assert.ok(!readFileSync(join(dir, 'service-account.json'), 'utf8').includes('BEGIN PRIVATE KEY'), 'the record holds no key material');

    const removed = gsm(['setup-service-account', '--remove'], env);
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /Removed the service account setup/);
    assert.ok(existsSync(key), 'the key file itself is never deleted');
    assert.equal(existsSync(join(dir, 'service-account.json')), false);
  } finally {
    cleanup();
  }
});

test('setup-service-account refuses files that are not a service account key, and names the problem without its content', () => {
  const dir = folder();
  try {
    const env = tokenDirEnv(dir);
    const cases = [
      [fakeServiceKey(dir, { name: 'user-login', type: 'authorized_user' }), /not a service account key/],
      [fakeServiceKey(dir, { name: 'no-type', omitType: true }), /no type/],
      [fakeServiceKey(dir, { name: 'no-private', privateKey: '' }), /without a private key/],
      [join(dir, 'missing.json'), /key file not found/],
    ];
    for (const [file, pattern] of cases) {
      const res = gsm(['setup-service-account', '--key-file', file], env);
      // A refused key is a usage error (exit code 2), and the message names the problem.
      assert.equal(res.status, 2, `${file} should be refused`);
      assert.match(res.stderr + res.stdout, pattern);
      assert.ok(!(res.stderr + res.stdout).includes('BEGIN PRIVATE KEY'), 'the key material is never shown');
    }
    const notJson = join(dir, 'not-json.json');
    writeFileSync(notJson, '{ this is not json');
    const res = gsm(['setup-service-account', '--key-file', notJson], env);
    assert.equal(res.status, 2);
    assert.match(res.stderr + res.stdout, /not valid JSON/);
    assert.equal(existsSync(join(dir, 'service-account.json')), false, 'a refused key is never recorded');
  } finally {
    cleanup();
  }
});

test('the service-account group counts as logged in once its key is set up, and its server loads the tools', async () => {
  const dir = folder();
  try {
    const key = fakeServiceKey(dir);
    const env = tokenDirEnv(dir);
    const plugin = join(REPO, 'plugins', 'gplay', 'servers', 'gplay.mjs');
    await withServer(plugin, env, async ({ call }) => {
      const before = JSON.parse(await call('health'));
      assert.equal(before.login.kind, 'service-account');
      assert.equal(before.login.loggedIn, false);
      assert.equal(before.login.next, 'auth_setup_service_account');

      const set = await call('auth_setup_service_account', { path: key });
      assert.match(set, /Saved service account setup/);
      assert.match(set, /auth_status/);
      const status = await call('auth_status');
      assert.match(status, /Set up for "service-account" with a service account key/);
      const after = JSON.parse(await call('health'));
      assert.equal(after.login.loggedIn, true);
      assert.equal(after.login.account, 'play-bot@test-project.iam.gserviceaccount.com');

      const removed = await call('auth_setup_service_account', { remove: true });
      assert.match(removed, /Removed the service account setup/);
    });
  } finally {
    cleanup();
  }
});

test('a missing service account key gives a message that says how to set it up', async () => {
  const dir = folder();
  try {
    const plugin = join(REPO, 'plugins', 'gmerchant', 'servers', 'gmerchant.mjs');
    await withServer(plugin, tokenDirEnv(dir), async ({ call }) => {
      const text = await call('auth_setup_service_account', {});
      assert.match(text, /Give the full path of the service account JSON key file/);
    });
  } finally {
    cleanup();
  }
});

// ---- The Maps API key (apikey group)

test('the Maps server takes the API key, with no OAuth login', async () => {
  const dir = folder();
  try {
    const plugin = join(REPO, 'plugins', 'gmaps', 'servers', 'gmaps.mjs');
    await withServer(plugin, tokenDirEnv(dir, { GSM_API_KEY: 'fake-maps-key-for-test' }), async ({ call }) => {
      const health = JSON.parse(await call('health'));
      assert.equal(health.login.kind, 'api-key');
      assert.equal(health.login.loggedIn, true);
    });
  } finally {
    cleanup();
  }
});

// ---- The plain-file secret store (the default)

test('the plain-file store keeps secrets in their files, mode 0600, and records no names', () => {
  const dir = folder();
  try {
    const cfg = { tokenDir: dir };
    const file = join(dir, 'workspace-user.someone_example.com.token.json');
    secretFiles.writeSecretText(cfg, file, '{"refresh_token":"rt-plain"}');
    assert.equal(readFileSync(file, 'utf8'), '{"refresh_token":"rt-plain"}');
    assert.equal(secretFiles.readSecretText(cfg, file), '{"refresh_token":"rt-plain"}');
    assert.equal(secretFiles.storeFor(dir, {}), 'file');
    assert.deepEqual(secretFiles.storedSecretNames(dir), [], 'the file store keeps no manifest');
    assert.equal(secretFiles.secretFileExists(cfg, file), true);
    assert.equal(secretFiles.removeSecretFile(cfg, file), true);
    assert.equal(existsSync(file), false);
    assert.equal(secretFiles.removeSecretFile(cfg, file), false, 'a second removal finds nothing');
  } finally {
    cleanup();
  }
});

test('secret names are checked, so a name cannot leave the token folder', () => {
  const dir = folder();
  try {
    const cfg = { tokenDir: dir };
    const bad = join(dir, 'bad name.token.json');
    // The name check runs before any backend is used, so the file backend shows it on every platform.
    assert.throws(() => secretStore.putSecretSync('file', dir, '../escape', 'x'), /name|invalid|must/i);
    assert.throws(() => secretStore.putSecretSync('file', dir, 'a/b', 'x'), /name|invalid|must/i);
    // A name with a space is refused by the OS stores, so `protect` reports that file and keeps it plain.
    assert.equal(secretFiles.secretNameOf(bad), 'bad name.token');
    assert.equal(secretFiles.secretFileExists(cfg, join(dir, 'missing.json')), false);
  } finally {
    cleanup();
  }
});

// ---- gsm protect (Windows, with the real DPAPI store)

function saveTwoSecrets(dir) {
  const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
  saveAccount('workspace-user', 'first@example.com', { refresh_token: 'rt-protect-test', scope: GMAIL_SCOPE }, cfg);
  writeFileSync(join(dir, 'apikey.json'), JSON.stringify({ apiKey: 'fake-api-key-protect-test', savedAt: new Date().toISOString() }));
  return cfg;
}

test('gsm protect moves the secrets into the DPAPI store and back, with no plain copies left in between', { skip: !WINDOWS && 'DPAPI is Windows only' }, () => {
  const dir = folder();
  try {
    const env = tokenDirEnv(dir);
    saveTwoSecrets(dir);
    const originalToken = JSON.parse(readFileSync(join(dir, 'workspace-user.first_example.com.token.json'), 'utf8'));

    const protectRes = gsm(['protect'], env);
    assert.equal(protectRes.status, 0, protectRes.stdout + protectRes.stderr);
    assert.match(protectRes.stdout, /Protected: 3 secret\(s\) are in the dpapi store/);
    assert.equal(existsSync(join(dir, 'client_secret.json')), false, 'no plain client file is left');
    assert.equal(existsSync(join(dir, 'apikey.json')), false, 'no plain API key file is left');
    assert.equal(existsSync(join(dir, 'workspace-user.first_example.com.token.json')), false, 'no plain token file is left');
    assert.equal(JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).backend, 'dpapi');
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8')).names.sort(),
      ['apikey', 'client_secret', 'workspace-user.first_example.com.token'],
    );
    assert.ok(!readdirSync(dir).some((n) => n.endsWith('.json') && n.includes('rt-protect-test')), 'no plain file mentions the token');

    // The tokens are read from the store by the suite itself, in a fresh process.
    const readBack = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `const { loadUserTokens } = await import(${JSON.stringify(DIST('core/auth.js'))}); const { loadConfig } = await import(${JSON.stringify(DIST('core/config.js'))}); console.log(JSON.stringify(loadUserTokens('workspace-user', loadConfig())));`],
      { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120_000 },
    );
    assert.equal(readBack.status, 0, readBack.stderr);
    assert.equal(JSON.parse(readBack.stdout.trim()).refresh_token, 'rt-protect-test');

    const again = gsm(['protect'], env);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /already in the dpapi store/);

    const back = gsm(['protect', '--off'], env);
    assert.equal(back.status, 0, back.stdout + back.stderr);
    assert.match(back.stdout, /back to plain files \(3 secret\(s\)\)/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'workspace-user.first_example.com.token.json'), 'utf8')), originalToken);
    assert.equal(JSON.parse(readFileSync(join(dir, 'store.json'), 'utf8')).backend, 'file');
    assert.equal(existsSync(join(dir, 'secrets.json')), false, 'the index is removed once nothing is stored');
  } finally {
    cleanup();
  }
});

test('gsm protect changes nothing when one value cannot be stored, and rolls back the values it wrote', { skip: !WINDOWS && 'DPAPI is Windows only' }, () => {
  const dir = folder();
  try {
    const env = tokenDirEnv(dir);
    saveTwoSecrets(dir);
    // A file whose name the store refuses (a space is not a secret name). The valid files are written first, then undone.
    const bad = join(dir, 'bad name.token.json');
    writeFileSync(bad, JSON.stringify({ refresh_token: 'rt-bad' }));
    const before = readdirSync(dir).sort();

    const res = gsm(['protect'], env);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /could not move bad name\.token\.json/);
    assert.match(res.stdout, /Nothing was changed/);
    assert.deepEqual(readdirSync(dir).sort(), before, 'every plain file is back where it was');
    assert.equal(existsSync(join(dir, 'store.json')), false, 'the store choice is not changed');
    assert.equal(existsSync(join(dir, 'secrets.json')), false, 'nothing is listed as stored');
    assert.equal(readdirSync(dir).some((n) => n.endsWith('.secret')), false, 'no value is left in the store');
  } finally {
    cleanup();
  }
});

test('gsm protect without an OS store on the machine says so and keeps the plain files', () => {
  const dir = folder();
  try {
    const env = tokenDirEnv(dir, { PATH: '' });
    saveTwoSecrets(dir);
    const res = gsm(['protect', '--backend', 'keychain'], { ...env, PATH: '' });
    if (WINDOWS) {
      // On Windows the keychain backend is not available: the explicit choice is refused, with the reason.
      assert.notEqual(res.status, 0);
      assert.match(res.stderr + res.stdout, /keychain|not available|GSM_TOKEN_STORE=file/i);
    }
    assert.equal(existsSync(join(dir, 'client_secret.json')), true, 'the plain files stay');
  } finally {
    cleanup();
  }
});
