// Tests for the simple installer: global is the default scope, the runtime copies that Codex, OpenCode and agy point at,
// project and local scope, the agy refusal, the claude commands for the three scopes, `gsm list`, `uninstall --all`,
// the usage errors, and the root gsm.mjs run from another folder. Run after compiling (npm test does).
// Every test uses temp folders. The real home folder, the real token directory and the claude CLI are never used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseCliArgs, parseInstallArgs } from '../dist/cli/args.js';
import { runInstall, runUninstallAll } from '../dist/cli/install.js';
import { listInstalls, runList } from '../dist/cli/list.js';
import { findRoots } from '../dist/cli/paths.js';
import { loadProductRegistry, productIds } from '../dist/cli/products.js';
import { installsFileFor, readInstalls } from '../dist/cli/records.js';
import { runtimeFolderFor, runtimeServerFile } from '../dist/cli/runtime.js';
import { AGY_GLOBAL_ONLY, UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GSM = join(REPO, 'dist', 'cli', 'gsm.js');
const ROOT_GSM = join(REPO, 'gsm.mjs');
const REPO_ROOTS = findRoots(pathToFileURL(GSM).href);
const REGISTRY = loadProductRegistry(REPO_ROOTS);
const IDS = productIds(REGISTRY);

/** What a runtime copy holds, as the plugin folder has it. Only these items are copied. */
const RUNTIME_ITEMS = [
  'servers/gmail.mjs',
  'bin/gsm.mjs',
  'bin/gsm-hook.mjs',
  'hooks/hooks.json',
  'tool-map.json',
  'method-kinds.json',
  'catalog.json',
  'discovery',
  'scopes.json',
  'servers.json',
  'tool-kinds.json',
];

const noRun = async () => {
  throw new Error('the runner must not be called here');
};

async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-simple-'));
  const p = {
    root,
    home: join(root, 'home'),
    cwd: join(root, 'project'),
    folder: join(root, 'folder'),
    tokens: join(root, 'tokens'),
  };
  for (const dir of [p.home, p.cwd, p.folder, p.tokens]) mkdirSync(dir, { recursive: true });
  const saved = process.env.GSM_TOKEN_DIR;
  process.env.GSM_TOKEN_DIR = p.tokens;
  try {
    return await fn(p);
  } finally {
    if (saved === undefined) delete process.env.GSM_TOKEN_DIR;
    else process.env.GSM_TOKEN_DIR = saved;
    rmSync(root, { recursive: true, force: true });
  }
}

/** The in-process environment: the repo's plugins, the temp cwd and home, and output collected into `lines`. */
function envFor(p, lines, { run = noRun, roots = REPO_ROOTS, registry = REGISTRY } = {}) {
  return {
    roots,
    registry,
    cwd: p.cwd,
    defaultHome: p.home,
    platform: 'linux',
    run,
    out: { log: (l) => lines.push(l), warn: (l) => lines.push(`WARN ${l}`) },
  };
}

/** The parsed flags of an install or uninstall, as the CLI builds them. Paths are absolute. */
function request(argv) {
  const parsed = parseCliArgs(argv);
  return parseInstallArgs(parsed.values, parsed.command, (p) => resolve(p), IDS);
}

/** A runnable request: `action` is install or uninstall, and `argv` is the rest of the command line. */
const act = (action, argv) => ({ ...request([action, ...argv]), action });

/** The environment for a spawned gsm: HOME, USERPROFILE and the token directory point at temp folders. */
function childEnv(p) {
  const env = { ...process.env };
  for (const name of ['GSM_API_KEY_INPUT', 'GSM_CONFIRMATION', 'GSM_ALLOW_WRITES', 'GSM_TOKEN_DIR']) delete env[name];
  return { ...env, HOME: p.home, USERPROFILE: p.home, GSM_TOKEN_DIR: p.tokens };
}

function runGsm(args, p, cwd = p.cwd) {
  const res = spawnSync(process.execPath, [GSM, ...args], { cwd, env: childEnv(p), encoding: 'utf8', timeout: 120_000 });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const read = (file) => readFileSync(file, 'utf8');

// ---------- scope and flags ----------

test('global is the default scope; folder is an alias of local; any other scope is refused', () => {
  const base = ['install', '--agent', 'codex', '--plugin', 'gmail'];
  const parse = (argv) => parseInstallArgs(parseCliArgs(argv).values, 'install', (p) => p, IDS);
  assert.equal(parse(base).scope, 'global');
  assert.equal(parse(base).pathArg, undefined);
  assert.equal(parse([...base, '--scope', 'local']).scope, 'local');
  assert.equal(parse([...base, '--scope', 'folder']).scope, 'local', 'folder is accepted as local');
  assert.equal(parse([...base, '--scope', 'project', '--path', '/x']).pathArg, '/x');
  assert.throws(() => parse([...base, '--scope', 'machine']), /--scope must be one of: global, project, local/);
});

test('a missing --agent or --plugin prints the usage and the valid values, and exits 2', () =>
  withTemp((p) => {
    const noAgent = runGsm(['install', '--plugin', 'gmail', '--home', p.home], p);
    assert.equal(noAgent.code, 2, noAgent.stderr);
    assert.match(noAgent.stderr, /--agent is required\. Valid agents: claude, codex, opencode, agy, all/);
    // From another folder the usage names the full path of gsm.mjs (quoted), and from the repository it is node gsm.mjs.
    assert.match(noAgent.stderr, /usage: node (gsm\.mjs|"[^"]*gsm\.mjs") install --agent/);

    const noPlugin = runGsm(['install', '--agent', 'codex', '--home', p.home], p);
    assert.equal(noPlugin.code, 2, noPlugin.stderr);
    assert.match(noPlugin.stderr, /--plugin is required\. Valid plugin ids: /);
    assert.match(noPlugin.stderr, /usage: node (gsm\.mjs|"[^"]*gsm\.mjs") install --agent/);
  }));

// ---------- runtime copies: codex, opencode and agy ----------

test('codex, opencode and agy write global configs that point at the runtime copy, and the copy is complete', () =>
  withTemp(async (p) => {
    mkdirSync(join(p.home, '.gemini', 'config'), { recursive: true }); // agy has run once
    const lines = [];
    for (const agent of ['codex', 'opencode', 'agy']) {
      const code = await runInstall(act('install', ['--agent', agent, '--plugin', 'gmail']), envFor(p, lines));
      assert.equal(code, 0, lines.join('\n'));
    }

    const runtime = runtimeFolderFor(p.home, 'gmail');
    const server = join(runtime, 'servers', 'gmail.mjs');
    assert.equal(runtimeServerFile(p.home, { name: 'gmail', plugin: 'gmail' }), server);
    for (const item of RUNTIME_ITEMS) assert.ok(existsSync(join(runtime, item)), `the runtime copy has ${item}`);
    assert.equal(existsSync(join(runtime, 'skills')), false, 'items outside the runtime list are not copied');
    assert.equal(existsSync(join(runtime, '.mcp.json')), false);

    assert.ok(read(join(p.home, '.codex', 'config.toml')).includes(`args = ['${server}']`), 'codex points at the runtime copy');
    const opencodeObj = JSON.parse(read(join(p.home, '.config', 'opencode', 'opencode.json')));
    assert.deepEqual(opencodeObj.mcp['gsm-gmail'].command, ['node', server]);
    const agyObj = JSON.parse(read(join(p.home, '.gemini', 'config', 'mcp_config.json')));
    assert.equal(agyObj.mcpServers['gsm-gmail'].args[0], server);
  }));

test('uninstall removes the entries, and the runtime copy only when no other install uses it; tokens are never touched', () =>
  withTemp(async (p) => {
    const tokenFile = join(p.tokens, 'workspace-user.token.json');
    writeFileSync(tokenFile, '{"refresh_token":"keep-me"}\n');
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gmail', '--scope', 'project', '--path', p.folder]), envFor(p, lines)), 0);
    const runtime = runtimeFolderFor(p.home, 'gmail');
    assert.equal(readInstalls(p.home).length, 2);

    // Codex stops using gmail. The opencode project entry still uses the runtime copy, so it stays.
    assert.equal(await runInstall(act('uninstall', ['--agent', 'codex', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.doesNotMatch(read(join(p.home, '.codex', 'config.toml')), /gsm-gmail/);
    assert.ok(existsSync(join(runtime, 'servers', 'gmail.mjs')), 'the runtime copy stays while opencode uses it');
    assert.equal(readInstalls(p.home).length, 1);

    // The last user of gmail goes, and the runtime copy goes with it.
    assert.equal(await runInstall(act('uninstall', ['--agent', 'opencode', '--plugin', 'gmail', '--scope', 'project', '--path', p.folder]), envFor(p, lines)), 0);
    assert.equal(existsSync(runtime), false, 'the runtime copy is removed when no install uses it');
    assert.equal(existsSync(installsFileFor(p.home)), false, 'no install is left, so the record file is removed');
    assert.equal(read(tokenFile), '{"refresh_token":"keep-me"}\n', 'the token file is untouched');
  }));

test('a dry run changes nothing: no config edit, no record change, and the runtime copy stays', () =>
  withTemp(async (p) => {
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gmail']), envFor(p, lines)), 0);
    const before = read(join(p.home, '.config', 'opencode', 'opencode.json'));
    const dry = [];
    assert.equal(await runInstall(act('uninstall', ['--agent', 'opencode', '--plugin', 'gmail', '--dry-run']), envFor(p, dry)), 0);
    assert.ok(dry.some((l) => l.startsWith(`would remove runtime copy: ${runtimeFolderFor(p.home, 'gmail')}`)), dry.join('\n'));
    assert.equal(read(join(p.home, '.config', 'opencode', 'opencode.json')), before);
    assert.equal(readInstalls(p.home).length, 1);
    assert.ok(existsSync(join(runtimeFolderFor(p.home, 'gmail'), 'servers', 'gmail.mjs')));
  }));

test('the round trip gives back a config file byte for byte, when gsm wrote it in its own format', () =>
  withTemp(async (p) => {
    // gsm writes JSON with two-space indentation and a final newline, so a file in that format comes back identical.
    const file = join(p.home, '.config', 'opencode', 'opencode.json');
    mkdirSync(join(p.home, '.config', 'opencode'), { recursive: true });
    const original = `${JSON.stringify({ theme: 'dark', mcp: { 'my-own': { type: 'remote', url: 'https://example.test/mcp', enabled: true } } }, null, 2)}\n`;
    writeFileSync(file, original);
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(await runInstall(act('uninstall', ['--agent', 'opencode', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(read(file), original);

    // With no other key, the mcp object that install added is removed too, so the file is exactly as it was.
    const bare = `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`;
    writeFileSync(file, bare);
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(await runInstall(act('uninstall', ['--agent', 'opencode', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(read(file), bare);
  }));

// ---------- project and local ----------

test('project and local scope write the folder for codex and opencode, and never the global files', () =>
  withTemp(async (p) => {
    const lines = [];
    for (const scope of ['project', 'local']) {
      const folder = join(p.folder, scope);
      mkdirSync(folder, { recursive: true });
      assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail', '--scope', scope, '--path', folder]), envFor(p, lines)), 0);
      assert.ok(existsSync(join(folder, '.codex', 'config.toml')), `${scope}: codex writes .codex/config.toml in the folder`);
      assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gcalendar', '--scope', scope, '--path', folder]), envFor(p, lines)), 0);
      assert.ok(existsSync(join(folder, 'opencode.json')), `${scope}: opencode writes opencode.json in the folder`);
    }
    assert.equal(existsSync(join(p.home, '.codex')), false, 'project and local never write the global codex config');
    assert.equal(existsSync(join(p.home, '.config')), false, 'project and local never write the global opencode config');
    assert.ok(lines.some((l) => l.includes('Codex does not separate local from project')), 'codex local carries its note');
    assert.ok(lines.some((l) => l.includes('OpenCode does not separate local from project')), 'opencode local carries its note');
    assert.ok(lines.some((l) => l.includes('trusted projects')), 'codex project carries the trusted-project note');
  }));

test('project scope with no --path acts on the current folder', () =>
  withTemp(async (p) => {
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail', '--scope', 'project']), envFor(p, lines)), 0);
    assert.ok(existsSync(join(p.cwd, '.codex', 'config.toml')));
  }));

test('agy refuses project and local scope before anything is written (exit 2 from the CLI)', () =>
  withTemp((p) => {
    for (const scope of ['project', 'local']) {
      const res = runGsm(['install', '--agent', 'agy', '--plugin', 'gmail', '--scope', scope, '--path', p.folder, '--home', p.home], p);
      assert.equal(res.code, 2, res.stderr);
      assert.ok(res.stderr.includes(AGY_GLOBAL_ONLY), res.stderr);
      assert.equal(existsSync(join(p.folder, '.gemini')), false);
      assert.equal(existsSync(join(p.home, '.google-services-mcps')), false, 'nothing was copied');
    }
    assert.throws(() => request(['install', '--agent', 'agy', '--plugin', 'gmail', '--scope', 'local']), UsageError);
  }));

// ---------- claude ----------

/** A fake claude runner. It answers `marketplace list` with no marketplaces, and every other call with success. */
function fakeClaude() {
  const calls = [];
  const run = async (command, args, cwd) => {
    calls.push({ command, args: [...args], cwd });
    return { code: 0, stdout: args[2] === 'list' ? '[]' : '', stderr: '' };
  };
  return { run, calls };
}

test('claude builds the marketplace add and the plugin install and uninstall commands for each scope', () =>
  withTemp(async (p) => {
    for (const [scope, flag] of [['global', 'user'], ['project', 'project'], ['local', 'local']]) {
      const fake = fakeClaude();
      const folder = scope === 'global' ? p.cwd : p.folder;
      const scopeArgs = scope === 'global' ? [] : ['--path', p.folder];
      const lines = [];
      const install = act('install', ['--agent', 'claude', '--plugin', 'gmail', '--scope', scope, ...scopeArgs]);
      assert.equal(await runInstall(install, envFor(p, lines, { run: fake.run })), 0, lines.join('\n'));

      const add = fake.calls.find((c) => c.args[2] === 'add');
      assert.deepEqual(add.args, ['plugin', 'marketplace', 'add', REPO_ROOTS.root], 'the checkout is the marketplace');
      const plugin = fake.calls.find((c) => c.args[1] === 'install');
      assert.deepEqual(plugin.args, ['plugin', 'install', 'gmail@google-services-mcps', '--scope', flag]);
      assert.equal(plugin.cwd, folder, `${scope}: the claude CLI runs in the folder`);

      const removal = fakeClaude();
      await runInstall(act('uninstall', ['--agent', 'claude', '--plugin', 'gmail', '--scope', scope, ...scopeArgs]), envFor(p, [], { run: removal.run }));
      assert.deepEqual(removal.calls[0].args, ['plugin', 'uninstall', 'gmail@google-services-mcps', '--scope', flag]);
      assert.equal(removal.calls[0].cwd, folder);
    }
  }));

test('claude from a plugin folder (not a checkout) adds the GitHub marketplace', () =>
  withTemp(async (p) => {
    const pluginDir = join(p.root, 'cache', 'gmail');
    mkdirSync(pluginDir, { recursive: true });
    copyFileSync(join(REPO, 'plugins', 'gmail', 'servers.json'), join(pluginDir, 'servers.json'));
    const roots = { layout: 'plugin', root: pluginDir, mapFile: join(pluginDir, 'servers.json') };
    const registry = loadProductRegistry(roots);
    const fake = fakeClaude();
    const lines = [];
    await runInstall(act('install', ['--agent', 'claude', '--plugin', 'gmail']), envFor(p, lines, { run: fake.run, roots, registry }));
    const add = fake.calls.find((c) => c.args[2] === 'add');
    assert.deepEqual(add.args, ['plugin', 'marketplace', 'add', 'FiredMosquito831/google-services-mcps']);
  }));

// ---------- gsm list ----------

test('gsm list shows what was installed, read from the record and the files, in text and JSON', () =>
  withTemp(async (p) => {
    mkdirSync(join(p.home, '.gemini', 'config'), { recursive: true });
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gcalendar', '--scope', 'project', '--path', p.folder]), envFor(p, lines)), 0);

    const text = [];
    assert.equal(runList({ home: p.home, json: false }, { log: (l) => text.push(l), warn: () => {} }), 0);
    assert.ok(text.some((l) => /^codex\s+global\s+-\s+gmail\s+ok\s/.test(l)), text.join('\n'));
    assert.ok(text.some((l) => /^opencode\s+project\s+.+\s+gcalendar\s+ok\s/.test(l)), text.join('\n'));

    const res = runGsm(['list', '--json', '--home', p.home], p);
    assert.equal(res.code, 0, res.stderr);
    const json = JSON.parse(res.stdout);
    assert.equal(json.installs.length, 2);
    assert.deepEqual(json.installs.map((i) => i.state), ['ok', 'ok']);
    assert.equal(json.installs[1].folder, p.folder);

    // An entry removed by hand is reported as missing, with the entry named.
    writeFileSync(join(p.home, '.codex', 'config.toml'), '');
    const row = listInstalls(p.home).find((r) => r.agent === 'codex');
    assert.equal(row.state, 'missing');
    assert.match(row.detail, /not in .*: gsm-gmail/);
  }));

test('gsm list with nothing installed says so, and exits 0', () =>
  withTemp((p) => {
    const res = runGsm(['list', '--home', p.home], p);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /No gsm installs are recorded/);
  }));

// ---------- uninstall --all ----------

test('uninstall --all prints the list, needs --yes outside a terminal, and removes every install', () =>
  withTemp(async (p) => {
    mkdirSync(join(p.home, '.gemini', 'config'), { recursive: true });
    const lines = [];
    assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail']), envFor(p, lines)), 0);
    assert.equal(await runInstall(act('install', ['--agent', 'opencode', '--plugin', 'gcalendar', '--scope', 'project', '--path', p.folder]), envFor(p, lines)), 0);

    await assert.rejects(
      runUninstallAll({ dryRun: false, yes: false, keepData: false, home: p.home }, envFor(p, lines)),
      (err) => err instanceof UsageError && /--yes/.test(err.message),
    );
    assert.equal(readInstalls(p.home).length, 2, 'nothing is removed without --yes');

    const dry = [];
    assert.equal(await runUninstallAll({ dryRun: true, yes: false, keepData: false, home: p.home }, envFor(p, dry)), 0);
    assert.ok(dry.includes('dry-run: nothing will be removed.'));
    assert.equal(readInstalls(p.home).length, 2);

    assert.equal(await runUninstallAll({ dryRun: false, yes: true, keepData: false, home: p.home }, envFor(p, lines)), 0);
    assert.equal(existsSync(installsFileFor(p.home)), false);
    assert.equal(existsSync(runtimeFolderFor(p.home, 'gmail')), false);
    assert.equal(existsSync(runtimeFolderFor(p.home, 'gcalendar')), false);
    assert.doesNotMatch(read(join(p.home, '.codex', 'config.toml')), /gsm-gmail/);
  }));

// ---------- errors and the plugins ----------

test('a missing plugin folder stops a real install before any file is written, and is a warning in a dry run', () =>
  withTemp(async (p) => {
    const fakeRepo = join(p.root, 'fake-repo');
    mkdirSync(join(fakeRepo, 'config'), { recursive: true });
    copyFileSync(join(REPO, 'config', 'products.json'), join(fakeRepo, 'config', 'products.json'));
    const roots = { layout: 'repo', root: fakeRepo, mapFile: join(fakeRepo, 'config', 'products.json') };
    const registry = loadProductRegistry(roots);

    const lines = [];
    await assert.rejects(
      runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail']), envFor(p, lines, { roots, registry })),
      /the plugin folder for gmail was not found/,
    );
    assert.equal(existsSync(join(p.home, '.codex')), false);
    assert.equal(existsSync(join(p.home, '.google-services-mcps')), false);

    const dry = [];
    assert.equal(await runInstall(act('install', ['--agent', 'codex', '--plugin', 'gmail', '--dry-run']), envFor(p, dry, { roots, registry })), 0);
    assert.ok(dry.some((l) => l.startsWith('WARN warning: the plugin folder for gmail was not found')), dry.join('\n'));
  }));

test('the CLI says plainly when it cannot find the plugins', () => {
  const nowhere = join(tmpdir(), 'gsm-no-plugins-here', 'deep', 'gsm.js');
  assert.throws(() => findRoots(pathToFileURL(nowhere).href), /cannot find the plugins: no servers\.json/);
});

// ---------- the root gsm.mjs ----------

test('the root gsm.mjs starts and prints help from another folder, and dry-runs an install there', () =>
  withTemp((p) => {
    assert.ok(existsSync(ROOT_GSM), 'gsm.mjs is built at the repo root (npm run build)');
    const elsewhere = join(p.root, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });

    const help = spawnSync(process.execPath, [ROOT_GSM, '--help'], { cwd: elsewhere, env: childEnv(p), encoding: 'utf8', timeout: 120_000 });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^gsm: install the Google services MCP suite/);
    assert.match(help.stdout, /^Examples:$/m);

    const dry = spawnSync(
      process.execPath,
      [ROOT_GSM, 'install', '--agent', 'codex', '--plugin', 'gmail', '--home', p.home, '--dry-run'],
      { cwd: elsewhere, env: childEnv(p), encoding: 'utf8', timeout: 120_000 },
    );
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /\[codex\] install \(dry-run\)/);
    assert.equal(existsSync(join(p.home, '.google-services-mcps')), false, 'a dry run creates nothing');
    assert.equal(existsSync(join(elsewhere, '.codex')), false);
  }));
