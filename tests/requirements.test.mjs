// The requirements an install needs (Claude Code, Codex, OpenCode, git), how gsm installs a missing one, and the
// explanations. Every program call goes through a fake runner, so nothing is installed and no real program is started.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkRequirements, describeMissing, marketplaceNeedsGit, missingOf } from '../dist/cli/requirements.js';
import { ACTION_TEXT, WHAT_GSM_DOES, describeAgent, describeProduct, describeScope, describeWrites } from '../dist/cli/explain.js';
import { runInstall } from '../dist/cli/install.js';
import { parseInstallArgs } from '../dist/cli/args.js';
import { findRoots } from '../dist/cli/paths.js';
import { loadProductRegistry, productIds } from '../dist/cli/products.js';
import { UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = findRoots(pathToFileURL(join(REPO, 'dist', 'cli', 'gsm.js')).href);
const REGISTRY = loadProductRegistry(ROOTS);

const ROOT = mkdtempSync(join(tmpdir(), 'gsm-requirements-'));
process.on('exit', () => rmSync(ROOT, { recursive: true, force: true }));
let counter = 0;
const fresh = (label) => {
  const dir = join(ROOT, `${String(++counter).padStart(3, '0')}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const enoent = () => Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
const ok = { code: 0, stdout: '', stderr: '' };

/**
 * A fake runner. `missing` lists the programs that cannot start (they throw ENOENT). Every call is recorded. On Windows the
 * program is the 3rd argument of cmd.exe, so the check looks for it there too.
 */
function fakeRunner({ missing = [], failing = [] } = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args: [...args] });
    const program = command === 'cmd.exe' ? args[2] : command;
    if (missing.includes(program)) throw enoent();
    if (failing.includes(program)) return { code: 1, stdout: '', stderr: 'failed' };
    return ok;
  };
  return { run, calls };
}

describe('requirements: what is checked, and how gsm would install it', () => {
  test('on Windows the programs run through cmd.exe, so npm and the .cmd shims start', async () => {
    const { run, calls } = fakeRunner();
    await checkRequirements({ run, platform: 'win32', cwd: 'D:\\x' }, ['claude'], false);
    assert.equal(calls[0].command, 'cmd.exe');
    assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/c', 'npm']);
  });

  test('a missing Claude Code is installed with npm, and its check says so', async () => {
    const { run } = fakeRunner({ missing: ['claude'] });
    const [claude] = await checkRequirements({ run, platform: 'linux', cwd: '.' }, ['claude'], false);
    assert.equal(claude.id, 'claude');
    assert.equal(claude.present, false);
    assert.equal(claude.install.display, 'npm install -g @anthropic-ai/claude-code');
    assert.match(claude.manual, /native installer/);
  });

  test('without npm, a missing requirement has no command gsm can run; it is shown by hand', async () => {
    const { run } = fakeRunner({ missing: ['claude', 'npm'] });
    const [claude] = await checkRequirements({ run, platform: 'linux', cwd: '.' }, ['claude'], false);
    assert.equal(claude.install, null);
    assert.match(describeMissing([claude]).join('\n'), /install by hand: npm install -g @anthropic-ai\/claude-code/);
  });

  test('codex and opencode are checked with their npm packages; agy is not a requirement', async () => {
    const { run } = fakeRunner({ missing: ['codex', 'opencode'] });
    const reqs = await checkRequirements({ run, platform: 'linux', cwd: '.' }, ['codex', 'opencode', 'agy'], false);
    assert.deepEqual(reqs.map((r) => r.id), ['codex', 'opencode']);
    assert.equal(reqs[0].install.display, 'npm install -g @openai/codex');
    assert.equal(reqs[1].install.display, 'npm install -g opencode-ai');
  });

  test('git is needed when the marketplace comes from GitHub; on Windows it is installed with winget when winget is there', async () => {
    const { run } = fakeRunner({ missing: ['git'] });
    const reqs = await checkRequirements({ run, platform: 'win32', cwd: '.' }, ['claude'], true);
    const git = reqs.find((r) => r.id === 'git');
    assert.equal(git.present, false);
    assert.equal(git.install.display, 'winget install --id Git.Git -e --source winget');
  });

  test('on Linux git is never installed by gsm (it needs sudo): the command is shown', async () => {
    const { run } = fakeRunner({ missing: ['git'] });
    const git = (await checkRequirements({ run, platform: 'linux', cwd: '.' }, ['claude'], true)).find((r) => r.id === 'git');
    assert.equal(git.install, null);
    assert.match(git.manual, /sudo apt-get install -y git/);
  });

  test('when the requirements are present, nothing is missing', async () => {
    const { run } = fakeRunner();
    assert.deepEqual(missingOf(await checkRequirements({ run, platform: 'linux', cwd: '.' }, ['claude', 'codex', 'opencode'], true)), []);
  });

  test('the marketplace needs git only when it is fetched from GitHub, not from a folder on this machine', () => {
    const folder = fresh('marketplace-folder');
    assert.equal(marketplaceNeedsGit(undefined, '/a/checkout'), false, 'a git checkout is its own marketplace');
    assert.equal(marketplaceNeedsGit(undefined, undefined), true, 'the default is GitHub');
    assert.equal(marketplaceNeedsGit('someone/fork', '/a/checkout'), true, 'owner/repo is fetched from GitHub');
    assert.equal(marketplaceNeedsGit(folder, undefined), false, 'a folder given with --marketplace needs no git');
  });
});

describe('install: a missing requirement stops the install, and --install-missing installs it', () => {
  function installEnv(p, { requirements, run }) {
    const lines = [];
    return {
      env: {
        roots: ROOTS,
        registry: REGISTRY,
        cwd: p.cwd,
        defaultHome: p.home,
        platform: 'linux',
        run,
        out: { log: (l) => lines.push(l), warn: (l) => lines.push(`WARN ${l}`) },
        requirements,
      },
      lines,
    };
  }
  const CODEX_MISSING = {
    id: 'codex',
    title: 'Codex (the codex command)',
    why: 'Codex starts the servers that gsm writes into its config',
    present: false,
    install: { display: 'npm install -g @openai/codex', command: 'npm', args: ['install', '-g', '@openai/codex'] },
    manual: 'npm install -g @openai/codex',
  };
  const request = (flags) => ({
    ...parseInstallArgs({ agent: 'codex', plugin: 'gmail', home: undefined, ...flags }, 'install', (p) => p, productIds(REGISTRY)),
    action: 'install',
  });

  test('a missing requirement stops a real install before the config is written, and says how to install it', async () => {
    const p = { home: fresh('no-codex'), cwd: fresh('cwd') };
    const { run } = fakeRunner();
    const { env } = installEnv(p, { run, requirements: async () => [CODEX_MISSING] });
    await assert.rejects(() => runInstall({ ...request({ home: p.home }) }, env), (err) => {
      assert.ok(err instanceof UsageError);
      assert.match(err.message, /these requirements are missing/);
      assert.match(err.message, /npm install -g @openai\/codex/);
      assert.match(err.message, /--install-missing/);
      assert.match(err.message, /not changed/);
      return true;
    });
    assert.equal(existsSync(join(p.home, '.codex', 'config.toml')), false, 'the config was not written');
  });

  test('with --install-missing, gsm runs the install, checks again, and then writes the config', async () => {
    const p = { home: fresh('install-missing'), cwd: fresh('cwd') };
    let checks = 0;
    const requirements = async () => (checks++ === 0 ? [CODEX_MISSING] : []);
    const { run, calls } = fakeRunner();
    const { env, lines } = installEnv(p, { run, requirements });
    assert.equal(await runInstall({ ...request({ home: p.home, 'install-missing': true }) }, env), 0);
    assert.deepEqual(calls[0], { command: 'npm', args: ['install', '-g', '@openai/codex'] });
    assert.ok(lines.some((l) => /installing Codex/.test(l)));
    assert.ok(existsSync(join(p.home, '.codex', 'config.toml')), 'the config is written after the install');
  });

  test('a failed requirement install stops the run, and the config is not written', async () => {
    const p = { home: fresh('failed-install'), cwd: fresh('cwd') };
    const { run } = fakeRunner({ failing: ['npm'] });
    const { env } = installEnv(p, { run, requirements: async () => [CODEX_MISSING] });
    await assert.rejects(() => runInstall({ ...request({ home: p.home, 'install-missing': true }) }, env), /installing Codex \(the codex command\) failed \(exit 1\)/);
    assert.equal(existsSync(join(p.home, '.codex', 'config.toml')), false);
  });

  test('a dry run only reports what is missing, and runs nothing', async () => {
    const p = { home: fresh('dry'), cwd: fresh('cwd') };
    const { run, calls } = fakeRunner();
    const { env, lines } = installEnv(p, { run, requirements: async () => [CODEX_MISSING] });
    assert.equal(await runInstall({ ...request({ home: p.home, 'dry-run': true }) }, env), 0);
    assert.ok(lines.some((l) => /a dry run installs nothing/.test(l)));
    assert.ok(lines.some((l) => /install: npm install -g @openai\/codex/.test(l)));
    assert.equal(calls.length, 0, 'no program runs in a dry run');
  });
});

describe('explanations: what a choice does, in plain words', () => {
  test('the product line names the login group and the tool count, and the description', () => {
    const text = describeProduct({
      id: 'gmail',
      title: 'Gmail',
      description: 'Gmail mailboxes, messages and labels.',
      group: 'workspace-user',
      tools: 97,
      generated: [],
      gateway: [],
      toolSource: 'tool-map',
      folder: '',
      folderExists: true,
    });
    assert.match(text, /gmail \(Gmail\): Gmail mailboxes, messages and labels\./);
    assert.match(text, /Login group: workspace-user; 97 tools\./);
  });

  test('the write setting says what is on and what still asks', () => {
    assert.match(describeWrites(false, undefined)[0], /Write tools stay off/);
    assert.match(describeWrites(true, 'every-change')[0], /asks before every change/);
    assert.match(describeWrites(true, 'destructive-only')[0], /only before destructive changes/);
    assert.match(describeWrites(true, 'off')[0], /does not ask/);
  });

  test('each agent says where its entries go, and "all" describes all four', () => {
    assert.match(describeAgent('codex')[0], /~\/\.codex\/config\.toml/);
    assert.match(describeAgent('claude')[0], /claude plugin install/);
    assert.equal(describeAgent('all').length, 4);
  });

  test('the project scope says that the file can be committed, and local says it is not shared', () => {
    assert.match(describeScope('project')[0], /commit/i);
    assert.match(describeScope('local')[0], /not shared/);
  });

  test('the first explanation and the uninstall text say what gsm installs, and that logins are kept', () => {
    assert.ok(WHAT_GSM_DOES.length >= 4);
    assert.match(WHAT_GSM_DOES.join(' '), /one MCP server/);
    assert.match(ACTION_TEXT.uninstall, /logins/);
  });
});
