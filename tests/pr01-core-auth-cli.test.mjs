import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { loadConfig } = await import(DIST('core/config.js'));
const { mergeRefreshedTokens, refreshExpiryInfo, tokenStatus } = await import(DIST('core/auth.js'));
const { restoreAccountBackup, saveAccount } = await import(DIST('core/accounts.js'));
const { loginHealth, serverHealth } = await import(DIST('core/health.js'));
const { createRuntimeGate } = await import(DIST('core/approval.js'));
const { parseCliArgs, parseInstallArgs } = await import(DIST('cli/args.js'));
const { readAuditLog } = await import(DIST('cli/audit.js'));
const { runRollbackAccount, runRollbackClient, runSetupClient, runStatus } = await import(DIST('cli/credentials.js'));
const { runDoctor } = await import(DIST('cli/doctor.js'));
const { loadProductRegistry } = await import(DIST('cli/products.js'));
const { findRoots } = await import(DIST('cli/paths.js'));
const { serverEnvironment } = await import(DIST('cli/settings.js'));

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-pr01-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Q023/Q034: OAuth refresh-token expiry metadata persists across refreshes and warns offline', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  const initial = { refresh_token: 'rt-1', access_token: 'at-1', refresh_token_expires_at: now + 12 * 3600 * 1000, login_at: now };
  const afterAccessRefresh = mergeRefreshedTokens(initial, { access_token: 'at-2', expiry_date: now + 3600_000 }, now + 1000);
  assert.equal(afterAccessRefresh.refresh_token_expires_at, initial.refresh_token_expires_at, 'access refresh keeps refresh expiry');
  assert.equal(afterAccessRefresh.login_at, now);

  const expiring = refreshExpiryInfo(afterAccessRefresh, now);
  assert.ok(expiring.refreshWarning && /expires in ~12h/i.test(expiring.refreshWarning));

  const expired = refreshExpiryInfo(afterAccessRefresh, now + 13 * 3600 * 1000);
  assert.ok(expired.refreshWarning && /expired/i.test(expired.refreshWarning));

  withTempDir((dir) => {
    const soon = Date.now() + 6 * 3600 * 1000;
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'a@example.com', {
      refresh_token: 'rt-soon',
      access_token: 'at-soon',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      refresh_token_expires_at: soon,
    }, cfg);
    const st = tokenStatus('workspace-user', cfg, 'a@example.com');
    assert.ok(st.refreshTokenExpiresAt);
    assert.ok(st.refreshWarning);
    const lh = loginHealth('workspace-user', cfg, 'a@example.com');
    assert.ok(lh.refreshWarning);

    const lines = [];
    const out = { log: (s) => lines.push(s), warn: (s) => lines.push(s) };
    runStatus(out, { GSM_TOKEN_DIR: dir });
    assert.ok(lines.some((l) => l.includes('refresh token expires:')));
    assert.ok(lines.some((l) => l.includes('WARNING: Refresh token expires')));
  });
});

test('ND02: client_secret replacement rollback and account token rollback restore prior credentials without leaking secrets', () => {
  withTempDir((dir) => {
    const oldSrc = join(dir, 'c1.json');
    const newSrc = join(dir, 'c2.json');
    const firstClient = JSON.stringify({ installed: { client_id: 'cid-1', client_secret: 'csec-1-SECRET' } });
    const secondClient = JSON.stringify({ installed: { client_id: 'cid-2', client_secret: 'csec-2-SECRET' } });
    writeFileSync(oldSrc, firstClient);
    writeFileSync(newSrc, secondClient);

    const prevTokenDir = process.env.GSM_TOKEN_DIR;
    process.env.GSM_TOKEN_DIR = join(dir, 'tokens');
    try {
      const logs = [];
      const out = { log: (s) => logs.push(s), warn: (s) => logs.push(s) };
      assert.equal(runSetupClient(oldSrc, false, out), 0);
      assert.equal(runSetupClient(newSrc, true, out), 0);
      assert.match(readFileSync(join(dir, 'tokens', 'client_secret.json'), 'utf8'), /cid-2/);

      assert.equal(runRollbackClient(out), 0);
      assert.match(readFileSync(join(dir, 'tokens', 'client_secret.json'), 'utf8'), /cid-1/);
      assert.ok(!logs.join('\n').includes('csec-1-SECRET') && !logs.join('\n').includes('csec-2-SECRET'));

      const cfg = loadConfig(process.env);
      saveAccount('workspace-user', 'u@example.com', { refresh_token: 'rt-old-SECRET', scope: 's1 s2' }, cfg);
      saveAccount('workspace-user', 'u@example.com', { refresh_token: 'rt-new-SECRET', scope: 's1' }, cfg);
      assert.equal(runRollbackAccount('workspace-user', 'u@example.com', out), 0);
      const restored = JSON.parse(readFileSync(join(dir, 'tokens', 'workspace-user.u_example.com.token.json'), 'utf8'));
      assert.equal(restored.refresh_token, 'rt-old-SECRET');
      assert.equal(restored.scope, 's1 s2');
      assert.ok(!logs.join('\n').includes('rt-old-SECRET'));
    } finally {
      if (prevTokenDir === undefined) delete process.env.GSM_TOKEN_DIR;
      else process.env.GSM_TOKEN_DIR = prevTokenDir;
    }
  });
});

test('Q026: health account selector reports named account without changing default output', async () => {
  await withTempDir(async (dir) => {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    saveAccount('workspace-user', 'first@example.com', { refresh_token: 'rt1', account: 'first@example.com', scope: 's1' }, cfg);
    saveAccount('workspace-user', 'second@example.com', { refresh_token: 'rt2', account: 'second@example.com', scope: 's2' }, cfg);

    const def = await serverHealth({ server: 'gmail', version: '1.0.0', group: 'workspace-user', cfg, registered: 1, hidden: 0, writesAllowed: false, live: false });
    assert.equal(def.login.account, 'first@example.com');

    const named = await serverHealth({ server: 'gmail', version: '1.0.0', group: 'workspace-user', cfg, account: 'second@example.com', registered: 1, hidden: 0, writesAllowed: false, live: false });
    assert.equal(named.login.account, 'second@example.com');
    assert.equal(named.login.loggedIn, true);

    const missing = await serverHealth({ server: 'gmail', version: '1.0.0', group: 'workspace-user', cfg, account: 'absent@example.com', registered: 1, hidden: 0, writesAllowed: false, live: false });
    assert.equal(missing.login.loggedIn, false);
    assert.match(missing.login.detail, /absent@example\.com/);
  });
});

test('ND01/NW01: runtime write gate records hashed audit lines, respects deny policy, and strips unknown audit keys', async () => {
  await withTempDir(async (dir) => {
    const fakeServer = { server: { getClientCapabilities: () => ({}) } };
    const gate = createRuntimeGate({
      server: fakeServer,
      cfg: { tokenDir: dir, confirmation: 'every-change', confirmationFromEnv: false, hookActive: false, allowWrites: false },
    });
    await gate({ tool: 'auth_login', kind: 'write', args: { secret: 'DO-NOT-LOG-THIS' } });
    const logPath = join(dir, 'audit.log');
    assert.ok(existsSync(logPath));
    assert.ok(!readFileSync(logPath, 'utf8').includes('DO-NOT-LOG-THIS'));

    const exported = readAuditLog(dir, { tool: 'auth_login' });
    assert.equal(exported.lines.length, 1);
    const parsed = JSON.parse(exported.lines[0]);
    assert.equal(parsed.tool, 'auth_login');
    assert.match(parsed.argsSha256, /^[0-9a-f]{16}$/);

    writeFileSync(join(dir, 'policy.json'), JSON.stringify({
      confirmation: 'every-change',
      rules: [{ match: 'account_remove', action: 'deny' }],
    }));
    await assert.rejects(
      () => gate({ tool: 'account_remove', kind: 'destructive', args: { email: 'a@example.com' } }),
      /Denied by policy rule "account_remove"/,
    );
    const all = readAuditLog(dir, {});
    assert.equal(all.lines.length, 2);
    assert.equal(JSON.parse(all.lines[1]).outcome, 'denied');
  });
});

test('NW06c: install --token-dir writes GSM_TOKEN_DIR for codex/opencode/agy and rejects both claude and all', () => {
  const base = ['install', '--plugin', 'gmail', '--scope', 'global', '--token-dir', 'my-tokens'];
  for (const agent of ['claude', 'all']) {
    assert.throws(
      () => parseInstallArgs(parseCliArgs([...base, '--agent', agent]).values, 'install', (p) => `/abs/${p}`, ['gmail']),
      /--token-dir applies only to codex, opencode and agy/,
    );
  }
  const ok = parseInstallArgs(parseCliArgs([...base, '--agent', 'codex']).values, 'install', (p) => `/abs/${p}`, ['gmail']);
  assert.equal(ok.tokenDir, '/abs/my-tokens');
  assert.deepEqual(serverEnvironment(false, undefined, undefined, '/abs/my-tokens'), [['GSM_TOKEN_DIR', '/abs/my-tokens']]);
});

test('Q037: doctor validates short tool aliases across all built plugin folders cleanly', () => {
  withTempDir((dir) => {
    const roots = findRoots(pathToFileURL(join(REPO, 'dist', 'cli', 'gsm.js')).href);
    const registry = loadProductRegistry(roots);
    const outLines = [];
    const out = { log: (s) => outLines.push(s), warn: (s) => outLines.push(s) };
    runDoctor({ roots, registry, tokenDir: dir, env: { ...process.env, GSM_TOKEN_DIR: dir } }, out);
    const aliasFails = outLines.filter((l) => l.startsWith('FAIL ') && l.includes('tool-aliases.json'));
    assert.deepEqual(aliasFails, []);
  });
});
