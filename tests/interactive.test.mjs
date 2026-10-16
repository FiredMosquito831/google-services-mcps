// The interactive layer: the command prefix for each route, the prompter (answers, defaults, retries, secrets), and the
// guided flows. The guided flows run through a fake dispatcher, so nothing is installed. The home folder is a temp folder.
// Run after compiling (npm test does).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PassThrough, Writable } from 'node:stream';
import { invocation, invocationFor, invocationText, setInvocation } from '../dist/core/invocation.js';
import { createPrompter } from '../dist/cli/prompt.js';
import { guidedBrowse, guidedInstall, guidedSignIn, guidedUninstall, runMenu } from '../dist/cli/guided.js';
import { findRoots } from '../dist/cli/paths.js';
import { loadProductRegistry } from '../dist/cli/products.js';
import { recordInstall, writeInstalls } from '../dist/cli/records.js';
import { UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPILED = join(REPO, 'dist', 'cli', 'gsm.js');
const REPO_CLI = pathToFileURL(COMPILED).href;

const ROOT = mkdtempSync(join(tmpdir(), 'gsm-interactive-'));
process.on('exit', () => rmSync(ROOT, { recursive: true, force: true }));
let counter = 0;
const fresh = (label) => {
  const dir = join(ROOT, `${String(++counter).padStart(3, '0')}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

// ---- the command prefix for each route -------------------------------------------------------------------------------

describe('invocation: the command to print for each route', () => {
  test('an npm package prints npx', () => {
    const file = join(fresh('npm'), 'node_modules', '@firedmosquito831', 'google-services-mcps', 'gsm.mjs');
    assert.equal(invocationFor(pathToFileURL(file).href, fresh('elsewhere')), 'npx @firedmosquito831/google-services-mcps');
  });

  test('the repository folder prints node gsm.mjs; any other folder prints the quoted full path', () => {
    assert.equal(invocationFor(REPO_CLI, REPO), 'node gsm.mjs');
    const other = invocationFor(REPO_CLI, fresh('other-folder'));
    assert.equal(other, `node "${join(REPO, 'gsm.mjs')}"`);
  });

  test('a plugin server prints the path of its plugin bin/gsm.mjs', () => {
    const server = join(fresh('plugin'), 'plugins', 'gmail', 'servers', 'gmail.mjs');
    assert.equal(
      invocationFor(pathToFileURL(server).href, fresh('user-folder')),
      `node "${join(dirname(dirname(server)), 'bin', 'gsm.mjs')}"`,
    );
  });

  test('invocationText replaces only the prefix, and leaves other text alone', () => {
    setInvocation('npx @firedmosquito831/google-services-mcps');
    try {
      assert.equal(invocation(), 'npx @firedmosquito831/google-services-mcps');
      assert.equal(
        invocationText('Run node gsm.mjs login cloud, or node gsm.mjs --help. Node.js 20 is needed.'),
        'Run npx @firedmosquito831/google-services-mcps login cloud, or npx @firedmosquito831/google-services-mcps --help. Node.js 20 is needed.',
      );
    } finally {
      setInvocation('node gsm.mjs');
    }
    assert.equal(invocationText('node gsm.mjs login'), 'node gsm.mjs login');
  });

  test('the help text names the interactive mode, and the compiled CLI prints node gsm.mjs from the repository', () => {
    const res = spawnSync(process.execPath, [COMPILED, '--help'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Interactive: in a terminal, run gsm with no arguments for a menu/);
    assert.match(res.stdout, /^  node gsm\.mjs install /m);
  });
});

// ---- the prompter ----------------------------------------------------------------------------------------------------

/** A prompter fed with the given answers, one line each, and the text it wrote. */
function prompterWith(answers, { terminal = false } = {}) {
  const input = new PassThrough();
  const written = [];
  const output = new Writable({
    write(chunk, _encoding, done) {
      written.push(String(chunk));
      done();
    },
  });
  const prompt = createPrompter(input, output, terminal);
  // The answers are written after the prompter exists, and the input then ends. Lines that arrive before a question is
  // asked are kept, so the answers are never lost.
  setImmediate(() => {
    for (const answer of answers) input.write(`${answer}\n`);
    input.end();
  });
  return { prompt, text: () => written.join(''), close: () => prompt.close() };
}

const COLORS = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
];

describe('prompt: answers, defaults and retries', () => {
  test('choose takes a number or a name, and an empty answer takes the fallback', async () => {
    const byNumber = prompterWith(['2']);
    assert.equal(await byNumber.prompt.choose('Colour?', COLORS, 'red'), 'green');
    const byName = prompterWith(['Blue']);
    assert.equal(await byName.prompt.choose('Colour?', COLORS, 'red'), 'blue');
    const fallback = prompterWith(['']);
    assert.equal(await fallback.prompt.choose('Colour?', COLORS, 'red'), 'red');
  });

  test('choose asks again after a wrong answer, and says what is valid', async () => {
    const { prompt, text } = prompterWith(['9', 'purple', '3']);
    assert.equal(await prompt.choose('Colour?', COLORS), 'blue');
    assert.match(text(), /Answer with a number from 1 to 3, or one of: red, green, blue\./);
  });

  test('pick takes numbers, names, a comma list, or all; an empty answer takes the defaults', async () => {
    assert.deepEqual(await prompterWith(['1,3']).prompt.pick('Colours?', COLORS), ['red', 'blue']);
    assert.deepEqual(await prompterWith(['all']).prompt.pick('Colours?', COLORS), ['red', 'green', 'blue']);
    assert.deepEqual(await prompterWith(['green']).prompt.pick('Colours?', COLORS), ['green']);
    assert.deepEqual(await prompterWith(['']).prompt.pick('Colours?', COLORS, ['green', 'blue']), ['green', 'blue']);
  });

  test('pick refuses an unknown name and asks again', async () => {
    const { prompt, text } = prompterWith(['pink', '2']);
    assert.deepEqual(await prompt.pick('Colours?', COLORS), ['green']);
    assert.match(text(), /"pink" is not one of the choices/);
  });

  test('confirm uses the fallback on an empty answer, and asks again after a wrong one', async () => {
    assert.equal(await prompterWith(['']).prompt.confirm('Go?', true), true);
    assert.equal(await prompterWith(['']).prompt.confirm('Go?', false), false);
    assert.equal(await prompterWith(['YES']).prompt.confirm('Go?', false), true);
    const retry = prompterWith(['maybe', 'n']);
    assert.equal(await retry.prompt.confirm('Go?', true), false);
    assert.match(retry.text(), /Answer y or n\./);
  });

  test('ask returns the fallback on an empty answer', async () => {
    assert.equal(await prompterWith(['']).prompt.ask('Folder', '/work'), '/work');
    assert.equal(await prompterWith(['  x  ']).prompt.ask('Folder', '/work'), 'x');
  });

  test('a secret is returned, and is not written to the output', async () => {
    const { prompt, text } = prompterWith(['AIza-SECRET-VALUE-123']);
    assert.equal(await prompt.secret('API key'), 'AIza-SECRET-VALUE-123');
    assert.equal(text().includes('AIza-SECRET-VALUE-123'), false, 'the typed secret is never written');
  });

  test('when the input ends before an answer, the flow stops with a usage error and changes nothing', async () => {
    const { prompt } = prompterWith([]);
    await assert.rejects(() => prompt.confirm('Install now?', true), (err) => {
      assert.ok(err instanceof UsageError);
      assert.match(err.message, /Nothing was changed/);
      return true;
    });
  });
});

// ---- the guided flows, through a fake dispatcher -----------------------------------------------------------------------

const roots = findRoots(REPO_CLI);
const registry = loadProductRegistry(roots);

/** The environment of a guided flow. `run` records each command line, and returns 0. */
function guidedEnv(answers, { home = fresh('home'), cwd = fresh('cwd'), clientSecretFile = join(home, 'client_secret.json'), apiKeySaved = false } = {}) {
  const { prompt, text } = prompterWith(answers);
  const runs = [];
  const saved = [];
  const env = {
    prompt,
    run: async (argv) => {
      runs.push([...argv]);
      return 0;
    },
    roots,
    registry,
    home,
    cwd,
    out: { log: () => {}, warn: () => {} },
    clientSecretFile,
    apiKeySaved,
    saveApiKey: async (key, force) => {
      saved.push({ key, force });
      return 0;
    },
  };
  return { env, runs, saved, text, close: () => prompt.close() };
}

describe('guided install: the answers become the command, previewed first', () => {
  test('asks each question, previews with --dry-run, and then runs the same command', async () => {
    // agent 1 (claude), scope (empty: global), products (gmail), writes (empty: no), install now (y)
    const g = guidedEnv(['1', '', 'gmail', '', 'y']);
    try {
      assert.equal(await guidedInstall(g.env), 0);
      assert.deepEqual(g.runs, [
        ['install', '--agent', 'claude', '--plugin', 'gmail', '--scope', 'global', '--dry-run'],
        ['install', '--agent', 'claude', '--plugin', 'gmail', '--scope', 'global'],
      ]);
      assert.match(g.text(), /node gsm\.mjs install --agent claude --plugin gmail --scope global/);
    } finally {
      g.close();
    }
  });

  test('a flag that was given is not asked again, and writes and the path are passed on', async () => {
    const folder = fresh('project');
    // Only the final confirmation is asked: the answer n means nothing is installed after the preview.
    const g = guidedEnv(['n'], { cwd: folder });
    try {
      const code = await guidedInstall(g.env, {
        agent: 'codex',
        plugin: 'gmail,gcalendar',
        scope: 'project',
        path: folder,
        allowWrites: true,
        confirmation: 'destructive-only',
      });
      assert.equal(code, 0);
      assert.deepEqual(g.runs, [
        ['install', '--agent', 'codex', '--plugin', 'gmail,gcalendar', '--scope', 'project', '--path', folder, '--allow-writes', '--confirmation', 'destructive-only', '--dry-run'],
      ]);
      assert.match(g.text(), /Nothing was installed\./);
    } finally {
      g.close();
    }
  });

  test('agy is global only, so the scope is not asked', async () => {
    const g = guidedEnv(['4', 'all', '', 'n']);
    try {
      await guidedInstall(g.env);
      assert.equal(g.runs[0][g.runs[0].indexOf('--scope') + 1], 'global');
      assert.equal(g.runs[0][g.runs[0].indexOf('--agent') + 1], 'agy');
    } finally {
      g.close();
    }
  });
});

describe('guided uninstall: picks the recorded install', () => {
  test('one install: its products are picked, previewed, then removed', async () => {
    const home = fresh('uninstall-home');
    const records = recordInstall([], { agent: 'codex', scope: 'global', folder: null }, join(home, '.codex', 'config.toml'), [
      { name: 'gmail', plugin: 'gmail' },
      { name: 'gcalendar', plugin: 'gcalendar' },
    ]);
    writeInstalls(home, records);
    // 1 is "everything", so the install is 2; products (empty: all of them), remove now (empty: yes)
    const g = guidedEnv(['2', '', ''], { home });
    try {
      assert.equal(await guidedUninstall(g.env), 0);
      assert.deepEqual(g.runs, [
        ['uninstall', '--agent', 'codex', '--plugin', 'gmail,gcalendar', '--scope', 'global', '--dry-run'],
        ['uninstall', '--agent', 'codex', '--plugin', 'gmail,gcalendar', '--scope', 'global'],
      ]);
    } finally {
      g.close();
    }
  });

  test('everything: previewed, then removed with --yes only after the confirmation', async () => {
    const home = fresh('uninstall-all');
    writeInstalls(home, recordInstall([], { agent: 'codex', scope: 'global', folder: null }, join(home, 'c.toml'), [{ name: 'gmail', plugin: 'gmail' }]));
    const g = guidedEnv(['all', 'y'], { home });
    try {
      await guidedUninstall(g.env);
      assert.deepEqual(g.runs, [
        ['uninstall', '--all', '--dry-run'],
        ['uninstall', '--all', '--yes'],
      ]);
    } finally {
      g.close();
    }
  });

  test('with nothing recorded it says so and runs nothing', async () => {
    const g = guidedEnv([], { home: fresh('empty-home') });
    try {
      assert.equal(await guidedUninstall(g.env), 0);
      assert.deepEqual(g.runs, []);
      assert.match(g.text(), /Nothing to uninstall\./);
    } finally {
      g.close();
    }
  });
});

describe('guided sign-in and the other flows', () => {
  test('an OAuth group with its client file in place: profile and browser are asked, then login runs', async () => {
    const home = fresh('signin-home');
    const clientFile = join(home, 'client_secret.json');
    writeFileSync(clientFile, '{}');
    // group 1 (cloud), profile (empty: readonly), browser (empty: yes)
    const g = guidedEnv(['1', '', ''], { home, clientSecretFile: clientFile });
    try {
      assert.equal(await guidedSignIn(g.env), 0);
      assert.deepEqual(g.runs, [['login', 'cloud', '--profile', 'readonly']]);
    } finally {
      g.close();
    }
  });

  test('an OAuth group without its client file asks for the file first, then saves it with setup-client', async () => {
    const home = fresh('no-client');
    const source = join(home, 'downloaded.json');
    writeFileSync(source, '{}');
    // group 2 (workspace-user), client file path, profile (empty), browser (n)
    const g = guidedEnv(['2', source, '', 'n'], { home, clientSecretFile: join(home, 'client_secret.json') });
    try {
      await guidedSignIn(g.env);
      assert.deepEqual(g.runs, [
        ['setup-client', source],
        ['login', 'workspace-user', '--profile', 'readonly', '--no-browser'],
      ]);
    } finally {
      g.close();
    }
  });

  test('the API key is typed without echo, saved through the saver, and never part of a command', async () => {
    // group 6 (apikey); the key
    const g = guidedEnv(['6', 'TYPED-KEY-VALUE-123']);
    try {
      assert.equal(await guidedSignIn(g.env), 0);
      assert.deepEqual(g.saved, [{ key: 'TYPED-KEY-VALUE-123', force: false }]);
      assert.deepEqual(g.runs, []);
      assert.equal(g.text().includes('TYPED-KEY-VALUE-123'), false, 'the key is not printed');
    } finally {
      g.close();
    }
  });

  test('browse builds the apis command with its filter', async () => {
    // what: apis (1); filter: gmail; product: gmail
    const g = guidedEnv(['1', 'gmail', 'gmail']);
    try {
      await guidedBrowse(g.env);
      assert.deepEqual(g.runs, [['apis', 'gmail', '--search', 'gmail']]);
    } finally {
      g.close();
    }
  });

  test('the menu runs the chosen action and quits on the last entry', async () => {
    // 5 is list, 13 is quit
    const g = guidedEnv(['5', '13']);
    try {
      assert.equal(await runMenu(g.env), 0);
      assert.deepEqual(g.runs, [['list']]);
    } finally {
      g.close();
    }
  });
});
