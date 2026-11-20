// In-chat admin setup through the real runServer wrapper (dist), with a throwaway key in an isolated token folder.
// Nothing reaches Google: the child's JWT.prototype.request is stubbed and records the client's subject, key path and
// scopes. It proves that the setup reload adds tools, resets the curated Directory client, reports the count, refuses
// tools left over from the old grant before any prepare/read, keeps the failure answer, and leaves other groups alone.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const require = createRequire(join(REPO, 'package.json'));
const RESTART_LINE = 'Restart the gadmin server so it reads the new setup. Write tools also need GSM_ALLOW_WRITES=true.';
const FALLBACK_LINE =
  'Newly covered tools load in this chat session for clients that refresh their tool list. If your client still shows the old list, or a tool is refused as not covered by the current admin setup, restart this gadmin server.';
const GUARD_LINE =
  'This tool is not covered by the current admin setup. Rerun auth_setup_admin (or run gsm setup-admin in a terminal and restart this server) before calling it.';
const MISSING_KEY_LINE =
  'Admin setup missing or key file not found; run auth_setup_admin (or run gsm setup-admin in a terminal and restart this server) before calling it.';
// The nine scope-less tool-map entries that grant=[] alone would still register before setup.
const SCOPELESS = [
  'api_call',
  'api_describe',
  'api_methods',
  'api_search',
  'cloudid_customers_userinvitations_get',
  'cloudid_is_invitable_user',
  'cloudid_userinvitations_cancel',
  'cloudid_userinvitations_list',
  'cloudid_userinvitations_send',
];

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const throwawayKey = (dir, name, clientEmail) => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ type: 'service_account', client_email: clientEmail, private_key: privateKey, private_key_id: name }));
  return file;
};

function adminChild(dir, callsFile) {
  const entry = join(dir, 'admin-entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(REPO, 'package.json'))});`,
      `const { JWT } = require('google-auth-library');`,
      `JWT.prototype.request = async function (opts) {`,
      `  appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({`,
      `    subject: this.subject ?? null, keyFile: this.keyFile ?? null, scopes: this.scopes ?? [],`,
      `    url: String(opts.url), method: String(opts.method ?? 'GET'),`,
      `  }) + '\\n');`,
      `  return { data: {}, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `globalThis.fetch = async () => { throw new Error('network is blocked in this test'); };`,
      `const { runServer } = await import(${JSON.stringify(DIST('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(DIST('servers/workspace-admin.js'))});`,
      `await runServer({ name: 'gadmin', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function plainChild(dir, server) {
  const entry = join(dir, `plain-${server}.mjs`);
  writeFileSync(
    entry,
    [
      `const { defineTool, runServer } = await import(${JSON.stringify(DIST('core/tools.js'))});`,
      `const tool = defineTool({`,
      `  name: 'probe_read', title: 'Probe read', description: 'A read with no Google call.', kind: 'read',`,
      `  inputSchema: {}, async handler() { return { ok: true }; },`,
      `});`,
      `await runServer({ name: ${JSON.stringify(server)}, version: '0.0.0', buildTools: () => [tool] });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-admin-reload-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  const key1 = throwawayKey(dir, 'key1', 'sa1@test-project.iam.gserviceaccount.com');
  const key2 = throwawayKey(dir, 'key2', 'sa2@test-project.iam.gserviceaccount.com');
  const key3 = throwawayKey(dir, 'key3', 'sa3@test-project.iam.gserviceaccount.com');
  const callsFile = join(dir, 'calls.jsonl');
  // runServer computes ../bin/gsm.mjs from dist/core/tools.js. The plugin CLI is built from the same source by npm run build.
  const cliInDist = join(REPO, 'dist', 'bin', 'gsm.mjs');
  mkdirSync(dirname(cliInDist), { recursive: true });
  copyFileSync(join(REPO, 'plugins', 'gadmin', 'bin', 'gsm.mjs'), cliInDist);
  return { dir, tokens, key1, key2, key3, callsFile, entry: adminChild(dir, callsFile) };
}

function childEnv(s, extra = {}) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
  );
  return {
    ...base,
    GSM_TOKEN_DIR: s.tokens,
    GSM_ALLOW_WRITES: 'true',
    GSM_SERVICE_ACCOUNT_KEY_FILE: s.key1,
    GSM_ADMIN_SUBJECT: 'old@example.com',
    ...extra,
  };
}

async function connect(entry, env) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const client = new Client({ name: 'admin-reload', version: '0.0.0' }, {});
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' }));
  return client;
}

const textOf = (res) => res.content.find((c) => c.type === 'text')?.text ?? '';
const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
const namesOf = async (client) => (await client.listTools()).tools.map((tool) => tool.name);
const registeredOf = async (client) => JSON.parse(textOf(await client.callTool({ name: 'health', arguments: {} }))).tools.registered;

test('auth_setup_admin reloads the tool list, resets the curated client and reports counts; stale tools are refused before any read', async () => {
  const s = setup();
  const client = await connect(s.entry, childEnv(s, { CALLS_FILE: s.callsFile }));
  try {
    const before = await namesOf(client);
    // The first curated call builds the client from the environment fallback, before any setup file exists.
    assert.notEqual((await client.callTool({ name: 'admin_users_list', arguments: {} })).isError, true);
    const first = callsIn(s.callsFile).at(-1);
    assert.equal(first.subject, 'old@example.com');
    assert.equal(first.keyFile, s.key1);
    assert.deepEqual(first.scopes, [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
    ]);

    const answer = textOf(
      await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'new@example.com', key_file: s.key2 } }),
    );
    assert.ok(answer.includes(RESTART_LINE), 'the CLI restart line is kept verbatim');
    assert.ok(answer.includes(FALLBACK_LINE), 'the in-chat fallback sentence follows the count');
    const match = answer.match(/(\d+) tool\(s\) loaded now, (\d+) registered in total\./);
    assert.ok(match, answer);
    assert.ok(Number(match[1]) > 0, 'a newly covered read tool loads');
    assert.equal(Number(match[2]), await registeredOf(client), 'the total equals health, not tools/list length');

    const after = await namesOf(client);
    assert.equal(after.length - before.length, Number(match[1]), 'the tool list gained exactly the reported tools');
    for (const name of after.filter((n) => !before.includes(n))) assert.ok(name.startsWith('admin_'), name);

    // Same curated tool, now with the stored setup: the cached pre-setup Directory client must not be reused.
    assert.notEqual((await client.callTool({ name: 'admin_users_list', arguments: {} })).isError, true);
    const second = callsIn(s.callsFile).at(-1);
    assert.equal(second.subject, 'new@example.com');
    assert.equal(second.keyFile, s.key2);
    assert.ok(second.scopes.includes('https://www.googleapis.com/auth/admin.directory.user.readonly'));
    assert.ok(!second.scopes.includes('https://www.googleapis.com/auth/admin.directory.user'));

    const again = textOf(
      await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'new@example.com', key_file: s.key2 } }),
    );
    assert.match(again, new RegExp(`0 tool\\(s\\) loaded now, ${match[2]} registered in total\\.`), 'a second setup is idempotent');

    // A readonly --replace setup narrows the grant; the write tools registered at startup stay listed but are refused
    // before prepare/describeTarget (both of which read Google for admin_user_delete).
    await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'third@example.com', key_file: s.key3, replace: true } });
    assert.ok((await namesOf(client)).includes('admin_user_delete'), 'the stale tool is still listed');
    const callsBeforeGuard = callsIn(s.callsFile).length;
    const stale = await client.callTool({ name: 'admin_user_delete', arguments: { user_key: 'ana@example.com' } });
    assert.equal(stale.isError, true);
    assert.equal(textOf(stale), GUARD_LINE);
    assert.equal(callsIn(s.callsFile).length, callsBeforeGuard, 'no Google call, no prepare read and no approval');
    const staleWrite = await client.callTool({
      name: 'admin_user_create',
      arguments: { primary_email: 'ana@example.com', given_name: 'Ana', family_name: 'Silva', password: 'test-password' },
    });
    assert.equal(staleWrite.isError, true);
    assert.equal(textOf(staleWrite), GUARD_LINE);
    assert.equal(callsIn(s.callsFile).length, callsBeforeGuard);

    // The reset also applies to a second setup: the curated client now uses the third key and subject.
    assert.notEqual((await client.callTool({ name: 'admin_users_list', arguments: {} })).isError, true);
    const third = callsIn(s.callsFile).at(-1);
    assert.equal(third.subject, 'third@example.com');
    assert.equal(third.keyFile, s.key3);

    // A failed setup keeps the old answer, the tool count and the curated client.
    const failed = textOf(
      await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'nobody@example.com', key_file: join(s.dir, 'missing-key.json') } }),
    );
    assert.match(failed, /^Could not set up the admin account:/);
    assert.ok(!failed.includes('tool(s) loaded now'), 'no count line on failure');
    assert.equal(await registeredOf(client), Number(match[2]));
    assert.notEqual((await client.callTool({ name: 'admin_users_list', arguments: {} })).isError, true);
    const afterFailure = callsIn(s.callsFile).at(-1);
    assert.equal(afterFailure.subject, 'third@example.com');
    assert.equal(afterFailure.keyFile, s.key3);
  } finally {
    await client.close();
  }
});

test('before setup, only health and auth_setup_admin register; setup stays callable and the exact name set is proved', async () => {
  const s = setup();
  const client = await connect(
    s.entry,
    childEnv(s, { GSM_ADMIN_SUBJECT: '', GSM_SERVICE_ACCOUNT_KEY_FILE: '', GSM_ALLOW_WRITES: 'true' }),
  );
  try {
    const before = (await namesOf(client)).sort();
    assert.deepEqual(before, ['auth_setup_admin', 'health'], 'no admin data tool is advertised before setup');
    for (const name of SCOPELESS) assert.ok(!before.includes(name), `${name} is scope-less but still hidden`);

    const callable = await client.callTool({ name: 'auth_setup_admin', arguments: {} });
    assert.equal(callable.isError, true, 'the setup handler runs and validates its arguments');
    assert.match(textOf(callable), /subject|key_file/i, 'the missing arguments are reported');

    const health = JSON.parse(textOf(await client.callTool({ name: 'health', arguments: {} })));
    assert.equal(health.login.loggedIn, false);
    assert.equal(health.login.next, 'auth_setup_admin');

    const answer = textOf(
      await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'new@example.com', key_file: s.key2 } }),
    );
    assert.ok(answer.includes(RESTART_LINE), 'the CLI restart line is kept verbatim');
    const after = await namesOf(client);
    assert.ok(after.includes('admin_users_list'), 'a real key-file-backed setup registers the admin data tools');
    assert.ok(after.includes('auth_setup_admin') && after.includes('health'), 'setup and diagnosis remain available');
    const added = after.filter((n) => !before.includes(n));
    assert.ok(added.length > 0 && added.every((n) => n.startsWith('admin_') || n.startsWith('cloudid_') || n.startsWith('api_')), added.join(', '));
    const healthAfter = JSON.parse(textOf(await client.callTool({ name: 'health', arguments: {} })));
    assert.equal(healthAfter.login.loggedIn, true);
    assert.equal(healthAfter.login.next, undefined);
  } finally {
    await client.close();
  }
});

test('auth_setup_admin defaults to readonly and passes an explicit profile through to the CLI', async () => {
  const s = setup();
  const client = await connect(s.entry, childEnv(s));
  const setupFile = join(s.tokens, 'workspace-admin.scopes.json');
  const profileOnDisk = () => JSON.parse(readFileSync(setupFile, 'utf8')).profile;
  const runSetup = (args) => client.callTool({ name: 'auth_setup_admin', arguments: args });
  try {
    const fallback = textOf(await runSetup({ subject: 'owner@example.com', key_file: s.key2 }));
    assert.ok(fallback.includes(RESTART_LINE), 'the restart line is kept with every profile');
    assert.equal(profileOnDisk(), 'readonly');

    assert.ok(
      textOf(await runSetup({ subject: 'owner@example.com', key_file: s.key2, profile: 'readwrite' })).includes(RESTART_LINE),
    );
    assert.equal(profileOnDisk(), 'readwrite');
    assert.ok(textOf(await runSetup({ subject: 'owner@example.com', key_file: s.key2, profile: 'full' })).includes(RESTART_LINE));
    assert.equal(profileOnDisk(), 'full');

    const invalid = await runSetup({ subject: 'owner@example.com', key_file: s.key2, profile: 'everything' });
    assert.equal(invalid.isError, true);
    assert.match(textOf(invalid), /profile|readonly|readwrite|full/i);
    assert.equal(profileOnDisk(), 'full', 'an invalid profile leaves the stored setup unchanged');
  } finally {
    await client.close();
  }
});

test('a key deleted after startup is refused at call time and reported by health', async () => {
  const s = setup();
  const client = await connect(s.entry, childEnv(s));
  try {
    assert.ok((await namesOf(client)).includes('admin_users_list'), 'the env key makes the server ready at startup');
    textOf(await client.callTool({ name: 'auth_setup_admin', arguments: { subject: 'owner@example.com', key_file: s.key2 } }));
    rmSync(s.key2);
    const stale = await client.callTool({ name: 'admin_users_list', arguments: {} });
    assert.equal(stale.isError, true);
    assert.equal(textOf(stale), MISSING_KEY_LINE, 'a stale tool fails closed before any read or gate');
    const health = JSON.parse(textOf(await client.callTool({ name: 'health', arguments: {} })));
    assert.equal(health.login.loggedIn, false);
    assert.equal(health.login.next, 'auth_setup_admin');
    assert.ok(health.login.detail.includes(s.key2), 'health names the missing key path');
  } finally {
    await client.close();
  }
});

test('the shared wrapper keeps other groups unchanged: an unscoped read answers the same before and after setup', async () => {
  for (const server of ['gmail', 'gcloud', 'gplay', 'gsearch', 'gsc']) {
    const dir = mkdtempSync(join(tmpdir(), 'gsm-admin-plain-'));
    temps.push(dir);
    const tokens = join(dir, 'tokens');
    mkdirSync(tokens);
    const base = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
    );
    const client = await connect(plainChild(dir, server), { ...base, GSM_TOKEN_DIR: tokens });
    try {
      const res = await client.callTool({ name: 'probe_read', arguments: {} });
      assert.equal(res.isError, undefined, `${server}: no guard outside workspace-admin`);
      assert.equal(textOf(res), '{"ok":true}', `${server}: the handler result is unchanged`);
    } finally {
      await client.close();
    }
  }
});
