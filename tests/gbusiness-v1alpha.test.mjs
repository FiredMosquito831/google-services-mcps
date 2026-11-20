// Q044/Q041: exactly two My Business Business Information v1alpha edit-status GETs are exposed as generated tools, with the
// existing business.manage scopeOverride. File-based contract test: no login, no network, no Google call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const BM = 'https://www.googleapis.com/auth/business.manage';
const TARGETS = [
  'mybusinessbusinessinformation.locations.getExtended',
  'mybusinessbusinessinformation.locations.attributes.getExtended',
];
const baseline = readJson('tests', 'fixtures', 'gbusiness-v1alpha-baseline.json');

/** Every method in a trimmed Discovery snapshot, as [id, method], in document order. */
function discoveryMethods(doc) {
  const rows = [];
  const walk = (node) => {
    for (const method of Object.values(node.methods ?? {})) rows.push([method.id, method]);
    for (const resource of Object.values(node.resources ?? {})) walk(resource);
  };
  walk(doc);
  return rows;
}

test('gbusiness generates only the two v1alpha edit-status methods, with business.manage', () => {
  const product = readJson('config', 'products.json').products.gbusiness;
  const entries = product.generated.filter((a) => a.api === 'mybusinessbusinessinformation' && a.version === 'v1alpha');
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].include, ['locations.getExtended', 'locations.attributes.getExtended']);
  assert.deepEqual(product.gateway, []);
  assert.deepEqual(product.scopeOverrides.mybusinessbusinessinformation, [BM]);

  const doc = readJson('data', 'discovery', 'mybusinessbusinessinformation.v1alpha.json');
  const methods = discoveryMethods(doc);
  const ids = methods.map(([id]) => id);
  assert.equal(ids.length, 17);
  for (const id of TARGETS) assert.ok(ids.includes(id), id);
  for (const [id, raw] of methods) {
    if (TARGETS.includes(id)) {
      assert.equal(raw.httpMethod, 'GET', id);
      assert.ok(!raw.scopes || raw.scopes.length === 0, id);
    }
  }

  // Method ids do not carry the version, so compare with the v1 snapshot: only the ids unique to v1alpha can prove
  // that no other v1alpha method leaked into the tool map.
  const v1Ids = new Set(discoveryMethods(readJson('data', 'discovery', 'mybusinessbusinessinformation.v1.json')).map(([id]) => id));
  const v1alphaOnly = new Set(ids.filter((id) => !v1Ids.has(id)));
  assert.ok(TARGETS.every((id) => v1alphaOnly.has(id)));
  const map = readJson('plugins', 'gbusiness', 'tool-map.json');
  const generated = map.filter((entry) => entry.methodId);
  const exposedV1alpha = generated.map((entry) => entry.methodId).filter((id) => v1alphaOnly.has(id));
  assert.deepEqual(exposedV1alpha.slice().sort(), TARGETS.slice().sort());
  for (const entry of generated.filter((e) => TARGETS.includes(e.methodId))) {
    assert.equal(entry.kind, 'read', entry.name);
    assert.deepEqual(entry.scopes, [BM], entry.name);
  }
  assert.equal(generated.length, product.generatedToolCount);
});

test('no existing gbusiness tool name, alias or google toolset entry was renamed or dropped', () => {
  const map = readJson('plugins', 'gbusiness', 'tool-map.json');
  const names = map.filter((entry) => entry.methodId).map((entry) => entry.name);
  const before = new Set(baseline.generatedToolNames);
  const after = new Set(names);
  assert.equal(before.size, baseline.generatedToolNames.length);
  assert.equal(after.size, names.length);
  assert.ok([...before].every((name) => after.has(name)), 'an existing generated tool name changed');
  const added = [...after].filter((name) => !before.has(name));
  assert.equal(added.length, 2, `unexpected added tools: ${added.join(', ')}`);
  for (const name of added) assert.ok(TARGETS.some((id) => name.endsWith(id.split('.').pop().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())), name);

  const aliases = readJson('plugins', 'gbusiness', 'tool-aliases.json').aliases;
  for (const [oldName, newName] of Object.entries(baseline.aliases)) {
    assert.equal(aliases[oldName], newName, `alias ${oldName} was repointed`);
  }
  const addedAliases = Object.keys(aliases).filter((key) => !(key in baseline.aliases));
  assert.deepEqual(addedAliases, ['mbinfo_locatio_attribu_get_exte']);

  const product = readJson('config', 'products.json').products.gbusiness;
  assert.deepEqual(product.toolsets.google.tools, baseline.googleToolNames);
  assert.deepEqual(readJson('config', 'servers.json').servers.find((s) => s.name === 'gbusiness').toolsets.google, baseline.googleToolNames);
});

test('OD13i: mbinfo_locations_patch accepts narrow single-field bodies without requiring a full Location object', async () => {
  const { generateDiscoveryTools, loadToolKinds } = await import(new URL('../dist/core/discovery/tools.js', import.meta.url).href);
  const { loadConfig } = await import(new URL('../dist/core/config.js', import.meta.url).href);
  const doc = readJson('data', 'discovery', 'mybusinessbusinessinformation.v1.json');
  const { tools } = generateDiscoveryTools(
    'gbusiness',
    'business',
    [{ apiName: 'mybusinessbusinessinformation', apiVersion: 'v1', doc }],
    loadToolKinds(REPO),
    loadConfig({ GSM_ALLOW_WRITES: 'true' }),
    64,
  );
  const patch = tools.find((t) => t.name === 'mbinfo_locations_patch');
  assert.ok(patch, 'mbinfo_locations_patch exists');
  const singleField = patch.inputSchema.body.safeParse({ websiteUri: 'https://example.com' });
  assert.equal(singleField.success, true);
  assert.deepEqual(singleField.data, { websiteUri: 'https://example.com' });
  const nestedField = patch.inputSchema.body.safeParse({ profile: { description: 'Fresh roast coffee' } });
  assert.equal(nestedField.success, true);
  assert.deepEqual(nestedField.data, { profile: { description: 'Fresh roast coffee' } });
});
