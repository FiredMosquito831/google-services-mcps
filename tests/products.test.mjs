import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const productsPath = resolve(here, '../config/products.json');
const catalogPath = resolve(here, '../data/catalog.json');
const errorsPath = resolve(here, '../data/catalog-errors.json');

const rawProducts = readFileSync(productsPath, 'utf8');
const map = JSON.parse(rawProducts);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const catalogErrors = JSON.parse(readFileSync(errorsPath, 'utf8'));

const CAP = 350;
const GROUPS = new Set([
  'cloud',
  'searchconsole',
  'apikey',
  'workspace-user',
  'workspace-admin',
  'business',
  'developer',
]);

// A catalog entry is an API name plus a version, so one name can have several entries.
const key = (name, version) => `${name}@${version}`;
const catalogApis = new Map(catalog.apis.map((a) => [key(a.name, a.version), a]));
const errorKeys = new Set(catalogErrors.map((e) => key(e.name, e.version)));

// A tool exists for every method whose flags do not contain "u" (media upload).
const toolCount = (api) => api.methods.filter((m) => !m[4].includes('u')).length;

const productIds = Object.keys(map.products);

/** The product whose generated or gateway list holds this entry, or null. */
function productOf(k) {
  for (const id of productIds) {
    for (const list of ['generated', 'gateway']) {
      if (map.products[id][list].some((e) => key(e.api, e.version) === k)) return id;
    }
  }
  return null;
}

test('product ids are unique and match /^[a-z]{2,10}$/', () => {
  // JSON.parse keeps the last of duplicate keys, so scan the raw product keys too.
  const rawKeys = [...rawProducts.matchAll(/^ {4}"([^"]+)": \{$/gm)].map((m) => m[1]);
  assert.equal(new Set(rawKeys).size, rawKeys.length, 'duplicate product id in config/products.json');
  assert.deepEqual([...rawKeys].sort(), [...productIds].sort());
  for (const id of productIds) {
    assert.match(id, /^[a-z]{2,10}$/, `bad product id: ${id}`);
  }
});

test('server names are unique and at most 12 characters', () => {
  const names = productIds.map((id) => map.products[id].server.name);
  assert.equal(new Set(names).size, names.length, 'duplicate server name');
  for (const name of names) {
    assert.ok(name.length <= 12, `server name too long: ${name}`);
  }
});

test('every product has an allowed group', () => {
  for (const id of productIds) {
    const p = map.products[id];
    assert.ok(GROUPS.has(p.group), `${id}: group "${p.group}" is not one of ${[...GROUPS].join(', ')}`);
    assert.equal(typeof p.title, 'string', `${id}: title missing`);
    assert.equal(typeof p.description, 'string', `${id}: description missing`);
  }
});

test('gsearch uses the apikey group', () => {
  assert.equal(map.products.gsearch.group, 'apikey');
});

test('catalog entries are unique by name and version and carry a boolean preferred flag', () => {
  assert.equal(catalogApis.size, catalog.apis.length, 'duplicate name and version in catalog.json');
  assert.equal(catalog.apiCount, catalog.apis.length, 'apiCount does not match the entries');
  for (const api of catalog.apis) {
    assert.equal(typeof api.preferred, 'boolean', `${key(api.name, api.version)}: preferred is not a boolean`);
  }
});

test('generatedToolCount is at most 350 and equals the recomputed tool total', () => {
  for (const id of productIds) {
    const p = map.products[id];
    let recomputed = 0;
    for (const entry of p.generated) {
      const api = catalogApis.get(key(entry.api, entry.version));
      assert.ok(api, `${id}: generated ${key(entry.api, entry.version)} is not in catalog.json`);
      recomputed += toolCount(api);
    }
    assert.equal(p.generatedToolCount, recomputed, `${id}: generatedToolCount is stale`);
    assert.ok(p.generatedToolCount <= CAP, `${id}: ${p.generatedToolCount} generated tools exceeds ${CAP}`);
  }
});

test('an entry with zero per-method tools is never generated', () => {
  for (const id of productIds) {
    for (const entry of map.products[id].generated) {
      const k = key(entry.api, entry.version);
      assert.ok(toolCount(catalogApis.get(k)) > 0, `${id}: ${k} has no per-method tools`);
    }
  }
});

test('every catalog entry appears exactly once across generated, gateway and unassigned', () => {
  const seen = new Map();
  const note = (k, where) => seen.set(k, [...(seen.get(k) ?? []), where]);

  for (const id of productIds) {
    for (const list of ['generated', 'gateway']) {
      for (const entry of map.products[id][list]) {
        const k = key(entry.api, entry.version);
        assert.ok(catalogApis.has(k), `${id}.${list}: ${k} is not a catalog entry`);
        note(k, `${id}.${list}`);
      }
    }
  }
  for (const u of map.unassigned) {
    const k = key(u.api, u.version);
    assert.ok(
      catalogApis.has(k) || errorKeys.has(k),
      `unassigned ${k} is neither a catalog entry nor a known discovery error`,
    );
    assert.equal(typeof u.reason, 'string', `unassigned ${k} needs a reason`);
    assert.ok(u.reason.trim().length > 0, `unassigned ${k} has an empty reason`);
    note(k, 'unassigned');
  }

  for (const k of catalogApis.keys()) {
    const places = seen.get(k) ?? [];
    assert.equal(places.length, 1, `${k} appears ${places.length} times: ${places.join(', ') || 'nowhere'}`);
  }
});

test('every discovery error is listed in unassigned with a reason', () => {
  for (const e of catalogErrors) {
    const k = key(e.name, e.version);
    const u = map.unassigned.find((x) => x.api === e.name && x.version === e.version);
    assert.ok(u, `${k} failed to fetch but is not listed in unassigned`);
    assert.ok(u.reason.trim().length > 0, `${k} needs a reason`);
  }
});

test('a non-preferred version is in the product of its API name', () => {
  const preferredByName = new Map(catalog.apis.filter((a) => a.preferred).map((a) => [a.name, a]));
  for (const api of catalog.apis) {
    if (api.preferred) continue;
    const preferred = preferredByName.get(api.name);
    if (!preferred) continue; // no preferred version in the directory (cloudquotas), see the next test
    const own = key(api.name, api.version);
    assert.equal(
      productOf(own),
      productOf(key(preferred.name, preferred.version)),
      `${own} is not in the product of ${key(preferred.name, preferred.version)}`,
    );
  }
});

test('supplemental generativelanguage entries are in the catalog and in gai gateway', () => {
  for (const version of ['v1', 'v1beta']) {
    assert.ok(catalogApis.has(key('generativelanguage', version)), `generativelanguage@${version} is not in the catalog`);
    assert.ok(
      map.products.gai.gateway.some((e) => e.api === 'generativelanguage' && e.version === version),
      `generativelanguage@${version} is not in gai gateway`,
    );
  }
});

test('supplemental cloudquotas entries are in gcloud gateway', () => {
  for (const version of ['v1', 'v1beta']) {
    assert.ok(catalogApis.has(key('cloudquotas', version)), `cloudquotas@${version} is not in the catalog`);
    assert.ok(
      map.products.gcloud.gateway.some((e) => e.api === 'cloudquotas' && e.version === version),
      `cloudquotas@${version} is not in gcloud gateway`,
    );
  }
});

test('notes only reference known API names or name@version entries', () => {
  const names = new Set([...catalog.apis.map((a) => a.name), ...catalogErrors.map((e) => e.name)]);
  const entries = new Set([...catalogApis.keys(), ...errorKeys]);
  for (const note of Object.keys(map.notes)) {
    if (note.includes('@')) assert.ok(entries.has(note), `note for unknown entry ${note}`);
    else assert.ok(names.has(note), `note for unknown API ${note}`);
  }
});
