// Tool counts in the docs (1.38.3): README's products block, docs/SURFACES.md, docs/CAPABILITIES.md and each
// docs/capabilities/<id>.md count the tools a server registers, by the same rule as the skills (registersEntry in
// src/core/runtime-tools.ts): the tool map without the runtime tools of other sign-in kinds (every map lists all nine,
// for the hook) and, for the service-account group, without tools the key's fixed scopes never cover. The installer's
// own count (toolsetCount without options, the Antigravity warning) is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');

const { registersEntry, runtimeToolsFor, RUNTIME_TOOL_NAMES } = await import(dist('core/runtime-tools.js'));
const { SERVICE_ACCOUNT_SCOPES_BY_SERVER } = await import(dist('core/service-account-scopes.js'));
const { toolsetCount } = await import(dist('cli/toolset-count.js'));

const products = readJson('config', 'products.json').products;
const ids = Object.keys(products);

function registered(id) {
  const p = products[id];
  const keyScopes = p.group === 'service-account' ? SERVICE_ACCOUNT_SCOPES_BY_SERVER[p.server.name] : undefined;
  const map = readJson('plugins', id, 'tool-map.json');
  const short = (t) => t.name.slice(t.name.indexOf('__', 'mcp__plugin_'.length) + 2);
  return { map, own: map.filter((t) => registersEntry(short(t), t.scopes, p.group, keyScopes)), short };
}

test('registersEntry: a group registers its own runtime tools only, and a service account key only the tools its scopes cover', () => {
  assert.equal(registersEntry('auth_login', [], 'workspace-user'), true);
  assert.equal(registersEntry('auth_setup_admin', [], 'workspace-user'), false);
  assert.equal(registersEntry('auth_setup_admin', [], 'workspace-admin'), true);
  assert.equal(registersEntry('auth_login', [], 'apikey'), false);
  assert.equal(registersEntry('health', [], 'apikey'), true);
  assert.equal(registersEntry('gmail_search', ['https://x/gmail.readonly'], 'workspace-user'), true);
  const key = ['https://www.googleapis.com/auth/content'];
  assert.equal(registersEntry('merchant_x', ['https://www.googleapis.com/auth/content'], 'service-account', key), true);
  assert.equal(registersEntry('mc_x', ['https://www.googleapis.com/auth/manufacturercenter'], 'service-account', key), false);
  assert.equal(registersEntry('unscoped', [], 'service-account', key), true);
  for (const group of ['cloud', 'workspace-user', 'workspace-admin', 'apikey', 'service-account']) {
    for (const name of runtimeToolsFor(group)) assert.ok(RUNTIME_TOOL_NAMES.includes(name));
  }
});

test('README, SURFACES, CAPABILITIES and each capability page give every product the count its skill gives', () => {
  const readme = read('README.md');
  const surfaces = read('docs', 'SURFACES.md');
  const capabilities = read('docs', 'CAPABILITIES.md');
  let total = 0;
  for (const id of ids) {
    const { map, own } = registered(id);
    const count = own.length;
    total += count;
    assert.ok(count < map.length, `${id}: ${count} registered of ${map.length} map entries`);
    const skill = read('plugins', id, 'skills', id, 'SKILL.md');
    assert.match(skill, new RegExp(`lists up to ${count} tools with the \`all\` toolset`), `${id} skill`);
    assert.match(readme, new RegExp(`\\| \\[\`${id}\`\\]\\(docs/products/${id}\\.md\\) \\| [^|]+ \\| \`[a-z-]+\` \\| ${count} \\|`), `${id} README`);
    assert.match(surfaces, new RegExp(`\\| \`${id}\` \\| [^|]+ \\| [a-z-]+ \\| ${count} \\|`), `${id} SURFACES`);
    const kinds = { read: 0, write: 0, destructive: 0, dynamic: 0 };
    for (const t of own) kinds[t.kind] += 1;
    assert.match(capabilities, new RegExp(`\\| \`${id}\` \\| .*? \\| ${count} \\(${kinds.read} / ${kinds.write} / ${kinds.destructive} / ${kinds.dynamic}\\) \\|`), `${id} CAPABILITIES`);
    const page = read('docs', 'capabilities', `${id}.md`);
    assert.match(page, new RegExp(`- Tools: ${count} total\\.`), `${id} capability page`);
  }
  assert.match(readme, new RegExp(`\\*\\*Totals:\\*\\* ${ids.length} products, ${total} tools,`));
  assert.match(capabilities, new RegExp(`; ${total} tools built;`));
});

test('a capability page lists no runtime tool its server never registers, and names the map entries it leaves out', () => {
  for (const id of ids) {
    const page = read('docs', 'capabilities', `${id}.md`);
    const group = products[id].group;
    // The page without its "Not registered by this server" section, which names the left-out entries on purpose.
    const start = page.indexOf('## Not registered by this server');
    const end = start >= 0 ? page.indexOf('\n## ', start + 3) : -1;
    const tables = start >= 0 ? page.slice(0, start) + (end >= 0 ? page.slice(end) : '') : page;
    assert.ok(tables.includes('| Tool | Safety |'), `${id}: the tool tables are checked`);
    for (const name of RUNTIME_TOOL_NAMES) {
      if (!runtimeToolsFor(group).includes(name)) assert.ok(!tables.includes(`| \`${name}\` |`), `${id} lists ${name}`);
    }
    const { map, own, short } = registered(id);
    const left = map.filter((t) => !own.includes(t)).map(short);
    for (const name of left) assert.ok(page.includes(`\`${name}\``), `${id} names ${name} as not registered`);
  }
});

test("the installer's count is unchanged: toolsetCount without options still counts every map entry for all", () => {
  for (const id of ids) {
    const mapFile = join(ROOT, 'plugins', id, 'tool-map.json');
    const all = toolsetCount(mapFile, id, products[id].server.name, 'all', undefined);
    assert.equal(all.count, readJson('plugins', id, 'tool-map.json').length, id);
  }
});
