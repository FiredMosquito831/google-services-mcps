// Tests for the gsm command surface: products, apis, methods, doctor, version, the help text, the install
// summary and the install and uninstall dry-run matrix. Run `npx tsc -p tsconfig.json` first (tests import dist/).
// Every test works in temp folders. The real home folder, the real token directory and the claude CLI are never used:
// each spawned gsm gets HOME, USERPROFILE and GSM_TOKEN_DIR pointed at temp folders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyMethod } from '../dist/core/discovery/methods.js';
import { loadCatalog, loadKindOverrides, findCatalogFile } from '../dist/cli/catalog.js';
import { fallbackClassify, loadClassifier } from '../dist/cli/method-kinds.js';
import { runDoctor, REQUIRED_PATHS } from '../dist/cli/doctor.js';
import { loadProductRegistry } from '../dist/cli/products.js';
import { runApis, runMethods, runProducts, versionLines, METHODS_DEFAULT_LIMIT } from '../dist/cli/listing.js';
import { UsageError } from '../dist/cli/types.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GSM = join(REPO, 'dist', 'cli', 'gsm.js');
const GSM_URL = pathToFileURL(GSM).href;
const REPO_PRODUCTS = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products;
const REPO_IDS = Object.keys(REPO_PRODUCTS);
const AGENTS = ['claude', 'codex', 'opencode', 'agy', 'all'];
const SCOPES = ['global', 'project', 'local'];

async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-surface-test-'));
  const paths = {
    root,
    home: join(root, 'home'),
    folder: join(root, 'folder'),
    tokens: join(root, 'tokens'),
  };
  for (const dir of [paths.home, paths.folder, paths.tokens]) mkdirSync(dir, { recursive: true });
  try {
    return await fn(paths);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Every file below a folder, recursively. Used to prove that a dry run wrote nothing. */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/** Runs the built CLI with HOME, USERPROFILE and GSM_TOKEN_DIR inside the temp paths. */
function runGsm(args, p, { env = {}, input = '' } = {}) {
  const childEnv = { ...process.env };
  for (const name of ['GSM_API_KEY_INPUT', 'GSM_CONFIRMATION', 'GSM_ALLOW_WRITES', 'GSM_TOKEN_DIR', 'GSM_ADS_DEVELOPER_TOKEN']) {
    delete childEnv[name];
  }
  Object.assign(childEnv, env, { HOME: p.home, USERPROFILE: p.home, GSM_TOKEN_DIR: p.tokens });
  const res = spawnSync(process.execPath, [GSM, ...args], { env: childEnv, input, encoding: 'utf8', timeout: 120_000 });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const collector = () => {
  const lines = [];
  return { lines, out: { log: (l) => lines.push(l), warn: (l) => lines.push(l) } };
};

// ---------- products ----------

test('products lists the 23 products of config/products.json from the repo, with tool counts and folder state', async () => {
  await withTemp((p) => {
    const res = runGsm(['products', '--json'], p);
    assert.equal(res.code, 0, res.stderr);
    const rows = JSON.parse(res.stdout);
    assert.equal(rows.length, 23);
    assert.deepEqual(rows.map((r) => r.id).sort(), [...REPO_IDS].sort());
    for (const row of rows) {
      const product = REPO_PRODUCTS[row.id];
      assert.equal(row.generatedApis, product.generated.length, `${row.id} generated APIs`);
      assert.equal(row.gatewayApis, (product.gateway ?? []).length, `${row.id} gateway APIs`);
      assert.equal(row.group, product.group);
      const folder = join(REPO, 'plugins', row.id);
      assert.equal(row.pluginFolder, existsSync(folder), `${row.id} folder state`);
      const mapFile = join(folder, 'tool-map.json');
      if (existsSync(mapFile)) {
        assert.equal(row.toolSource, 'tool-map');
        assert.equal(row.tools, JSON.parse(readFileSync(mapFile, 'utf8')).length, `${row.id} tools from tool-map.json`);
      } else {
        assert.equal(row.tools, product.generatedToolCount ?? null);
      }
    }
  });
});

test('products text output has one line per product under a header', async () => {
  await withTemp((p) => {
    const res = runGsm(['products'], p);
    assert.equal(res.code, 0, res.stderr);
    const lines = res.stdout.split(/\r?\n/);
    assert.match(lines[0], /^ID\s+TITLE\s+GROUP\s+TOOLS\s+GENERATED\s+GATEWAY\s+FOLDER$/);
    for (const id of REPO_IDS) assert.ok(lines.some((l) => l.startsWith(`${id} `)), `${id} has a row`);
  });
});

// ---------- apis ----------

test('apis --search filters by name or title, case-insensitively, and reports the total', async () => {
  await withTemp((p) => {
    const res = runGsm(['apis', '--search', 'BigQuery', '--json'], p);
    assert.equal(res.code, 0, res.stderr);
    const body = JSON.parse(res.stdout);
    assert.equal(body.total, body.apis.length);
    assert.ok(body.apis.length >= 5);
    for (const api of body.apis) {
      const hit = api.name.toLowerCase().includes('bigquery') || api.title.toLowerCase().includes('bigquery');
      assert.ok(hit, `${api.name} ${api.version} matches bigquery`);
    }
    assert.ok(body.apis.some((a) => a.name === 'bigquery' && a.version === 'v2'));

    const none = runGsm(['apis', '--search', 'no-such-api-anywhere', '--json'], p);
    assert.equal(none.code, 0);
    assert.equal(JSON.parse(none.stdout).total, 0);
  });
});

test('apis with a product lists its generated and gateway APIs, and --search and --limit narrow them', async () => {
  await withTemp((p) => {
    const all = JSON.parse(runGsm(['apis', 'gcloud', '--json'], p).stdout);
    const product = REPO_PRODUCTS.gcloud;
    assert.equal(all.total, product.generated.length + product.gateway.length);
    assert.equal(all.apis.filter((a) => a.kind === 'generated').length, product.generated.length);
    assert.equal(all.apis.filter((a) => a.kind === 'gateway').length, product.gateway.length);

    const storage = JSON.parse(runGsm(['apis', 'gcloud', '--search', 'storage', '--json'], p).stdout);
    assert.ok(storage.apis.some((a) => a.name === 'storage' && a.kind === 'generated' && a.methods > 0));
    assert.ok(storage.apis.every((a) => /storage/i.test(a.name) || /storage/i.test(a.title)));

    const limited = JSON.parse(runGsm(['apis', '--limit', '2', '--json'], p).stdout);
    assert.equal(limited.shown, 2);
    assert.equal(limited.apis.length, 2);
  });
});

test('apis: an unknown product is a usage error (exit 2), and --limit must be at least 1', async () => {
  await withTemp((p) => {
    const unknown = runGsm(['apis', 'nope'], p);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown product "nope"/);
    assert.equal(runGsm(['apis', '--limit', '0'], p).code, 2);
    assert.equal(runGsm(['apis', 'gcloud', 'extra'], p).code, 2);
  });
});

test('apis without a catalog says so and fails with an error', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-no-catalog-'));
  try {
    const fromUrl = pathToFileURL(join(dir, 'bin', 'gsm.mjs')).href;
    if (findCatalogFile(fromUrl) !== undefined) {
      t.skip('a catalog.json exists above the temp folder');
      return;
    }
    assert.throws(() => loadCatalog(fromUrl), /no API catalog found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- methods ----------

test('methods prints the kind of every method: read, write or destructive', async () => {
  await withTemp((p) => {
    const res = runGsm(['methods', 'storage', 'v1', '--json'], p);
    assert.equal(res.code, 0, res.stderr);
    const body = JSON.parse(res.stdout);
    assert.equal(body.classifier, 'core', 'the compiled classifyMethod is used in the repo');
    assert.equal(body.total, body.methods.length);
    const kindOf = (id) => body.methods.find((m) => m.id === id)?.kind;
    assert.equal(kindOf('storage.objects.get'), 'read');
    assert.equal(kindOf('storage.objects.list'), 'read');
    assert.equal(kindOf('storage.objects.insert'), 'write');
    assert.equal(kindOf('storage.objects.delete'), 'destructive');
    assert.equal(kindOf('storage.folders.deleteRecursive'), 'destructive', 'an override from config/tool-kinds.json applies');
    const kinds = new Set(body.methods.map((m) => m.kind));
    assert.deepEqual([...kinds].sort(), ['destructive', 'read', 'write']);
    for (const m of body.methods) assert.ok(typeof m.verb === 'string' && typeof m.path === 'string');

    const text = runGsm(['methods', 'storage', 'v1', '--search', 'delete'], p);
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /storage v1 \(Cloud Storage API\): \d+ matching methods, read 0, write 0, destructive \d+/);
    assert.match(text.stdout, /storage\.objects\.delete\s+DELETE\s+b\/\{bucket\}\/o\/\{object\}\s+destructive/);
  });
});

test('methods shows at most 200 rows unless --limit is given', async () => {
  await withTemp((p) => {
    const catalog = loadCatalog(GSM_URL);
    const biggest = catalog.apis.reduce((best, a) => (a.methods.length > best.methods.length ? a : best));
    assert.ok(biggest.methods.length > METHODS_DEFAULT_LIMIT, 'the test needs an API with more than 200 methods');

    const capped = JSON.parse(runGsm(['methods', biggest.name, biggest.version, '--json'], p).stdout);
    assert.equal(capped.total, biggest.methods.length);
    assert.equal(capped.shown, METHODS_DEFAULT_LIMIT);
    assert.equal(capped.methods.length, METHODS_DEFAULT_LIMIT);

    const limited = JSON.parse(runGsm(['methods', biggest.name, biggest.version, '--limit', '7', '--json'], p).stdout);
    assert.equal(limited.shown, 7);

    const text = runGsm(['methods', biggest.name, biggest.version], p);
    assert.match(text.stdout, new RegExp(`showing ${METHODS_DEFAULT_LIMIT} of ${biggest.methods.length} methods`));
  });
});

test('methods: an unknown API or version is a usage error that names the choices', async () => {
  await withTemp((p) => {
    const unknown = runGsm(['methods', 'nope'], p);
    assert.equal(unknown.code, 2);
    assert.match(unknown.stderr, /unknown API "nope"/);
    const noVersion = runGsm(['methods', 'storage', 'v9'], p);
    assert.equal(noVersion.code, 2);
    assert.match(noVersion.stderr, /storage has no version v9\. Its versions: v1/);
    assert.equal(runGsm(['methods'], p).code, 2);
  });
});

test('the classifier fallback used in plugin bundles agrees with classifyMethod on every catalog method', () => {
  const catalog = loadCatalog(GSM_URL);
  const overrides = loadKindOverrides(catalog.file);
  assert.ok(Object.keys(overrides).length > 0, 'config/tool-kinds.json has overrides');
  let checked = 0;
  for (const api of catalog.apis) {
    for (const m of api.methods) {
      const name = m.id.slice(m.id.lastIndexOf('.') + 1);
      assert.equal(fallbackClassify(m.verb, name, m.id, overrides), classifyMethod(m.verb, name, m.id, overrides), m.id);
      checked += 1;
    }
  }
  assert.equal(checked, catalog.apis.reduce((n, a) => n + a.methods.length, 0));
});

test('the classifier loads classifyMethod from dist/core in the repo, and the built-in rules without it', async () => {
  const core = await loadClassifier(GSM_URL);
  assert.equal(core.source, 'core');
  const plugin = await loadClassifier(pathToFileURL(join(REPO, 'plugins', 'no-such-plugin', 'bin', 'gsm.mjs')).href);
  assert.equal(plugin.source, 'built-in');
});

// ---------- doctor (fixture plugin folder, in-process) ----------

/** A minimal plugin folder that passes every check of `gsm doctor` for one product. */
function makePluginFixture(dir, id = 'gx', { apis = [], gatewayApis = [] } = {}) {
  const write = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  write(
    'servers.json',
    JSON.stringify({
      plugins: { [id]: 'Fixture product' },
      groups: {},
      servers: [{ name: id, plugin: id, group: 'workspace-user', kind: 'curated', label: 'Fixture', apis, gatewayApis }],
    }),
  );
  write('.claude-plugin/plugin.json', JSON.stringify({ name: id, version: '0.2.0' }));
  write('.mcp.json', JSON.stringify({ mcpServers: { [id]: { command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/servers/${id}.mjs`] } } }));
  write('bin/gsm.mjs', '// fixture\n');
  write('bin/gsm-hook.mjs', '// fixture\n');
  write(
    'hooks/hooks.json',
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: `^mcp__plugin_${id}_`, hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/gsm-hook.mjs'], timeout: 10 }] }],
      },
    }),
  );
  write(
    'tool-map.json',
    JSON.stringify([
      { name: `mcp__plugin_${id}_${id}__api_call`, kind: 'dynamic', scopes: [], title: 'Call an API method' },
      { name: `mcp__plugin_${id}_${id}__api_describe`, kind: 'read', scopes: [], title: 'Describe an API method' },
    ]),
  );
  write('scopes.json', JSON.stringify({ [id]: [] }));
  write('skills/fixture/SKILL.md', '# fixture skill\n');
  write(`servers/${id}.mjs`, '// fixture server\n');
}

const fixtureRoots = (dir) => ({ layout: 'plugin', root: dir, mapFile: join(dir, 'servers.json') });

function doctorOn(dir, tokenDir, { pluginId, env = {} } = {}) {
  const { lines, out } = collector();
  const roots = fixtureRoots(dir);
  const code = runDoctor({ roots, registry: loadProductRegistry(roots), pluginId, tokenDir, env }, out);
  return { code, lines, text: lines.join('\n') };
}

function writeToken(tokenDir, name, body) {
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, name), body);
}

test('doctor passes on a complete fixture plugin folder and prints no secret', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx');
    writeToken(p.tokens, 'client_secret.json', '{"installed":{"client_id":"id","client_secret":"SECRET-CLIENT-VALUE"}}');
    writeToken(p.tokens, 'apikey.json', '{"apiKey":"SECRET-KEY-VALUE"}');
    const res = doctorOn(plugin, p.tokens, { pluginId: 'gx' });
    assert.equal(res.code, 0, res.text);
    assert.ok(res.lines.includes('PASS gx: plugin folder has the 9 required files'), res.text);
    assert.ok(res.lines.some((l) => l.startsWith('PASS gx: hooks/hooks.json matches ^mcp__plugin_gx_ and runs bin/gsm-hook.mjs')), res.text);
    assert.ok(res.lines.some((l) => l.startsWith('PASS gx: every server in .mcp.json (gx) has a file under servers/')), res.text);
    assert.ok(res.lines.some((l) => l.startsWith('PASS gx: tool-map.json has 2 tools')), res.text);
    assert.ok(res.lines.some((l) => l.startsWith('PASS OAuth client file exists')), res.text);
    assert.equal(res.lines.filter((l) => l.startsWith('FAIL')).length, 0, res.text);
    assert.equal(res.text.includes('SECRET-'), false, 'no secret value may be printed');
    assert.equal(REQUIRED_PATHS.length, 9);
  });
});

test('doctor fails when tool-map.json is missing, and exits 1', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx');
    writeToken(p.tokens, 'client_secret.json', '{}');
    rmSync(join(plugin, 'tool-map.json'));
    const res = doctorOn(plugin, p.tokens, { pluginId: 'gx' });
    assert.equal(res.code, 1);
    assert.ok(res.lines.some((l) => l.startsWith('FAIL gx: missing tool-map.json')), res.text);
    assert.ok(res.lines.at(-1).startsWith('doctor:') && res.lines.at(-1).includes('failed'), res.text);
  });
});

test('doctor fails on a wrong hook matcher, on tool names without the prefix or over 64 characters, and on a missing OAuth client', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx');
    writeFileSync(
      join(plugin, 'hooks', 'hooks.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: '^mcp__other_', hooks: [{ type: 'command', args: ['${CLAUDE_PLUGIN_ROOT}/bin/gsm-hook.mjs'] }] }] } }),
    );
    const hook = doctorOn(plugin, p.tokens, { pluginId: 'gx' });
    assert.equal(hook.code, 1);
    assert.ok(hook.lines.some((l) => l.startsWith('FAIL gx: hooks/hooks.json has no PreToolUse entry with matcher ^mcp__plugin_gx_')), hook.text);

    makePluginFixture(plugin, 'gx');
    const long = `mcp__plugin_gx_gx__${'x'.repeat(60)}`;
    writeFileSync(
      join(plugin, 'tool-map.json'),
      JSON.stringify([{ name: 'bad_name' }, { name: long }, { name: 'mcp__plugin_gx_gx__ok' }]),
    );
    const names = doctorOn(plugin, p.tokens, { pluginId: 'gx' });
    assert.equal(names.code, 1);
    assert.ok(names.lines.some((l) => l.startsWith('FAIL gx: 2 tool name(s) lack the prefix')), names.text);

    makePluginFixture(plugin, 'gx');
    const noClient = doctorOn(plugin, p.tokens, { pluginId: 'gx' });
    assert.equal(noClient.code, 1);
    assert.ok(noClient.lines.some((l) => l.startsWith('FAIL OAuth client file missing')), noClient.text);
  });
});

test('doctor: a token directory that does not exist yet passes when it can be created, and is not created', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx');
    const tokenDir = join(p.root, 'not-yet', 'tokens');
    writeToken(p.tokens, 'client_secret.json', '{}');
    const res = doctorOn(plugin, tokenDir, { pluginId: 'gx' });
    assert.ok(res.lines.some((l) => l.startsWith(`PASS token directory ${tokenDir} does not exist yet`)), res.text);
    assert.equal(existsSync(tokenDir), false, 'doctor must not create the token directory');
  });
});

test('doctor: the Ads developer token is an information line for gads, never a FAIL, and its value is never printed', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gads');
    writeToken(p.tokens, 'client_secret.json', '{}');
    const missing = doctorOn(plugin, p.tokens, { pluginId: 'gads', env: {} });
    assert.ok(missing.lines.some((l) => l.startsWith('INFO GSM_ADS_DEVELOPER_TOKEN is not set')), missing.text);
    assert.equal(
      missing.lines.some((l) => l.startsWith('FAIL') && l.includes('GSM_ADS_DEVELOPER_TOKEN')),
      false,
      'a missing developer token is not a failure',
    );
    const set = doctorOn(plugin, p.tokens, { pluginId: 'gads', env: { GSM_ADS_DEVELOPER_TOKEN: 'ADS-SECRET-VALUE' } });
    assert.ok(set.lines.some((l) => l.startsWith('INFO GSM_ADS_DEVELOPER_TOKEN is set')), set.text);
    assert.equal(set.text.includes('ADS-SECRET-VALUE'), false);
  });
});

test('doctor: workspace-admin FAILs without setup-admin or both environment variables, and passes with either', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gadmin');
    // The fixture gives every server the workspace-user group; the admin check needs workspace-admin.
    const map = JSON.parse(readFileSync(join(plugin, 'servers.json'), 'utf8'));
    map.servers[0].group = 'workspace-admin';
    writeFileSync(join(plugin, 'servers.json'), JSON.stringify(map));
    const none = doctorOn(plugin, p.tokens, { pluginId: 'gadmin', env: {} });
    assert.equal(none.code, 1, none.text);
    assert.ok(none.lines.some((l) => l.startsWith('FAIL workspace-admin is not set up')), none.text);

    const oneVariable = doctorOn(plugin, p.tokens, { pluginId: 'gadmin', env: { GSM_ADMIN_SUBJECT: 'admin@example.com' } });
    assert.ok(oneVariable.lines.some((l) => l.startsWith('FAIL workspace-admin is not set up')), 'one variable is not enough');

    const both = doctorOn(plugin, p.tokens, {
      pluginId: 'gadmin',
      env: { GSM_ADMIN_SUBJECT: 'admin@example.com', GSM_SERVICE_ACCOUNT_KEY_FILE: join(p.root, 'key.json') },
    });
    assert.ok(both.lines.some((l) => l.startsWith('PASS workspace-admin is set up')), both.text);

    writeToken(p.tokens, 'workspace-admin.scopes.json', JSON.stringify({ subject: 'admin@example.com', scopes: [], profile: 'custom', keyFile: 'key.json' }));
    const stored = doctorOn(plugin, p.tokens, { pluginId: 'gadmin', env: {} });
    assert.ok(stored.lines.some((l) => l.startsWith('PASS workspace-admin is set up')), stored.text);
  });
});

test('gsm login --no-browser: the help names the flag, and the URL is printed without opening a browser', async () => {
  await withTemp(async (p) => {
    assert.match(runGsm(['--help'], p).stdout, /--no-browser/);
    const client = join(p.root, 'client_secret.json');
    writeFileSync(client, JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
    // The login waits for the browser callback, so the run is stopped once the URL is printed (the timeout kills it).
    const res = spawnSync(process.execPath, [GSM, 'login', 'business', '--no-browser', '--client-secret', client], {
      env: { ...process.env, HOME: p.home, USERPROFILE: p.home, GSM_TOKEN_DIR: p.tokens },
      encoding: 'utf8',
      timeout: 6000,
    });
    const out = res.stdout ?? '';
    assert.match(out, /Open this URL in a browser to log in \(--no-browser: the browser is not opened\):/, out + (res.stderr ?? ''));
    assert.match(out, /https:\/\/accounts\.google\.com\/o\/oauth2/);
    assert.equal(out.includes('if the browser does not open'), false, 'the default wording is not used');
    assert.equal(existsSync(join(p.tokens, 'business.token.json')), false, 'no token is saved before the login completes');
  });
});

test('doctor: an unknown --plugin id is a usage error that lists the valid ids', async () => {
  await withTemp((p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx');
    assert.throws(() => doctorOn(plugin, p.tokens, { pluginId: 'nope' }), (err) => err instanceof UsageError && /Valid plugin ids: gx/.test(err.message));
    const cli = runGsm(['doctor', '--plugin', 'nope', '--token-dir', p.tokens], p);
    assert.equal(cli.code, 2);
    assert.match(cli.stderr, /unknown plugin id "nope"/);
  });
});

// ---------- listings and version in a plugin folder (in-process, fixture catalog) ----------

test('plugin layout: products, apis, methods and version read the plugin folder and its catalog.json', async () => {
  await withTemp(async (p) => {
    const plugin = join(p.root, 'plugin');
    makePluginFixture(plugin, 'gx', {
      apis: [{ api: 'storage', version: 'v1' }],
      gatewayApis: [{ api: 'logging', version: 'v2' }],
    });
    writeFileSync(
      join(plugin, 'catalog.json'),
      JSON.stringify({
        apis: [
          {
            name: 'storage',
            version: 'v1',
            title: 'Cloud Storage API',
            preferred: true,
            methods: [
              ['storage.objects.list', 'GET', 'b/{bucket}/o', [], ''],
              ['storage.objects.delete', 'DELETE', 'b/{bucket}/o/{object}', [], ''],
            ],
          },
        ],
      }),
    );
    const roots = fixtureRoots(plugin);
    const env = { roots, registry: loadProductRegistry(roots), moduleUrl: pathToFileURL(join(plugin, 'bin', 'gsm.mjs')).href };

    const products = collector();
    assert.equal(await runProducts({ ...env, out: products.out }, true), 0);
    const [row] = JSON.parse(products.lines.join('\n'));
    assert.equal(row.id, 'gx');
    assert.equal(row.pluginFolder, true);
    assert.equal(row.tools, 2, 'tools come from the plugin tool-map.json');
    assert.equal(row.generatedApis, 1);
    assert.equal(row.gatewayApis, 1);

    const apis = collector();
    assert.equal(await runApis({ ...env, out: apis.out }, { product: 'gx', json: true }), 0);
    const listed = JSON.parse(apis.lines.join('\n'));
    assert.deepEqual(
      listed.apis.map((a) => [a.name, a.kind, a.methods]),
      [
        ['storage', 'generated', 2],
        ['logging', 'gateway', null],
      ],
    );

    const methods = collector();
    assert.equal(await runMethods({ ...env, out: methods.out }, { api: 'storage', json: true }), 0);
    const body = JSON.parse(methods.lines.join('\n'));
    assert.equal(body.classifier, 'built-in', 'a plugin folder has no dist/core, so the built-in rules are used');
    assert.deepEqual(
      body.methods.map((m) => m.kind),
      ['read', 'destructive'],
    );

    const version = versionLines(roots);
    assert.equal(version[0], 'suite version: 0.2.0 (.claude-plugin/plugin.json)');
    assert.ok(version[1].startsWith('node version: v'));
  });
});

// ---------- version and help ----------

test('version prints the suite version from the repo package and the products file, and the Node version', async () => {
  await withTemp((p) => {
    const res = runGsm(['version'], p);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /suite version: \S+ \(package\.json\)/);
    assert.match(res.stdout, /products file version: \S+ \(config\/products\.json\)/);
    assert.match(res.stdout, new RegExp(`node version: ${process.version.replace(/\./g, '\\.')}`));
    assert.equal(runGsm(['version', 'extra'], p).code, 2);
  });
});

test('gsm --help lists products, apis, methods, doctor and version on their own lines, with their flags', async () => {
  await withTemp((p) => {
    const res = runGsm(['--help'], p);
    assert.equal(res.code, 0);
    for (const name of ['products', 'apis', 'methods', 'doctor', 'version']) {
      assert.ok(new RegExp(`^  ${name}\\s{2,}\\S`, 'm').test(res.stdout), `help must list "${name}" with a one-line description`);
    }
    assert.ok(res.stdout.includes('gsm products [--json]'));
    assert.ok(res.stdout.includes('gsm apis [<product>] [--search <text>] [--json] [--limit <n>]'));
    assert.ok(res.stdout.includes('gsm methods <api> [<version>] [--search <text>] [--json] [--limit <n>]'));
    assert.ok(res.stdout.includes('gsm doctor [--plugin <id>] [--token-dir <dir>]'));
    assert.ok(res.stdout.includes('gsm version'));
    // The existing help text is still there.
    assert.ok(res.stdout.includes('--confirmation <every-change|destructive-only|off>'));
    assert.ok(res.stdout.includes('Install product plugins for an agent'));
  });
});

// ---------- install and uninstall dry-run matrix ----------

for (const agent of AGENTS) {
  for (const scope of SCOPES) {
    test(`install and uninstall --dry-run for ${agent} at ${scope} scope print the plan and write nothing`, async () => {
      await withTemp((p) => {
        // claude never takes --home (it always uses the real Claude Code configuration), so its HOME is the temp home instead.
        const scopeArgs = scope === 'global' ? [] : ['--path', p.folder];
        const homeArgs = agent === 'claude' ? [] : ['--home', p.home];
        const common = ['--agent', agent, '--plugin', 'all', '--scope', scope, ...scopeArgs, ...homeArgs, '--dry-run'];

        const install = runGsm(['install', ...common], p);
        const uninstall = runGsm(['uninstall', ...common], p);

        // agy has no project or local file, so an agy named explicitly is refused before anything runs (exit 2).
        const agyRefused = agent === 'agy' && scope !== 'global';
        if (agyRefused) {
          assert.equal(install.code, 2, install.stderr);
          assert.equal(uninstall.code, 2, uninstall.stderr);
          assert.match(install.stderr, /agy supports only --scope global/);
        } else {
          assert.equal(install.code, 0, install.stderr);
          assert.equal(uninstall.code, 0, uninstall.stderr);
          assert.match(install.stdout, /dry-run: nothing will be written or run\./);
          assert.match(install.stdout, /install \(dry-run\)/, 'the planned changes are printed');
          assert.match(uninstall.stdout, /uninstall \(dry-run\)/);
          assert.match(install.stdout, /summary: would install 23 products, 23 servers, \d+ tools; confirmation: not set/);
        }
        assert.deepEqual(listFiles(p.home), [], 'a dry run must not create files in the home folder');
        assert.deepEqual(listFiles(p.folder), [], 'a dry run must not create files in the folder scope');
        assert.deepEqual(listFiles(p.tokens), [], 'a dry run must not create files in the token directory');
      });
    });
  }
}

test('agy global dry-run plans the change when the agy config folder is missing, and says a real install stops there', async () => {
  await withTemp((p) => {
    const res = runGsm(['install', '--agent', 'agy', '--plugin', 'all', '--scope', 'global', '--home', p.home, '--dry-run'], p);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /\[agy\] install \(dry-run\)/);
    assert.match(res.stdout, /file: .*mcp_config\.json \(create\)/);
    assert.match(res.stdout, /A real install stops until agy has run once/);
    assert.equal(existsSync(join(p.home, '.gemini')), false);
  });
});

test('install summary states the confirmation mode and the write setting that were set', async () => {
  await withTemp((p) => {
    const res = runGsm(
      ['install', '--agent', 'codex', '--plugin', 'gcloud,gsc', '--scope', 'global', '--home', p.home, '--confirmation', 'off', '--allow-writes', '--dry-run'],
      p,
    );
    assert.equal(res.code, 0, res.stderr);
    const summary = res.stdout.split(/\r?\n/).filter((l) => l.startsWith('summary:'));
    assert.equal(summary.length, 1, 'exactly one summary line');
    assert.match(summary[0], /^summary: would install 2 products, 2 servers, \d+ tools; confirmation: off; writes: enabled \(GSM_ALLOW_WRITES=true\)$/);

    const plain = runGsm(['install', '--agent', 'codex', '--plugin', 'gcloud', '--scope', 'global', '--home', p.home, '--dry-run'], p);
    assert.match(plain.stdout, /confirmation: not set \(plugin default every-change\); writes: not set \(write tools stay off\)/);
  });
});

test('install summary: for claude, --allow-writes is not claimed as enabled; it names the plugin option instead', async () => {
  await withTemp((p) => {
    const claudeOnly = runGsm(['install', '--agent', 'claude', '--plugin', 'gmail', '--scope', 'global', '--allow-writes', '--dry-run'], p);
    assert.equal(claudeOnly.code, 0, claudeOnly.stderr);
    const line = claudeOnly.stdout.split(/\r?\n/).filter((l) => l.startsWith('summary:'));
    assert.equal(line.length, 1, 'exactly one summary line');
    assert.match(line[0], /; writes: set the plugin option allow_writes with `claude plugin configure gmail@google-services-mcps`$/);
    assert.doesNotMatch(line[0], /enabled/, 'claude never reports writes as enabled');

    const mixed = runGsm(['install', '--agent', 'all', '--plugin', 'gmail', '--scope', 'global', '--allow-writes', '--dry-run'], p);
    assert.equal(mixed.code, 0, mixed.stderr);
    const mixedLine = mixed.stdout.split(/\r?\n/).find((l) => l.startsWith('summary:'));
    assert.match(mixedLine, /writes: enabled \(GSM_ALLOW_WRITES=true\) for codex, opencode; for claude, set the plugin option allow_writes with `claude plugin configure gmail@google-services-mcps`$/);

    const off = runGsm(['install', '--agent', 'claude', '--plugin', 'gmail', '--scope', 'global', '--dry-run'], p);
    assert.match(off.stdout, /writes: not set \(write tools stay off\)$/m);
  });
});

test('the install summary is the last line of the output', async () => {
  await withTemp((p) => {
    const res = runGsm(['install', '--agent', 'opencode', '--plugin', 'gsc', '--scope', 'global', '--home', p.home, '--dry-run'], p);
    assert.equal(res.code, 0, res.stderr);
    const lines = res.stdout.trimEnd().split(/\r?\n/);
    assert.ok(lines.at(-1).startsWith('summary:'), lines.at(-1));
  });
});
