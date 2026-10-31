// Plugin options that were never set (1.37.1): each plugin's .mcp.json passes its options as ${user_config.<key>}. An
// option that reaches a server, the CLI or the hook empty, or as that reference unexpanded, reads as unset everywhere
// (src/core/plugin-option.ts), so the default applies: above all, the literal "${user_config.token_dir}" is never used
// as a folder. Run after compiling (npm test does). The last tests start bundled servers and the bundled hook with each
// literal, in temp folders; nothing is sent to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { optionValue } = await import(dist('core/plugin-option.js'));
const { loadConfig } = await import(dist('core/config.js'));
const ads = await import(dist('core/ads.js'));
const settings = await import(dist('cli/settings.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Each option variable of the plugins' .mcp.json, with the reference Claude Code substitutes (scripts/bundle.mjs). */
const LITERALS = {
  GSM_ALLOW_WRITES: '${user_config.allow_writes}',
  GSM_CONFIRMATION: '${user_config.confirmation}',
  GSM_TOKEN_DIR: '${user_config.token_dir}',
  GSM_TOOLSET: '${user_config.toolset}',
  GSM_ADMIN_SUBJECT: '${user_config.admin_subject}',
  GSM_SERVICE_ACCOUNT_KEY_FILE: '${user_config.service_account_key_file}',
  GSM_ADS_DEVELOPER_TOKEN: '${user_config.ads_developer_token}',
  GSM_ADS_LOGIN_CUSTOMER_ID: '${user_config.ads_login_customer_id}',
};

test('the plugins pass exactly these options as ${user_config.*} references', () => {
  const seen = new Set();
  for (const plugin of readdirSync(join(ROOT, 'plugins'))) {
    const env = Object.values(readJson('plugins', plugin, '.mcp.json').mcpServers)[0].env;
    for (const [name, value] of Object.entries(env)) if (value.startsWith('${user_config.')) seen.add(`${name}=${value}`);
  }
  assert.deepEqual([...seen].sort(), Object.entries(LITERALS).map(([k, v]) => `${k}=${v}`).sort());
});

test('optionValue: missing, blank and unexpanded references are unset; other values are trimmed', () => {
  for (const raw of [undefined, '', '   ', '${user_config.token_dir}', '  ${user_config.x}  ', '${user_config.']) assert.equal(optionValue(raw), undefined, String(raw));
  assert.equal(optionValue(' D:\\tokens '), 'D:\\tokens');
  assert.equal(optionValue('/home/me/${user_config.not-a-prefix}'), '/home/me/${user_config.not-a-prefix}', 'only a value that starts with the reference is unset');
  assert.equal(optionValue('every-change'), 'every-change');
});

test('loadConfig: every option literal gives the defaults, with no warning', () => {
  const lines = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  let cfg;
  try {
    cfg = loadConfig({ ...LITERALS });
  } finally {
    process.stderr.write = write;
  }
  assert.equal(cfg.tokenDir, join(homedir(), '.google-services-mcps'));
  assert.equal(cfg.clientSecretFile, join(homedir(), '.google-services-mcps', 'client_secret.json'));
  assert.equal(cfg.allowWrites, false);
  assert.equal(cfg.confirmation, 'every-change');
  assert.equal(cfg.confirmationFromEnv, false);
  assert.equal(cfg.toolset, 'all');
  assert.equal(cfg.adminSubject, undefined);
  assert.equal(cfg.serviceAccountKeyFile, undefined);
  assert.deepEqual(lines.filter((l) => l.includes('[config]')), [], 'an unset option is not a bad value');
  // Real values are read as before.
  const set = loadConfig({ GSM_TOKEN_DIR: ' /x/tokens ', GSM_CONFIRMATION: 'off', GSM_TOOLSET: 'google', GSM_ADMIN_SUBJECT: 'a@example.com', GSM_SERVICE_ACCOUNT_KEY_FILE: '/k.json' });
  assert.equal(set.tokenDir, '/x/tokens');
  assert.equal(set.confirmation, 'off');
  assert.equal(set.confirmationFromEnv, true);
  assert.equal(set.toolset, 'google');
  assert.equal(set.adminSubject, 'a@example.com');
  assert.equal(set.serviceAccountKeyFile, '/k.json');
});

test('Google Ads: an unexpanded developer token or manager id is unset, not sent and not an error', () => {
  const saved = { token: process.env.GSM_ADS_DEVELOPER_TOKEN, login: process.env.GSM_ADS_LOGIN_CUSTOMER_ID };
  process.env.GSM_ADS_DEVELOPER_TOKEN = LITERALS.GSM_ADS_DEVELOPER_TOKEN;
  process.env.GSM_ADS_LOGIN_CUSTOMER_ID = LITERALS.GSM_ADS_LOGIN_CUSTOMER_ID;
  try {
    const tokenDir = tempDir('gsm-unset-ads-');
    assert.equal(ads.loginCustomerIdOf(), undefined);
    assert.equal(ads.developerTokenOf({ tokenDir }), undefined);
    assert.deepEqual(ads.adsHeaders({ tokenDir }), {});
    process.env.GSM_ADS_LOGIN_CUSTOMER_ID = '123-456-7890';
    assert.equal(ads.loginCustomerIdOf(), '1234567890');
  } finally {
    for (const [k, v] of [['GSM_ADS_DEVELOPER_TOKEN', saved.token], ['GSM_ADS_LOGIN_CUSTOMER_ID', saved.login]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('gsm status reads an unexpanded toolset or confirmation as unset', () => {
  assert.deepEqual(settings.toolsetStatus({ GSM_TOOLSET: LITERALS.GSM_TOOLSET }), { toolset: 'all', set: false, known: true });
  assert.deepEqual(settings.confirmationStatus({ GSM_CONFIRMATION: LITERALS.GSM_CONFIRMATION }), { mode: 'every-change', set: false, known: true });
});

// ---- bundled servers and the bundled hook ----

const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));

/** A fake home whose default token folder (~/.google-services-mcps) holds a fake sign-in for the plugin's group. */
function homeWithSignIn(plugin) {
  const map = readJson('plugins', plugin, 'tool-map.json');
  const group = readJson('plugins', plugin, 'servers.json').servers[0].group;
  const scopes = [...new Set(map.flatMap((t) => t.scopes ?? []))].sort();
  const home = tempDir(`gsm-unset-${plugin}-`);
  const tokens = join(home, '.google-services-mcps');
  mkdirSync(tokens, { recursive: true });
  if (group === 'workspace-admin') {
    const keyFile = join(home, 'key.json');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
    writeFileSync(join(tokens, 'workspace-admin.scopes.json'), JSON.stringify({ subject: 'admin@example.com', scopes, profile: 'custom', keyFile }));
  } else {
    writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  }
  return { home, tokens };
}

async function startServer(plugin, env, cwd) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'plugins', plugin, 'servers', `${plugin}.mjs`)], env, cwd, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (b) => (stderr += b));
  const client = new Client({ name: 'gsm-unset-options-test', version: '0.0.0' });
  await client.connect(transport);
  const tools = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    tools.push(...page.tools.map((t) => t.name));
    cursor = page.nextCursor;
  } while (cursor);
  return { client, tools, stderr: () => stderr };
}

for (const plugin of ['gmail', 'gadmin', 'gads']) {
  test(`${plugin}: with every option literal the server uses the default token folder and lists the same tools as with no options`, { timeout: 120_000 }, async () => {
    const { home, tokens } = homeWithSignIn(plugin);
    const cwd = tempDir('gsm-unset-cwd-');
    const homeEnv = { ...baseEnv, HOME: home, USERPROFILE: home, APPDATA: join(home, 'appdata'), CLOUDSDK_CONFIG: join(home, 'gcloud') };
    const literal = await startServer(plugin, { ...homeEnv, ...LITERALS, GSM_HOOK_ACTIVE: '1' }, cwd);
    const plain = await startServer(plugin, { ...homeEnv, GSM_HOOK_ACTIVE: '1' }, cwd);
    try {
      assert.deepEqual(literal.tools, plain.tools, 'the same tools as with no option set');
      assert.ok(literal.tools.length > 10, `${plugin} is signed in from ${tokens} (${literal.tools.length} tools)`);
      if (plugin !== 'gadmin') {
        const status = await literal.client.callTool({ name: 'auth_status', arguments: {} });
        assert.match(status.content[0].text, /^Signed in for "/, status.content[0].text);
      }
      // The tool lists are equal, so writes stay off as with GSM_ALLOW_WRITES unset; no option reads as a bad value.
      assert.ok(!/\[config\] GSM_(CONFIRMATION|TOOLSET)/.test(literal.stderr()), literal.stderr());
      assert.deepEqual(readdirSync(cwd), [], 'no folder named after the literal is made');
      assert.ok(!existsSync(join(cwd, '${user_config.token_dir}')));
    } finally {
      await literal.client.close();
      await plain.client.close();
    }
  });
}

test('the hook reads the policy from the default token folder when GSM_TOKEN_DIR is the literal', () => {
  const home = tempDir('gsm-unset-hook-');
  const tokens = join(home, '.google-services-mcps');
  mkdirSync(tokens, { recursive: true });
  const tool = 'mcp__plugin_gmail_gmail__gmail_list_labels';
  writeFileSync(join(tokens, 'policy.json'), JSON.stringify({ rules: [{ match: tool, action: 'deny' }] }));
  const cwd = tempDir('gsm-unset-hook-cwd-');
  const run = (env) =>
    spawnSync(process.execPath, [join(ROOT, 'plugins', 'gmail', 'bin', 'gsm-hook.mjs')], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {} }),
      env: { ...baseEnv, HOME: home, USERPROFILE: home, ...env },
      cwd,
      encoding: 'utf8',
    });
  const literal = run({ GSM_TOKEN_DIR: LITERALS.GSM_TOKEN_DIR });
  assert.equal(literal.status, 0);
  assert.match(literal.stdout, /"permissionDecision":"deny"/, 'the deny rule in ~/.google-services-mcps/policy.json applies');
  assert.equal(run({}).stdout, literal.stdout, 'the same answer as with GSM_TOKEN_DIR unset');
  assert.deepEqual(readdirSync(cwd), []);
});
