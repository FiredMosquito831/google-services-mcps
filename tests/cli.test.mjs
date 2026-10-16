// Tests for the gsm installer. Run `npx tsc -p tsconfig.json` first (tests import dist/).
// Every test works in its own temp folders. The real home folder is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as codex from '../dist/cli/adapters/codex.js';
import * as opencode from '../dist/cli/adapters/opencode.js';
import * as agy from '../dist/cli/adapters/agy.js';
import * as claude from '../dist/cli/adapters/claude.js';
import { tomlString } from '../dist/cli/adapters/codex.js';
import { parseCliArgs, parseInstallArgs } from '../dist/cli/args.js';
import { runInstall, selectPlugins, selectServers } from '../dist/cli/install.js';
import { backupFile, timestamp } from '../dist/cli/fsutil.js';
import { checkoutRootFor, findRoots, repoRootFor, serverFileFor } from '../dist/cli/paths.js';
import { AGY_GLOBAL_ONLY, CODEX_BEGIN, CODEX_END, UsageError } from '../dist/cli/types.js';

const SERVERS = [
  { name: 'gcloud', plugin: 'google-cloud', group: 'cloud' },
  { name: 'gsc', plugin: 'google-search', group: 'searchconsole' },
];

async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-cli-test-'));
  const paths = {
    root,
    home: join(root, 'home'),
    cwd: join(root, 'project'),
    folder: join(root, 'folder'),
    bundle: join(root, 'bundle'),
  };
  for (const dir of [paths.home, paths.cwd, paths.folder, paths.bundle]) mkdirSync(dir, { recursive: true });
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

// ---------- codex ----------

test('codex: block is inserted, merged on reinstall, and removed on uninstall with outside text untouched', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.codex', 'config.toml');
    mkdirSync(dirname(file), { recursive: true });
    const userText = 'model = "gpt-5"\n\n[profiles.work]\napproval_policy = "never"\n';
    writeFileSync(file, userText);

    await codex.install(makeCtx(p, { servers: [SERVERS[0]] }));
    let text = read(file);
    assert.ok(text.startsWith(userText), 'text outside the block must be unchanged');
    assert.equal(count(text, CODEX_BEGIN), 1);
    assert.ok(text.includes(`[mcp_servers.gsm-gcloud]\ncommand = "node"\nargs = ['${join(p.bundle, 'gcloud.mjs')}']`));

    // Installing the second server merges into the block and does not duplicate the first.
    await codex.install(makeCtx(p));
    text = read(file);
    assert.equal(count(text, CODEX_BEGIN), 1);
    assert.equal(count(text, '[mcp_servers.gsm-gcloud]'), 1);
    assert.equal(count(text, '[mcp_servers.gsm-gsc]'), 1);

    // Reinstalling with --allow-writes updates both tables and adds the env line.
    const updated = await codex.install(makeCtx(p, { allowWrites: true }));
    text = read(file);
    assert.equal(count(text, 'env = { GSM_ALLOW_WRITES = "true" }'), 2);
    assert.deepEqual(updated.changes[0].updated.sort(), ['gsm-gcloud', 'gsm-gsc']);

    // Uninstall one server keeps the other.
    await codex.uninstall(makeCtx(p, { servers: [SERVERS[1]] }));
    text = read(file);
    assert.equal(count(text, '[mcp_servers.gsm-gsc]'), 0);
    assert.equal(count(text, '[mcp_servers.gsm-gcloud]'), 1);

    // Uninstall the rest: the block is gone and the original text is restored byte for byte.
    await codex.uninstall(makeCtx(p));
    assert.equal(read(file), userText);
  }));

test('codex: a second identical install changes nothing and makes no backup', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.codex', 'config.toml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'x = 1\n');
    await codex.install(makeCtx(p));
    const again = await codex.install(makeCtx(p));
    assert.deepEqual(again.backups, []);
    assert.equal(again.changes[0].before, again.changes[0].after);
  }));

test('codex: unbalanced markers are refused', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.codex', 'config.toml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${CODEX_BEGIN}\n[mcp_servers.gsm-gcloud]\ncommand = "node"\n`);
    await assert.rejects(codex.install(makeCtx(p)), /unbalanced/);
    assert.ok(read(file).startsWith(CODEX_BEGIN), 'a refused file must not change');

    writeFileSync(file, `${CODEX_END}\n${CODEX_BEGIN}\n`);
    await assert.rejects(codex.install(makeCtx(p)), /unbalanced/);
  }));

test('codex: a user-owned table with the same name outside the block is refused', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.codex', 'config.toml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '[mcp_servers.gsm-gcloud]\ncommand = "mine"\n');
    await assert.rejects(codex.install(makeCtx(p)), /already defines \[mcp_servers\.gsm-gcloud\]/);
    assert.equal(read(file), '[mcp_servers.gsm-gcloud]\ncommand = "mine"\n');
  }));

test('codex: TOML strings use literal quotes when possible and escape otherwise', () => {
  assert.equal(tomlString('C:\\Program Files\\x.mjs'), "'C:\\Program Files\\x.mjs'");
  assert.equal(tomlString("it's.mjs"), '"it\'s.mjs"');
  // No single quote: a literal string, which needs no escaping for quotes or backslashes.
  assert.equal(tomlString('a"b\\c'), "'a\"b\\c'");
  // A single quote and a backslash together: a basic string with the backslash doubled.
  assert.equal(tomlString("it's\\x"), '"it\'s\\\\x"');
  assert.equal(tomlString('a\nb'), '"a\\u000ab"');
});

test('codex: project scope writes under cwd and a folder scope under --path', () =>
  withTemp(async (p) => {
    await codex.install(makeCtx(p, { scope: 'project' }));
    assert.ok(existsSync(join(p.cwd, '.codex', 'config.toml')));
    await codex.install(makeCtx(p, { scope: 'folder', pathArg: p.folder }));
    assert.ok(existsSync(join(p.folder, '.codex', 'config.toml')));
  }));

// ---------- opencode ----------

test('opencode: keys are added, other keys keep their order, and only gsm keys are removed', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.config', 'opencode', 'opencode.json');
    mkdirSync(dirname(file), { recursive: true });
    const initial = {
      $schema: 'https://opencode.ai/config.json',
      theme: 'dark',
      mcp: { 'my-own': { type: 'remote', url: 'https://example.test/mcp', enabled: true }, 'gsm-custom': { type: 'local', command: ['x'], enabled: true } },
      model: 'provider/model',
    };
    writeFileSync(file, JSON.stringify(initial, null, 2) + '\n');

    await opencode.install(makeCtx(p));
    let obj = JSON.parse(read(file));
    assert.deepEqual(Object.keys(obj), ['$schema', 'theme', 'mcp', 'model']);
    assert.deepEqual(Object.keys(obj.mcp), ['my-own', 'gsm-custom', 'gsm-gcloud', 'gsm-gsc']);
    assert.deepEqual(obj.mcp['gsm-gcloud'], { type: 'local', command: ['node', join(p.bundle, 'gcloud.mjs')], enabled: true });
    assert.equal(obj.theme, 'dark');
    assert.equal(obj.model, 'provider/model');
    assert.deepEqual(obj.mcp['my-own'], initial.mcp['my-own']);

    await opencode.uninstall(makeCtx(p));
    obj = JSON.parse(read(file));
    assert.deepEqual(Object.keys(obj), ['$schema', 'theme', 'mcp', 'model']);
    assert.deepEqual(Object.keys(obj.mcp), ['my-own', 'gsm-custom'], 'the user key gsm-custom is not in the selection and must stay');
    assert.equal(obj.theme, 'dark');
  }));

test('opencode: a new file gets the schema, and --allow-writes adds environment', () =>
  withTemp(async (p) => {
    const file = join(p.cwd, 'opencode.json');
    await opencode.install(makeCtx(p, { scope: 'project', allowWrites: true, servers: [SERVERS[0]] }));
    const obj = JSON.parse(read(file));
    assert.equal(obj.$schema, 'https://opencode.ai/config.json');
    assert.deepEqual(obj.mcp['gsm-gcloud'].environment, { GSM_ALLOW_WRITES: 'true' });
  }));

test('opencode: JSONC input (comments or trailing commas) is refused and left unchanged', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.config', 'opencode', 'opencode.json');
    mkdirSync(dirname(file), { recursive: true });
    const withComment = '{\n  // my settings\n  "theme": "dark"\n}\n';
    writeFileSync(file, withComment);
    await assert.rejects(opencode.install(makeCtx(p)), /JSONC/);
    assert.equal(read(file), withComment);

    const withTrailing = '{\n  "theme": "dark",\n}\n';
    writeFileSync(file, withTrailing);
    await assert.rejects(opencode.install(makeCtx(p)), /JSONC/);
    assert.equal(read(file), withTrailing);
  }));

// ---------- agy ----------

test('agy: project and local scope are refused', () =>
  withTemp(async (p) => {
    for (const scope of ['project', 'local', 'folder']) {
      const ctx = makeCtx(p, { scope, pathArg: p.folder });
      await assert.rejects(agy.install(ctx), (err) => err.message === AGY_GLOBAL_ONLY);
      await assert.rejects(agy.uninstall(ctx), (err) => err.message === AGY_GLOBAL_ONLY);
    }
  }));

test('agy: global install keeps other keys and uninstall removes only gsm- entries', () =>
  withTemp(async (p) => {
    const dir = join(p.home, '.gemini', 'config');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'mcp_config.json');
    writeFileSync(file, JSON.stringify({ mcpServers: { 'ase-moodle': { command: 'python', args: ['-m', 'x'], disabled: false } }, other: 1 }, null, 2));

    await agy.install(makeCtx(p));
    let obj = JSON.parse(read(file));
    assert.equal(obj.other, 1);
    assert.deepEqual(Object.keys(obj.mcpServers), ['ase-moodle', 'gsm-gcloud', 'gsm-gsc']);
    assert.deepEqual(obj.mcpServers['gsm-gcloud'], { command: 'node', args: [join(p.bundle, 'gcloud.mjs')], disabled: false });

    await agy.uninstall(makeCtx(p));
    obj = JSON.parse(read(file));
    assert.deepEqual(Object.keys(obj.mcpServers), ['ase-moodle']);
    assert.equal(obj.other, 1);
  }));

test('agy: a missing agy config folder is an install error, not a silent create', () =>
  withTemp(async (p) => {
    await assert.rejects(agy.install(makeCtx(p)), /agy config folder not found/);
    assert.equal(existsSync(join(p.home, '.gemini')), false);
  }));

// ---------- dry run and backups ----------

test('dry-run writes nothing for codex and opencode, and creates no backups', () =>
  withTemp(async (p) => {
    const codexFile = join(p.home, '.codex', 'config.toml');
    const openFile = join(p.home, '.config', 'opencode', 'opencode.json');
    const dry = makeCtx(p, { dryRun: true });
    const cres = await codex.install(dry);
    const ores = await opencode.install(dry);
    assert.equal(existsSync(join(p.home, '.codex')), false);
    assert.equal(existsSync(join(p.home, '.config')), false);
    assert.deepEqual(cres.backups, []);
    assert.deepEqual(ores.backups, []);
    assert.ok(cres.changes[0].after.includes(CODEX_BEGIN));
    assert.deepEqual(ores.changes[0].added, ['gsm-gcloud', 'gsm-gsc']);

    // With an existing file, dry-run keeps it and makes no backup.
    mkdirSync(dirname(openFile), { recursive: true });
    writeFileSync(openFile, '{"theme":"dark"}\n');
    await opencode.install(dry);
    assert.equal(read(openFile), '{"theme":"dark"}\n');
    assert.deepEqual(readdirSync(dirname(openFile)), ['opencode.json']);
  }));

test('backups: an existing file is copied to a gsm-backup name before it changes, with the same content', () =>
  withTemp(async (p) => {
    const file = join(p.home, '.config', 'opencode', 'opencode.json');
    mkdirSync(dirname(file), { recursive: true });
    const original = '{"theme":"dark"}\n';
    writeFileSync(file, original);
    const res = await opencode.install(makeCtx(p));
    assert.equal(res.backups.length, 1);
    const [backup] = res.backups;
    assert.equal(dirname(backup), dirname(file));
    assert.match(backup, /\.gsm-backup-\d{8}-\d{6}(-\d+)?$/);
    assert.equal(read(backup), original);
    // No temp file is left behind.
    assert.equal(readdirSync(dirname(file)).some((n) => n.endsWith('.gsm-tmp')), false);
  }));

test('backups: a new file gets no backup, and an existing backup is never overwritten', () =>
  withTemp(async (p) => {
    const res = await codex.install(makeCtx(p));
    assert.deepEqual(res.backups, []);

    const file = join(p.home, 'a.txt');
    writeFileSync(file, 'one');
    const when = new Date(2026, 9, 13, 17, 5, 9);
    const first = backupFile(file, when);
    const second = backupFile(file, when);
    assert.equal(first, `${file}.gsm-backup-20261013-170509`);
    assert.equal(second, `${first}-1`);
    assert.equal(read(first), 'one');
  }));

test('timestamp formats local time as YYYYMMDD-HHMMSS', () => {
  assert.equal(timestamp(new Date(2026, 9, 13, 7, 4, 9)), '20261013-070409');
});

// ---------- claude (argument building through an injected runner) ----------

function fakeRunner(respond) {
  const calls = [];
  const run = async (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    return respond(command, args, cwd);
  };
  return { run, calls };
}

const OK = { code: 0, stdout: '', stderr: '' };

test('claude: installs into a new marketplace and maps global to --scope user', () =>
  withTemp(async (p) => {
    const listed = JSON.stringify([{ name: 'claude-plugins-official', source: 'x' }]);
    const { run, calls } = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: listed, stderr: '' } : OK));
    const res = await claude.install(
      makeCtx(p, { run, plugins: ['google-cloud'], repoRoot: '/repo/root' }),
    );
    assert.deepEqual(res.errors, []);
    assert.deepEqual(calls.map((c) => c.args), [
      ['plugin', 'marketplace', 'list', '--json'],
      ['plugin', 'marketplace', 'add', '/repo/root', '--scope', 'user'],
      ['plugin', 'install', 'google-cloud@google-services-mcps', '--scope', 'user'],
    ]);
    assert.ok(calls.every((c) => c.command === 'claude'));
    assert.equal(calls[0].cwd, p.cwd);
  }));

test('claude: a folder install declares the marketplace in local settings every time (no list check), then installs at local scope', () =>
  withTemp(async (p) => {
    const listed = JSON.stringify([{ name: 'google-services-mcps' }]);
    const { run, calls } = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: listed, stderr: '' } : OK));
    await claude.install(makeCtx(p, { run, scope: 'folder', pathArg: p.folder, plugins: ['google-search'] }));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[2], 'add', 'the marketplace is declared in the folder scope');
    assert.deepEqual(calls[0].args.slice(-2), ['--scope', 'local']);
    assert.deepEqual(calls[1].args, ['plugin', 'install', 'google-search@google-services-mcps', '--scope', 'local']);
    assert.equal(calls[1].cwd, p.folder);
  }));

test('claude: project scope maps to --scope project, and uninstall passes --keep-data only when asked', () =>
  withTemp(async (p) => {
    const { run, calls } = fakeRunner(() => OK);
    await claude.uninstall(makeCtx(p, { run, scope: 'project', plugins: ['google-business'], keepData: true }));
    await claude.uninstall(makeCtx(p, { run, scope: 'project', plugins: ['google-business'], keepData: false }));
    assert.deepEqual(calls[0].args, ['plugin', 'uninstall', 'google-business@google-services-mcps', '--scope', 'project', '--keep-data']);
    assert.deepEqual(calls[1].args, ['plugin', 'uninstall', 'google-business@google-services-mcps', '--scope', 'project']);
  }));

test('claude: on Windows it falls back from claude to claude.cmd when the first name cannot start', () =>
  withTemp(async (p) => {
    const seen = [];
    const run = async (command, args) => {
      seen.push(command);
      if (command === 'claude') {
        const err = new Error('spawn claude ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return args[2] === 'list' ? { code: 0, stdout: '[]', stderr: '' } : OK;
    };
    const res = await claude.install(makeCtx(p, { run, platform: 'win32', plugins: ['google-cloud'], repoRoot: 'C:\\repo' }));
    assert.deepEqual(res.errors, []);
    assert.equal(seen[0], 'claude');
    assert.equal(seen[1], 'claude.cmd');
  }));

test('claude: dry-run plans the commands and runs nothing', () =>
  withTemp(async (p) => {
    const { run, calls } = fakeRunner(() => {
      throw new Error('must not run in dry-run');
    });
    const res = await claude.install(makeCtx(p, { run, dryRun: true, plugins: ['google-cloud', 'google-search'], repoRoot: '/repo' }));
    assert.equal(calls.length, 0);
    assert.ok(res.commands.some((c) => c.includes('plugin install google-cloud@google-services-mcps --scope user')));
    assert.ok(res.commands.some((c) => c.includes('plugin marketplace add /repo')));
  }));

test('claude: with no checkout the marketplace comes from GitHub, and --marketplace overrides the source', () =>
  withTemp(async (p) => {
    const { run, calls } = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: '[]', stderr: '' } : OK));
    const res = await claude.install(makeCtx(p, { run, plugins: ['google-cloud'], repoRoot: undefined }));
    assert.deepEqual(res.errors, []);
    assert.deepEqual(calls[1].args, ['plugin', 'marketplace', 'add', 'FiredMosquito831/google-services-mcps', '--scope', 'user']);

    const fork = fakeRunner((cmd, args) => (args[2] === 'list' ? { code: 0, stdout: '[]', stderr: '' } : OK));
    await claude.install(makeCtx(p, { run: fork.run, plugins: ['google-cloud'], repoRoot: '/repo', marketplace: 'someone/fork' }));
    assert.deepEqual(fork.calls[1].args, ['plugin', 'marketplace', 'add', 'someone/fork', '--scope', 'user'], '--marketplace beats the checkout');
  }));

// ---------- argument parsing ----------

test('args: help and unknown commands', () => {
  assert.equal(parseCliArgs([]).command, 'help');
  assert.equal(parseCliArgs(['--help']).command, 'help');
  assert.equal(parseCliArgs(['status', '--help']).command, 'help');
  assert.throws(() => parseCliArgs(['bogus']), UsageError);
  assert.throws(() => parseCliArgs(['status', '--nope']), UsageError);
});

test('args: install flags are validated', () => {
  const resolvePath = (p) => p;
  const ids = ['gcloud', 'gsc'];
  const ok = parseCliArgs(['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'global', '--allow-writes', '--dry-run']);
  const parsed = parseInstallArgs(ok.values, 'install', resolvePath, ids);
  assert.equal(parsed.agent, 'codex');
  assert.equal(parsed.allowWrites, true);
  assert.equal(parsed.dryRun, true);

  const bad = (argv) => () => parseInstallArgs(parseCliArgs(argv).values, argv[0], resolvePath, ids);
  // local without --path acts on the current folder; "folder" is an alias of local.
  assert.equal(parseInstallArgs(parseCliArgs(['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'folder']).values, 'install', resolvePath, ids).scope, 'local');
  assert.throws(bad(['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'global', '--path', '/x']), /only used with --scope project or local/);
  assert.throws(bad(['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'nope']), /--scope must be one of: global, project, local/);
  assert.throws(bad(['install', '--agent', 'claude', '--plugin', 'all', '--scope', 'global', '--home', '/h']), /does not apply to claude/);
  assert.throws(bad(['install', '--agent', 'nope', '--plugin', 'all', '--scope', 'global']), /--agent must be one of/);
  assert.throws(bad(['install', '--plugin', 'all', '--scope', 'global']), /--agent is required/);
  assert.throws(bad(['uninstall', '--agent', 'codex', '--plugin', 'all', '--scope', 'global', '--allow-writes']), /Unknown option/);
});

// ---------- paths ----------

test('paths: repo layout uses config/products.json, and plugin layout uses servers.json beside bin/', () =>
  withTemp((p) => {
    const repo = join(p.root, 'repo');
    mkdirSync(join(repo, 'config'), { recursive: true });
    writeFileSync(join(repo, 'config', 'products.json'), '{}');
    mkdirSync(join(repo, 'dist', 'cli'), { recursive: true });
    const repoRoots = findRoots(pathToFileURL(join(repo, 'dist', 'cli', 'gsm.js')).href);
    assert.equal(repoRoots.layout, 'repo');
    assert.equal(repoRootFor(repoRoots), repo);
    assert.equal(serverFileFor(repoRoots, SERVERS[0]), join(repo, 'plugins', 'google-cloud', 'servers', 'gcloud.mjs'));

    const plugin = join(repo, 'plugins', 'google-cloud');
    mkdirSync(join(plugin, 'bin'), { recursive: true });
    writeFileSync(join(plugin, 'servers.json'), '{}');
    const pluginRoots = findRoots(pathToFileURL(join(plugin, 'bin', 'gsm.mjs')).href);
    assert.equal(pluginRoots.layout, 'plugin');
    assert.equal(pluginRoots.root, plugin);
    assert.equal(repoRootFor(pluginRoots), repo);
    assert.equal(serverFileFor(pluginRoots, SERVERS[0]), join(plugin, 'servers', 'gcloud.mjs'));
  }));

test('paths: only a git checkout is used as the marketplace folder; a folder without .git (an npm package, a zip) is not', () =>
  withTemp((p) => {
    const repo = join(p.root, 'repo');
    mkdirSync(join(repo, 'config'), { recursive: true });
    writeFileSync(join(repo, 'config', 'products.json'), '{}');
    mkdirSync(join(repo, 'dist', 'cli'), { recursive: true });
    const roots = findRoots(pathToFileURL(join(repo, 'dist', 'cli', 'gsm.js')).href);
    assert.equal(checkoutRootFor(roots), undefined, 'no .git: the install uses the GitHub source');
    mkdirSync(join(repo, '.git'));
    assert.equal(checkoutRootFor(roots), repo, 'a git checkout is its own marketplace folder');
  }));

// ---------- orchestrator (dry-run only; nothing is executed) ----------

const FAKE_REGISTRY = {
  dataRoot: '',
  groups: {},
  plugins: { 'google-cloud': 'c', 'google-workspace': 'w', 'google-search': 's', 'google-business': 'b' },
  servers: SERVERS.map((s) => ({ ...s, kind: 'curated', label: '' })),
};
const REPO_ROOTS = { layout: 'repo', root: join(tmpdir(), 'fake-repo'), mapFile: join(tmpdir(), 'fake-repo', 'config', 'servers.json') };

function orchestratorEnv(p, lines) {
  return {
    roots: REPO_ROOTS,
    registry: FAKE_REGISTRY,
    cwd: p.cwd,
    defaultHome: p.home,
    platform: 'linux',
    run: async () => {
      throw new Error('nothing may run in dry-run');
    },
    out: { log: (l) => lines.push(l), warn: (l) => lines.push(`WARN ${l}`) },
    // The tests do not depend on which programs this machine has.
    requirements: async () => [],
  };
}

const request = (over) => ({
  action: 'install',
  agent: 'all',
  plugin: 'all',
  scope: 'global',
  allowWrites: false,
  dryRun: true,
  keepData: false,
  ...over,
});

test('install: with --agent all and --home, claude is skipped and its CLI is never called', () =>
  withTemp(async (p) => {
    const lines = [];
    const code = await runInstall(request({ home: p.home }), orchestratorEnv(p, lines));
    assert.equal(code, 0);
    assert.ok(lines.some((l) => l.startsWith('[claude] skipped: --home does not apply')));
    assert.equal(lines.some((l) => l.includes('claude plugin')), false);
    assert.ok(lines.some((l) => l.startsWith('[codex] install (dry-run)')));
    assert.ok(lines.some((l) => l.startsWith('[agy] skipped: agy config folder not found')));
    assert.equal(existsSync(join(p.home, '.codex')), false, 'dry-run must not create folders');
  }));

test('install: with --agent all and project scope, agy is skipped with the global-only note', () =>
  withTemp(async (p) => {
    const lines = [];
    await runInstall(request({ scope: 'project' }), orchestratorEnv(p, lines));
    assert.ok(lines.some((l) => l === `[agy] skipped: ${AGY_GLOBAL_ONLY}`));
  }));

test('install: an agent named explicitly is never skipped, and its refusal is reported as an error', () =>
  withTemp(async (p) => {
    const lines = [];
    const code = await runInstall(request({ agent: 'agy', scope: 'project' }), orchestratorEnv(p, lines));
    assert.equal(code, 1);
    assert.ok(lines.some((l) => l === `WARN [agy] error: ${AGY_GLOBAL_ONLY}`));
  }));

test('install: --servers must belong to the selected plugins, and unknown names are rejected', () => {
  assert.throws(() => selectServers(FAKE_REGISTRY, ['gsc'], ['google-cloud']), /belongs to plugin google-search/);
  assert.throws(() => selectServers(FAKE_REGISTRY, ['nope'], ['google-cloud']), /unknown server "nope"/);
  assert.deepEqual(selectServers(FAKE_REGISTRY, ['gcloud'], ['google-cloud']).map((s) => s.name), ['gcloud']);
  assert.deepEqual(selectServers(FAKE_REGISTRY, undefined, ['google-search']).map((s) => s.name), ['gsc']);
});

test('install: "all" expands to the product ids given, and a list is used as it is', () => {
  // A plugin folder passes only the products of its own servers.json, so validation keeps it to its own product.
  assert.deepEqual(selectPlugins('all', ['gcloud', 'gsc']), ['gcloud', 'gsc']);
  assert.deepEqual(selectPlugins(['gsc'], ['gcloud', 'gsc']), ['gsc']);
});
