// Project readiness: the service lists of each login group match the product map, the comparison and batching rules,
// and the two gcloud tools (project_readiness reads, project_enable_missing writes and is listed only with writes on).
// No test calls Google: the tools are checked without credentials, which must fail with gsm's own message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const CLOUD_SERVER = join(REPO, 'plugins', 'gcloud', 'servers', 'gcloud.mjs');

const readiness = await import(DIST('core/readiness.js'));
const products = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products;

test('the service IDs are read from a serviceusage resource name', () => {
  assert.equal(readiness.serviceIdFromName('projects/17208615777/services/gmail.googleapis.com'), 'gmail.googleapis.com');
  assert.equal(readiness.serviceIdFromName('projects/1/services/calendar-json.googleapis.com'), 'calendar-json.googleapis.com');
  assert.equal(readiness.serviceIdFromName('projects/1/services/'), undefined);
  assert.equal(readiness.serviceIdFromName('gmail.googleapis.com'), undefined);
  assert.equal(readiness.serviceIdFromName(undefined), undefined);
  assert.equal(readiness.serviceIdFromName(null), undefined);
});

test('each group lists exactly the products of that group in the product map', () => {
  const inMap = (group) => Object.keys(products).filter((id) => products[id].group === group).sort();
  for (const g of readiness.READINESS_GROUPS) {
    assert.deepEqual([...g.products].sort(), inMap(g.group), `group ${g.group} must list the products the map puts in it`);
  }
  // Every product of the map is in exactly one group of the readiness list.
  const listed = readiness.READINESS_GROUPS.flatMap((g) => g.products);
  assert.equal(new Set(listed).size, listed.length, 'no product is listed twice');
  assert.deepEqual([...new Set(listed)].sort(), Object.keys(products).sort(), 'every product is listed');
});

test('service IDs are well formed, and no group lists one twice', () => {
  for (const g of readiness.READINESS_GROUPS) {
    assert.ok(g.services.length > 0, `${g.group} needs services`);
    for (const s of g.services) assert.match(s, /^[a-z][a-z0-9-]*\.googleapis\.com$/, `${s} is a service ID`);
    assert.equal(new Set(g.services).size, g.services.length, `${g.group} lists a service twice`);
  }
});

test('missing services are the ones not enabled, in the group order', () => {
  const group = { group: 'x', label: 'x', products: [], services: ['a.googleapis.com', 'b.googleapis.com', 'c.googleapis.com'] };
  assert.deepEqual(readiness.missingServices(group, new Set(['b.googleapis.com'])), ['a.googleapis.com', 'c.googleapis.com']);
  assert.deepEqual(readiness.missingServices(group, new Set(['a.googleapis.com', 'b.googleapis.com', 'c.googleapis.com'])), []);
});

test('the missing list of several groups has each service once', () => {
  const g1 = { group: 'g1', label: '', products: [], services: ['a.googleapis.com', 'shared.googleapis.com'] };
  const g2 = { group: 'g2', label: '', products: [], services: ['shared.googleapis.com', 'b.googleapis.com'] };
  assert.deepEqual(readiness.missingForGroups([g1, g2], new Set()), ['a.googleapis.com', 'shared.googleapis.com', 'b.googleapis.com']);
});

test('batches hold at most the limit, and together they hold every service once', () => {
  const services = Array.from({ length: 45 }, (_, i) => `s${i}.googleapis.com`);
  const batches = readiness.chunkServices(services);
  assert.equal(readiness.BATCH_ENABLE_LIMIT, 20);
  assert.deepEqual(batches.map((b) => b.length), [20, 20, 5]);
  assert.deepEqual(batches.flat(), services);
  assert.deepEqual(readiness.chunkServices([]), []);
  assert.throws(() => readiness.chunkServices(services, 0), /at least 1/);
});

test('an unknown group is reported, and an empty choice means every group', () => {
  const all = readiness.selectReadinessGroups(undefined);
  assert.equal(all.groups.length, readiness.READINESS_GROUPS.length);
  assert.deepEqual(all.unknown, []);
  const some = readiness.selectReadinessGroups(['searchconsole', 'nope', 'searchconsole']);
  assert.deepEqual(some.groups.map((g) => g.group), ['searchconsole']);
  assert.deepEqual(some.unknown, ['nope']);
});

test('the console steps name the consent screen, the client page and the publishing step', () => {
  const steps = readiness.consoleSteps('decisive-design-508511-b1').join('\n');
  assert.match(steps, /https:\/\/console\.cloud\.google\.com\/auth\/audience\?project=decisive-design-508511-b1/);
  assert.match(steps, /https:\/\/console\.cloud\.google\.com\/apis\/credentials\?project=decisive-design-508511-b1/);
  assert.match(steps, /Basic API Access/);
});

/** Starts a plugin server with the given environment, and talks to it over stdio. */
async function withServer(serverFile, env, fn) {
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  });
  let nextId = 1;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 90_000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ request });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

function isolatedEnv(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-readiness-'));
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return {
    dir,
    env: {
      ...process.env,
      GSM_TOKEN_DIR: dir,
      APPDATA: join(home, 'AppData', 'Roaming'),
      HOME: home,
      USERPROFILE: home,
      GOOGLE_APPLICATION_CREDENTIALS: join(dir, 'no-adc.json'),
      // No machine identity either: a closed local port, so the lookup fails at once instead of waiting.
      GCE_METADATA_HOST: '127.0.0.1:9',
      GSM_NO_BROWSER: '1',
      ...extra,
    },
  };
}

test('the gcloud server lists project_readiness, and lists project_enable_missing only with writes on', async () => {
  const off = isolatedEnv({ GSM_ALLOW_WRITES: 'false' });
  try {
    await withServer(CLOUD_SERVER, off.env, async ({ request }) => {
      const names = (await request('tools/list', {})).result.tools.map((t) => t.name);
      assert.ok(names.includes('project_readiness'), 'the readiness check is a read, always listed');
      assert.ok(!names.includes('project_enable_missing'), 'enabling is a write: not listed with writes off');
    });
  } finally {
    rmSync(off.dir, { recursive: true, force: true });
  }
  const on = isolatedEnv({ GSM_ALLOW_WRITES: 'true' });
  try {
    await withServer(CLOUD_SERVER, on.env, async ({ request }) => {
      const names = (await request('tools/list', {})).result.tools.map((t) => t.name);
      assert.ok(names.includes('project_enable_missing'), 'listed once writes are allowed');
    });
  } finally {
    rmSync(on.dir, { recursive: true, force: true });
  }
});

test('project_readiness without a login says so, and does not call Google', async () => {
  const { dir, env } = isolatedEnv({ GSM_ALLOW_WRITES: 'false' });
  try {
    await withServer(CLOUD_SERVER, env, async ({ request }) => {
      const res = await request('tools/call', {
        name: 'project_readiness',
        arguments: { project_id: 'decisive-design-508511-b1', groups: ['searchconsole'] },
      });
      const text = res.result.content[0].text;
      assert.equal(res.result.isError, true, 'a call with no login is an error');
      assert.match(text, /Not logged in|not logged in|application default|login/i);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
