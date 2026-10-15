// Tests for the gateway methods in the scope requirements: the read rules per profile, the summary numbers,
// the missing-catalog note, the registry scope union, and the runtime check the gateway makes for the same scopes.
// Run after compiling (npm test does). Every test uses its own temp folders and a fixture catalog; no network call is made.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;

// Registry first: it loads the gateway catalog reader, so this import order checks the module graph loads.
const { scopesForServer } = await import(dist('core/registry.js'));
const { loadConfig } = await import(dist('core/config.js'));
const { resolveScopes, requirementsForSpecs, coveredTools } = await import(dist('core/scopes.js'));
const { isGranted } = await import(dist('core/tools.js'));
const gw = await import(dist('core/gateway.js'));
const { coverageOf, gatewayCoverageOf, gatewayReachLine, formatCoverage, runScopes } = await import(dist('cli/scopes.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const RO = G('demo.readonly');
const RW = G('demo.items');

/** Seven methods: six reachable (one upload is refused), with every kind and both a scope-less and a scoped read. */
const CATALOG = {
  apis: [
    {
      name: 'demoapi',
      version: 'v1',
      title: 'Demo API',
      description: 'Demo.',
      rootUrl: 'https://demo.example.googleapis.com/',
      servicePath: '',
      methods: [
        ['demoapi.items.list', 'GET', 'v1/items', [RO, RW], ''],
        ['demoapi.items.get', 'GET', 'v1/items/{itemId}', [RO], ''],
        ['demoapi.items.create', 'POST', 'v1/items', [RW], ''],
        ['demoapi.items.delete', 'DELETE', 'v1/items/{itemId}', [RW], ''],
        ['demoapi.items.bulkwrite', 'POST', 'v1/items:bulkWrite', [RW], ''],
        ['demoapi.ping', 'GET', 'v1/ping', [], ''],
        ['demoapi.items.upload', 'POST', 'v1/items:upload', [RW], 'u'],
      ],
    },
  ],
};

/** The Discovery document the gateway reads for the two calls the runtime test makes. */
const DISCOVERY = {
  name: 'demoapi',
  version: 'v1',
  rootUrl: 'https://demo.example.googleapis.com/',
  servicePath: '',
  parameters: {},
  schemas: { Item: { id: 'Item', type: 'object', properties: { displayName: { type: 'string' } } } },
  resources: {
    items: {
      methods: {
        list: {
          id: 'demoapi.items.list',
          path: 'v1/items',
          httpMethod: 'GET',
          parameters: { pageSize: { type: 'integer', location: 'query' } },
          response: { $ref: 'Item' },
        },
        create: {
          id: 'demoapi.items.create',
          path: 'v1/items',
          httpMethod: 'POST',
          parameters: {},
          request: { $ref: 'Item' },
          response: { $ref: 'Item' },
        },
      },
    },
  },
};

/** A server of the fixture group: no per-method tools, one gateway API. */
const DEMO = {
  name: 'demo',
  plugin: 'demo',
  group: 'workspace-user',
  kind: 'discovery',
  gatewayApis: [{ api: 'demoapi', version: 'v1' }],
  label: 'Demo',
};

const tracked = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tracked.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.GSM_DATA_DIR;
  gw.setRequestForTests(undefined);
  for (const dir of tracked.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Points GSM_DATA_DIR at a folder holding the catalog (and optional extra JSON files, keyed by name). */
function useCatalog(catalog = CATALOG, extra = {}) {
  const dir = tempDir('gsm-gw-data-');
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify(catalog));
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(dir, name), JSON.stringify(content));
  process.env.GSM_DATA_DIR = dir;
  return dir;
}

/** Points GSM_DATA_DIR at a folder with no catalog. The gateway then has no file to read. */
function useEmptyDataDir() {
  const dir = tempDir('gsm-gw-empty-');
  process.env.GSM_DATA_DIR = dir;
  return dir;
}

function configWithToken(tokenDir = tempDir('gsm-gw-token-')) {
  return loadConfig({ GSM_TOKEN_DIR: tokenDir });
}

async function demoRequirements(warnings = [], specs = [DEMO]) {
  return requirementsForSpecs(specs, configWithToken(), { warn: (line) => warnings.push(line) });
}

const gatewayTools = (reqs) => reqs.filter((r) => r.gateway);
const toolOf = (reqs, id) => reqs.find((r) => r.tool === `demo/${id}`);

// ---------------------------------------------------------------------------
// Requirements and the profile rules

test('gateway requirements: one per method, keyed by server and method id, upload methods left out', async () => {
  useCatalog();
  const warnings = [];
  const reqs = await demoRequirements(warnings);
  assert.deepEqual(warnings, [], 'no note when the catalog is present');
  assert.equal(gatewayTools(reqs).length, 6, 'seven methods, one of them an upload');
  assert.ok(gatewayTools(reqs).every((r) => r.tool.startsWith('demo/demoapi.')));
  assert.ok(!reqs.some((r) => r.tool.includes('upload')), 'the gateway refuses upload methods, so none is a requirement');
  assert.equal(toolOf(reqs, 'demoapi.items.delete').kind, 'destructive');
  assert.equal(toolOf(reqs, 'demoapi.items.create').kind, 'write');
  assert.equal(toolOf(reqs, 'demoapi.items.list').kind, 'read');
});

test('readonly: reaches the read methods that have a read-only scope, and no write or destructive method', async () => {
  useCatalog();
  const reqs = await demoRequirements();
  const ro = resolveScopes(reqs, 'readonly');
  assert.deepEqual(ro.scopes, [RO], 'only the read-only scope is requested');
  assert.deepEqual(
    ro.covered.filter((t) => t.startsWith('demo/')),
    ['demo/demoapi.items.get', 'demo/demoapi.items.list', 'demo/demoapi.ping'],
  );
  for (const id of ['demoapi.items.create', 'demoapi.items.delete', 'demoapi.items.bulkwrite']) {
    assert.ok(ro.uncovered.includes(`demo/${id}`), `${id} stays uncovered under readonly`);
  }
});

test('readwrite: includes the write and destructive scopes, and covers every gateway method', async () => {
  useCatalog();
  const reqs = await demoRequirements();
  const rw = resolveScopes(reqs, 'readwrite');
  assert.deepEqual(rw.scopes, [RO, RW].sort());
  assert.deepEqual(rw.uncovered, []);
  for (const id of ['demoapi.items.create', 'demoapi.items.delete', 'demoapi.items.bulkwrite']) {
    assert.ok(rw.covered.includes(`demo/${id}`), `${id} is covered under readwrite`);
  }
});

test('full: covers every gateway method', async () => {
  useCatalog();
  const reqs = await demoRequirements();
  assert.deepEqual(resolveScopes(reqs, 'full').uncovered, []);
});

test('a gateway method with no scopes is always covered, in every profile', async () => {
  useCatalog();
  const reqs = await demoRequirements();
  for (const profile of ['readonly', 'readwrite', 'full']) {
    assert.ok(resolveScopes(reqs, profile).covered.includes('demo/demoapi.ping'), `${profile}: ping is covered`);
  }
});

test('a gateway method keeps the kind of its catalog entry, and config/tool-kinds.json overrides it', async () => {
  useCatalog(CATALOG, { 'tool-kinds.json': { 'demoapi.items.create': 'read' } });
  const reqs = await demoRequirements();
  assert.equal(toolOf(reqs, 'demoapi.items.create').kind, 'read', 'the override applies');
  const ro = resolveScopes(reqs, 'readonly');
  assert.ok(ro.uncovered.includes('demo/demoapi.items.create'), 'a read method with only a write scope is uncovered under readonly');
});

// ---------------------------------------------------------------------------
// Summary numbers

test('summary: per-method tools and gateway methods are counted apart, with the right numbers', async () => {
  useCatalog();
  const gateway = await demoRequirements();
  const tool = { tool: 'demo/some_tool', kind: 'read', scopes: [RO] };
  const reqs = [...gateway, tool];
  const ro = resolveScopes(reqs, 'readonly').scopes;

  const tools = coverageOf(reqs, ro);
  assert.equal(tools.total, 1, 'the per-method tool is the only tool');
  assert.equal(formatCoverage(tools), '1 of 1 tools (read 1 of 1, write 0 of 0, destructive 0 of 0)');

  const gw3 = gatewayCoverageOf(reqs, ro);
  assert.equal(gw3.total, 6);
  assert.equal(gw3.enabled, 3, 'list, get and ping are reachable with the read-only scope');
  assert.deepEqual(
    Object.fromEntries(Object.entries(gw3.byKind).map(([k, v]) => [k, `${v.enabled} of ${v.total}`])),
    { read: '3 of 3', write: '0 of 2', destructive: '0 of 1', dynamic: '0 of 0' },
  );
  assert.equal(formatCoverage(gw3, 'gateway methods'), '3 of 6 gateway methods (read 3 of 3, write 0 of 2, destructive 0 of 1)');
  assert.equal(gatewayReachLine(reqs, ro, 'readonly'), '3 gateway methods reachable with this profile, 3 need a broader profile.');
  assert.equal(gatewayReachLine(reqs, ro, 'custom'), '3 gateway methods reachable with these scopes, 3 not reachable.');

  const rw = resolveScopes(reqs, 'readwrite').scopes;
  assert.equal(gatewayReachLine(reqs, rw, 'readwrite'), '6 gateway methods reachable with this profile, 0 need a broader profile.');
  assert.equal(gatewayCoverageOf(reqs, rw).enabled, 6);
  assert.equal(coverageOf(reqs, rw).enabled, 1);
  assert.equal(coveredTools(reqs, []).includes('demo/demoapi.ping'), true, 'a scope-less method is covered even with no scope');
});

// ---------------------------------------------------------------------------
// Missing catalog and missing APIs

test('a missing catalog gives a stderr note and no gateway requirements', async () => {
  useEmptyDataDir();
  const warnings = [];
  const reqs = await demoRequirements(warnings);
  assert.deepEqual(reqs, [], 'no gateway requirement');
  assert.equal(warnings.length, 1, 'one note');
  assert.match(warnings[0], /The API catalog \(catalog\.json\) was not found, so the gateway methods of demo are not counted/);
  assert.match(warnings[0], /GSM_DATA_DIR/);
});

test('no note when the server has no gateway APIs, even with no catalog', async () => {
  useEmptyDataDir();
  const warnings = [];
  await demoRequirements(warnings, [{ ...DEMO, gatewayApis: undefined }]);
  assert.deepEqual(warnings, []);
});

test('an API the catalog lacks is noted, and its methods are not counted', async () => {
  useCatalog();
  const warnings = [];
  const specs = [{ ...DEMO, gatewayApis: [{ api: 'demoapi', version: 'v1' }, { api: 'otherapi', version: 'v2' }] }];
  const reqs = await demoRequirements(warnings, specs);
  assert.equal(gatewayTools(reqs).length, 6, 'the present API still counts');
  assert.deepEqual(warnings, ['[demo] not in the API catalog, so their methods are not counted: otherapi.v2']);
});

// ---------------------------------------------------------------------------
// Registry scope union and the CLI commands

test('scopesForServer includes the gateway scopes, and none when the catalog is missing', () => {
  const reg = { dataRoot: tempDir('gsm-gw-reg-'), plugins: {}, groups: {}, servers: [DEMO] };
  useCatalog();
  assert.deepEqual(scopesForServer(reg, 'demo'), [RO, RW].sort());
  useEmptyDataDir();
  assert.deepEqual(scopesForServer(reg, 'demo'), []);
});

test('gsm scopes: the gateway lines count apart from the tools, and a missing catalog is a warning', async () => {
  const reg = { dataRoot: tempDir('gsm-gw-reg-'), plugins: {}, groups: {}, servers: [DEMO] };

  useCatalog();
  const lines = [];
  const warnings = [];
  await runScopes({ group: 'workspace-user', profile: 'readonly', json: false }, reg, {
    log: (l) => lines.push(l),
    warn: (l) => warnings.push(l),
  });
  const text = lines.join('\n');
  assert.deepEqual(warnings, []);
  assert.match(text, /^Group workspace-user: products demo \(servers demo\), 0 tools and 6 gateway methods in total$/m);
  assert.match(text, /^  covered 0, uncovered 0$/m, 'the tool line counts no gateway method');
  assert.match(text, /^  gateway methods covered 3, uncovered 3$/m);
  assert.match(text, /^  3 of 6 gateway methods \(read 3 of 3, write 0 of 2, destructive 0 of 1\)$/m);
  assert.match(text, /^  products \(gateway methods covered\): demo 3 of 6$/m);
  assert.match(text, /^  products \(tools covered\): demo 0 of 0$/m);

  const json = [];
  await runScopes({ group: 'workspace-user', profile: 'readonly', json: true }, reg, { log: (l) => json.push(l), warn: () => {} });
  const parsed = JSON.parse(json.join('\n'));
  assert.equal(parsed.tools, 0);
  assert.equal(parsed.gatewayMethods, 6);
  assert.equal(parsed.profiles.readonly.gatewayMethods.covered, 3);
  assert.equal(parsed.profiles.readonly.gatewayMethods.uncovered, 3);
  assert.deepEqual(parsed.profiles.readonly.products.demo, { covered: 0, total: 0, gatewayCovered: 3, gatewayTotal: 6 });

  useEmptyDataDir();
  const noCatalogWarnings = [];
  const noCatalogLines = [];
  await runScopes({ group: 'workspace-user', profile: 'full', json: false }, reg, {
    log: (l) => noCatalogLines.push(l),
    warn: (l) => noCatalogWarnings.push(l),
  });
  assert.equal(noCatalogWarnings.length, 1);
  assert.match(noCatalogWarnings[0], /catalog\.json\) was not found/);
  assert.match(noCatalogLines.join('\n'), /^Group workspace-user: products demo \(servers demo\), 0 tools and 0 gateway methods in total$/m);
});

// ---------------------------------------------------------------------------
// The runtime check, for the same scopes

test('the gateway runs a method that the login scopes cover, and refuses one they do not, before any request', async () => {
  useCatalog();
  const tokenDir = tempDir('gsm-gw-token-');
  mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
  writeFileSync(join(tokenDir, 'discovery-cache', 'demoapi.v1.json'), JSON.stringify(DISCOVERY));
  const cfg = configWithToken(tokenDir);

  const granted = resolveScopes(await demoRequirements(), 'readonly').scopes;
  const ctx = {
    gate: async () => {},
    grantedScopes: granted,
    hasScope: (anyOf) => isGranted({ scopes: anyOf }, granted),
  };
  const requests = [];
  gw.setRequestForTests(async (req) => {
    requests.push(req);
    return { status: 200, data: {} };
  });
  const apiCall = gw
    .gatewayTools({ product: 'demo', group: 'workspace-user', apis: [{ api: 'demoapi', version: 'v1' }], cfg })
    .find((t) => t.name === 'api_call');

  await assert.rejects(apiCall.handler({ method: 'demoapi.items.create', body: { displayName: 'x' } }, ctx), (err) => {
    assert.match(err.message, /holds none of the scopes demoapi\.items\.create needs \(https:\/\/www\.googleapis\.com\/auth\/demo\.items\)/);
    return true;
  });
  assert.equal(requests.length, 0, 'the refused call sends no request');

  const result = await apiCall.handler({ method: 'demoapi.items.list' }, ctx);
  assert.equal(result.status, 200);
  assert.equal(requests.length, 1, 'the covered call runs');
});
