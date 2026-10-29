// The per-account scope rule of gsm login, run in this process with a fake browser step and a fake Google answer
// (runLogin's deps). Each test uses its own temporary token folder. No browser opens and nothing calls Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { runLogin } = await import(DIST('cli/login.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { saveAccount, listAccounts, accountTokenFile } = await import(DIST('core/accounts.js'));
const { requirementsFor } = await import(DIST('core/scopes.js'));
const { coverageOf, formatCoverage } = await import(DIST('cli/scopes.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
/** A business scope that a readonly login never asks for. */
const USABLE = G('tagmanager.publish');
/** A Search Console scope: no business server uses it, so it is foreign to the business group. */
const FOREIGN = G('webmasters');

const registry = () => loadRegistry(DIST('core/registry.js'));

function tempTokens() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-login-account-'));
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir }) };
}

function capture() {
  const lines = [];
  return { lines, out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

/**
 * A fake browser step: records what the login asked for, and returns a token that grants `grant` (default: everything
 * asked for). A fake token info names `account`.
 */
function fakeGoogle({ account, grant } = {}) {
  const seen = {};
  return {
    seen,
    deps: (cfg) => ({
      cfg,
      loopback: async (_id, _secret, scopes, _out, options) => {
        seen.scopes = scopes;
        seen.loginHint = options.loginHint;
        return { access_token: 'fake-access', refresh_token: 'fake-refresh', scope: (grant ?? scopes).join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}

const storedScopes = (cfg, email) => JSON.parse(readFileSync(accountTokenFile('business', email, cfg), 'utf8')).scope.split(' ');

test("login without an account does not ask for the default account's scopes, and saves a new account", async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'default@example.com', { refresh_token: 'r1', scope: `${USABLE} ${FOREIGN} ${EMAIL}` }, cfg);
    const google = fakeGoogle({ account: 'other@example.com' });
    const { out, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    assert.ok(!google.seen.scopes.includes(USABLE), "the default account's scope is not requested");
    assert.ok(!google.seen.scopes.includes(FOREIGN));
    assert.equal(google.seen.loginHint, undefined, 'no hint without an account');
    assert.match(text(), /No account named: no stored scope is merged/);
    // The other account is saved with what it was granted; the default account is untouched.
    assert.ok(!storedScopes(cfg, 'other@example.com').includes(USABLE));
    assert.deepEqual(storedScopes(cfg, 'default@example.com').sort(), [USABLE, FOREIGN, EMAIL].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("login with an account merges that account's usable scopes only, sends the hint, and drops foreign scopes", async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'default@example.com', { refresh_token: 'r1', scope: `${G('adwords')} ${EMAIL}` }, cfg);
    saveAccount('business', 'person@example.com', { refresh_token: 'r2', scope: `${USABLE} ${FOREIGN} ${EMAIL}` }, cfg);
    const google = fakeGoogle({ account: 'person@example.com' });
    const { out, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly', account: 'person@example.com' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    assert.equal(google.seen.loginHint, 'person@example.com');
    assert.ok(google.seen.scopes.includes(USABLE), "the account's own usable scope is kept");
    assert.ok(!google.seen.scopes.includes(FOREIGN), 'a scope no business server uses is not requested again');
    assert.ok(!google.seen.scopes.includes(G('adwords')), "another account's scope is not requested");
    assert.match(text(), /Not requested again: 1 stored scope\(s\) that no server of business uses/);
    const saved = storedScopes(cfg, 'person@example.com');
    assert.ok(saved.includes(USABLE) && !saved.includes(FOREIGN), 'the saved token holds the granted scopes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login: when Google signs in another account than the one named, a save that would drop its scopes is refused', async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'named@example.com', { refresh_token: 'r1', scope: `${EMAIL}` }, cfg);
    saveAccount('business', 'picked@example.com', { refresh_token: 'r2', scope: `${USABLE} ${EMAIL}` }, cfg);
    const before = readFileSync(accountTokenFile('business', 'picked@example.com', cfg), 'utf8');
    const google = fakeGoogle({ account: 'picked@example.com' });
    const { out, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly', account: 'named@example.com' }, registry, out, google.deps(cfg));
    assert.equal(code, 1, 'the login reports that nothing was saved');
    assert.match(text(), /Not saved: you named named@example\.com, but Google signed in picked@example\.com/);
    assert.match(text(), /auth_login with account "named@example\.com"/);
    assert.equal(readFileSync(accountTokenFile('business', 'picked@example.com', cfg), 'utf8'), before, "the other account's token is unchanged");
    assert.deepEqual(listAccounts('business', cfg).map((a) => a.email), ['named@example.com', 'picked@example.com']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login: another account than the one named is saved when nothing would be dropped (a new account, or only foreign scopes)', async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'picked@example.com', { refresh_token: 'r2', scope: `${FOREIGN} ${EMAIL}` }, cfg);
    const google = fakeGoogle({ account: 'picked@example.com' });
    const { out, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly', account: 'named@example.com' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    assert.ok(!storedScopes(cfg, 'picked@example.com').includes(FOREIGN), 'the foreign scope is gone with the new token');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login: the "This token runs" line counts the scopes Google granted, not the ones asked for', async () => {
  const { dir, cfg } = tempTokens();
  try {
    // Google grants only the email scope (the person unticked the rest on the consent screen).
    const google = fakeGoogle({ account: 'person@example.com', grant: [EMAIL] });
    const { out, lines, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    const names = registry().servers.filter((s) => s.group === 'business').map((s) => s.name);
    const requirements = await requirementsFor(names, cfg, { warn: () => undefined });
    const granted = `This token runs ${formatCoverage(coverageOf(requirements, [EMAIL]))}.`;
    const asked = `This token runs ${formatCoverage(coverageOf(requirements, google.seen.scopes))}.`;
    assert.notEqual(granted, asked, 'the test needs a grant smaller than the request');
    assert.ok(lines.includes(granted), text());
    assert.ok(!lines.includes(asked), 'the requested coverage is not reported as what the token runs');
    assert.ok(lines.some((l) => l.startsWith('If Google grants every scope asked for, this token runs ')), 'the request is described before the browser step');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login without an account does not save over an account whose usable scopes it would drop; --replace does', async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'person@example.com', { refresh_token: 'r1', scope: `${USABLE} ${EMAIL}` }, cfg);
    const before = readFileSync(accountTokenFile('business', 'person@example.com', cfg), 'utf8');
    const refused = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly' }, registry, refused.out, fakeGoogle({ account: 'person@example.com' }).deps(cfg));
    assert.equal(code, 1, 'nothing is saved');
    assert.match(refused.text(), /Not saved: person@example\.com is already signed in for business/);
    assert.match(refused.text(), /auth_login with account "person@example\.com"/);
    assert.equal(readFileSync(accountTokenFile('business', 'person@example.com', cfg), 'utf8'), before, 'the token is unchanged');

    const replaced = capture();
    const replaceCode = await runLogin({ group: 'business', profile: 'readonly', replace: true }, registry, replaced.out, fakeGoogle({ account: 'person@example.com' }).deps(cfg));
    assert.equal(replaceCode, 0, replaced.text());
    assert.match(replaced.text(), /Not kept: 1 scope\(s\) that the earlier token of person@example\.com held for servers of business/);
    assert.ok(!storedScopes(cfg, 'person@example.com').includes(USABLE), '--replace drops the stored scope');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login with the account named keeps what the person approves, and says what was not kept', async () => {
  const { dir, cfg } = tempTokens();
  try {
    saveAccount('business', 'person@example.com', { refresh_token: 'r1', scope: `${USABLE} ${EMAIL}` }, cfg);
    // The person unticks the stored scope on Google's consent screen: only the email scope is granted.
    const google = fakeGoogle({ account: 'person@example.com', grant: [EMAIL] });
    const { out, text } = capture();
    const code = await runLogin({ group: 'business', profile: 'readonly', account: 'person@example.com' }, registry, out, google.deps(cfg));
    assert.equal(code, 0, text());
    assert.ok(google.seen.scopes.includes(USABLE), 'the stored scope was asked for');
    assert.match(text(), /Not kept: 1 scope\(s\) that the earlier token of person@example\.com held/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
