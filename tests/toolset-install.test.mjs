// gsm install --toolset: the Codex, OpenCode and Antigravity adapters write GSM_TOOLSET only when the flag is given, the
// Claude Code adapter passes it as --config toolset=<value>, the guided install asks, gsm status shows it, and an agy
// install warns when a product can list more than 100 tools. Every test works in temp folders; nothing runs agy or claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as codex from '../dist/cli/adapters/codex.js';
import * as opencode from '../dist/cli/adapters/opencode.js';
import * as agy from '../dist/cli/adapters/agy.js';
import { configArgs } from '../dist/cli/adapters/claude.js';
import { parseCliArgs, parseInstallArgs } from '../dist/cli/args.js';
import { serverEnvironment } from '../dist/cli/settings.js';
import { postureLine } from '../dist/cli/posture.js';
import { agyToolWarnings, installSummary } from '../dist/cli/install.js';
import { toolsetCount, RUNTIME_TOOL_NAMES, AGY_TOOL_LIMIT } from '../dist/cli/toolset-count.js';
import { findRoots } from '../dist/cli/paths.js';
import { loadProductRegistry } from '../dist/cli/products.js';
import { UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GSM = join(REPO, 'dist', 'cli', 'gsm.js');
const SERVERS = [
  { name: 'gcloud', plugin: 'gcloud', group: 'cloud' },
  { name: 'gsc', plugin: 'gsc', group: 'searchconsole' },
];
const FILES = { codex: ['.codex', 'config.toml'], opencode: ['.config', 'opencode', 'opencode.json'], agy: ['.gemini', 'config', 'mcp_config.json'] };
const ADAPTERS = { codex, opencode, agy };

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Installs the two servers with one adapter into a fresh temp home and returns the config file's text. */
async function installText(agent, extra) {
  const home = join(tempDir('gsm-toolset-install-'), 'home');
  mkdirSync(join(home, '.gemini', 'config'), { recursive: true });
  await ADAPTERS[agent].install({
    home,
    cwd: dirname(home),
    scope: 'global',
    plugins: [],
    servers: SERVERS,
    serverFile: (s) => `/bundle/${s.name}.mjs`,
    dryRun: false,
    allowWrites: false,
    keepData: false,
    run: async () => {
      throw new Error('the runner must not be called here');
    },
    platform: 'linux',
    ...extra,
  });
  return readFileSync(join(home, ...FILES[agent]), 'utf8');
}

test('without --toolset, the codex, opencode and agy files are byte-identical to 1.2.0', async () => {
  // Written by the 1.2.0 adapters (e347bfc) with the same inputs.
  const golden = JSON.parse(readFileSync(join(REPO, 'tests', 'fixtures', 'adapters-unset-1.2.0.json'), 'utf8'));
  for (const agent of Object.keys(ADAPTERS)) {
    assert.equal(await installText(agent, {}), golden[agent], agent);
    assert.equal(await installText(agent, { allowWrites: true, confirmation: 'off' }), golden[`${agent}+writes`], `${agent} with writes`);
  }
  assert.deepEqual(serverEnvironment(true, 'off'), [
    ['GSM_ALLOW_WRITES', 'true'],
    ['GSM_CONFIRMATION', 'off'],
  ]);
});

test('with --toolset, each config-file adapter writes GSM_TOOLSET for every server', async () => {
  const codexText = await installText('codex', { toolset: 'google' });
  assert.equal(codexText.split('env = { GSM_TOOLSET = "google" }').length - 1, 2);
  const withWrites = await installText('codex', { toolset: 'curated', allowWrites: true });
  assert.equal(withWrites.split('env = { GSM_ALLOW_WRITES = "true", GSM_TOOLSET = "curated" }').length - 1, 2);
  const open = JSON.parse(await installText('opencode', { toolset: 'all' }));
  assert.deepEqual(open.mcp['gsm-gcloud'].environment, { GSM_TOOLSET: 'all' });
  const agyFile = JSON.parse(await installText('agy', { toolset: 'google', confirmation: 'every-change' }));
  assert.deepEqual(agyFile.mcpServers['gsm-gsc'].env, { GSM_CONFIRMATION: 'every-change', GSM_TOOLSET: 'google' });
});

test('claude: --toolset becomes --config toolset=<value>, only when given', () => {
  assert.deepEqual(configArgs({ allowWrites: false }), []);
  assert.deepEqual(configArgs({ allowWrites: true, confirmation: 'off' }), ['--config', 'allow_writes=true', '--config', 'confirmation=off']);
  assert.deepEqual(configArgs({ allowWrites: false, toolset: 'google' }), ['--config', 'toolset=google']);
});

test('install --toolset is parsed for install only; an unknown value is a usage error', () => {
  const base = ['install', '--agent', 'codex', '--plugin', 'all', '--scope', 'global'];
  const parse = (args) => parseInstallArgs(parseCliArgs(args).values, 'install', (p) => p, ['gcloud']);
  assert.equal('toolset' in parse(base), false, 'no flag, no key');
  assert.equal(parse([...base, '--toolset', 'curated']).toolset, 'curated');
  assert.throws(() => parse([...base, '--toolset', 'lean']), (err) => err instanceof UsageError && /--toolset must be one of: all, google, curated/.test(err.message));
  assert.throws(() => parseCliArgs(['uninstall', '--agent', 'codex', '--plugin', 'all', '--toolset', 'google']), /Unknown option/);
});

test('the posture line names the toolset only when GSM_TOOLSET is set', () => {
  const plain = postureLine(['https://www.googleapis.com/auth/gmail.readonly'], {});
  assert.equal(plain, 'security: 1 granted scope(s), read-only only: yes; confirmation: every-change (default); writes: disabled');
  assert.equal(postureLine([], { GSM_TOOLSET: 'google' }), 'security: 0 granted scope(s), read-only only: no scopes; confirmation: every-change (default); writes: disabled; toolset: google');
  assert.match(postureLine([], { GSM_TOOLSET: 'lean' }), /; toolset: unrecognised GSM_TOOLSET value \(expected all, google, curated; the servers use all\)$/);
});

const repoEnv = () => {
  const roots = findRoots(pathToFileURL(GSM).href);
  return { roots, registry: loadProductRegistry(roots) };
};

test('installSummary names the toolset only when --toolset is given', () => {
  const env = repoEnv();
  const servers = env.registry.servers.filter((s) => s.plugin === 'gsc');
  const run = { agent: 'codex', plugin: ['gsc'], scope: 'global', allowWrites: false, installMissing: false, dryRun: true, keepData: false, action: 'install' };
  const plain = installSummary(run, env, servers);
  assert.match(plain, /; writes: not set \(write tools stay off\)$/);
  assert.equal(installSummary({ ...run, toolset: 'google' }, env, servers), `${plain}; toolset: google`);
});

test('tool counts per toolset from the tool map: gmail all, google and curated', () => {
  const env = repoEnv();
  const gmail = env.registry.servers.find((s) => s.plugin === 'gmail');
  const map = join(REPO, 'plugins', 'gmail', 'tool-map.json');
  const entries = JSON.parse(readFileSync(map, 'utf8'));
  const runtime = entries.filter((e) => RUNTIME_TOOL_NAMES.some((n) => e.name.endsWith(`__${n}`))).length;
  assert.equal(runtime, RUNTIME_TOOL_NAMES.length, 'every runtime tool is in the map');
  assert.deepEqual(toolsetCount(map, 'gmail', 'gmail', 'all', gmail.toolsets), { count: entries.length, effective: 'all' });
  assert.deepEqual(toolsetCount(map, 'gmail', 'gmail', 'google', gmail.toolsets), { count: 14 + runtime, effective: 'google' });
  // curated: the 15 hand-written Gmail tools and the 3 gateway tools.
  assert.deepEqual(toolsetCount(map, 'gmail', 'gmail', 'curated', gmail.toolsets), { count: 18 + runtime, effective: 'curated' });
  const gsc = env.registry.servers.find((s) => s.plugin === 'gsc');
  assert.equal(toolsetCount(join(REPO, 'plugins', 'gsc', 'tool-map.json'), 'gsc', 'gsc', 'google', gsc.toolsets).effective, 'all');
});

test('agy warnings: a product over the limit is named with the counts of the other toolsets; one under it is not', () => {
  const env = repoEnv();
  assert.equal(AGY_TOOL_LIMIT, 100);
  const lines = agyToolWarnings({}, env, ['gcloud', 'gmail', 'gsc']);
  assert.equal(lines.length, 2, lines.join('\n'));
  // gcloud has a google list since 1.10.0 (59 tools and the runtime tools).
  assert.match(lines[0], /^\[agy\] warning: gcloud can list up to \d+ tools with toolset all\. Antigravity is reported to refuse a server with more than 100 tools \(not verified by gsm\)\. Fewer tools: --toolset google: up to 68, --toolset curated: up to \d+\.$/);
  assert.match(lines[1], /^\[agy\] warning: gmail can list up to 115 tools with toolset all\. .* Fewer tools: --toolset google: up to 23, --toolset curated: up to 27\.$/);
  // With google, gcloud and gmail are under the limit; gai has no google list, so it lists all its tools.
  const google = agyToolWarnings({ toolset: 'google' }, env, ['gcloud', 'gmail', 'gai']);
  assert.equal(google.length, 1, google.join('\n'));
  assert.match(google[0], /^\[agy\] warning: gai can list up to \d+ tools with toolset google \(it has no google list, so all tools\)\./);
});

/** The built CLI with a temp token folder and --home, and no GSM_* setting from this shell. */
function runGsm(args) {
  const root = tempDir('gsm-toolset-cli-');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_')));
  env.GSM_TOKEN_DIR = join(root, 'tokens');
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const res = spawnSync(process.execPath, [GSM, ...args, '--home', home], { env, encoding: 'utf8', timeout: 120_000 });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', home };
}

test('gsm install --agent agy --dry-run warns for gcloud, and --toolset reaches the planned config', () => {
  const plain = runGsm(['install', '--agent', 'agy', '--plugin', 'gcloud,gsc', '--dry-run']);
  assert.equal(plain.code, 0, plain.stderr);
  assert.match(plain.stderr, /\[agy\] warning: gcloud can list up to \d+ tools with toolset all/);
  assert.equal(/warning: gsc/.test(plain.stderr), false);
  assert.equal(/GSM_TOOLSET/.test(plain.stdout), false, 'nothing is planned for the toolset without the flag');
  assert.equal(existsSync(join(plain.home, '.gemini')), false, 'a dry run writes nothing');

  const codexRun = runGsm(['install', '--agent', 'codex', '--plugin', 'gsc', '--toolset', 'google', '--dry-run']);
  assert.equal(codexRun.code, 0, codexRun.stderr);
  assert.match(codexRun.stdout, /GSM_TOOLSET = "google"/);
  assert.match(codexRun.stdout, /; toolset: google$/m);
  assert.equal(/\[agy\] warning/.test(codexRun.stderr), false, 'the warning is for agy only');
});
