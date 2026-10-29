// Safe sign-out: Google's revocation ends an account's grant for every client of the project, so account_remove and
// gsm logout revoke only when no other group on this machine has the same account. The check reads accounts.json and
// file names only. No test calls Google: revocations go to a fake client, and every token folder is temporary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { saveAccount, accountTokenFile, otherGroupsWithAccount, listAccounts, UNKNOWN_ACCOUNT } = await import(DIST('core/accounts.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { runLogout } = await import(DIST('cli/credentials.js'));

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const tokens = (email, rt) => ({ refresh_token: rt, scope: SCOPE, account: email });

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-signout-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client-id', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }), env: { ...process.env, GSM_TOKEN_DIR: dir } };
}

/** A fake OAuth client that records what it was asked to revoke. */
function revoker() {
  const revoked = [];
  return {
    revoked,
    deps: {
      makeClient: () => ({
        setCredentials() {},
        async getAccessToken() {
          return { token: 'at' };
        },
        async getTokenInfo() {
          return {};
        },
        async revokeToken(token) {
          revoked.push(token);
          return {};
        },
      }),
    },
  };
}

function capture() {
  const lines = [];
  return { out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

test('otherGroupsWithAccount finds the same account in another group, by accounts.json and file names only', () => {
  const { dir, cfg } = folder();
  try {
    saveAccount('workspace-user', 'person@example.com', tokens('person@example.com', 'rt-1'), cfg);
    assert.deepEqual(otherGroupsWithAccount('person@example.com', 'workspace-user', cfg), [], 'its own group does not count');
    saveAccount('searchconsole', 'Person@Example.com', tokens('person@example.com', 'rt-2'), cfg);
    saveAccount('business', 'someone-else@example.com', tokens('someone-else@example.com', 'rt-3'), cfg);
    assert.deepEqual(otherGroupsWithAccount('person@example.com', 'workspace-user', cfg), ['searchconsole'], 'any case; another account does not count');
    // A login whose account was not recorded may be the same account.
    saveAccount('developer', UNKNOWN_ACCOUNT, { refresh_token: 'rt-4' }, cfg);
    assert.deepEqual(otherGroupsWithAccount('person@example.com', 'workspace-user', cfg), ['searchconsole', 'developer']);
    // A token file from before accounts.json existed: its account is unknown without reading it, so it counts.
    writeFileSync(join(dir, 'cloud.token.json'), JSON.stringify({ refresh_token: 'rt-5' }));
    assert.deepEqual(otherGroupsWithAccount('person@example.com', 'workspace-user', cfg), ['cloud', 'searchconsole', 'developer']);
    // An unnamed account counts as shared with any other group that has an account.
    assert.ok(otherGroupsWithAccount(UNKNOWN_ACCOUNT, 'developer', cfg).includes('business'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gsm logout does not revoke an account another group uses, removes only the local token, and says how to revoke everywhere', async () => {
  const { dir, cfg, env } = folder();
  try {
    saveAccount('workspace-user', 'person@example.com', tokens('person@example.com', 'rt-gmail'), cfg);
    saveAccount('searchconsole', 'person@example.com', tokens('person@example.com', 'rt-gsc'), cfg);
    const fake = revoker();
    const { out, text } = capture();
    assert.equal(await runLogout('workspace-user', out, { account: 'person@example.com', deps: fake.deps, env }), 0);
    assert.deepEqual(fake.revoked, [], 'nothing is revoked at Google');
    assert.match(text(), /workspace-user person@example\.com: not revoked at Google\. person@example\.com is also signed in here for searchconsole/);
    assert.match(text(), /logout workspace-user --account person@example\.com --revoke-all/);
    assert.deepEqual(listAccounts('workspace-user', cfg), [], 'the local token is removed');
    assert.ok(existsSync(accountTokenFile('searchconsole', 'person@example.com', cfg)), 'the other group keeps its token');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gsm logout --revoke-all revokes anyway and names the logins that stop working; an account no other group uses is revoked as before', async () => {
  const { dir, cfg, env } = folder();
  try {
    saveAccount('workspace-user', 'person@example.com', tokens('person@example.com', 'rt-gmail'), cfg);
    saveAccount('searchconsole', 'person@example.com', tokens('person@example.com', 'rt-gsc'), cfg);
    saveAccount('business', 'alone@example.com', tokens('alone@example.com', 'rt-ads'), cfg);

    const all = revoker();
    const first = capture();
    await runLogout('workspace-user', first.out, { account: 'person@example.com', revokeAll: true, deps: all.deps, env });
    assert.deepEqual(all.revoked, ['rt-gmail']);
    assert.match(first.text(), /--revoke-all: the logins of person@example\.com for searchconsole no longer work/);

    const alone = revoker();
    const second = capture();
    await runLogout('business', second.out, { account: 'alone@example.com', deps: alone.deps, env });
    assert.deepEqual(alone.revoked, ['rt-ads'], 'not shared: revoked, as before');
    assert.match(second.text(), /business alone@example\.com: revoked at Google/);

    const local = revoker();
    saveAccount('business', 'alone@example.com', tokens('alone@example.com', 'rt-ads-2'), cfg);
    await runLogout('business', capture().out, { account: 'alone@example.com', localOnly: true, deps: local.deps, env });
    assert.deepEqual(local.revoked, [], '--local-only never revokes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gsm logout refuses --local-only together with --revoke-all', () => {
  const { dir, env } = folder();
  try {
    const res = spawnSync(process.execPath, [join(REPO, 'dist', 'cli', 'gsm.js'), 'logout', 'workspace-user', '--local-only', '--revoke-all'], { env, encoding: 'utf8' });
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr, /--local-only .* or --revoke-all .*not both/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('account_remove keeps an account another group uses signed in there, and does not revoke it', async () => {
  const { dir, cfg } = folder();
  saveAccount('workspace-user', 'person@example.com', tokens('person@example.com', 'rt-gmail'), cfg);
  saveAccount('searchconsole', 'person@example.com', tokens('person@example.com', 'rt-gsc'), cfg);
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
    const tools = (await request('tools/list')).result.tools;
    const remove = tools.find((t) => t.name === 'account_remove');
    assert.doesNotMatch(remove.description, /The other accounts stay signed in/);
    assert.match(remove.description, /unless the same account is signed in here for another group/);
    const answer = (await request('tools/call', { name: 'account_remove', arguments: { email: 'person@example.com' } })).result.content[0].text;
    assert.match(answer, /Removed person@example\.com from workspace-user on this machine\. Not revoked at Google: person@example\.com is also signed in here for searchconsole/);
    assert.match(answer, /logout searchconsole --account person@example\.com --revoke-all/);
    assert.deepEqual(listAccounts('workspace-user', cfg), []);
    assert.ok(existsSync(accountTokenFile('searchconsole', 'person@example.com', cfg)), 'the other group keeps its token');
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    rmSync(dir, { recursive: true, force: true });
  }
});
