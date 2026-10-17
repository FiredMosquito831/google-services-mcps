// Credential handling: the live checks, the expired-login message, revoke at logout, PKCE, the folder access list,
// the pre-login tool list, and the safety kinds of the curated tools. No test calls Google: the clients are fakes,
// and the server runs with a temporary token folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { checkGrant, revokeGrant, describeKeyRestrictions } = await import(DIST('core/grant-check.js'));
const { GrantExpiredError, isInvalidGrant } = await import(DIST('core/auth.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { aclExtras, ensureTokenDir } = await import(DIST('core/acl.js'));
const { loopbackLogin } = await import(DIST('cli/login.js'));

const GMAIL_RO = 'https://www.googleapis.com/auth/gmail.readonly';
const CAL_RO = 'https://www.googleapis.com/auth/calendar.readonly';

function tokenDirWith({ token, scope } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-auth-'));
  writeFileSync(
    join(dir, 'client_secret.json'),
    JSON.stringify({ installed: { client_id: 'test-client-id', client_secret: 'test-client-secret' } }),
  );
  if (token) {
    writeFileSync(join(dir, 'workspace-user.token.json'), JSON.stringify({ refresh_token: token, scope }));
  }
  return dir;
}

const cfgFor = (dir) => loadConfig({ GSM_TOKEN_DIR: dir });

/** A fake OAuth client. Each test sets the answers it needs. */
function fakeClient(answers = {}) {
  return () => ({
    setCredentials() {},
    async getAccessToken() {
      if (answers.refresh instanceof Error) throw answers.refresh;
      return { token: answers.access ?? 'at-test' };
    },
    async getTokenInfo() {
      if (answers.info instanceof Error) throw answers.info;
      return answers.info ?? { scope: GMAIL_RO, expires_in: 3000 };
    },
    async revokeToken(token) {
      answers.revoked?.push(token);
      if (answers.revokeError) throw answers.revokeError;
      return {};
    },
  });
}

test('checkGrant: a valid login reports the granted scopes, and the stored scopes Google no longer grants', async () => {
  const dir = tokenDirWith({ token: 'rt-secret-value', scope: `${GMAIL_RO} ${CAL_RO}` });
  const result = await checkGrant('workspace-user', cfgFor(dir), { makeClient: fakeClient({ info: { scope: GMAIL_RO, expires_in: 1800 } }) });
  assert.equal(result.state, 'valid');
  assert.deepEqual(result.scopes, [GMAIL_RO]);
  assert.deepEqual(result.missingScopes, [CAL_RO]);
  assert.equal(result.expiresInSeconds, 1800);
  assert.match(result.detail, /no longer granted/);
});

test('checkGrant: a rejected refresh token is "expired", with the login command and the Testing note', async () => {
  const dir = tokenDirWith({ token: 'rt-secret-value', scope: GMAIL_RO });
  const refused = new Error('invalid_grant: Token has been expired or revoked.');
  const result = await checkGrant('workspace-user', cfgFor(dir), { makeClient: fakeClient({ refresh: refused }) });
  assert.equal(result.state, 'expired');
  assert.match(result.detail, /login workspace-user/);
  assert.match(result.detail, /7 days/);
});

test('checkGrant: a token Google rejects at the tokeninfo step is "revoked"', async () => {
  const dir = tokenDirWith({ token: 'rt-secret-value', scope: GMAIL_RO });
  const result = await checkGrant('workspace-user', cfgFor(dir), {
    makeClient: fakeClient({ info: new Error('Request failed with status code 400: invalid_token') }),
  });
  assert.equal(result.state, 'revoked');
});

test('checkGrant: a network failure is "unreachable", and no secret reaches the detail', async () => {
  const dir = tokenDirWith({ token: 'rt-secret-value', scope: GMAIL_RO });
  const result = await checkGrant('workspace-user', cfgFor(dir), {
    makeClient: fakeClient({ refresh: new Error('getaddrinfo failed for rt-secret-value and test-client-secret') }),
  });
  assert.equal(result.state, 'unreachable');
  assert.ok(!result.detail.includes('rt-secret-value'), 'the refresh token must not appear in the detail');
  assert.ok(!result.detail.includes('test-client-secret'), 'the client secret must not appear in the detail');
});

test('checkGrant: no token file is "not-logged-in", with the command that logs in', async () => {
  const dir = tokenDirWith();
  const result = await checkGrant('workspace-user', cfgFor(dir), { makeClient: fakeClient() });
  assert.equal(result.state, 'not-logged-in');
  assert.match(result.detail, /login workspace-user/);
});

test('revokeGrant: revokes the refresh token at Google, and reports a failure without the token', async () => {
  const dir = tokenDirWith({ token: 'rt-secret-value', scope: GMAIL_RO });
  const revoked = [];
  const ok = await revokeGrant('workspace-user', cfgFor(dir), { makeClient: fakeClient({ revoked }) });
  assert.equal(ok.revoked, true);
  assert.deepEqual(revoked, ['rt-secret-value']);

  const failed = await revokeGrant('workspace-user', cfgFor(dir), {
    makeClient: fakeClient({ revokeError: new Error('invalid_token rt-secret-value') }),
  });
  assert.equal(failed.revoked, false);
  assert.match(failed.detail, /myaccount\.google\.com\/permissions/);
  assert.ok(!failed.detail.includes('rt-secret-value'));
});

test('revokeGrant: nothing stored means nothing to revoke', async () => {
  const dir = tokenDirWith();
  assert.equal(await revokeGrant('workspace-user', cfgFor(dir), { makeClient: fakeClient() }), undefined);
});

test('describeKeyRestrictions: a key with no restrictions is reported as unrestricted', () => {
  assert.equal(describeKeyRestrictions(null).restricted, false);
  assert.equal(describeKeyRestrictions({}).restricted, false);
  assert.match(describeKeyRestrictions({}).detail, /UNRESTRICTED/);
});

test('describeKeyRestrictions: API limits and caller limits both count as restricted', () => {
  const byApi = describeKeyRestrictions({ apiTargets: [{ service: 'gmail.googleapis.com' }] });
  assert.equal(byApi.restricted, true);
  assert.match(byApi.detail, /1 API\(s\)/);
  const byCaller = describeKeyRestrictions({ serverKeyRestrictions: { allowedIps: ['10.0.0.1'] } });
  assert.equal(byCaller.restricted, true);
  assert.match(byCaller.detail, /server/);
});

test('isInvalidGrant reads the message and the response body; other errors are not invalid_grant', () => {
  assert.equal(isInvalidGrant(new Error('invalid_grant')), true);
  assert.equal(isInvalidGrant({ response: { data: { error: 'invalid_grant' } } }), true);
  assert.equal(isInvalidGrant(new Error('network down')), false);
});

test('GrantExpiredError names the login command for its group', () => {
  const err = new GrantExpiredError('workspace-user');
  assert.equal(err.name, 'GrantExpiredError');
  assert.match(err.message, /login workspace-user/);
});

test('loopback login asks for PKCE (S256), and refuses a callback whose state does not match', async () => {
  const lines = [];
  const out = { log: (text) => lines.push(text), warn: (text) => lines.push(text) };
  const login = loopbackLogin('test-client-id', 'test-client-secret', [GMAIL_RO], out, { openBrowser: false });
  // Attach the handler now: the callback below rejects the login before the assertion runs.
  const outcome = login.then(
    () => 'resolved',
    (err) => err,
  );
  let url;
  for (let i = 0; i < 100 && !url; i += 1) {
    const found = lines.join('\n').match(/https:\/\/accounts\.google\.com\/\S+/);
    if (found) url = new URL(found[0]);
    else await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(url, 'the login prints the authorization URL');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const challenge = url.searchParams.get('code_challenge');
  assert.equal(challenge.length, 43, 'an S256 challenge is 43 base64url characters');
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  // The challenge is the S256 hash of a verifier that never leaves the process, so the URL carries no verifier.
  assert.equal(url.searchParams.get('code_verifier'), null);

  const redirect = new URL(url.searchParams.get('redirect_uri'));
  await fetch(`${redirect.origin}${redirect.pathname}?code=abc&state=wrong-state`).catch(() => undefined);
  const error = await outcome;
  assert.ok(error instanceof Error, 'the login must fail');
  assert.match(error.message, /state mismatch/);
});

test('the Windows folder access check: a limited folder has no other readers', { skip: process.platform !== 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-acl-'));
  try {
    ensureTokenDir(join(dir, 'tokens'));
    const acl = aclExtras(join(dir, 'tokens'));
    assert.equal(acl.supported, true);
    assert.deepEqual(acl.extra, []);

    // A file written after the folder is limited must stay openable and deletable by its owner.
    const file = join(dir, 'tokens', 'workspace-user.token.json');
    writeFileSync(file, '{}');
    assert.deepEqual(aclExtras(file).extra, []);
    assert.equal(readFileSync(file, 'utf8'), '{}');
    rmSync(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('off Windows the access check is skipped, and reports so', { skip: process.platform === 'win32' }, () => {
  assert.deepEqual(aclExtras(tmpdir()), { supported: false, extra: [] });
});

test('the curated reveal tool and the billing account move are writes, in the kinds file and in the built plugins', () => {
  const kinds = JSON.parse(readFileSync(join(REPO, 'config', 'tool-kinds.json'), 'utf8'));
  assert.equal(kinds['cloudbilling.organizations.billingAccounts.move'], 'write');
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gcloud', 'tool-map.json'), 'utf8'));
  const byName = new Map(map.map((tool) => [tool.name, tool]));
  assert.equal(byName.get('mcp__plugin_gcloud_gcloud__cloud_apikey_reveal').kind, 'write');
  assert.equal(byName.get('mcp__plugin_gcloud_gcloud__billing_organizatio_billing_acco_move').kind, 'write');
});

/** Starts a plugin server with a temporary token folder, and talks to it over stdio. */
async function withServer(serverFile, tokenDir, fn) {
  const child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, GSM_TOKEN_DIR: tokenDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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

test('before a login, gmail registers only auth_status and tools that need no scope; after a login, auth_status loads the rest', async () => {
  const dir = tokenDirWith();
  const server = join(REPO, 'plugins', 'gmail', 'servers', 'gmail.mjs');
  await withServer(server, dir, async (request) => {
    const before = (await request('tools/list', {})).result.tools.map((tool) => tool.name);
    assert.ok(before.includes('auth_status'));
    assert.ok(!before.includes('gmail_search'), 'a scoped tool must not be listed before a login');
    assert.ok(before.length < 20, `expected only a few tools before a login, got ${before.length}`);

    const notLogged = await request('tools/call', { name: 'auth_status', arguments: {} });
    assert.match(notLogged.result.content[0].text, /Not signed in for "workspace-user"/);

    // A stored login (no network: the check only looks for the token file), then auth_status loads the tools.
    writeFileSync(join(dir, 'workspace-user.token.json'), JSON.stringify({ refresh_token: 'rt-test', scope: GMAIL_RO }));
    const loaded = await request('tools/call', { name: 'auth_status', arguments: {} });
    assert.match(loaded.result.content[0].text, /Signed in for "workspace-user" with an OAuth account\. \d+ tool\(s\) loaded now/);
    const after = (await request('tools/list', {})).result.tools.map((tool) => tool.name);
    assert.ok(after.includes('gmail_search'), 'the scoped tools load once the login exists');
  });
});

