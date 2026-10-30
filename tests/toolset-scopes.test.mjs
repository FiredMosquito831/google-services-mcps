// Login scopes that follow the toolset (GSM_TOOLSET, --toolset): requirementsForSpecs keeps only the tools of the
// toolset, and counts the gateway methods only when the toolset holds api_call. The login runs in this process with a
// fake browser step; the chat sign-in runs against the built gmail plugin with no browser. Nothing calls Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { runLogin } = await import(DIST('cli/login.js'));
const { runScopes } = await import(DIST('cli/scopes.js'));
const { parseCliArgs, parseToolset, parseSetupAdminArgs } = await import(DIST('cli/args.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { resolveScopes, requirementsFor } = await import(DIST('core/scopes.js'));
const { GATEWAY_TOOL_NAMES } = await import(DIST('core/toolset.js'));
const { gatewayTools } = await import(DIST('core/gateway.js'));
const { createSignIn } = await import(DIST('core/inchat-login.js'));
const { saveAccount, accountTokenFile } = await import(DIST('core/accounts.js'));
const { UsageError } = await import(DIST('cli/types.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
const sorted = (list) => [...list].sort();
const registry = () => loadRegistry(DIST('core/registry.js'));

const GMAIL_GOOGLE = [
  'gmail_create_draft',
  'gmail_get_attachment',
  'gmail_get_message',
  'gmail_get_thread',
  'gmail_label',
  'gmail_list_drafts',
  'gmail_list_labels',
  'gmail_search',
  'gmail_search_threads',
  'gmail_send_draft',
  'gmail_trash',
  'gmail_unlabel',
  'gmail_untrash',
  'gmail_users_labels_create',
];

const temps = [];
function tempTokens(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-toolset-scopes-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir, ...env }) };
}
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function capture() {
  const lines = [];
  return { lines, out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

const quiet = { warn: () => undefined };
const toolsOf = (reqs) => reqs.filter((r) => !r.gateway).map((r) => r.tool.split('/')[1]).sort();

test('GATEWAY_TOOL_NAMES are the names of the gateway tools', () => {
  const { cfg } = tempTokens();
  const names = gatewayTools({ product: 'gmail', group: 'workspace-user', apis: [{ api: 'gmailpostmastertools', version: 'v1' }], cfg }).map((t) => t.name);
  assert.deepEqual(names, [...GATEWAY_TOOL_NAMES]);
});

test('requirements: no toolset and all are the same list; google keeps the gmail list and no gateway method (no api_call)', async () => {
  const { cfg } = tempTokens();
  for (const server of ['gmail', 'gcalendar', 'gsc']) {
    const plain = await requirementsFor([server], cfg, quiet);
    assert.deepEqual(await requirementsFor([server], cfg, { ...quiet, toolset: 'all' }), plain, server);
  }
  const google = await requirementsFor(['gmail'], cfg, { ...quiet, toolset: 'google' });
  assert.deepEqual(toolsOf(google), GMAIL_GOOGLE);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'the google list has no api_call, so no gateway method counts');
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('gmail.readonly')]);
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('gmail.modify')]);
});

test('requirements: the gcalendar google list resolves to calendar.readonly (readonly) and calendar (readwrite)', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gcalendar'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 8);
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('calendar.readonly')]);
  // The greedy cover takes the one scope that covers all eight tools: calendar.events covers neither list_calendars
  // nor suggest_time (free/busy), so calendar wins on coverage. Same answer as the all toolset gives today.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('calendar')]);
  assert.deepEqual(resolveScopes(await requirementsFor(['gcalendar'], cfg, quiet), 'readwrite').scopes, [G('calendar')]);
});

test('requirements: the gdrive google list resolves to drive.readonly (readonly) and drive (readwrite), no gateway method', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gdrive'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 19);
  assert.equal(google.filter((r) => r.gateway).length, 0);
  assert.deepEqual(resolveScopes(google, 'readonly').scopes, [G('drive.readonly')]);
  // drive covers all 19 tools; drive.file does not cover drive_search, drive_read_text, drive_get_file or drive_list_recent.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('drive')]);
});

test('requirements: the gcloud google list (59 tools, no gateway) resolves to Cloud read-only scopes and to cloud-platform', async () => {
  const { cfg } = tempTokens();
  const google = await requirementsFor(['gcloud'], cfg, { ...quiet, toolset: 'google' });
  assert.equal(google.length, 59);
  assert.equal(google.filter((r) => r.gateway).length, 0, 'no api_call in the list, so no gateway method counts');
  const readonly = resolveScopes(google, 'readonly');
  assert.deepEqual(readonly.scopes, [G('cloud-billing.readonly'), G('cloud-platform.read-only')]);
  // IAM lists only cloud-platform, and monitoring.read is not taken for a read-only scope by its name, so these reads
  // stay outside a readonly login, as with the all toolset.
  for (const tool of ['iam_roles_list', 'iam_role_get', 'iam_policies_get', 'monitoring_query_promql', 'monitoring_dashboards_list']) {
    assert.ok(readonly.uncovered.includes(`gcloud/${tool}`), tool);
  }
  for (const tool of ['logging_entries_list', 'gcs_read_text', 'billing_price_lookup', 'bq_query_read', 'cloud_projects_search']) {
    assert.ok(readonly.covered.includes(`gcloud/${tool}`), tool);
  }
  // cloud-platform covers every tool but the curated BigQuery reads, which list bigquery and not cloud-platform.
  assert.deepEqual(resolveScopes(google, 'readwrite').scopes, [G('bigquery'), G('cloud-platform')]);
});

test('requirements: curated keeps the curated tools and, with api_call, the gateway methods', async () => {
  const { cfg } = tempTokens();
  const all = await requirementsFor(['gmail'], cfg, quiet);
  const curated = await requirementsFor(['gmail'], cfg, { ...quiet, toolset: 'curated' });
  assert.deepEqual(toolsOf(curated), [
    'gmail_create_draft',
    'gmail_get_attachment',
    'gmail_get_message',
    'gmail_get_thread',
    'gmail_label',
    'gmail_list_drafts',
    'gmail_list_labels',
    'gmail_reply',
    'gmail_search',
    'gmail_search_threads',
    'gmail_send',
    'gmail_send_draft',
    'gmail_trash',
    'gmail_unlabel',
    'gmail_untrash',
  ]);
  assert.deepEqual(
    curated.filter((r) => r.gateway),
    all.filter((r) => r.gateway),
    'every gateway method counts, as api_call is in the curated toolset',
  );
  assert.deepEqual(resolveScopes(curated, 'readonly').scopes, [G('gmail.readonly')]);
  assert.deepEqual(resolveScopes(curated, 'readwrite').scopes, [G('gmail.modify')]);
});

test('requirements: a toolset a product does not have counts every tool, and says so', async () => {
  const { cfg } = tempTokens();
  const lines = [];
  const google = await requirementsFor(['gsc'], cfg, { warn: (l) => lines.push(l), toolset: 'google' });
  assert.deepEqual(google, await requirementsFor(['gsc'], cfg, quiet));
  assert.deepEqual(lines, ['[gsc] toolset google is not defined for this product yet; every tool counts toward the scopes.']);
});

test('--toolset: parsed for login, scopes and setup-admin; an unknown value is a usage error', () => {
  assert.equal(parseToolset(undefined), undefined);
  assert.equal(parseToolset('Google'), 'google');
  assert.throws(() => parseToolset('lean'), (err) => err instanceof UsageError && /--toolset must be one of: all, google, curated/.test(err.message));
  for (const command of ['login', 'scopes']) assert.equal(parseCliArgs([command, 'workspace-user', '--toolset', 'curated']).values.toolset, 'curated');
  const admin = ['--subject', 'admin@example.com', '--key-file', 'k.json'];
  assert.equal('toolset' in parseSetupAdminArgs(parseCliArgs(['setup-admin', ...admin]).values), false, 'no key without the flag');
  assert.equal(parseSetupAdminArgs(parseCliArgs(['setup-admin', ...admin, '--toolset', 'google']).values).toolset, 'google');
});

test('gsm scopes --toolset google: the gmail scopes of that toolset; without it the output has no toolset', async () => {
  const saved = process.env.GSM_TOOLSET;
  delete process.env.GSM_TOOLSET;
  try {
    const json = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true, toolset: 'google' }, registry(), json.out);
    const parsed = JSON.parse(json.lines.join('\n'));
    assert.equal(parsed.toolset, 'google');
    assert.equal(parsed.tools, GMAIL_GOOGLE.length);
    assert.equal(parsed.gatewayMethods, 0);
    assert.deepEqual(parsed.profiles.readonly.scopes, [G('gmail.readonly')]);
    assert.deepEqual(parsed.profiles.readwrite.scopes, [G('gmail.modify')]);

    const text = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: false, toolset: 'google' }, registry(), text.out);
    assert.match(text.text(), /^Toolset google: only the tools of this toolset are counted \(/m);

    const plain = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true }, registry(), plain.out);
    assert.equal('toolset' in JSON.parse(plain.lines.join('\n')), false);
    assert.equal(JSON.parse(plain.lines.join('\n')).tools > 90, true);

    // GSM_TOOLSET applies when --toolset is not given.
    process.env.GSM_TOOLSET = 'google';
    const fromEnv = capture();
    await runScopes({ group: 'workspace-user', servers: ['gmail'], json: true }, registry(), fromEnv.out);
    assert.equal(JSON.parse(fromEnv.lines.join('\n')).toolset, 'google');
  } finally {
    if (saved === undefined) delete process.env.GSM_TOOLSET;
    else process.env.GSM_TOOLSET = saved;
  }
});

/** A fake browser step that records the scopes asked for and grants them all. */
function fakeGoogle(account) {
  const seen = {};
  return {
    seen,
    deps: (cfg) => ({
      cfg,
      loopback: async (_id, _secret, scopes) => {
        seen.scopes = sorted(scopes);
        return { access_token: 'fake-access', refresh_token: 'fake-refresh', scope: scopes.join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}

test('login --toolset google asks for gmail.readonly only; GSM_TOOLSET does the same; a named account keeps its other scopes', async () => {
  const flag = tempTokens();
  const google = fakeGoogle('person@example.com');
  const run = capture();
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readonly', toolset: 'google' }, registry, run.out, google.deps(flag.cfg)), 0, run.text());
  assert.deepEqual(google.seen.scopes, sorted([G('gmail.readonly'), EMAIL]));
  assert.match(run.text(), /^Toolset google: only the tools of this toolset count toward the scopes/m);

  const env = tempTokens({ GSM_TOOLSET: 'google' });
  const viaEnv = fakeGoogle('person@example.com');
  assert.equal(await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite' }, registry, capture().out, viaEnv.deps(env.cfg)), 0);
  assert.deepEqual(viaEnv.seen.scopes, sorted([G('gmail.modify'), EMAIL]));

  // The account holds a Drive scope from another product of the group. A gmail login with the google toolset that names
  // the account keeps it (merge), so the toolset never takes scopes away from the other servers.
  const merge = tempTokens();
  saveAccount('workspace-user', 'person@example.com', { refresh_token: 'r', scope: `${G('drive.readonly')} ${EMAIL}` }, merge.cfg);
  const named = fakeGoogle('person@example.com');
  const out = capture();
  assert.equal(
    await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readonly', toolset: 'google', account: 'person@example.com' }, registry, out.out, named.deps(merge.cfg)),
    0,
    out.text(),
  );
  assert.deepEqual(named.seen.scopes, sorted([G('drive.readonly'), G('gmail.readonly'), EMAIL]));
  const stored = JSON.parse(readFileSync(accountTokenFile('workspace-user', 'person@example.com', merge.cfg), 'utf8')).scope.split(' ');
  assert.ok(stored.includes(G('drive.readonly')));
  assert.equal(/Not requested again/.test(out.text()), false, 'drive.readonly is a scope of the group, not a foreign one');
});

test('login without a toolset asks for the same scopes as before (all)', async () => {
  const a = tempTokens();
  const plain = fakeGoogle('person@example.com');
  await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite' }, registry, capture().out, plain.deps(a.cfg));
  const b = tempTokens();
  const all = fakeGoogle('person@example.com');
  const out = capture();
  await runLogin({ group: 'workspace-user', servers: ['gmail'], profile: 'readwrite', toolset: 'all' }, registry, out.out, all.deps(b.cfg));
  assert.deepEqual(all.seen.scopes, plain.seen.scopes);
  assert.deepEqual(plain.seen.scopes, sorted([G('gmail.modify'), G('gmail.settings.basic'), EMAIL]));
  assert.equal(/Toolset/.test(out.text()), false);
});

test('the chat sign-in passes --toolset to the login when the server has one, and nothing for all', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-toolset-argv-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'x', client_secret: 'y' } }));
  // A fake gsm CLI: it records its argv and prints a sign-in address, then exits.
  const cli = join(dir, 'fake-gsm.mjs');
  writeFileSync(
    cli,
    [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync(process.env.ARGV_FILE, JSON.stringify(process.argv.slice(2)));`,
      `console.log('https://accounts.google.com/o/oauth2/v2/auth?scope=x');`,
      '',
    ].join('\n'),
  );
  const argvFor = async (toolset, file) => {
    process.env.ARGV_FILE = join(dir, file);
    const signIn = createSignIn({
      cliFile: cli,
      group: 'workspace-user',
      server: 'gmail',
      cfg: loadConfig({ GSM_TOKEN_DIR: dir, ...(toolset ? { GSM_TOOLSET: toolset } : {}) }),
      adcScopes: () => [],
      onSignedIn: () => undefined,
    });
    await signIn.start('readonly', 'oauth');
    // Wait for the child to write its argv (it exits right after printing).
    for (let i = 0; i < 100; i++) {
      try {
        return JSON.parse(readFileSync(join(dir, file), 'utf8'));
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error('the fake CLI did not run');
  };
  try {
    const google = await argvFor('google', 'google.json');
    assert.ok(google.includes('--toolset=google'), google.join(' '));
    const all = await argvFor(undefined, 'all.json');
    assert.equal(all.some((a) => a.startsWith('--toolset')), false, all.join(' '));
    assert.deepEqual(all.slice(0, 6), ['login', 'workspace-user', '--profile', 'readonly', '--servers', 'gmail']);
  } finally {
    delete process.env.ARGV_FILE;
  }
});

// ---------------------------------------------------------------------------
// The chat sign-in on the built gmail plugin

const pluginServer = (id) => join(REPO, 'plugins', id, 'servers', `${id}.mjs`);

async function withServer(serverFile, tokenDir, extraEnv, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1', ...extraEnv };
  delete env.GSM_API_KEY;
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
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
    return await fn({ call });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

const askedIn = (answer) => new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ').sort();

test('auth_login on gmail with the google toolset asks for gmail.readonly (readonly) and gmail.modify (readwrite) only', async () => {
  const { dir } = tempTokens();
  await withServer(pluginServer('gmail'), dir, { GSM_TOOLSET: 'google' }, async ({ call }) => {
    assert.deepEqual(askedIn(await call('auth_login', { method: 'oauth', profile: 'readonly' })), sorted([G('gmail.readonly'), EMAIL]));
  });
  await withServer(pluginServer('gmail'), dir, { GSM_TOOLSET: 'google' }, async ({ call }) => {
    assert.deepEqual(askedIn(await call('auth_login', { method: 'oauth', profile: 'readwrite' })), sorted([G('gmail.modify'), EMAIL]));
  });
});
