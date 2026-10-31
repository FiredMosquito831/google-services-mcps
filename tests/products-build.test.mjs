/**
 * The generated product plugins against the source of truth, config/products.json.
 *
 * Needs a built tree: npm run build (scripts/gen-servers.mjs, scripts/snapshot-discovery.mjs and
 * scripts/bundle.mjs). Checks that every product has its plugin folder and that the generated files
 * agree with each other: names, prefixes, kinds, scopes and the catalog and Discovery subsets.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8').replace(/^﻿/, ''));

const products = load('config', 'products.json').products;
const ids = Object.keys(products);
const map = load('config', 'servers.json');
const toolKinds = load('config', 'tool-kinds.json');
const catalog = load('data', 'catalog.json');
const marketplace = load('.claude-plugin', 'marketplace.json');

const GROUPS = ['cloud', 'workspace-user', 'workspace-admin', 'searchconsole', 'business', 'developer', 'apikey', 'service-account'];
const TOOL_KINDS = new Set(['read', 'write', 'destructive', 'dynamic']);
// A method-kinds entry is read, write, destructive, or dynamic (decided per call from the body, for the Google Ads mutate methods).
const METHOD_KINDS = new Set(['read', 'write', 'destructive', 'dynamic']);
const TOOL_NAME_MAX = 64;
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const apiKey = (a) => `${a.api}.${a.version}`;
const catalogKey = (a) => `${a.name}.${a.version}`;

test('config/products.json has 23 products with lowercase ids, known groups and a server named after the product', () => {
  assert.equal(ids.length, 23);
  for (const id of ids) {
    const p = products[id];
    assert.match(id, /^[a-z]+$/, `${id} must be lowercase letters only`);
    assert.ok(GROUPS.includes(p.group), `${id} has group ${p.group}`);
    assert.equal(p.server.name, id, `${id}: server name`);
    assert.ok(p.title && p.description, `${id} needs a title and a description`);
  }
});

test('config/servers.json is generated from products.json: one plugin and one server per product', () => {
  assert.equal(map.servers.length, ids.length);
  assert.deepEqual(Object.keys(map.plugins).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(map.groups).sort(), [...GROUPS].sort());
  for (const group of GROUPS) assert.ok(map.groups[group].length > 0, `group ${group} needs a description`);
  for (const s of map.servers) {
    const p = products[s.plugin];
    assert.ok(p, `server ${s.name} names unknown plugin ${s.plugin}`);
    assert.equal(s.name, p.server.name);
    assert.equal(s.group, p.group);
    assert.deepEqual(s.apis, p.generated, `${s.name}: generated APIs`);
    assert.deepEqual(s.gatewayApis ?? [], p.gateway, `${s.name}: gateway APIs`);
    if (s.curated) assert.ok(existsSync(join(ROOT, s.curated)), `${s.name}: curated file ${s.curated} is missing`);
  }
});

test('every plugin folder is a product, and every product has a plugin folder', () => {
  const folders = readdirSync(join(ROOT, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual([...folders].sort(), [...ids].sort());
});

test('the marketplace lists every product once, from its plugin folder', () => {
  assert.equal(marketplace.plugins.length, ids.length);
  for (const entry of marketplace.plugins) {
    const p = products[entry.name];
    assert.ok(p, `marketplace entry ${entry.name} is not a product`);
    assert.equal(entry.source, `./plugins/${entry.name}`);
    assert.equal(entry.description, p.description);
  }
});

test('every generated API has a Discovery snapshot that parses', () => {
  const seen = new Set();
  for (const s of map.servers) {
    for (const a of s.apis) {
      const file = join(ROOT, 'data', 'discovery', `${apiKey(a)}.json`);
      assert.ok(existsSync(file), `missing ${file}; run node scripts/snapshot-discovery.mjs`);
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      assert.ok(doc.resources, `${apiKey(a)} has no resources`);
      seen.add(apiKey(a));
    }
  }
  assert.ok(seen.size > 0);
});

for (const id of ids) {
  test(`plugin ${id} has consistent generated files`, () => {
    const dir = join(ROOT, 'plugins', id);
    const product = products[id];
    const server = map.servers.find((s) => s.plugin === id);
    assert.ok(server, `no server for ${id} in config/servers.json`);
    const name = server.name;
    const prefix = `mcp__plugin_${id}_${name}__`;

    for (const rel of [
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'servers.json',
      'scopes.json',
      'tool-map.json',
      'hooks/hooks.json',
      'bin/gsm.mjs',
      'bin/gsm-hook.mjs',
      `servers/${name}.mjs`,
      `skills/${id}/SKILL.md`,
      'tool-kinds.json',
    ]) {
      assert.ok(existsSync(join(dir, rel)), `plugins/${id}/${rel} is missing; run npm run build`);
    }

    // Plugin manifest.
    const manifest = load('plugins', id, '.claude-plugin', 'plugin.json');
    assert.equal(manifest.name, id);
    assert.equal(manifest.displayName, product.title);
    assert.equal(manifest.version, readFileSync(join(ROOT, 'scripts', 'bundle.mjs'), 'utf8').match(/MANIFEST_VERSION = '([^']+)'/)[1]);
    assert.equal(manifest.author.name, 'FiredMosquito831');
    assert.equal(manifest.userConfig.confirmation.default, 'every-change');
    assert.deepEqual(manifest.userConfig.confirmation.options, ['every-change', 'destructive-only', 'off']);
    if (product.group === 'workspace-admin') {
      assert.ok(manifest.userConfig.admin_subject && manifest.userConfig.service_account_key_file, 'gadmin needs the admin settings');
    }

    // Registry subset: the plugin's own server and group only.
    const registry = load('plugins', id, 'servers.json');
    assert.deepEqual(Object.keys(registry.plugins), [id]);
    assert.deepEqual(Object.keys(registry.groups), [product.group]);
    assert.deepEqual(registry.servers.map((s) => s.name), [name]);
    assert.equal(registry.servers[0].plugin, id);

    // Scopes: one list per server, named after it.
    assert.deepEqual(Object.keys(load('plugins', id, 'scopes.json')), [name]);

    // MCP config: one server, pointing into the plugin, with the user-config environment.
    const mcp = load('plugins', id, '.mcp.json').mcpServers;
    assert.deepEqual(Object.keys(mcp), [name]);
    assert.deepEqual(mcp[name].args, [`\${CLAUDE_PLUGIN_ROOT}/servers/${name}.mjs`]);
    for (const key of ['GSM_ALLOW_WRITES', 'GSM_CONFIRMATION', 'GSM_TOKEN_DIR', 'GSM_HOOK_ACTIVE']) {
      assert.ok(key in mcp[name].env, `${key} missing from .mcp.json`);
    }
    if (product.group === 'workspace-admin') assert.ok('GSM_SERVICE_ACCOUNT_KEY_FILE' in mcp[name].env);

    // Hook: the PreToolUse matcher covers this plugin's own server's tools only (anchored to the server since 1.38.2).
    const hooks = load('plugins', id, 'hooks', 'hooks.json');
    assert.equal(hooks.hooks.PreToolUse[0].matcher, `^mcp__plugin_${id}_${name}__`);
    assert.deepEqual(hooks.hooks.PreToolUse[0].hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/bin/gsm-hook.mjs']);

    // Tool map: full Claude names with the plugin prefix, unique, within the limit, known kinds.
    const toolMap = load('plugins', id, 'tool-map.json');
    assert.ok(Array.isArray(toolMap) && toolMap.length > 0, 'tool-map.json must be a non-empty array');
    const names = toolMap.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, 'tool names are unique');
    for (const t of toolMap) {
      assert.ok(t.name.startsWith(prefix), `${t.name} does not start with ${prefix}`);
      assert.ok(t.name.length <= TOOL_NAME_MAX, `${t.name} is longer than ${TOOL_NAME_MAX}`);
      assert.match(t.name, /^[A-Za-z0-9_-]+$/);
      assert.ok(TOOL_KINDS.has(t.kind), `${t.name} has kind ${t.kind}`);
      assert.ok(Array.isArray(t.scopes), `${t.name} needs a scopes list`);
    }

    // Gateway: the method kinds and the catalog subset cover the same methods, and only gateway APIs.
    const gatewayApis = server.gatewayApis ?? [];
    if (gatewayApis.length === 0) {
      assert.ok(!existsSync(join(dir, 'method-kinds.json')), 'no gateway APIs, so no method-kinds.json');
      assert.ok(!existsSync(join(dir, 'catalog.json')), 'no gateway APIs, so no catalog.json');
    } else {
      const kinds = load('plugins', id, 'method-kinds.json');
      for (const [method, kind] of Object.entries(kinds)) {
        assert.ok(METHOD_KINDS.has(kind), `${method} has kind ${kind}`);
      }
      const subset = load('plugins', id, 'catalog.json');
      assert.deepEqual(subset.apis.map(catalogKey).sort(), gatewayApis.map(apiKey).sort(), 'catalog subset holds exactly the gateway APIs');
      assert.equal(subset.apiCount, subset.apis.length);
      const methodIds = subset.apis.flatMap((a) => a.methods.map((m) => m[0]));
      assert.ok(sameList(Object.keys(kinds), [...new Set(methodIds)]), 'method-kinds.json lists every gateway method once');
      // Each catalog method is classified the way the hook will read it.
      for (const api of catalog.apis.filter((a) => gatewayApis.some((g) => g.api === a.name && g.version === a.version))) {
        for (const m of api.methods) assert.ok(m[0] in kinds, `${m[0]} is missing from method-kinds.json`);
      }
    }

    // Discovery: one snapshot per generated API, copied from data/discovery.
    for (const a of server.apis) {
      assert.ok(existsSync(join(dir, 'discovery', `${apiKey(a)}.json`)), `discovery/${apiKey(a)}.json is missing`);
    }

    // Safety overrides are the repo's file.
    assert.deepEqual(load('plugins', id, 'tool-kinds.json'), toolKinds);

    // Skill: named after the plugin, with the frontmatter the plugin loader reads.
    const skill = readFileSync(join(dir, 'skills', id, 'SKILL.md'), 'utf8');
    assert.match(skill, new RegExp(`^---\\nname: ${id}\\n`));
  });
}

test('gadmin: no duplicate tool names, and admin_users_list is the curated tool, not the Directory method', () => {
  const toolMap = load('plugins', 'gadmin', 'tool-map.json');
  const names = toolMap.map((t) => t.name);
  assert.equal(new Set(names).size, names.length, 'gadmin tool names are unique');

  // The curated tool keeps its name: it has its own title and no method id.
  const curated = toolMap.find((t) => t.name === 'mcp__plugin_gadmin_gadmin__admin_users_list');
  assert.ok(curated, 'the curated admin_users_list is registered');
  assert.equal(curated.title, 'List users');
  assert.equal(curated.methodId, undefined, 'the curated tool has no Discovery method id');

  // The generated Directory method of the same name is registered under a hashed name.
  const generated = toolMap.filter((t) => t.methodId === 'directory.users.list');
  assert.equal(generated.length, 1, 'directory.users.list is generated once');
  assert.match(generated[0].name, /^mcp__plugin_gadmin_gadmin__admin_users_list_[0-9a-f]{4}$/);
});

test('every generated method id reaches tool-map.json, and matches its Discovery method', () => {
  // Discovery ids are dot-separated; some segments have underscores (tagmanager ... move_entities_to_folder).
  const METHOD_ID = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;
  for (const server of map.servers) {
    const apis = server.apis ?? [];
    if (apis.length === 0) continue;

    // The method ids the Discovery snapshots list, without media-upload methods (skipped by the generator).
    // An API with an include list (a subset, see config/products.json) expects only the methods the list names.
    const expected = new Set();
    const walk = (doc, resources, chain, include) => {
      for (const [resourceName, resource] of Object.entries(resources ?? {})) {
        const here = [...chain, resourceName];
        for (const [methodName, m] of Object.entries(resource.methods ?? {})) {
          if (m.supportsMediaUpload || m.mediaUpload) continue;
          const inSubset = !include || include.some((path) => path === here.join('.') || path === [...here, methodName].join('.'));
          if (inSubset) expected.add(m.id ?? [doc.name, ...here, methodName].join('.'));
        }
        walk(doc, resource.resources, here, include);
      }
    };
    for (const a of apis) {
      const doc = load('data', 'discovery', `${apiKey(a)}.json`);
      walk(doc, doc.resources, [], a.include);
    }

    const toolMap = load('plugins', server.plugin, 'tool-map.json');
    const withId = toolMap.filter((t) => t.methodId !== undefined);
    for (const t of withId) {
      assert.match(t.methodId, METHOD_ID, `${server.name}: ${t.methodId} is a method id`);
      assert.equal(t.methodId, t.title, `${t.name}: methodId is the Discovery method`);
    }
    const found = new Set(withId.map((t) => t.methodId));
    assert.deepEqual([...found].filter((id) => !expected.has(id)), [], `${server.name}: method ids not in its Discovery snapshots`);
    assert.deepEqual([...expected].filter((id) => !found.has(id)), [], `${server.name}: generated methods with no methodId in tool-map.json`);
  }
});
