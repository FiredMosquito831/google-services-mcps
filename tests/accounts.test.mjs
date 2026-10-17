// Several Google accounts per group: the registry (the default, promotion when one is removed, a token file from before
// accounts existed), the account a call uses, the account tools of a server, and the account commands of the CLI.
// No test calls Google: the clients are created but never used, and every token folder is temporary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const { saveAccount, listAccounts, defaultAccount, accountTokenFile, removeAccount, setDefaultAccount, slugOf } = await import(
  DIST('core/accounts.js')
);
const { loadUserTokens, getAuthClient, UnknownAccountError } = await import(DIST('core/auth.js'));
const { withAccount } = await import(DIST('core/account-context.js'));
const { loadConfig } = await import(DIST('core/config.js'));

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-accounts-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client-id', client_secret: 'test-secret' } }));
  return dir;
}

const tokens = (name) => ({ refresh_token: `rt-${name}`, scope: SCOPE, account: `${name}@example.com` });

test('the first account of a group is its default; a second one does not take the default', () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    assert.equal(defaultAccount('workspace-user', cfg), 'first@example.com');
    const listed = listAccounts('workspace-user', cfg);
    assert.deepEqual(
      listed.map((account) => [account.email, account.default]),
      [
        ['first@example.com', true],
        ['second@example.com', false],
      ],
    );
    // Each account has its own token file, named after its address.
    assert.notEqual(accountTokenFile('workspace-user', 'first@example.com', cfg), accountTokenFile('workspace-user', 'second@example.com', cfg));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the default can change, and removing the default promotes the one account left', () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    setDefaultAccount('workspace-user', 'second@example.com', cfg);
    assert.equal(defaultAccount('workspace-user', cfg), 'second@example.com');
    assert.throws(() => setDefaultAccount('workspace-user', 'nobody@example.com', cfg), /no signed-in account/);

    assert.equal(removeAccount('workspace-user', 'second@example.com', cfg), true);
    assert.equal(defaultAccount('workspace-user', cfg), 'first@example.com', 'the one account left becomes the default');
    assert.equal(removeAccount('workspace-user', 'second@example.com', cfg), false, 'a second removal finds nothing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a token file from before accounts existed is the default account of its group', () => {
  const dir = folder();
  try {
    writeFileSync(join(dir, 'workspace-user.token.json'), JSON.stringify(tokens('legacy')));
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    assert.equal(defaultAccount('workspace-user', cfg), 'legacy@example.com');
    assert.equal(loadUserTokens('workspace-user', cfg)?.refresh_token, 'rt-legacy');
    // A new account is added next to it, and the old one stays the default.
    saveAccount('workspace-user', 'new@example.com', tokens('new'), cfg);
    assert.equal(defaultAccount('workspace-user', cfg), 'legacy@example.com');
    assert.equal(accountTokenFile('workspace-user', 'legacy@example.com', cfg), join(dir, 'workspace-user.token.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a call names its account; without one the default is used; an account not signed in is refused', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    assert.equal(loadUserTokens('workspace-user', cfg)?.refresh_token, 'rt-first');
    await withAccount('second@example.com', async () => {
      assert.equal(loadUserTokens('workspace-user', cfg)?.refresh_token, 'rt-second');
    });
    await withAccount('nobody@example.com', async () => {
      assert.throws(() => loadUserTokens('workspace-user', cfg), UnknownAccountError);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the client of a call is the one of the account it names, and it keeps its own tokens', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    const first = await withAccount('first@example.com', () => getAuthClient('workspace-user', cfg));
    const second = await withAccount('second@example.com', () => getAuthClient('workspace-user', cfg));
    assert.equal(first.credentials.refresh_token, 'rt-first');
    assert.equal(second.credentials.refresh_token, 'rt-second');
    assert.notEqual(first, second);
    // The same account gets the same client back, so a refreshed token is used from then on.
    assert.equal(await withAccount('first@example.com', () => getAuthClient('workspace-user', cfg)), first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an account address becomes a safe file name', () => {
  assert.equal(slugOf('Person.Name+work@Example.com'), 'person.name_work_example.com');
});

/** Starts a plugin server with a temporary token folder, and talks to it over stdio. */
async function withServer(serverFile, tokenDir, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1' };
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

test('the Google tools take an account argument; the account tools list, change and remove accounts', async () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    await withServer(join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs'), dir, async ({ request, call }) => {
      const tools = (await request('tools/list', {})).result.tools;
      const search = tools.find((tool) => tool.name === 'gmail_search');
      assert.ok(search, 'the Gmail tools are listed once an account is signed in');
      assert.ok(search.inputSchema.properties.account, 'the account argument is part of the tool schema');

      const listed = JSON.parse(await call('accounts_list'));
      assert.equal(listed.default, 'first@example.com');
      assert.equal(listed.accounts.length, 2);

      assert.match(await call('account_set_default', { email: 'second@example.com' }), /is now second@example.com/);
      assert.equal(JSON.parse(await call('accounts_list')).default, 'second@example.com');

      const refused = await call('gmail_search', { query: 'x', account: 'nobody@example.com' });
      assert.match(refused, /No signed-in account "nobody@example.com" for workspace-user/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the account commands: accounts lists, accounts default changes the default, logout removes only the named account', () => {
  const dir = folder();
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', tokens('first'), cfg);
    saveAccount('workspace-user', 'second@example.com', tokens('second'), cfg);
    const env = { ...process.env, GSM_TOKEN_DIR: dir };
    const gsm = (...args) => spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), ...args], { env, encoding: 'utf8', timeout: 120000 });

    const listed = gsm('accounts', '--group', 'workspace-user');
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /first@example\.com {2}\(default\)/);
    assert.match(listed.stdout, /second@example\.com/);

    const changed = gsm('accounts', 'default', 'workspace-user', 'second@example.com');
    assert.equal(changed.status, 0, changed.stderr);
    assert.equal(defaultAccount('workspace-user', cfg), 'second@example.com');

    const removed = gsm('logout', 'workspace-user', '--account', 'first@example.com', '--local-only');
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /removed from this machine/);
    assert.deepEqual(
      listAccounts('workspace-user', cfg).map((account) => account.email),
      ['second@example.com'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

