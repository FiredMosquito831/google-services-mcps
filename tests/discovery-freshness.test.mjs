// The Discovery freshness check (scripts/check-discovery-freshness.mjs) and the revision record of the snapshot
// (scripts/snapshot-discovery.mjs, data/discovery/_revisions.json). Both scripts run against a fake Google on
// 127.0.0.1 (--origin) and a temp copy of config/ and data/ (--root). No test reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = join(REPO, 'scripts', 'check-discovery-freshness.mjs');
const SNAPSHOT = join(REPO, 'scripts', 'snapshot-discovery.mjs');

/** Runs a script without blocking this process, so the fake server can answer it. */
function run(script, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** A fake Google: answers the listed paths (host first, as routeUrl builds them), 404 for anything else. */
async function fakeGoogle(routes) {
  const log = [];
  const server = createServer((req, res) => {
    log.push({ url: req.url, headers: req.headers });
    const route = routes[req.url];
    res.writeHead(route?.status ?? (route ? 200 : 404), { 'content-type': 'application/json' });
    res.end(route ? JSON.stringify(route.body ?? {}) : '{"error":{"code":404}}');
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    log,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
  };
}

function writeJson(root, rel, value) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Every file under root with its content, to prove a run wrote nothing. */
function contents(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(root, full)] = readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}

const method = (id, httpMethod, path) => ({ id, httpMethod, path });

const ALPHA_SNAPSHOT_RESOURCES = {
  items: {
    methods: {
      list: method('alpha.items.list', 'GET', 'v1/items'),
      get: method('alpha.items.get', 'GET', 'v1/items/{id}'),
      delete: method('alpha.items.delete', 'DELETE', 'v1/items/{id}'),
    },
  },
};

/** The trimmed snapshot shape scripts/snapshot-discovery.mjs writes. */
const alphaSnapshot = {
  name: 'alpha',
  version: 'v1',
  title: 'Alpha API',
  rootUrl: 'https://alpha.googleapis.com/',
  servicePath: '',
  baseUrl: 'https://alpha.googleapis.com/',
  schemas: {},
  resources: ALPHA_SNAPSHOT_RESOURCES,
};

const discoveryDoc = (name, version, revision, resources, extra = {}) => ({
  kind: 'discovery#restDescription',
  name,
  version,
  revision,
  title: `${name} API`,
  rootUrl: `https://${name}.googleapis.com/`,
  servicePath: '',
  baseUrl: `https://${name}.googleapis.com/`,
  schemas: {},
  resources,
  ...extra,
});

// A top-level method: the trimmed snapshot drops these, so a comparison with a snapshot must ignore it.
const PING = { methods: { ping: method('alpha.ping', 'GET', 'v1/ping') } };

const catalogEntry = (name, version, preferred, methods) => ({
  name,
  version,
  preferred,
  title: `${name} API`,
  description: '',
  documentationLink: `https://developers.google.com/${name}`,
  labels: [],
  deprecated: false,
  rootUrl: `https://${name}.googleapis.com/`,
  servicePath: '',
  methods: methods.map(([id, verb, path]) => [id, verb, path, [], '']),
});

const ALPHA_CATALOG = catalogEntry('alpha', 'v1', true, [
  ['alpha.items.list', 'GET', 'v1/items'],
  ['alpha.items.get', 'GET', 'v1/items/{id}'],
  ['alpha.items.delete', 'DELETE', 'v1/items/{id}'],
]);

const DIR = '/www.googleapis.com/discovery/v1/apis?preferred=true';
const pathUrl = (name, version) => `/www.googleapis.com/discovery/v1/apis/${name}/${version}/rest`;
const hostUrl = (name, version) => `/${name}.googleapis.com/$discovery/rest?version=${version}`;

/** A temp root with config/ and data/ as the scripts read them. */
function makeRoot({ servers, catalogApis, products = { products: {}, unassigned: [] }, revisions, snapshots = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-fresh-'));
  writeJson(root, 'config/servers.json', { servers });
  writeJson(root, 'config/products.json', products);
  writeJson(root, 'data/catalog.json', {
    generatedAt: '2026-10-15T15:08:21.313Z',
    apiCount: catalogApis.length,
    methodCount: catalogApis.reduce((n, a) => n + a.methods.length, 0),
    apis: catalogApis,
  });
  for (const [key, doc] of Object.entries(snapshots)) writeJson(root, `data/discovery/${key}.json`, doc);
  if (revisions) writeJson(root, 'data/discovery/_revisions.json', { $comment: 'test', snapshots: revisions });
  return root;
}

function differencesFixture() {
  const root = makeRoot({
    servers: [
      { name: 'gtest', apis: [{ api: 'alpha', version: 'v1' }], gatewayApis: [{ api: 'beta', version: 'v1' }, { api: 'keyed', version: 'v1' }] },
    ],
    catalogApis: [
      ALPHA_CATALOG,
      catalogEntry('beta', 'v1', true, [['beta.things.list', 'GET', 'v1/things']]),
      catalogEntry('beta', 'v2', false, [['beta.things.list', 'GET', 'v2/things']]),
      catalogEntry('gone', 'v1', false, [['gone.x.get', 'GET', 'v1/x']]),
      catalogEntry('keyed', 'v1', true, [['keyed.y.get', 'GET', 'v1/y']]),
    ],
    products: { products: {}, unassigned: [{ api: 'oldthing', version: 'v1', reason: 'Shut down.' }] },
    revisions: { 'alpha.v1': { revision: '20261001', fetchedAt: '2026-10-01T00:00:00.000Z' } },
    snapshots: { 'alpha.v1': alphaSnapshot },
  });
  const routes = {
    [DIR]: {
      body: {
        kind: 'discovery#directoryList',
        items: [
          { name: 'alpha', version: 'v1', preferred: true },
          { name: 'beta', version: 'v2', preferred: true },
          { name: 'keyed', version: 'v1', preferred: true },
          { name: 'newapi', version: 'v1', title: 'New API', documentationLink: 'https://developers.google.com/newapi', preferred: true },
          { name: 'oldthing', version: 'v1', preferred: true },
        ],
      },
    },
    // alpha: create added, delete removed, get moved to another path; the top-level ping is not a snapshot method.
    [pathUrl('alpha', 'v1')]: {
      body: discoveryDoc(
        'alpha',
        'v1',
        '20261020',
        {
          items: {
            methods: {
              list: method('alpha.items.list', 'GET', 'v1/items'),
              get: method('alpha.items.get', 'GET', 'v1/{+name}'),
              create: method('alpha.items.create', 'POST', 'v1/items'),
            },
          },
        },
        PING,
      ),
    },
    // beta v1: the documented path answers 404, the API's own host serves it (the snapshot's URL order).
    [hostUrl('beta', 'v1')]: { body: discoveryDoc('beta', 'v1', '20261025', { things: { methods: { list: method('beta.things.list', 'GET', 'v1/things') } } }) },
    [pathUrl('beta', 'v2')]: { body: discoveryDoc('beta', 'v2', '20261025', { things: { methods: { list: method('beta.things.list', 'GET', 'v2/things') } } }) },
    // keyed: the host answers 403 to a caller without a key (as Routes does).
    [hostUrl('keyed', 'v1')]: { status: 403, body: { error: { code: 403, message: 'API key required' } } },
    // gone: nothing answers, so every candidate is 404.
  };
  return { root, routes };
}

test('freshness: differences are reported by method id, with revisions, preferred versions and new directory APIs; exit 1', async () => {
  const { root, routes } = differencesFixture();
  const google = await fakeGoogle(routes);
  try {
    const before = contents(root);
    const r = await run(CHECK, ['--json', '--root', root, '--origin', google.origin]);
    assert.equal(r.code, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.deepEqual(contents(root), before, 'the check writes nothing');

    assert.equal(report.result, 'differences');
    assert.equal(report.exitCode, 1);
    assert.match(report.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(report.summary, {
      apiVersions: 5,
      againstSnapshot: 1,
      againstCatalog: 4,
      checked: 3,
      needsKey: 1,
      gone: 1,
      failed: 0,
      revisionNewer: 1,
      revisionSame: 0,
      revisionUnknown: 2,
      apisWithMethodChanges: 1,
      methodsAdded: 1,
      methodsRemoved: 1,
      methodsChanged: 1,
      preferredChanges: 1,
      uncoveredNew: 1,
      uncoveredKnown: 1,
    });
    assert.deepEqual(Object.keys(report), ['tool', 'checkedAt', 'requests', 'result', 'exitCode', 'summary', 'directory', 'preferredChanges', 'uncovered', 'apis']);
    assert.deepEqual(report.apis.map((a) => a.key), ['alpha.v1', 'beta.v1', 'beta.v2', 'gone.v1', 'keyed.v1']);

    const alpha = report.apis.find((a) => a.key === 'alpha.v1');
    assert.equal(alpha.status, 'checked');
    assert.equal(alpha.against, 'data/discovery/alpha.v1.json');
    assert.deepEqual(alpha.usedBy, ['gtest apis']);
    assert.equal(alpha.url, 'https://www.googleapis.com/discovery/v1/apis/alpha/v1/rest');
    assert.deepEqual(alpha.revision, { recorded: '20261001', now: '20261020', changed: true });
    assert.deepEqual(alpha.methods, {
      recorded: 3,
      now: 3,
      added: ['alpha.items.create'],
      removed: ['alpha.items.delete'],
      changed: [{ id: 'alpha.items.get', was: 'GET v1/items/{id}', now: 'GET v1/{+name}' }],
    });

    const beta = report.apis.find((a) => a.key === 'beta.v1');
    assert.equal(beta.against, 'data/catalog.json');
    assert.equal(beta.url, 'https://beta.googleapis.com/$discovery/rest?version=v1');
    assert.deepEqual(beta.methods, { recorded: 1, now: 1, added: [], removed: [], changed: [] });
    assert.equal(beta.revision.now, '20261025');
    assert.equal(beta.revision.changed, null);
    assert.match(beta.revision.recorded, /^unknown \(the catalog of 2026-10-15 records no revision\)$/);

    const keyed = report.apis.find((a) => a.key === 'keyed.v1');
    assert.equal(keyed.status, 'needs-key');
    assert.match(keyed.error, /HTTP 403 at https:\/\/keyed\.googleapis\.com\//);
    assert.equal(keyed.methods, undefined);
    assert.equal(report.apis.find((a) => a.key === 'gone.v1').status, 'gone');

    assert.equal(report.directory.status, 'checked');
    assert.equal(report.directory.preferredEntries, 5);
    assert.deepEqual(report.preferredChanges, [{ name: 'beta', recorded: ['v1'], now: ['v2'], notInCatalog: [], usedBy: ['gtest gatewayApis v1'] }]);
    assert.deepEqual(report.uncovered, [
      { name: 'newapi', versions: ['v1'], title: 'New API', documentationLink: 'https://developers.google.com/newapi', knownReason: null },
      { name: 'oldthing', versions: ['v1'], title: null, documentationLink: null, knownReason: 'Shut down.' },
    ]);

    // Requests: the directory, alpha 1, beta v1 2 (404 then host), beta v2 1, keyed 2, gone 2. Public: no credentials.
    assert.equal(report.requests, 9);
    assert.equal(google.log.length, 9);
    const urls = google.log.map((l) => l.url);
    assert.ok(urls.indexOf(pathUrl('beta', 'v1')) < urls.indexOf(hostUrl('beta', 'v1')), 'the documented path is asked before the host');
    for (const entry of google.log) {
      assert.equal(entry.headers.authorization, undefined, `${entry.url} carries no credentials`);
      assert.doesNotMatch(entry.url, /[?&]key=/);
    }

    const text = await run(CHECK, ['--root', root, '--origin', google.origin]);
    assert.equal(text.code, 1);
    for (const line of [
      '      + alpha.items.create',
      '      - alpha.items.delete',
      '      ~ alpha.items.get: GET v1/items/{id} -> GET v1/{+name}',
      '  beta: v1 -> v2; used: gtest gatewayApis v1',
      '  newapi v1 "New API" (new)',
      '  oldthing v1 (known: Shut down.)',
      'Result: differences found (exit 1). Refreshing the snapshots changes the tools; that is a separate decision.',
    ]) {
      assert.ok(text.stdout.split('\n').includes(line), `text output has: ${line}\n${text.stdout}`);
    }
    assert.match(text.stdout, /keyed\.v1: needs a key or a sign-in, not checked \(HTTP 404 at [^|]+ \| HTTP 403 at https:\/\/keyed\.googleapis\.com\//);
    assert.match(text.stdout, /^Methods differ in 1 of 3 checked API versions: 1 added, 1 removed, 1 changed \(verb or path\)\.$/m);
  } finally {
    await google.close();
    rmSync(root, { recursive: true, force: true });
  }
});

function freshRoot(extraCatalog = []) {
  return makeRoot({
    servers: [{ name: 'gtest', apis: [{ api: 'alpha', version: 'v1' }], gatewayApis: [] }],
    catalogApis: [ALPHA_CATALOG, ...extraCatalog],
    revisions: { 'alpha.v1': { revision: '20261001', fetchedAt: '2026-10-01T00:00:00.000Z' } },
    snapshots: { 'alpha.v1': alphaSnapshot },
  });
}

const FRESH_ROUTES = {
  [DIR]: { body: { kind: 'discovery#directoryList', items: [{ name: 'alpha', version: 'v1', preferred: true }] } },
  // A newer revision with the same methods (and a top-level method the snapshot never keeps) is not a difference.
  [pathUrl('alpha', 'v1')]: { body: discoveryDoc('alpha', 'v1', '20261020', ALPHA_SNAPSHOT_RESOURCES, PING) },
};

test('freshness: the same methods under a newer revision are fresh; exit 0', async () => {
  const root = freshRoot();
  const google = await fakeGoogle(FRESH_ROUTES);
  try {
    const r = await run(CHECK, ['--json', '--root', root, '--origin', google.origin]);
    assert.equal(r.code, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.result, 'fresh');
    assert.equal(report.summary.revisionNewer, 1);
    assert.equal(report.summary.apisWithMethodChanges, 0);
    assert.deepEqual(report.preferredChanges, []);
    assert.deepEqual(report.uncovered, []);
    assert.equal(report.requests, 2);

    const text = await run(CHECK, ['--root', root, '--origin', google.origin]);
    assert.equal(text.code, 0);
    assert.match(text.stdout, /^Result: no differences \(exit 0\)$/m);
  } finally {
    await google.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('freshness: a document that fails twice is retried once, tried at the next URL, and reported; exit 2', async () => {
  const root = freshRoot([catalogEntry('flaky', 'v1', false, [['flaky.z.get', 'GET', 'v1/z']])]);
  const google = await fakeGoogle({ ...FRESH_ROUTES, [pathUrl('flaky', 'v1')]: { status: 500, body: { error: { code: 500 } } } });
  try {
    const r = await run(CHECK, ['--json', '--root', root, '--origin', google.origin]);
    assert.equal(r.code, 2, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.result, 'incomplete');
    const flaky = report.apis.find((a) => a.key === 'flaky.v1');
    assert.equal(flaky.status, 'failed');
    assert.match(flaky.error, /HTTP 500 at https:\/\/www\.googleapis\.com\/discovery\/v1\/apis\/flaky\/v1\/rest \| HTTP 404 at https:\/\/flaky\.googleapis\.com\//);
    const urls = google.log.map((l) => l.url);
    assert.equal(urls.filter((u) => u === pathUrl('flaky', 'v1')).length, 2, 'one retry, no more');
    assert.equal(urls.filter((u) => u === hostUrl('flaky', 'v1')).length, 1);
  } finally {
    await google.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('freshness: usage errors exit 2, and --origin accepts only a loopback http server', async () => {
  const remote = await run(CHECK, ['--origin', 'https://www.googleapis.com']);
  assert.equal(remote.code, 2);
  assert.match(remote.stderr, /--origin is for tests and accepts only http on 127\.0\.0\.1, localhost or \[::1\]/);
  const unknown = await run(CHECK, ['--bogus']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /unknown argument: --bogus/);
  const missing = await run(CHECK, ['--root']);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /--root needs a value/);
  const empty = mkdtempSync(join(tmpdir(), 'gsm-fresh-empty-'));
  try {
    const noData = await run(CHECK, ['--root', empty, '--origin', 'http://127.0.0.1:9']);
    assert.equal(noData.code, 2, 'a check that cannot read its inputs never exits 1');
    assert.match(noData.stderr, /The check could not run/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('snapshot: records the revision and fetch time, keeps a failed API record and the trimmed shape, drops stale records', async () => {
  const root = makeRoot({
    servers: [],
    catalogApis: [],
    products: {
      products: { gtest: { server: { name: 'gtest' }, generated: [{ api: 'alpha', version: 'v1' }, { api: 'beta', version: 'v1' }] } },
    },
    revisions: {
      'beta.v1': { revision: '20260901', fetchedAt: '2026-09-01T00:00:00.000Z' },
      'zeta.v1': { revision: '20260901', fetchedAt: '2026-09-01T00:00:00.000Z' },
    },
    snapshots: { 'beta.v1': { ...alphaSnapshot, name: 'beta' }, 'zeta.v1': { ...alphaSnapshot, name: 'zeta' } },
  });
  const google = await fakeGoogle({ [pathUrl('alpha', 'v1')]: { body: discoveryDoc('alpha', 'v1', '20261020', ALPHA_SNAPSHOT_RESOURCES) } });
  try {
    const started = Date.now();
    const r = await run(SNAPSHOT, ['--root', root, '--origin', google.origin]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const dir = join(root, 'data', 'discovery');
    const record = JSON.parse(readFileSync(join(dir, '_revisions.json'), 'utf8'));
    assert.match(record.$comment, /^Written by scripts\/snapshot-discovery\.mjs\./);
    assert.deepEqual(Object.keys(record.snapshots), ['alpha.v1', 'beta.v1'], 'sorted; zeta is no longer wanted');
    assert.equal(record.snapshots['alpha.v1'].revision, '20261020');
    const fetchedAt = Date.parse(record.snapshots['alpha.v1'].fetchedAt);
    assert.match(record.snapshots['alpha.v1'].fetchedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(fetchedAt >= started - 1000 && fetchedAt <= Date.now() + 1000, 'the fetch time is this run (UTC)');
    assert.deepEqual(record.snapshots['beta.v1'], { revision: '20260901', fetchedAt: '2026-09-01T00:00:00.000Z' }, 'a failed fetch keeps its record');
    const snap = JSON.parse(readFileSync(join(dir, 'alpha.v1.json'), 'utf8'));
    assert.deepEqual(Object.keys(snap), ['name', 'version', 'title', 'rootUrl', 'servicePath', 'baseUrl', 'schemas', 'resources'], 'the snapshot keeps its trimmed shape, with no revision');
    assert.equal(existsSync(join(dir, 'zeta.v1.json')), false, 'the stale snapshot is removed');
    assert.equal(existsSync(join(dir, 'beta.v1.json')), true, 'a failed API keeps its snapshot');
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '_errors.json'), 'utf8')).map((e) => e.api), ['beta']);
  } finally {
    await google.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot --offline: reads only the raw cache, keeps the previous key order and a matching revision record, and clips at 1,500 and 1,000 characters', async () => {
  const getRaw = {
    // Keys in another order than the snapshot below, as Google may serve them.
    httpMethod: 'GET',
    path: 'v1/items/{id}',
    id: 'alpha.items.get',
    description: 'd'.repeat(1600),
    parameters: {
      zeta: { type: 'string', location: 'query', description: 'z'.repeat(1200) },
      id: { location: 'path', type: 'string', required: true, description: 'The item.' },
    },
  };
  const rawAlpha = discoveryDoc('alpha', 'v1', '20261020', { items: { methods: { get: getRaw, list: method('alpha.items.list', 'GET', 'v1/items') } } });
  const rawBeta = discoveryDoc('beta', 'v1', '20261021', ALPHA_SNAPSHOT_RESOURCES);
  const previousAlpha = {
    ...alphaSnapshot,
    resources: {
      items: {
        methods: {
          list: { id: 'alpha.items.list', path: 'v1/items', httpMethod: 'GET', parameters: [] },
          get: {
            id: 'alpha.items.get',
            path: 'v1/items/{id}',
            httpMethod: 'GET',
            description: 'old',
            parameters: [
              { name: 'id', location: 'path', type: 'string', required: true, description: 'The item.' },
              { name: 'zeta', location: 'query', type: 'string', description: 'old' },
            ],
          },
        },
      },
    },
  };
  const root = makeRoot({
    servers: [],
    catalogApis: [],
    products: {
      products: { gtest: { server: { name: 'gtest' }, generated: [{ api: 'alpha', version: 'v1' }, { api: 'beta', version: 'v1' }, { api: 'gamma', version: 'v1' }] } },
    },
    revisions: {
      'alpha.v1': { revision: '20261020', fetchedAt: '2026-10-20T00:00:00.000Z' },
      'beta.v1': { revision: '20260901', fetchedAt: '2026-09-01T00:00:00.000Z' },
      'gamma.v1': { revision: '20260902', fetchedAt: '2026-09-02T00:00:00.000Z' },
    },
    snapshots: { 'alpha.v1': previousAlpha, 'gamma.v1': { ...alphaSnapshot, name: 'gamma' } },
  });
  const cache = join(root, 'raw-cache');
  writeJson(cache, 'alpha.v1.json', rawAlpha);
  writeJson(cache, 'beta.v1.json', rawBeta);
  try {
    // A closed loopback port as the origin: any request the script made would fail, and show as a failure below.
    const r = await run(SNAPSHOT, ['--root', root, '--offline', '--cache', cache, '--origin', 'http://127.0.0.1:9']);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const dir = join(root, 'data', 'discovery');
    const alpha = JSON.parse(readFileSync(join(dir, 'alpha.v1.json'), 'utf8'));
    assert.deepEqual(Object.keys(alpha.resources.items.methods), ['list', 'get'], 'the previous method order');
    const get = alpha.resources.items.methods.get;
    assert.deepEqual(Object.keys(get).slice(0, 4), ['id', 'path', 'httpMethod', 'description'], 'the previous key order');
    assert.deepEqual(get.parameters.map((p) => p.name), ['id', 'zeta'], 'the previous parameter order');
    assert.equal(get.description.length, 1500);
    assert.ok(get.description.endsWith('...'));
    assert.equal(get.parameters[1].description.length, 1000);
    assert.ok(get.parameters[1].description.endsWith('...'));
    const record = JSON.parse(readFileSync(join(dir, '_revisions.json'), 'utf8')).snapshots;
    assert.deepEqual(record['alpha.v1'], { revision: '20261020', fetchedAt: '2026-10-20T00:00:00.000Z' }, 'the same revision keeps its record');
    assert.deepEqual(record['beta.v1'], { revision: '20261021', fetchedAt: statSync(join(cache, 'beta.v1.json')).mtime.toISOString() }, "another revision: the cache's, at the cache file's time");
    assert.deepEqual(record['gamma.v1'], { revision: '20260902', fetchedAt: '2026-09-02T00:00:00.000Z' }, 'a document the cache lacks keeps its record');
    const errors = JSON.parse(readFileSync(join(dir, '_errors.json'), 'utf8'));
    assert.deepEqual(errors.map((e) => e.api), ['gamma']);
    assert.match(errors[0].error, /not in the cache/);
    assert.equal(existsSync(join(dir, 'gamma.v1.json')), true, 'and keeps its snapshot');
    const usage = await run(SNAPSHOT, ['--root', root, '--cache', cache]);
    assert.equal(usage.code, 2);
    assert.match(usage.stderr, /--cache is for --offline/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('data/discovery/_revisions.json has one record for each snapshot, and nothing else', () => {
  const dir = join(REPO, 'data', 'discovery');
  const snapshots = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.slice(0, -'.json'.length)).sort();
  const record = JSON.parse(readFileSync(join(dir, '_revisions.json'), 'utf8'));
  assert.deepEqual(Object.keys(record.snapshots), snapshots);
  for (const [key, entry] of Object.entries(record.snapshots)) {
    assert.deepEqual(Object.keys(entry), ['revision', 'fetchedAt'], key);
    assert.ok(typeof entry.revision === 'string' && entry.revision.length > 0, `${key}: a revision, or an "unknown (...)" note`);
    assert.ok(entry.fetchedAt === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.fetchedAt), `${key}: fetchedAt is null or ISO UTC`);
  }
});
