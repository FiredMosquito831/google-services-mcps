// The CLI of the repository layout (the repository's gsm.mjs, and so the npm package's) counts tools, gateway methods and
// scopes exactly as each plugin's own CLI does (the one the sign-in from the chat runs), and its --json output is JSON
// from any folder. Until 1.26.1 the repository CLI built its servers from config/products.json without the curated
// modules and the gateway APIs (gmail: 88 of 103 tools, 0 of 4 gateway methods), the npm package found no Discovery
// snapshot or catalog at all (0 tools), and `gsm scopes apikey --json` put a quoted path unescaped into a JSON string.
// Nothing here calls Google: every run uses a temp token folder and a temp home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRoots } from '../dist/cli/paths.js';
import { loadProductRegistry, loadRegistryFile, registryFromProducts } from '../dist/cli/products.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_GSM = join(REPO, 'dist', 'cli', 'gsm.js');
const ROOT_GSM = join(REPO, 'gsm.mjs');
const pluginGsm = (root, id) => join(root, 'plugins', id, 'bin', 'gsm.mjs');
const readJson = (...parts) => JSON.parse(readFileSync(join(...parts), 'utf8'));

/** A temp folder with a home, a token folder and a working folder outside the repository. Removed afterwards. */
function withTemp(body) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-root-cli-'));
  const home = join(root, 'home');
  const tokens = join(root, 'tokens');
  const cwd = join(root, 'cwd');
  for (const dir of [home, tokens, cwd]) mkdirSync(dir, { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  Object.assign(env, { HOME: home, USERPROFILE: home, GSM_TOKEN_DIR: tokens });
  try {
    return body({ root, home, tokens, cwd, env });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function gsm(entry, args, t, cwd = t.cwd) {
  const res = spawnSync(process.execPath, [entry, ...args], { cwd, env: t.env, encoding: 'utf8', timeout: 120_000 });
  assert.equal(res.status, 0, `${entry} ${args.join(' ')}\n${res.stdout}\n${res.stderr}`);
  return res;
}

/** The cases compared: every toolset, and Gmail's optional part. */
const CASES = [
  { id: 'gmail', group: 'workspace-user', extra: [] },
  { id: 'gmail', group: 'workspace-user', extra: ['--toolset', 'google'] },
  { id: 'gmail', group: 'workspace-user', extra: ['--toolset', 'curated'] },
  { id: 'gmail', group: 'workspace-user', extra: ['--with', 'postmaster'] },
  { id: 'gcloud', group: 'cloud', extra: [] },
  { id: 'gcloud', group: 'cloud', extra: ['--toolset', 'google'] },
  { id: 'gcloud', group: 'cloud', extra: ['--toolset', 'curated'] },
];

/** Root CLI `scopes <group> --servers <id>` against the plugin's own CLI `scopes <group>`: the same JSON, byte for byte. */
function assertSameAsPlugin(rootEntry, pluginRoot, t) {
  for (const c of CASES) {
    const label = `${c.id} ${c.extra.join(' ') || '(all)'}`;
    const fromRoot = gsm(rootEntry, ['scopes', c.group, '--servers', c.id, '--json', ...c.extra], t);
    const fromPlugin = gsm(pluginGsm(pluginRoot, c.id), ['scopes', c.group, '--json', ...c.extra], t);
    assert.equal(fromRoot.stdout, fromPlugin.stdout, `${label}: the root CLI prints what the plugin's CLI prints`);
    assert.equal(fromRoot.stderr, fromPlugin.stderr, `${label}: the same notes`);
    // Gateway methods are counted on both sides, so two CLIs that both missed them could not pass by matching.
    if (c.extra.length === 0) assert.ok(JSON.parse(fromRoot.stdout).gatewayMethods > 0, `${label}: gateway methods are counted`);
  }
}

test('repo layout: each server is built from its plugin folder (curated module, gateway APIs, snapshots, catalog)', () => {
  const roots = findRoots(new URL('../dist/cli/gsm.js', import.meta.url).href);
  assert.equal(roots.layout, 'repo');
  const reg = loadProductRegistry(roots);
  const converted = registryFromProducts(readJson(REPO, 'config', 'products.json'), REPO);
  assert.equal(reg.servers.length, converted.servers.length);
  for (const spec of reg.servers) {
    const own = loadRegistryFile(join(REPO, 'plugins', spec.plugin, 'servers.json'));
    const entry = own.servers.find((s) => s.name === spec.name);
    const before = converted.servers.find((s) => s.name === spec.name);
    assert.equal(spec.pluginRoot, join(REPO, 'plugins', spec.plugin), spec.name);
    for (const key of ['curated', 'apis', 'gatewayApis', 'scopes', 'scopePolicy', 'scopeOverrides', 'fieldsDefaults', 'fieldMaskDefaults', 'pageSizeDefaults', 'methodNotes', 'toolsets', 'toolsetScopes']) {
      assert.deepEqual(spec[key], entry[key], `${spec.name}.${key} comes from the plugin's servers.json`);
    }
    // What listings and installs print stays the conversion's.
    for (const key of ['name', 'plugin', 'group', 'kind', 'label']) assert.deepEqual(spec[key], before[key], `${spec.name}.${key}`);
    for (const [group, scopes] of Object.entries(own.groupScopes ?? {})) assert.deepEqual(reg.groupScopes[group], scopes, `${group} scope list`);
  }
  assert.ok(reg.servers.find((s) => s.name === 'gmail').curated, 'gmail has its curated module');
  assert.ok(reg.servers.find((s) => s.name === 'gcloud').gatewayApis.length > 0, 'gcloud has its gateway APIs');
  // A plugin folder's own CLI reads its servers.json as it is: no plugin folder is set there.
  const plugin = loadProductRegistry({ layout: 'plugin', root: join(REPO, 'plugins', 'gmail'), mapFile: join(REPO, 'plugins', 'gmail', 'servers.json') });
  assert.equal(plugin.servers[0].pluginRoot, undefined);
});

test('gsm scopes from the repository CLI equals the plugin CLI: gmail and gcloud, every toolset, gmail with postmaster', () =>
  withTemp((t) => assertSameAsPlugin(DIST_GSM, REPO, t)));

test('the npm package layout (no data/ folder): the root gsm.mjs counts what the plugin CLIs count, setup-admin too', () =>
  withTemp((t) => {
    // The package's files: gsm.mjs, package.json, config/ and the plugin folders (data/ is not shipped).
    const pkg = join(t.root, 'package');
    mkdirSync(join(pkg, 'plugins'), { recursive: true });
    for (const part of ['gsm.mjs', 'package.json', 'config', ...['gmail', 'gcloud', 'gadmin'].map((id) => join('plugins', id))]) {
      cpSync(join(REPO, part), join(pkg, part), { recursive: true });
    }
    assertSameAsPlugin(join(pkg, 'gsm.mjs'), pkg, t);

    // setup-admin saves the scopes the gadmin plugin's own CLI saves (a fake key: only its client_email is read).
    const key = join(t.root, 'key.json');
    writeFileSync(key, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com' }));
    const saved = (entry) => {
      const tokens = mkdtempSync(join(t.root, 'admin-'));
      const env = { ...t.env, GSM_TOKEN_DIR: tokens };
      const res = spawnSync(process.execPath, [entry, 'setup-admin', '--subject', 'admin@example.com', '--key-file', key, '--profile', 'readwrite'], {
        cwd: t.cwd,
        env,
        encoding: 'utf8',
        timeout: 120_000,
      });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      return { scopes: readJson(tokens, 'workspace-admin.scopes.json').scopes, coverage: res.stdout.match(/^The server for .*$/m)?.[0] };
    };
    const fromRoot = saved(join(pkg, 'gsm.mjs'));
    const fromPlugin = saved(pluginGsm(pkg, 'gadmin'));
    assert.deepEqual(fromRoot, fromPlugin);
    assert.ok(fromRoot.scopes.length > 4, `${fromRoot.scopes.length} admin scopes`);
  }));

test('--json prints valid JSON from outside the repository: scopes apikey (its note names the command), and the other --json commands', () =>
  withTemp((t) => {
    for (const cwd of [t.cwd, REPO]) {
      const apikey = JSON.parse(gsm(DIST_GSM, ['scopes', 'apikey', '--json'], t, cwd).stdout);
      assert.equal(apikey.group, 'apikey');
      assert.deepEqual(apikey.profiles, {});
      // From another folder the command is `node "<path to gsm.mjs>"`, quoted: it must be escaped inside the string.
      assert.ok(apikey.note.endsWith(`${cwd === REPO ? 'node gsm.mjs' : `node "${ROOT_GSM}"`} setup-apikey`), apikey.note);
    }
    const others = [
      ['scopes', 'workspace-user', '--servers', 'gmail', '--json'],
      ['products', '--json'],
      ['apis', 'gmail', '--json'],
      ['methods', 'gmail', 'v1', '--json', '--limit', '3'],
      ['list', '--json', '--home', t.home],
      ['health', '--json', '--plugin', 'gmaps'],
    ];
    for (const args of others) assert.doesNotThrow(() => JSON.parse(gsm(DIST_GSM, args, t).stdout), args.join(' '));
    // The text output of the apikey group is unchanged: one line with the command for this route.
    const text = gsm(DIST_GSM, ['scopes', 'apikey'], t).stdout;
    assert.equal(text, `apikey: the products in this group use an API key, not OAuth scopes. Save the key with: node "${ROOT_GSM}" setup-apikey\n`);
  }));
