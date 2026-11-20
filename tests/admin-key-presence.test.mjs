// Q007/Q011: the local workspace-admin diagnostics name a deleted key without reading it. No live Google call is made.
// The doctor's PASS/FAIL line, counters, summary and exit code are pinned so the warning stays additive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { runDoctor } = await import(DIST('cli/doctor.js'));
const { runStatus, runStatusCheck } = await import(DIST('cli/credentials.js'));
const { loadProductRegistry } = await import(DIST('cli/products.js'));
const { liveHealth, loginHealth } = await import(DIST('core/health.js'));
const { tokenStatus } = await import(DIST('core/auth.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { ensureTokenDir } = await import(DIST('core/acl.js'));

const KEY_CONTENTS = 'DUMMY-KEY-CONTENTS-MUST-NOT-BE-PRINTED';

async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-admin-key-presence-'));
  const paths = {
    root,
    plugin: join(root, 'plugin'),
    tokens: join(root, 'tokens'),
    otherTokens: join(root, 'other-tokens'),
    key: join(root, 'key.json'),
    missing: join(root, 'gone.json'),
    otherMissing: join(root, 'other-gone.json'),
  };
  mkdirSync(paths.plugin, { recursive: true });
  // The token folders are made the way a login makes them, including the restricted Windows access list.
  ensureTokenDir(paths.tokens);
  ensureTokenDir(paths.otherTokens);
  const write = (dir, rel, text) => {
    const file = join(dir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write(paths.plugin, 'servers.json', JSON.stringify({
    plugins: { gadmin: 'Fixture admin' },
    groups: {},
    servers: [{ name: 'gadmin', plugin: 'gadmin', group: 'workspace-admin', kind: 'curated', label: 'Fixture admin', apis: [], gatewayApis: [] }],
  }));
  write(paths.plugin, '.claude-plugin/plugin.json', JSON.stringify({ name: 'gadmin', version: '0.0.0' }));
  write(paths.plugin, '.mcp.json', JSON.stringify({ mcpServers: { gadmin: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/servers/gadmin.mjs'] } } }));
  write(paths.plugin, 'bin/gsm.mjs', '// fixture\n');
  write(paths.plugin, 'bin/gsm-hook.mjs', '// fixture\n');
  write(paths.plugin, 'hooks/hooks.json', JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: '^mcp__plugin_gadmin_',
        hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/gsm-hook.mjs'], timeout: 10 }],
      }],
    },
  }));
  write(paths.plugin, 'tool-map.json', JSON.stringify([
    { name: 'mcp__plugin_gadmin_gadmin__health', kind: 'read', scopes: [], title: 'health' },
  ]));
  write(paths.plugin, 'scopes.json', JSON.stringify({ gadmin: [] }));
  write(paths.plugin, 'skills/gadmin/SKILL.md', '# fixture skill\n');
  write(paths.plugin, 'servers/gadmin.mjs', '// fixture server\n');
  try {
    return await fn(paths);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function doctorOn(paths, tokenDir, env = {}) {
  const lines = [];
  const out = { log: (line) => lines.push(line), warn: (line) => lines.push(line) };
  const roots = { layout: 'plugin', root: paths.plugin, mapFile: join(paths.plugin, 'servers.json') };
  const code = runDoctor({ roots, registry: loadProductRegistry(roots), tokenDir, env }, out);
  return { code, lines, text: lines.join('\n') };
}

function statusOn(paths, env = {}) {
  const lines = [];
  runStatus({ log: (line) => lines.push(line), warn: (line) => lines.push(line) }, { GSM_TOKEN_DIR: paths.tokens, ...env });
  return { lines, text: lines.join('\n') };
}

function storedRecord(paths, keyFile) {
  writeFileSync(join(paths.tokens, 'workspace-admin.scopes.json'), JSON.stringify({
    subject: 'admin@example.com', scopes: ['scope'], profile: 'readonly', keyFile,
  }));
}

const expectedWarning = (keyFile) =>
  `WARN workspace-admin key file missing at ${keyFile} (setup present; admin calls will fail until the key is restored). Run: node gsm.mjs setup-admin --subject <email> --key-file <file>`;

test('doctor warns on a deleted stored key, keeps the PASS line, counters and exit code, and never prints key contents', () => {
  withTemp((paths) => {
    storedRecord(paths, paths.key);
    writeFileSync(paths.key, KEY_CONTENTS);
    const healthy = doctorOn(paths, paths.tokens, {});
    assert.ok(healthy.lines.some((line) => line.startsWith('PASS workspace-admin is set up')), healthy.text);
    assert.equal(healthy.lines.includes(expectedWarning(paths.key)), false);
    const summary = healthy.lines.find((line) => line.startsWith('doctor: ') && line.includes(' passed, '));
    assert.equal(healthy.code, 0, healthy.text);

    rmSync(paths.key);
    const missing = doctorOn(paths, paths.tokens, {});
    assert.ok(missing.lines.some((line) => line.startsWith('PASS workspace-admin is set up')), missing.text);
    assert.equal(missing.lines.includes(expectedWarning(paths.key)), true, missing.text);
    assert.equal(missing.lines.find((line) => line.startsWith('doctor: ') && line.includes(' passed, ')), summary);
    assert.equal(missing.code, 0, missing.text);
    assert.equal(missing.text.includes(KEY_CONTENTS), false);
    assert.equal(missing.text.includes('FAIL workspace-admin'), false);
  });
});

test('a stored key path never falls back to a present env key, and status agrees with health', () => {
  withTemp((paths) => {
    storedRecord(paths, paths.missing);
    writeFileSync(paths.key, KEY_CONTENTS);
    const env = {
      GSM_ADMIN_SUBJECT: 'env@example.com',
      GSM_SERVICE_ACCOUNT_KEY_FILE: paths.key,
    };
    const doctor = doctorOn(paths, paths.tokens, env);
    assert.equal(doctor.lines.includes(expectedWarning(paths.missing)), true, doctor.text);
    assert.equal(doctor.lines.includes(expectedWarning(paths.key)), false, doctor.text);
    assert.equal(doctor.code, 0);

    const status = statusOn(paths, env);
    assert.ok(status.lines.includes(`workspace-admin: setup record present (key file missing at ${paths.missing})`), status.text);
    assert.ok(status.lines.some((line) => line.includes(`key file: ${paths.missing} (NOT found)`)), status.text);
    assert.equal(status.text.includes(KEY_CONTENTS), false);

    const health = loginHealth('workspace-admin', loadConfig({ GSM_TOKEN_DIR: paths.tokens, ...env }));
    assert.ok(health.detail.includes(paths.missing), health.detail);
    assert.equal(health.detail.includes(paths.key), false);
  });
});

test('an env-only setup warns on a missing env key; present keys and absent setups keep their old lines', () => {
  withTemp((paths) => {
    const env = { GSM_ADMIN_SUBJECT: 'admin@example.com', GSM_SERVICE_ACCOUNT_KEY_FILE: paths.missing };
    const missing = doctorOn(paths, paths.tokens, env);
    assert.equal(missing.lines.includes(expectedWarning(paths.missing)), true, missing.text);
    assert.equal(missing.code, 0, missing.text);

    writeFileSync(paths.key, KEY_CONTENTS);
    const present = doctorOn(paths, paths.tokens, { ...env, GSM_SERVICE_ACCOUNT_KEY_FILE: paths.key });
    assert.equal(present.lines.includes(expectedWarning(paths.key)), false, present.text);
    assert.equal(present.code, 0, present.text);
    const status = statusOn(paths, { ...env, GSM_SERVICE_ACCOUNT_KEY_FILE: paths.key });
    assert.ok(status.lines.includes('workspace-admin: configured by environment variables (service account, domain-wide delegation)'), status.text);
    assert.equal(status.text.includes(KEY_CONTENTS), false);

    const none = doctorOn(paths, paths.tokens, {});
    assert.ok(none.lines.some((line) => line.startsWith('FAIL workspace-admin is not set up')), none.text);
    assert.equal(none.lines.some((line) => line.startsWith('WARN workspace-admin')), false, none.text);
    assert.equal(none.code, 1);
  });
});

test('--token-dir selects the setup file and key path even when GSM_TOKEN_DIR points elsewhere', () => {
  withTemp((paths) => {
    storedRecord(paths, paths.missing);
    writeFileSync(join(paths.otherTokens, 'workspace-admin.scopes.json'), JSON.stringify({
      subject: 'other@example.com', scopes: [], profile: 'readonly', keyFile: paths.otherMissing,
    }));
    const env = { GSM_TOKEN_DIR: paths.otherTokens };

    const selected = doctorOn(paths, paths.tokens, env);
    assert.ok(selected.lines.some((line) => line.startsWith(`PASS workspace-admin is set up`) && line.includes(join(paths.tokens, 'workspace-admin.scopes.json'))), selected.text);
    assert.equal(selected.lines.includes(expectedWarning(paths.missing)), true, selected.text);
    assert.equal(selected.text.includes(paths.otherMissing), false, selected.text);

    const fallback = doctorOn(paths, paths.otherTokens, env);
    assert.ok(fallback.lines.some((line) => line.startsWith('PASS workspace-admin is set up') && line.includes(join(paths.otherTokens, 'workspace-admin.scopes.json'))), fallback.text);
    assert.equal(fallback.lines.includes(expectedWarning(paths.otherMissing)), true, fallback.text);
    assert.equal(fallback.text.includes(paths.missing), false, fallback.text);
  });
});

test('tokenStatus and the gsm health table name a deleted key, and keep the setup fields', () => {
  withTemp((paths) => {
    storedRecord(paths, paths.missing);
    writeFileSync(paths.key, KEY_CONTENTS);
    const cfg = loadConfig({
      GSM_TOKEN_DIR: paths.tokens,
      GSM_ADMIN_SUBJECT: 'env@example.com',
      GSM_SERVICE_ACCOUNT_KEY_FILE: paths.key,
    });

    // The stored path wins over a present env key, just as it does in getAuthClient. Only detail changes.
    assert.deepEqual(tokenStatus('workspace-admin', cfg), {
      kind: 'workspace-admin',
      loggedIn: true,
      tokenFile: join(paths.tokens, 'workspace-admin.scopes.json'),
      scopes: ['scope'],
      detail: `key file missing at ${paths.missing}`,
    });
    assert.equal(loginHealth('workspace-admin', cfg).detail, `key file missing at ${paths.missing}`);

    const env = { ...process.env, GSM_TOKEN_DIR: paths.tokens };
    delete env.GSM_ADMIN_SUBJECT;
    delete env.GSM_SERVICE_ACCOUNT_KEY_FILE;
    const table = spawnSync(process.execPath, [join(REPO, 'gsm.mjs'), 'health', '--plugin', 'gadmin'], {
      cwd: REPO,
      env,
      encoding: 'utf8',
      timeout: 120000,
    });
    assert.equal(table.status, 0, table.stderr);
    const row = table.stdout.split(/\r?\n/).find((line) => line.startsWith('gadmin'));
    assert.ok(row, table.stdout);
    assert.ok(row.includes(`set up — key file missing at ${paths.missing}`), table.stdout);
    assert.equal(table.stdout.includes(KEY_CONTENTS), false);

    // Restoring only the stored path removes the reason; the env path is still a valid fallback for an absent record.
    writeFileSync(paths.missing, '{not read}');
    assert.equal(tokenStatus('workspace-admin', cfg).detail, undefined);
    assert.equal(loginHealth('workspace-admin', cfg).detail, 'service account set up');
  });
});

test('Q001/NW02: liveHealth and status --check support opt-in DWD JWT verification without touching network offline', async () => {
  await withTemp(async (paths) => {
    writeFileSync(paths.key, JSON.stringify({ type: 'service_account', client_email: 'sa@example.iam.gserviceaccount.com' }));
    storedRecord(paths, paths.key);
    const cfg = loadConfig({ GSM_TOKEN_DIR: paths.tokens });

    const valid = await liveHealth('workspace-admin', cfg, {
      makeAdminClient: (keyFile, scopes, subject) => {
        assert.equal(keyFile, paths.key);
        assert.deepEqual(scopes, ['scope']);
        assert.equal(subject, 'admin@example.com');
        return { getAccessToken: async () => ({ token: 'dwd-access-token' }) };
      },
    });
    assert.equal(valid.state, 'valid');
    assert.equal(valid.account, 'admin@example.com');
    assert.match(valid.detail, /domain-wide delegation verified/);

    const refused = await liveHealth('workspace-admin', cfg, {
      makeAdminClient: () => ({
        getAccessToken: async () => {
          throw new Error('unauthorized_client: Client is unauthorized to retrieve access tokens using this method');
        },
      }),
    });
    assert.equal(refused.state, 'expired');
    assert.match(refused.detail, /Domain-wide delegation/);

    const lines = [];
    const code = await runStatusCheck(
      { log: (l) => lines.push(l), warn: (l) => lines.push(l) },
      { GSM_TOKEN_DIR: paths.tokens },
      { makeAdminClient: () => ({ getAccessToken: async () => ({ token: 'ok' }) }) },
    );
    assert.ok(lines.some((l) => l.startsWith('workspace-admin: valid. domain-wide delegation verified')), lines.join('\n'));
    assert.equal(typeof code, 'number');
  });
});
