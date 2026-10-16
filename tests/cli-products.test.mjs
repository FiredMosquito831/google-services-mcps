// Tests for the product-based gsm CLI: product ids, --confirmation, setup-apikey, the claude install
// commands for several products, and the security posture. Run `npx tsc -p tsconfig.json` first (tests import dist/).
// Every test works in its own temp folders, and every spawned gsm gets GSM_TOKEN_DIR and --home in a temp folder.
// The real home folder and the real claude CLI are never used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as codex from '../dist/cli/adapters/codex.js';
import * as opencode from '../dist/cli/adapters/opencode.js';
import * as agy from '../dist/cli/adapters/agy.js';
import * as claude from '../dist/cli/adapters/claude.js';
import { parseCliArgs, parseGroup, parseInstallArgs, parsePluginChoice } from '../dist/cli/args.js';
import { checkApiKey } from '../dist/cli/apikey.js';
import { loadProductRegistry, productIds } from '../dist/cli/products.js';
import { UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GSM = join(REPO, 'dist', 'cli', 'gsm.js');
const REPO_PRODUCTS = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products;
const REPO_IDS = Object.keys(REPO_PRODUCTS);

const SERVERS = [
  { name: 'gcloud', plugin: 'gcloud', group: 'cloud' },
  { name: 'gsc', plugin: 'gsc', group: 'searchconsole' },
];

async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-products-test-'));
  const paths = {
    root,
    home: join(root, 'home'),
    cwd: join(root, 'project'),
    bundle: join(root, 'bundle'),
    tokens: join(root, 'tokens'),
  };
  for (const dir of [paths.home, paths.cwd, paths.bundle, paths.tokens]) mkdirSync(dir, { recursive: true });
  try {
    return await fn(paths);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function makeCtx(paths, overrides = {}) {
  return {
    home: paths.home,
    cwd: paths.cwd,
    scope: 'global',
    pathArg: undefined,
    pluginRoot: undefined,
    repoRoot: undefined,
    plugins: [],
    servers: SERVERS,
    serverFile: (s) => join(paths.bundle, `${s.name}.mjs`),
    dryRun: false,
    allowWrites: false,
    keepData: false,
    run: async () => {
      throw new Error('the runner must not be called here');
    },
    platform: 'linux',
    ...overrides,
  };
}

const read = (file) => readFileSync(file, 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

/**
 * Runs the real built CLI. The environment is cleaned of the GSM_* settings that matter here, so the
 * outcome depends only on the arguments given. GSM_TOKEN_DIR is always set, to a temp folder.
 */
function runGsm(args, { tokenDir, env = {}, input = '' }) {
  if (!tokenDir) throw new Error('runGsm needs a temp tokenDir, never the real home');
  const childEnv = { ...process.env };
  for (const name of ['GSM_API_KEY_INPUT', 'GSM_CONFIRMATION', 'GSM_ALLOW_WRITES', 'GSM_TOKEN_DIR']) delete childEnv[name];
  Object.assign(childEnv, env, { GSM_TOKEN_DIR: tokenDir });
  const res = spawnSync(process.execPath, [GSM, ...args], { env: childEnv, input, encoding: 'utf8', timeout: 60_000 });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function fakeRunner(respond) {
  const calls = [];
  const run = async (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    return respond(command, args, cwd);
  };
  return { run, calls };
}

const OK = { code: 0, stdout: '', stderr: '' };
const resolvePath = (p) => p;

// ---------- product ids ----------

test('an unknown plugin id is a usage error that lists the valid ids', () => {
  const ids = ['gcloud', 'gsc'];
  assert.throws(
    () => parseInstallArgs(parseCliArgs(['install', '--agent', 'codex', '--plugin', 'nope', '--scope', 'global']).values, 'install', resolvePath, ids),
    (err) => err instanceof UsageError && /unknown plugin id "nope"/.test(err.message) && /Valid plugin ids: gcloud, gsc, or all/.test(err.message),
  );
  // A list with one bad id is refused as a whole.
  assert.throws(() => parsePluginChoice('gcloud,nope,gsc', ids), UsageError);
  assert.deepEqual(parsePluginChoice('gsc,gcloud,gsc', ids), ['gsc', 'gcloud']);
  assert.equal(parsePluginChoice('all', ids), 'all');
  assert.throws(() => parsePluginChoice('gcloud,all', ids), /cannot be combined/);
});

test('a plugin folder validates ids against its own servers.json, so another product is refused', () => {
  const plugin = mkdtempSync(join(tmpdir(), 'gsm-plugin-folder-'));
  try {
    mkdirSync(join(plugin, 'bin'), { recursive: true });
    writeFileSync(
      join(plugin, 'servers.json'),
      JSON.stringify({ plugins: { gsc: 'Google Search' }, groups: {}, servers: [{ name: 'gsc', plugin: 'gsc', group: 'searchconsole', kind: 'curated', label: 'x' }] }),
    );
    const loaded = loadProductRegistry({ layout: 'plugin', root: plugin, mapFile: join(plugin, 'servers.json') }, pathToFileURL(join(plugin, 'bin', 'gsm.mjs')).href);
    const ids = productIds(loaded);
    assert.deepEqual(ids, ['gsc']);
    assert.throws(() => parseInstallArgs(parseCliArgs(['install', '--agent', 'codex', '--plugin', 'gcloud', '--scope', 'global']).values, 'install', resolvePath, ids), /Valid plugin ids: gsc/);
  } finally {
    rmSync(plugin, { recursive: true, force: true });
  }
});

test('the repo product list comes from config/products.json, and developer products are in its registry', () => {
  const reg = loadProductRegistry({ layout: 'repo', root: REPO, mapFile: join(REPO, 'config', 'products.json') }, import.meta.url);
  assert.deepEqual([...productIds(reg)].sort(), [...REPO_IDS].sort());
  for (const id of ['gplay', 'gfirebase', 'gmaps']) {
    assert.equal(reg.servers.find((s) => s.plugin === id)?.group, 'developer', `${id} should be in the developer group`);
  }
});

test('the CLI refuses an unknown product id with exit code 2 and lists the repo product ids', () =>
  withTemp((p) => {
    const res = runGsm(['install', '--agent', 'codex', '--plugin', 'nope', '--scope', 'global', '--home', p.home, '--dry-run'], { tokenDir: p.tokens });
    assert.equal(res.code, 2);
    assert.match(res.stderr, /unknown plugin id "nope"/);
    for (const id of REPO_IDS) assert.ok(res.stderr.includes(id), `valid id ${id} should be listed`);
    assert.equal(res.stdout, '');
    assert.equal(existsSync(join(p.home, '.codex')), false);
  }));

// ---------- --confirmation ----------

test('--confirmation rejects unknown values and accepts the three modes', () => {
  const ids = ['gcloud'];
  const base = ['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'global'];
  for (const mode of ['every-change', 'destructive-only', 'off']) {
    const parsed = parseInstallArgs(parseCliArgs([...base, '--confirmation', mode]).values, 'install', resolvePath, ids);
    assert.equal(parsed.confirmation, mode);
  }
  assert.equal(parseInstallArgs(parseCliArgs(base).values, 'install', resolvePath, ids).confirmation, undefined, 'no flag means nothing is written');
  for (const bad of ['always', 'OFF', 'none', '']) {
    assert.throws(
      () => parseInstallArgs(parseCliArgs([...base, '--confirmation', bad]).values, 'install', resolvePath, ids),
      /--confirmation must be one of: every-change, destructive-only, off/,
    );
  }
  // uninstall has no --confirmation option.
  assert.throws(() => parseCliArgs(['uninstall', '--agent', 'codex', '--plugin', 'all', '--scope', 'global', '--confirmation', 'off']), /Unknown option/);
});

test('codex writes GSM_CONFIRMATION into each server environment, and writes nothing when the flag is absent', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.codex', 'config.toml');
    await codex.install(makeCtx(p, { confirmation: 'destructive-only' }));
    let text = read(file);
    assert.equal(count(text, 'env = { GSM_CONFIRMATION = "destructive-only" }'), 2);

    await codex.install(makeCtx(p, { allowWrites: true, confirmation: 'off' }));
    text = read(file);
    assert.equal(count(text, 'env = { GSM_ALLOW_WRITES = "true", GSM_CONFIRMATION = "off" }'), 2);

    await codex.install(makeCtx(p));
    assert.equal(read(file).includes('GSM_CONFIRMATION'), false, 'without the flag the server default applies');
  }));

test('opencode and agy write GSM_CONFIRMATION into their server environment keys', () =>
  withTemp(async (p) => {
    const openFile = join(p.home, '.config', 'opencode', 'opencode.json');
    await opencode.install(makeCtx(p, { confirmation: 'every-change', servers: [SERVERS[0]] }));
    assert.deepEqual(JSON.parse(read(openFile)).mcp['gsm-gcloud'].environment, { GSM_CONFIRMATION: 'every-change' });

    mkdirSync(join(p.home, '.gemini', 'config'), { recursive: true });
    await agy.install(makeCtx(p, { allowWrites: true, confirmation: 'off', servers: [SERVERS[0]] }));
    const agyFile = join(p.home, '.gemini', 'config', 'mcp_config.json');
    assert.deepEqual(JSON.parse(read(agyFile)).mcpServers['gsm-gcloud'].env, { GSM_ALLOW_WRITES: 'true', GSM_CONFIRMATION: 'off' });
  }));

test('the claude adapter passes --confirmation to each plugin install as --config, and runs no configure command', () =>
  withTemp(async (p) => {
    const listed = JSON.stringify([{ name: 'google-services-mcps' }]);
    const { run, calls } = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: listed, stderr: '' } : OK));
    const res = await claude.install(makeCtx(p, { run, plugins: ['gcloud', 'gsc'], confirmation: 'destructive-only' }));
    assert.deepEqual(res.errors, []);
    assert.deepEqual(
      calls.slice(1).map((c) => c.args),
      [
        ['plugin', 'install', 'gcloud@google-services-mcps', '--scope', 'user', '--config', 'confirmation=destructive-only'],
        ['plugin', 'install', 'gsc@google-services-mcps', '--scope', 'user', '--config', 'confirmation=destructive-only'],
      ],
    );
    assert.ok(res.notes.some((n) => n === 'plugin options set: confirmation=destructive-only'), res.notes.join('\n'));
    assert.equal(calls.some((c) => c.args.includes('configure')), false);
  }));

// ---------- claude install commands for several products ----------

test('claude: builds one <id>@google-services-mcps install command for each product id', () =>
  withTemp(async (p) => {
    const listed = JSON.stringify([{ name: 'google-services-mcps' }]);
    const { run, calls } = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: listed, stderr: '' } : OK));
    const ids = ['gcloud', 'gsc', 'gsearch'];
    const res = await claude.install(makeCtx(p, { run, plugins: ids }));
    assert.deepEqual(res.errors, []);
    assert.deepEqual(
      calls.slice(1).map((c) => c.args),
      ids.map((id) => ['plugin', 'install', `${id}@google-services-mcps`, '--scope', 'user']),
    );
    assert.deepEqual(
      res.commands,
      ids.map((id) => `claude plugin install ${id}@google-services-mcps --scope user`),
    );
  }));

test('claude: dry-run plans the same commands for several products and runs none', () =>
  withTemp(async (p) => {
    const { run, calls } = fakeRunner(() => {
      throw new Error('must not run in dry-run');
    });
    const ids = ['gdrive', 'gmail'];
    const res = await claude.install(makeCtx(p, { run, dryRun: true, plugins: ids, scope: 'project', repoRoot: '/repo' }));
    assert.equal(calls.length, 0);
    for (const id of ids) {
      assert.ok(res.commands.includes(`claude plugin install ${id}@google-services-mcps --scope project`));
    }
  }));

// ---------- setup-apikey ----------

test('setup-apikey saves the key from GSM_API_KEY_INPUT with mode 0600 and never prints it', () =>
  withTemp((p) => {
    const key = 'AIzaSyTEST-key_0123456789';
    const file = join(p.tokens, 'apikey.json');
    const res = runGsm(['setup-apikey'], { tokenDir: p.tokens, env: { GSM_API_KEY_INPUT: key } });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(res.stdout.trim(), `API key saved to ${file}`);
    assert.equal(res.stdout.includes(key) || res.stderr.includes(key), false, 'the key must not be printed');
    assert.deepEqual(JSON.parse(read(file)), { apiKey: key });
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600, 'the key file must be mode 0600');
    }
  }));

test('setup-apikey refuses to overwrite without --force, and --force replaces the key', () =>
  withTemp((p) => {
    const file = join(p.tokens, 'apikey.json');
    const first = 'first-key-111';
    const second = 'second-key-222';
    assert.equal(runGsm(['setup-apikey'], { tokenDir: p.tokens, env: { GSM_API_KEY_INPUT: first } }).code, 0);

    const refused = runGsm(['setup-apikey'], { tokenDir: p.tokens, env: { GSM_API_KEY_INPUT: second } });
    assert.equal(refused.code, 2);
    assert.match(refused.stderr, /already exists\. Re-run with --force/);
    assert.deepEqual(JSON.parse(read(file)), { apiKey: first }, 'a refused run must not change the file');
    for (const text of [refused.stdout, refused.stderr]) {
      assert.equal(text.includes(first) || text.includes(second), false, 'no key may appear in output');
    }

    const forced = runGsm(['setup-apikey', '--force'], { tokenDir: p.tokens, input: `${second}\n` });
    assert.equal(forced.code, 0, forced.stderr);
    assert.deepEqual(JSON.parse(read(file)), { apiKey: second });
    assert.equal(forced.stdout.includes(second) || forced.stderr.includes(second), false);
  }));

test('setup-apikey reads stdin when GSM_API_KEY_INPUT is not set, and rejects a key given as an argument', () =>
  withTemp((p) => {
    const key = 'stdin-key-333';
    const ok = runGsm(['setup-apikey'], { tokenDir: p.tokens, input: `${key}\n` });
    assert.equal(ok.code, 0, ok.stderr);
    assert.deepEqual(JSON.parse(read(join(p.tokens, 'apikey.json'))), { apiKey: key });

    // A key given as an argument is refused, and the message does not repeat it.
    const argKey = 'arg-key-444';
    const asArg = runGsm(['setup-apikey', argKey], { tokenDir: p.tokens, env: { GSM_API_KEY_INPUT: key } });
    assert.equal(asArg.code, 2);
    assert.equal(asArg.stdout.includes(argKey) || asArg.stderr.includes(argKey), false);
    const asFlag = runGsm(['setup-apikey', `--${argKey}`], { tokenDir: p.tokens });
    assert.equal(asFlag.code, 2);
    assert.equal(asFlag.stderr.includes(argKey), false, 'an unknown option that is a key must not be echoed');
  }));

test('setup-apikey validates the key: non-empty, no spaces, at most 200 characters, and never echoes it', () => {
  assert.equal(checkApiKey('  abc123  '), 'abc123');
  assert.throws(() => checkApiKey('   '), /empty/);
  assert.throws(() => checkApiKey('ab cd'), /must not contain spaces/);
  assert.throws(() => checkApiKey('ab\ncd'), /spaces or line breaks/);
  const long = 'k'.repeat(201);
  assert.throws(() => checkApiKey(long), /longer than 200 characters/);
  assert.equal(checkApiKey('k'.repeat(200)).length, 200);
  // The messages never include the key.
  try {
    checkApiKey('secret value');
  } catch (err) {
    assert.equal(err.message.includes('secret value'), false);
  }
});

test('setup-apikey with no key given is a usage error', () =>
  withTemp((p) => {
    const res = runGsm(['setup-apikey'], { tokenDir: p.tokens, input: '' });
    assert.equal(res.code, 2);
    assert.match(res.stderr, /no API key given/);
    assert.equal(existsSync(join(p.tokens, 'apikey.json')), false);
  }));

test('login apikey prints the alias message and does no login', () =>
  withTemp((p) => {
    const res = runGsm(['login', 'apikey'], { tokenDir: p.tokens });
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /no login is needed/);
    assert.match(res.stdout, /node gsm\.mjs setup-apikey/);
  }));

// ---------- groups ----------

test('parseGroup accepts developer and apikey, and rejects an unknown group', () => {
  assert.equal(parseGroup(['developer'], 'usage'), 'developer');
  assert.equal(parseGroup(['apikey'], 'usage'), 'apikey');
  assert.equal(parseGroup(['workspace-admin'], 'usage'), 'workspace-admin');
  assert.throws(() => parseGroup(['nope'], 'usage'), /unknown group "nope"/);
});

// ---------- help and status ----------

test('gsm --help lists every command on its own line, and the new flag and command', () =>
  withTemp((p) => {
    const res = runGsm(['--help'], { tokenDir: p.tokens });
    assert.equal(res.code, 0);
    const commands = ['install', 'uninstall', 'login', 'scopes', 'setup-client', 'setup-apikey', 'setup-admin', 'status', 'logout'];
    for (const name of commands) {
      assert.ok(new RegExp(`^  ${name}\\s{2,}\\S`, 'm').test(res.stdout), `help must list "${name}" with a one-line description`);
    }
    assert.ok(res.stdout.includes('--confirmation <every-change|destructive-only|off>'));
    assert.ok(res.stdout.includes('developer'));
  }));

test('status shows the security posture of a token and never prints token values', () =>
  withTemp((p) => {
    const scopes = ['https://www.googleapis.com/auth/cloud-platform.read-only', 'https://www.googleapis.com/auth/gmail.readonly'];
    writeFileSync(
      join(p.tokens, 'cloud.token.json'),
      JSON.stringify({ scope: scopes.join(' '), refresh_token: 'SECRET-REFRESH-VALUE', access_token: 'SECRET-ACCESS-VALUE', expiry_date: Date.now() + 3600_000 }),
    );

    const defaults = runGsm(['status'], { tokenDir: p.tokens });
    assert.equal(defaults.code, 0, defaults.stderr);
    assert.match(defaults.stdout, /security: 2 granted scope\(s\), read-only only: yes; confirmation: every-change \(default\); writes: disabled/);
    assert.match(defaults.stdout, /apikey: not set \(run: node gsm\.mjs setup-apikey\)/);
    assert.equal(defaults.stdout.includes('SECRET-'), false, 'token values must not be printed');

    const set = runGsm(['status'], { tokenDir: p.tokens, env: { GSM_CONFIRMATION: 'off', GSM_ALLOW_WRITES: 'true' } });
    assert.match(set.stdout, /confirmation: off; writes: enabled/);
  }));
