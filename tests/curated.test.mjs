import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;

// Every hand-written (curated) module. Each one exports buildTools and nothing that starts a server.
const MODULES = ['cloud', 'gmail', 'gdrive', 'gcalendar', 'workspace-admin', 'searchconsole', 'gchat', 'gcontacts', 'gclassroom', 'ganalytics', 'gfirebase', 'gai', 'gmaps', 'gplay'];
// The product modules that must hold only their own area's tools.
const AREA_PREFIX = { gmail: ['gmail'], gdrive: ['drive', 'sheets'], gcalendar: ['calendar'], gchat: ['chat'], gcontacts: ['contacts', 'profile'], gclassroom: ['classroom'], ganalytics: ['ga'], gfirebase: ['firestore', 'remoteconfig', 'auth'], gai: ['vertex'], gmaps: ['maps'], gplay: ['androidmgmt'] };
const EXPECTED_COUNT = { gmail: 16, gdrive: 12, gcalendar: 9, gchat: 7, gcontacts: 3, gclassroom: 14, ganalytics: 5, gfirebase: 5, gai: 3, gmaps: 2, gplay: 9 };
const KINDS = new Set(['read', 'write', 'destructive']);

const dir = mkdtempSync(join(tmpdir(), 'gsm-curated-'));
after(() => rmSync(dir, { recursive: true, force: true }));
// A test config with no stored tokens and no network: buildTools must only describe tools.
const cfg = { allowWrites: true, tokenDir: dir, clientSecretFile: join(dir, 'client.json'), maxResultChars: 100000 };

const built = {};
for (const name of MODULES) {
  const mod = await import(dist(`servers/${name}.js`));
  assert.equal(typeof mod.buildTools, 'function', `${name} exports buildTools`);
  built[name] = await mod.buildTools(cfg);
}

const prefixOf = (toolName) => toolName.split('_')[0];

test('no curated module starts a server or touches the stdio transport', () => {
  for (const name of MODULES) {
    const source = readFileSync(resolve(here, '../src/servers', `${name}.ts`), 'utf8');
    assert.doesNotMatch(source, /runServer\(/, `${name} does not call runServer`);
    assert.doesNotMatch(source, /StdioServerTransport/, `${name} does not use the stdio transport`);
  }
});

for (const name of MODULES) {
  test(`${name}: tool names are unique, short, and every tool has a kind and scopes`, () => {
    const tools = built[name];
    assert.ok(tools.length > 0, 'the module has tools');
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, 'names are unique');
    for (const t of tools) {
      assert.match(t.name, /^[a-z][a-z0-9_]*$/, `${t.name} is a snake_case name`);
      assert.ok(t.name.length <= 40, `${t.name} is at most 40 characters`);
      assert.ok(KINDS.has(t.kind), `${t.name} has a kind (${t.kind})`);
      assert.ok(t.title && t.description, `${t.name} has a title and description`);
      assert.ok(Array.isArray(t.scopes) && t.scopes.length > 0, `${t.name} declares scopes`);
      // openid is the one bare scope name: OpenID Connect names it so, and Discovery lists it so (oauth2.userinfo.get).
      assert.ok(t.scopes.every((s) => typeof s === 'string' && (s.startsWith('https://') || s === 'openid')), `${t.name} scopes are full URLs`);
    }
  });
}

test('the product modules hold exactly their own area and the expected number of tools', () => {
  for (const [name, prefixes] of Object.entries(AREA_PREFIX)) {
    const seen = new Set(built[name].map((t) => prefixOf(t.name)));
    assert.deepEqual([...seen].sort(), [...prefixes].sort(), `${name} holds only ${prefixes.join(', ')} tools`);
    assert.equal(built[name].length, EXPECTED_COUNT[name], `${name} tool count`);
  }
});

test('no prefix is claimed by two modules, and tool names are unique across modules', () => {
  const owner = new Map();
  for (const name of MODULES) {
    for (const t of built[name]) {
      const prefix = prefixOf(t.name);
      if (owner.has(prefix)) assert.equal(owner.get(prefix), name, `prefix ${prefix}_ is used by ${owner.get(prefix)} and ${name}`);
      owner.set(prefix, name);
    }
  }
  const all = MODULES.flatMap((name) => built[name].map((t) => t.name));
  assert.equal(new Set(all).size, all.length, 'names are unique across all curated modules');
});
