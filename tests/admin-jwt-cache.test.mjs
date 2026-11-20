// Q003: the generated workspace-admin path caches one wrapped JWT per setup (key file, subject, ordered scopes and
// key-file stat metadata), so sequential calls share an access token until google-auth-library refreshes it. All token
// requests here are answered by a local fake transporter: no network, no real key, token or credential is ever read.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { getAuthClient, forgetAdminClients, forgetServiceAccountClients, ADMIN_SCOPES } = await import(DIST('core/auth.js'));
const { loadConfig } = await import(DIST('core/config.js'));

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const keyJson = JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' });

/** A throwaway key outside an isolated token folder, plus the setup `gsm setup-admin` would store. */
function adminSetup(withSetup = true) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-admin-jwt-'));
  temps.push(dir);
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir);
  const keyFile = join(dir, 'key.json');
  writeFileSync(keyFile, keyJson);
  const record = { subject: 'admin@example.com', scopes: [...ADMIN_SCOPES], profile: 'readonly', keyFile };
  const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir });
  const setupFile = join(tokenDir, 'workspace-admin.scopes.json');
  if (withSetup) writeFileSync(setupFile, JSON.stringify(record));
  return { dir, tokenDir, keyFile, cfg, record, setupFile };
}

const writeSetup = (s, record) => writeFileSync(s.setupFile, JSON.stringify(record));

/** The scope claim of a JWT-bearer token request (the assertion is a signed JWT; its payload names the scopes). */
function scopeOfTokenRequest(opts) {
  const assertion = opts.data instanceof URLSearchParams ? opts.data.get('assertion') : new URLSearchParams(String(opts.data)).get('assertion');
  const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8'));
  return payload.scope.split(' ');
}

/**
 * Answers the token requests of a client the way Google would for one key. Every request is recorded. Nothing reaches
 * the network. Copied verbatim from tests/service-account-scopes.test.mjs (:167 and :177); kept local so that file stays
 * byte-identical and its assertions do not change.
 */
function fakeTokenEndpoint(client, seen, refused = []) {
  client.transporter.request = async (opts) => {
    const scopes = scopeOfTokenRequest(opts);
    seen.push(scopes);
    if (scopes.some((s) => refused.includes(s))) {
      const err = new Error('Request failed with status code 400');
      err.response = { status: 400, data: { error: 'invalid_scope', error_description: 'Invalid OAuth scope or ID token audience provided.' } };
      throw err;
    }
    return { status: 200, data: { access_token: 'fake-access-token', expires_in: 3600, token_type: 'Bearer' } };
  };
}

async function tokenFrom(client, seen) {
  fakeTokenEndpoint(client, seen);
  const token = await client.getAccessToken();
  assert.equal(token.token, 'fake-access-token');
}

const MISSING_SETUP = 'Admin tools need GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT (a super admin email for domain-wide delegation), or run: gsm setup-admin --subject <email> --key-file <file>.';
const missingKey = (keyFile) => `Service account key file not found: ${keyFile}. Run gsm setup-admin again with the right --key-file.`;

test('two sequential generated admin calls reuse one client and produce one token request', async () => {
  const s = adminSetup();
  forgetAdminClients();
  try {
    const first = await getAuthClient('workspace-admin', s.cfg);
    const second = await getAuthClient('workspace-admin', s.cfg);
    assert.equal(second, first, 'same setup: the cached, already-wrapped client');
    assert.equal(first.subject, s.record.subject);
    const seen = [];
    await tokenFrom(first, seen);
    await tokenFrom(second, seen);
    assert.deepEqual(seen, [s.record.scopes], 'one JWT assertion and one token request for two calls, with the stored scope order');

    forgetAdminClients();
    const rebuilt = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(rebuilt, first, 'forgetAdminClients drops the cached client');
    const seenAgain = [];
    await tokenFrom(rebuilt, seenAgain);
    assert.deepEqual(seenAgain, [s.record.scopes], 'the rebuilt client requests its own token');
  } finally {
    forgetAdminClients();
  }
});

test('a changed subject, ordered scope set, key path or key stat metadata gets its own client and token request', async () => {
  const s = adminSetup();
  forgetAdminClients();
  try {
    const seen = [];
    const initial = await getAuthClient('workspace-admin', s.cfg);
    await tokenFrom(initial, seen);

    const otherSubject = { ...s.record, subject: 'other@example.com' };
    writeSetup(s, otherSubject);
    const bySubject = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(bySubject, initial, 'subject is part of the cache key');
    await tokenFrom(bySubject, seen);

    const reordered = { ...s.record, scopes: [s.record.scopes[2], s.record.scopes[0], s.record.scopes[1]] };
    writeSetup(s, reordered);
    const byScopes = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(byScopes, bySubject, 'scope order is part of the cache key');
    await tokenFrom(byScopes, seen);
    assert.deepEqual(seen[2], reordered.scopes, 'the new scope order is what the assertion asks for');

    const otherKey = join(s.dir, 'other-key.json');
    writeFileSync(otherKey, keyJson);
    writeSetup(s, { ...s.record, keyFile: otherKey });
    const byPath = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(byPath, byScopes, 'key file path is part of the cache key');
    await tokenFrom(byPath, seen);

    const sizeBefore = statSync(otherKey).size;
    writeFileSync(otherKey, `${keyJson}\n`);
    assert.notEqual(statSync(otherKey).size, sizeBefore, 'the key metadata really changed');
    const byStat = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(byStat, byPath, 'a key replaced at the same path drops the old client');
    await tokenFrom(byStat, seen);

    assert.equal(seen.length, 5, 'each distinct setup minted exactly one token');
    for (const scopes of seen) assert.deepEqual(scopes.sort(), [...s.record.scopes].sort(), 'no scope was added or lost');
  } finally {
    forgetAdminClients();
  }
});

test('missing setup, missing key, a key removed after caching and a stat failure all keep the exact error text', async () => {
  const empty = adminSetup(false);
  await assert.rejects(getAuthClient('workspace-admin', empty.cfg), (err) => {
    assert.equal(err.message, MISSING_SETUP);
    return true;
  });

  const absent = adminSetup();
  const gone = join(absent.dir, 'gone.json');
  writeSetup(absent, { ...absent.record, keyFile: gone });
  await assert.rejects(getAuthClient('workspace-admin', absent.cfg), (err) => {
    assert.equal(err.message, missingKey(gone));
    return true;
  });

  const removed = adminSetup();
  forgetAdminClients();
  try {
    const cached = await getAuthClient('workspace-admin', removed.cfg);
    assert.ok(cached, 'the key existed on the first call');
    rmSync(removed.keyFile);
    await assert.rejects(getAuthClient('workspace-admin', removed.cfg), (err) => {
      assert.equal(err.message, missingKey(removed.keyFile), 'a cached client cannot outlive its key file');
      return true;
    });

    // Force statSync to fail after existsSync has passed, the race the spec names explicitly. The file is put back so
    // the patched stat, not the earlier existsSync check, is what fails.
    writeFileSync(removed.keyFile, keyJson);
    const fs = require('node:fs');
    const original = fs.statSync;
    fs.statSync = (path, ...rest) => {
      if (path === removed.keyFile) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return original(path, ...rest);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(getAuthClient('workspace-admin', removed.cfg), (err) => {
        assert.equal(err.message, missingKey(removed.keyFile), 'no stat-specific error string was introduced');
        return true;
      });
    } finally {
      fs.statSync = original;
      syncBuiltinESMExports();
    }
  } finally {
    forgetAdminClients();
  }
});

test('the service-account group and an unsigned-in user group keep their own client behaviour', async () => {
  const s = adminSetup();
  const serviceSetup = join(s.tokenDir, 'service-account.json');
  writeFileSync(serviceSetup, JSON.stringify({ keyFile: s.keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-11-19T00:00:00Z' }));
  forgetServiceAccountClients();
  try {
    const cfg = { ...s.cfg, server: 'gplay' };
    const service = await getAuthClient('service-account', cfg);
    assert.equal(await getAuthClient('service-account', cfg), service, 'the service-account cache still works');
    const seen = [];
    await tokenFrom(service, seen);
    assert.equal(seen.length, 1);
    const admin = await getAuthClient('workspace-admin', s.cfg);
    assert.notEqual(admin, service, 'the admin cache is separate from the service-account cache');
    await assert.rejects(getAuthClient('workspace-user', s.cfg), (err) => {
      assert.equal(err.name, 'AuthRequiredError');
      assert.match(err.message, /^Not logged in for "workspace-user"\. Run: /);
      return true;
    });
  } finally {
    forgetServiceAccountClients();
    forgetAdminClients();
  }
});
