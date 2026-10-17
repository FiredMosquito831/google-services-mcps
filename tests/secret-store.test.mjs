// The secret store: the file backend (round trip, modes, names), the choice of backend (GSM_TOKEN_STORE), the program
// calls for DPAPI, the Keychain and libsecret (checked as data, so they run on any platform), and on Windows a real
// DPAPI round trip. Every folder is temporary. No test starts the Keychain or libsecret, and no test touches the real
// token folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const {
  backendFor,
  buildCommand,
  getSecret,
  getSecretSync,
  putSecret,
  putSecretSync,
  deleteSecret,
  deleteSecretSync,
  resolveBackend,
  readStoreChoiceSync,
  writeStoreChoice,
} = await import(DIST('core/secret-store.js'));

const SERVICE = 'google-services-mcps';
const WIN = process.platform === 'win32';

function temp(label) {
  return mkdtempSync(join(tmpdir(), `gsm-secret-${label}-`));
}

async function withTemp(label, fn) {
  const dir = temp(label);
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A PATH with one empty file per program name, so the store finds the program but never runs it. */
function fakePath(root, programs) {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const name of programs) writeFileSync(join(bin, name), '');
  return bin;
}

// ---- file backend ----

test('file backend: put, get, overwrite and delete round trip', async () => {
  await withTemp('file', async (dir) => {
    const name = 'workspace-user.first_example.com.refresh';
    await putSecret('file', dir, name, 'refresh-1');
    assert.equal(await getSecret('file', dir, name), 'refresh-1');
    assert.equal(readFileSync(join(dir, `${name}.secret`), 'utf8'), 'refresh-1');
    await putSecret('file', dir, name, 'refresh-2');
    assert.equal(await getSecret('file', dir, name), 'refresh-2');
    await deleteSecret('file', dir, name);
    assert.equal(await getSecret('file', dir, name), undefined);
    await deleteSecret('file', dir, name); // a second delete of a missing secret is not an error
  });
});

test('file backend: a missing secret is undefined', async () => {
  await withTemp('missing', async (dir) => {
    assert.equal(await getSecret('file', dir, 'client_secret'), undefined);
  });
});

test('file backend: the token folder is created with mode 0700 and the file with 0600', { skip: WIN && 'POSIX modes only' }, async () => {
  await withTemp('modes', async (root) => {
    const dir = join(root, 'tokens');
    await putSecret('file', dir, 'client_secret', 'value');
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(statSync(join(dir, 'client_secret.secret')).mode & 0o777, 0o600);
  });
});

test('names are validated before anything is written or read', async () => {
  await withTemp('names', async (dir) => {
    const bad = ['../x', 'a/b', 'a\\b', '', 'a b', '.hidden', '..', 'CON', 'nul.txt', 'x'.repeat(201)];
    for (const name of bad) {
      await assert.rejects(() => putSecret('file', dir, name, 'v'), /invalid secret name/, `put ${JSON.stringify(name)}`);
      await assert.rejects(() => getSecret('file', dir, name), /invalid secret name/, `get ${JSON.stringify(name)}`);
      await assert.rejects(() => deleteSecret('file', dir, name), /invalid secret name/, `delete ${JSON.stringify(name)}`);
    }
    assert.deepEqual(readdirNames(dir), []);
    for (const name of ['client_secret', 'workspace-user.first_example.com.refresh', 'a1']) {
      await putSecret('file', dir, name, 'v');
      assert.equal(await getSecret('file', dir, name), 'v');
    }
  });
});

/** The entries of a folder, or none when the folder does not exist. */
function readdirNames(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}

test('an empty value is refused', async () => {
  await withTemp('empty', async (dir) => {
    await assert.rejects(() => putSecret('file', dir, 'client_secret', ''), /non-empty/);
  });
});

// ---- backend choice ----

test('GSM_TOKEN_STORE unset or auto picks the backend of this platform, and falls back to file', () => {
  const empty = temp('choice');
  try {
    assert.equal(backendFor('/unused', { PATH: empty }, 'win32'), 'file');
    assert.equal(backendFor('/unused', { PATH: empty }, 'darwin'), 'file');
    assert.equal(backendFor('/unused', { PATH: empty }, 'linux'), 'file');
    assert.equal(backendFor('/unused', { PATH: empty, GSM_TOKEN_STORE: 'auto' }, 'freebsd'), 'file');
    assert.equal(backendFor('/unused', { PATH: empty, GSM_TOKEN_STORE: '' }, 'linux'), 'file');
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('auto picks the native backend when its program is on PATH', () => {
  const root = temp('auto');
  try {
    assert.equal(backendFor('/unused', { PATH: fakePath(join(root, 'w'), ['powershell.exe']) }, 'win32'), 'dpapi');
    assert.equal(backendFor('/unused', { PATH: fakePath(join(root, 'm'), ['security']) }, 'darwin'), 'keychain');
    assert.equal(backendFor('/unused', { PATH: fakePath(join(root, 'l'), ['secret-tool']) }, 'linux'), 'secret-service');
    // The program of another platform does not count.
    assert.equal(backendFor('/unused', { PATH: fakePath(join(root, 'x'), ['security']) }, 'linux'), 'file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('each explicit GSM_TOKEN_STORE value is honoured when its program is there', () => {
  const root = temp('explicit');
  try {
    const path = fakePath(root, ['powershell.exe', 'security', 'secret-tool']);
    assert.equal(backendFor('/unused', { GSM_TOKEN_STORE: 'file', PATH: path }, 'linux'), 'file');
    assert.equal(backendFor('/unused', { GSM_TOKEN_STORE: 'dpapi', PATH: path }, 'win32'), 'dpapi');
    assert.equal(backendFor('/unused', { GSM_TOKEN_STORE: 'keychain', PATH: path }, 'darwin'), 'keychain');
    assert.equal(backendFor('/unused', { GSM_TOKEN_STORE: 'secret-service', PATH: path }, 'linux'), 'secret-service');
    assert.equal(backendFor('/unused', { GSM_TOKEN_STORE: '  DPAPI ', PATH: path }, 'win32'), 'dpapi');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown GSM_TOKEN_STORE value throws', () => {
  assert.throws(() => backendFor('/unused', { GSM_TOKEN_STORE: 'vault' }, 'linux'), /GSM_TOKEN_STORE must be one of auto, dpapi, keychain, secret-service, file/);
});

test('an explicit backend on the wrong platform throws and names the platform and the file fallback', () => {
  const cases = [
    ['keychain', 'win32', /macOS/],
    ['dpapi', 'linux', /Windows/],
    ['secret-service', 'darwin', /Linux/],
  ];
  for (const [backend, platform, what] of cases) {
    assert.throws(
      () => backendFor('/unused', { GSM_TOKEN_STORE: backend, PATH: '' }, platform),
      (err) => what.test(err.message) && err.message.includes(platform) && err.message.includes('GSM_TOKEN_STORE=file'),
      backend,
    );
  }
});

test('an explicit backend whose program is missing throws; it never falls back', () => {
  const empty = temp('missing-program');
  try {
    assert.throws(() => backendFor('/unused', { GSM_TOKEN_STORE: 'dpapi', PATH: empty }, 'win32'), /powershell\.exe/);
    assert.throws(() => backendFor('/unused', { GSM_TOKEN_STORE: 'keychain', PATH: empty }, 'darwin'), /security/);
    assert.throws(() => backendFor('/unused', { GSM_TOKEN_STORE: 'secret-service', PATH: empty }, 'linux'), /secret-tool/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('an explicit native backend that this platform lacks is refused by get, put and delete, without starting anything', async () => {
  await withTemp('unavailable', async (dir) => {
    const other = process.platform === 'darwin' ? 'dpapi' : 'keychain';
    await assert.rejects(() => putSecret(other, dir, 'client_secret', 'v'), /GSM_TOKEN_STORE=file/);
    await assert.rejects(() => getSecret(other, dir, 'client_secret'), /GSM_TOKEN_STORE=file/);
    await assert.rejects(() => deleteSecret(other, dir, 'client_secret'), /GSM_TOKEN_STORE=file/);
    assert.deepEqual(readdirNames(dir), []);
  });
});

test('deleting a DPAPI secret that is not there is a no-op on any platform', async () => {
  await withTemp('dpapi-delete', async (dir) => {
    await deleteSecret('dpapi', dir, 'client_secret');
    assert.deepEqual(readdirNames(dir), []);
  });
});

// ---- program calls (data only; nothing is started) ----

test('DPAPI: the value reaches PowerShell on stdin as base64, never in argv', () => {
  const value = 'p@ss "quoted" with spaces\nsecond line';
  const plan = buildCommand('dpapi', 'put', 'client_secret', value);
  assert.equal(plan.file, 'powershell.exe');
  assert.deepEqual(plan.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  const argv = plan.args.join('\n');
  assert.ok(!argv.includes(value));
  assert.ok(!argv.includes(Buffer.from(value).toString('base64')));
  assert.ok(!argv.includes(Buffer.from(value).toString('hex')));
  assert.equal(Buffer.from(plan.stdin, 'base64').toString('utf8'), value);
  assert.ok(plan.args[3].includes('ProtectedData]::Protect('));
  assert.ok(plan.args[3].includes('CurrentUser'));
  assert.ok(plan.args[3].includes('System.Security'));
  assert.ok(!plan.args[3].includes('"'), 'the script must not contain double quotes');
});

test('DPAPI: a get sends the ciphertext on stdin and unprotects it', () => {
  const plan = buildCommand('dpapi', 'get', 'client_secret', 'Y2lwaGVy');
  assert.equal(plan.stdin, 'Y2lwaGVy');
  assert.ok(plan.args[3].includes('ProtectedData]::Unprotect('));
});

test('Keychain: put sends a security -i command on stdin with the value as hex, never in argv', () => {
  const value = `tok "x" 'y' \\ spaces`;
  const plan = buildCommand('keychain', 'put', 'client_secret', value);
  assert.equal(plan.file, 'security');
  assert.deepEqual(plan.args, ['-i']);
  const lines = plan.stdin.split('\n');
  assert.equal(lines.length, 2, 'one command line and the final line break');
  assert.equal(lines[1], '');
  const hex = lines[0].split(' -X ')[1];
  assert.equal(lines[0], `add-generic-password -U -s ${SERVICE} -a client_secret -X ${hex}`);
  assert.equal(Buffer.from(hex, 'hex').toString('utf8'), value);
  assert.ok(!plan.args.join(' ').includes(hex));
});

test('Keychain: get and delete arguments', () => {
  assert.deepEqual(buildCommand('keychain', 'get', 'client_secret').args, [
    'find-generic-password',
    '-s',
    SERVICE,
    '-a',
    'client_secret',
    '-w',
  ]);
  assert.deepEqual(buildCommand('keychain', 'delete', 'client_secret').args, [
    'delete-generic-password',
    '-s',
    SERVICE,
    '-a',
    'client_secret',
  ]);
});

test('libsecret: put sends the value on stdin; get and delete arguments', () => {
  const value = 'secret "value" with spaces';
  const put = buildCommand('secret-service', 'put', 'client_secret', value);
  assert.equal(put.file, 'secret-tool');
  assert.equal(put.stdin, value);
  assert.deepEqual(put.args, ['store', `--label=${SERVICE} client_secret`, 'service', SERVICE, 'account', 'client_secret']);
  assert.ok(!put.args.join(' ').includes(value));
  assert.deepEqual(buildCommand('secret-service', 'get', 'client_secret').args, ['lookup', 'service', SERVICE, 'account', 'client_secret']);
  assert.deepEqual(buildCommand('secret-service', 'delete', 'client_secret').args, ['clear', 'service', SERVICE, 'account', 'client_secret']);
});

test('Keychain and libsecret refuse values with a line break or a tab, and names that fail validation', () => {
  assert.throws(() => buildCommand('keychain', 'put', 'client_secret', 'a\nb'), /single-line/);
  assert.throws(() => buildCommand('secret-service', 'put', 'client_secret', 'a\tb'), /single-line/);
  assert.throws(() => buildCommand('keychain', 'get', '../x'), /invalid secret name/);
  assert.throws(() => buildCommand('dpapi', 'delete', 'client_secret'), /no delete command/);
});

// ---- real DPAPI (Windows only) ----

test('DPAPI round trip on Windows: the value comes back, and the file holds no plaintext', { skip: !WIN && 'Windows only' }, async () => {
  await withTemp('dpapi', async (dir) => {
    const name = 'client_secret';
    const value = `quotes "double" and 'single', spaces  and a newline\nsecond line`;
    await putSecret('dpapi', dir, name, value);

    const file = join(dir, `${name}.secret`);
    assert.ok(existsSync(file));
    const stored = readFileSync(file, 'utf8');
    assert.ok(!stored.includes('second line'));
    assert.ok(!stored.includes(Buffer.from(value).toString('base64')));
    assert.ok(!Buffer.from(stored.trim(), 'base64').toString('utf8').includes('second line'));

    assert.equal(await getSecret('dpapi', dir, name), value);
    await putSecret('dpapi', dir, name, 'replaced');
    assert.equal(await getSecret('dpapi', dir, name), 'replaced');

    await deleteSecret('dpapi', dir, name);
    assert.equal(existsSync(file), false);
    assert.equal(await getSecret('dpapi', dir, name), undefined);
  });
});

test('DPAPI on Windows: a file that is not DPAPI ciphertext throws, and the error holds no value', { skip: !WIN && 'Windows only' }, async () => {
  await withTemp('dpapi-bad', async (dir) => {
    writeFileSync(join(dir, 'client_secret.secret'), 'plain-value-xyz-123');
    await assert.rejects(
      () => getSecret('dpapi', dir, 'client_secret'),
      (err) => /DPAPI/.test(err.message) && !err.message.includes('plain-value-xyz-123'),
    );
    assert.throws(
      () => getSecretSync('dpapi', dir, 'client_secret'),
      (err) => /DPAPI/.test(err.message) && !err.message.includes('plain-value-xyz-123'),
    );
  });
});

function withTempSync(label, fn) {
  const dir = temp(label);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const storeFile = (dir) => join(dir, 'store.json');

// ---- sync variants ----

test('file backend, sync: put, get, overwrite and delete round trip', () => {
  withTempSync('file-sync', (dir) => {
    const name = 'workspace-user.first_example.com.refresh';
    putSecretSync('file', dir, name, 'refresh-1');
    assert.equal(getSecretSync('file', dir, name), 'refresh-1');
    assert.equal(readFileSync(join(dir, `${name}.secret`), 'utf8'), 'refresh-1');
    putSecretSync('file', dir, name, 'refresh-2');
    assert.equal(getSecretSync('file', dir, name), 'refresh-2');
    deleteSecretSync('file', dir, name);
    assert.equal(getSecretSync('file', dir, name), undefined);
    deleteSecretSync('file', dir, name);
  });
});

test('sync: invalid names are rejected before anything is written or read', () => {
  withTempSync('names-sync', (dir) => {
    for (const name of ['../x', 'a/b', '', 'a b', 'CON']) {
      assert.throws(() => putSecretSync('file', dir, name, 'v'), /invalid secret name/, `put ${JSON.stringify(name)}`);
      assert.throws(() => getSecretSync('file', dir, name), /invalid secret name/, `get ${JSON.stringify(name)}`);
      assert.throws(() => deleteSecretSync('file', dir, name), /invalid secret name/, `delete ${JSON.stringify(name)}`);
    }
    assert.deepEqual(readdirNames(dir), []);
  });
});

test('sync: a native backend this platform lacks is refused without starting anything', () => {
  withTempSync('unavailable-sync', (dir) => {
    const other = process.platform === 'darwin' ? 'dpapi' : 'keychain';
    assert.throws(() => putSecretSync(other, dir, 'client_secret', 'v'), /GSM_TOKEN_STORE=file/);
    assert.throws(() => getSecretSync(other, dir, 'client_secret'), /GSM_TOKEN_STORE=file/);
    assert.throws(() => deleteSecretSync(other, dir, 'client_secret'), /GSM_TOKEN_STORE=file/);
    assert.deepEqual(readdirNames(dir), []);
  });
});

test('sync: deleting a DPAPI secret that is not there is a no-op on any platform', () => {
  withTempSync('dpapi-delete-sync', (dir) => {
    deleteSecretSync('dpapi', dir, 'client_secret');
    assert.deepEqual(readdirNames(dir), []);
  });
});

test('DPAPI round trip on Windows, sync: the value comes back, the file holds no plaintext, delete removes it', { skip: !WIN && 'Windows only' }, () => {
  withTempSync('dpapi-sync', (dir) => {
    const name = 'client_secret';
    const value = `quotes "double" and 'single', spaces  and a newline\nsecond line`;
    putSecretSync('dpapi', dir, name, value);
    const stored = readFileSync(join(dir, `${name}.secret`), 'utf8');
    assert.ok(!stored.includes('second line'));
    assert.ok(!Buffer.from(stored.trim(), 'base64').toString('utf8').includes('second line'));
    assert.equal(getSecretSync('dpapi', dir, name), value);
    deleteSecretSync('dpapi', dir, name);
    assert.equal(existsSync(join(dir, `${name}.secret`)), false);
    assert.equal(getSecretSync('dpapi', dir, name), undefined);
  });
});

test('DPAPI on Windows: the sync and async forms read each other\'s writes', { skip: !WIN && 'Windows only' }, async () => {
  await withTemp('dpapi-cross', async (dir) => {
    const value = 'cross "check"\nline two';
    putSecretSync('dpapi', dir, 'client_secret', value);
    assert.equal(await getSecret('dpapi', dir, 'client_secret'), value);
    await putSecret('dpapi', dir, 'client_secret', 'other');
    assert.equal(getSecretSync('dpapi', dir, 'client_secret'), 'other');
    await deleteSecret('dpapi', dir, 'client_secret');
    assert.equal(getSecretSync('dpapi', dir, 'client_secret'), undefined);
  });
});

// ---- store.json ----

test('store.json: a missing file reads as no choice, and resolveBackend gives file', () => {
  withTempSync('store-missing', (dir) => {
    assert.equal(readStoreChoiceSync(dir), undefined);
    assert.equal(resolveBackend(dir, {}, 'linux'), 'file');
  });
});

test('store.json: writeStoreChoice writes {"backend": ...} with mode 0600, and it reads back', () => {
  withTempSync('store-write', (root) => {
    const dir = join(root, 'tokens');
    writeStoreChoice(dir, 'file');
    assert.deepEqual(JSON.parse(readFileSync(storeFile(dir), 'utf8')), { backend: 'file' });
    assert.equal(readStoreChoiceSync(dir), 'file');
    if (!WIN) assert.equal(statSync(storeFile(dir)).mode & 0o777, 0o600);
    writeStoreChoice(dir, 'file');
    assert.equal(readStoreChoiceSync(dir), 'file');
  });
});

test('store.json on Windows: a DPAPI choice is written and read back', { skip: !WIN && 'Windows only' }, () => {
  withTempSync('store-dpapi', (dir) => {
    writeStoreChoice(dir, 'dpapi');
    assert.equal(readStoreChoiceSync(dir), 'dpapi');
  });
});

test('store.json: a backend this platform cannot use, a name that is not a backend, or auto is not written', () => {
  withTempSync('store-refuse', (dir) => {
    const other = process.platform === 'darwin' ? 'dpapi' : 'keychain';
    assert.throws(() => writeStoreChoice(dir, other), /GSM_TOKEN_STORE=file/);
    assert.throws(() => writeStoreChoice(dir, 'auto'), /must be one of/);
    assert.throws(() => writeStoreChoice(dir, 'vault'), /must be one of/);
    assert.equal(existsSync(storeFile(dir)), false);
  });
});

test('store.json: invalid JSON, a wrong shape, an unknown or auto backend name read as no choice, without throwing', () => {
  const cases = [
    '{not json',
    '',
    '{"backend":"vault"}',
    '{"backend":"auto"}',
    '{"backend":1}',
    '{"backend":null}',
    '{}',
    '["file"]',
    '"file"',
    'null',
    '{"backend":"file","extra":"x"}',
  ];
  withTempSync('store-invalid', (dir) => {
    for (const text of cases) {
      writeFileSync(storeFile(dir), text);
      assert.equal(readStoreChoiceSync(dir), undefined, JSON.stringify(text));
    }
    rmSync(storeFile(dir));
    mkdirSync(storeFile(dir));
    assert.equal(readStoreChoiceSync(dir), undefined, 'a folder named store.json');
  });
});

// ---- resolveBackend: GSM_TOKEN_STORE over store.json over the default ----

test('resolveBackend: nothing set gives file, even where auto would pick a native backend', () => {
  withTempSync('resolve-default', (root) => {
    const dir = join(root, 'tokens');
    assert.equal(resolveBackend(dir, { PATH: fakePath(join(root, 'w'), ['powershell.exe']) }, 'win32'), 'file');
    assert.equal(resolveBackend(dir, { PATH: fakePath(join(root, 'm'), ['security']) }, 'darwin'), 'file');
    assert.equal(resolveBackend(dir, { PATH: fakePath(join(root, 'l'), ['secret-tool']) }, 'linux'), 'file');
  });
});

test('resolveBackend: store.json is used when GSM_TOKEN_STORE is unset or empty', () => {
  withTempSync('resolve-store', (root) => {
    const dir = join(root, 'tokens');
    mkdirSync(dir);
    const PATH = fakePath(join(root, 'w'), ['powershell.exe']);
    writeFileSync(storeFile(dir), '{"backend":"dpapi"}');
    assert.equal(resolveBackend(dir, { PATH }, 'win32'), 'dpapi');
    assert.equal(resolveBackend(dir, { PATH, GSM_TOKEN_STORE: '   ' }, 'win32'), 'dpapi');
    writeFileSync(storeFile(dir), '{"backend":"file"}');
    assert.equal(resolveBackend(dir, {}, 'linux'), 'file');
  });
});

test('resolveBackend: GSM_TOKEN_STORE wins over store.json, even over an invalid store.json', () => {
  withTempSync('resolve-env', (root) => {
    const dir = join(root, 'tokens');
    mkdirSync(dir);
    const PATH = fakePath(join(root, 'w'), ['powershell.exe']);
    // store.json says file; the environment says auto, which picks DPAPI on Windows here.
    writeFileSync(storeFile(dir), '{"backend":"file"}');
    assert.equal(resolveBackend(dir, { PATH, GSM_TOKEN_STORE: 'auto' }, 'win32'), 'dpapi');
    writeFileSync(storeFile(dir), '{"backend":"dpapi"}');
    assert.equal(resolveBackend(dir, { PATH, GSM_TOKEN_STORE: 'file' }, 'win32'), 'file');
    assert.throws(() => resolveBackend(dir, { PATH, GSM_TOKEN_STORE: 'keychain' }, 'win32'), /macOS/);
    writeFileSync(storeFile(dir), '{"backend":"vault"}');
    assert.equal(resolveBackend(dir, { GSM_TOKEN_STORE: 'file' }, 'linux'), 'file');
  });
});

test('resolveBackend: a store.json choice this platform cannot use throws, and nothing else is tried', () => {
  withTempSync('resolve-unusable', (root) => {
    const dir = join(root, 'tokens');
    mkdirSync(dir);
    writeFileSync(storeFile(dir), '{"backend":"dpapi"}');
    assert.throws(() => resolveBackend(dir, { PATH: '' }, 'linux'), (err) => /selects dpapi/.test(err.message) && /Windows/.test(err.message));
    assert.throws(() => resolveBackend(dir, { PATH: fakePath(join(root, 'w'), ['powershell.exe']) }, 'linux'), /selects dpapi/);
  });
});

test('resolveBackend: an invalid store.json throws, and the message does not show its content', () => {
  withTempSync('resolve-invalid', (dir) => {
    writeFileSync(storeFile(dir), '{"backend":"vault","token":"TOPSECRET-VALUE"}');
    assert.throws(
      () => resolveBackend(dir, {}, 'linux'),
      (err) => /not a valid store choice/.test(err.message) && !err.message.includes('TOPSECRET-VALUE'),
    );
  });
});
