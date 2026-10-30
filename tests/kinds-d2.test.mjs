// D2 (1.24.2): the kinds of the POST methods Google marks read-only, and of Merchant dataSources.fetch, which Google
// says triggers processing. Each one is pinned in config/tool-kinds.json, given by both classifiers for every catalog
// version, carried by the built plugins (generated tools in tool-map.json, gateway methods in method-kinds.json),
// decided by the real plugin hook, and seen by a running server. Run after compiling (npm test does).
// Every test works in temp folders. No network call is made: the read tools are listed, never called, and the one
// write is declined at the gate, before its handler runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { classifyMethod } = await import(dist('core/discovery/methods.js'));
const { fallbackClassify } = await import(dist('cli/method-kinds.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/**
 * The owner-approved D2 set (spec 2026-10-29-tool-profiles, decision 8). Per method id: its new kind, the kind the
 * verb and name rules give without the override, the plugin, its generated tool, and whether a gateway API of the
 * plugin carries it too. The Discovery Engine answer method has three bindings of the same RPC (AnswerQueryRequest),
 * so all three are listed.
 */
const D2 = [
  { id: 'firebasedataconnect.projects.locations.services.executeGraphqlRead', kind: 'read', rules: 'write', plugin: 'gfirebase', tool: 'firebaseda_pro_loc_ser_exe_3072', gateway: true },
  { id: 'firebasedataconnect.projects.locations.services.generateQuery', kind: 'read', rules: 'write', plugin: 'gfirebase', tool: 'firebaseda_pro_loc_ser_gen_8f53', gateway: true },
  { id: 'firebasedataconnect.projects.locations.services.generateSchema', kind: 'read', rules: 'write', plugin: 'gfirebase', tool: 'firebaseda_pro_loc_ser_gen_cf40', gateway: true },
  { id: 'firebaserules.projects.test', kind: 'read', rules: 'write', plugin: 'gfirebase', tool: 'firebaseru_projects_test', gateway: false },
  { id: 'discoveryengine.projects.locations.collections.engines.servingConfigs.answer', kind: 'read', rules: 'write', plugin: 'gai', tool: 'discoverye_proj_loca_coll_engin_servi_answe', gateway: true },
  { id: 'discoveryengine.projects.locations.collections.dataStores.servingConfigs.answer', kind: 'read', rules: 'write', plugin: 'gai', tool: 'discoverye_proj_loca_colle_data_servi_answe', gateway: true },
  { id: 'discoveryengine.projects.locations.dataStores.servingConfigs.answer', kind: 'read', rules: 'write', plugin: 'gai', tool: 'discoverye_proje_locat_data_s_servin_answer', gateway: true },
  { id: 'developerknowledge.answerQuery', kind: 'read', rules: 'write', plugin: 'gsearch', tool: 'developerk_v1_answer_query', gateway: true },
  { id: 'places.places.autocomplete', kind: 'read', rules: 'write', plugin: 'gmaps', tool: 'places_places_autocomplete', gateway: false },
  { id: 'analyticsdata.properties.batchRunPivotReports', kind: 'read', rules: 'write', plugin: 'ganalytics', tool: 'gadata_properties_batch_run_p', gateway: false },
  { id: 'analyticsdata.properties.audienceExports.query', kind: 'read', rules: 'write', plugin: 'ganalytics', tool: 'gadata_propert_audience_query', gateway: false },
  { id: 'calendar.freebusy.query', kind: 'read', rules: 'write', plugin: 'gcalendar', tool: 'calendar_freebusy_query', gateway: false },
  { id: 'merchantapi.accounts.dataSources.fetch', kind: 'write', rules: 'read', plugin: 'gmerchant', tool: 'merchantap_accoun_data_so_fetch', gateway: true },
];

const kindsFile = readJson('config', 'tool-kinds.json');
const overrides = Object.fromEntries(Object.entries(kindsFile).filter(([key]) => key !== 'notes'));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);
const full = (plugin, tool) => `mcp__plugin_${plugin}_${plugin}__${tool}`;

test('config/tool-kinds.json pins the D2 kinds: twelve POST reads, and Merchant dataSources.fetch as a write', () => {
  for (const m of D2) assert.equal(kindsFile[m.id], m.kind, m.id);
  assert.equal(D2.filter((m) => m.kind === 'read').length, 12);
  assert.deepEqual(D2.filter((m) => m.kind === 'write').map((m) => m.id), ['merchantapi.accounts.dataSources.fetch']);
  // No note was added: a note is appended to the description of every generated tool of its API.
  for (const api of ['firebasedataconnect', 'firebaserules', 'discoveryengine', 'developerknowledge', 'places', 'analyticsdata', 'calendar', 'merchantapi']) {
    assert.equal(kindsFile.notes[api], undefined, api);
  }
});

test('both classifiers give the D2 kind for every catalog version of each method, and the verb rules alone give the old kind', () => {
  const catalog = readJson('data', 'catalog.json');
  const seen = new Map(D2.map((m) => [m.id, []]));
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!seen.has(id)) continue;
      const m = D2.find((d) => d.id === id);
      assert.equal(verb, 'POST', `${id} ${api.version} is a POST`);
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), m.kind, `${id} ${api.version}: classifyMethod`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), m.kind, `${id} ${api.version}: the plugin copy`);
      // Without the override the rules give the old kind, so the entry in tool-kinds.json is what changes it.
      assert.equal(classifyMethod(verb, nameOf(id), id, {}), m.rules, `${id} ${api.version}: the verb and name rules`);
      seen.get(id).push(`${api.name}:${api.version}`);
    }
  }
  for (const [id, versions] of seen) assert.ok(versions.length >= 1, `${id} is in the catalog`);
  // The versions the catalog carries today (data/catalog.json of 2026-10-15).
  assert.deepEqual(seen.get('developerknowledge.answerQuery').sort(), ['developerknowledge:v1', 'developerknowledge:v1alpha']);
  assert.deepEqual(seen.get('merchantapi.accounts.dataSources.fetch').sort(), ['merchantapi:datasources_v1', 'merchantapi:datasources_v1beta']);
  assert.equal(seen.get('discoveryengine.projects.locations.collections.engines.servingConfigs.answer').length, 3, 'v1, v1alpha and v1beta');
});

test('a credential name is still a write: the D2 overrides name none, and getKeyString keeps its override', () => {
  const CREDENTIAL = /token|credential|secret|password|authoriz|key/i;
  for (const m of D2) assert.equal(CREDENTIAL.test(nameOf(m.id)), false, m.id);
  assert.equal(kindsFile['apikeys.projects.locations.keys.getKeyString'], 'write');
  assert.equal(classifyMethod('GET', 'getKeyString', 'apikeys.projects.locations.keys.getKeyString', overrides), 'write');
});

test('the built plugins carry the D2 kinds: the generated tool in tool-map.json, the gateway method in method-kinds.json', () => {
  for (const m of D2) {
    const map = readJson('plugins', m.plugin, 'tool-map.json');
    const entry = map.find((t) => t.name === full(m.plugin, m.tool));
    assert.ok(entry, `${m.plugin} lists ${m.tool}`);
    assert.equal(entry.methodId, m.id, m.tool);
    assert.equal(entry.kind, m.kind, m.tool);
    if (m.gateway) assert.equal(readJson('plugins', m.plugin, 'method-kinds.json')[m.id], m.kind, `${m.plugin} gateway ${m.id}`);
    assert.deepEqual(readJson('plugins', m.plugin, 'tool-kinds.json'), kindsFile, `${m.plugin} carries config/tool-kinds.json`);
  }
  // Curated and generated free/busy are in step: both reads.
  const calendar = readJson('plugins', 'gcalendar', 'tool-map.json');
  assert.equal(calendar.find((t) => t.name === full('gcalendar', 'calendar_freebusy')).kind, 'read');
});

/** Runs a built plugin's own hook with a temp token folder (no policy file) and the default confirmation mode. */
function runPluginHook(plugin, toolName, toolInput) {
  const tokenDir = tempDir('gsm-d2-hook-');
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  const event = { session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 't' };
  const res = spawnSync(process.execPath, [join(ROOT, 'plugins', plugin, 'bin', 'gsm-hook.mjs')], { input: JSON.stringify(event), env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

test("the plugins' own hooks: a D2 read runs without a prompt, as a tool and through api_call; dataSources.fetch asks", () => {
  for (const m of D2) {
    const asTool = runPluginHook(m.plugin, full(m.plugin, m.tool), { parent: 'x' });
    const viaGateway = m.gateway ? runPluginHook(m.plugin, full(m.plugin, 'api_call'), { method: m.id, pathParams: {} }) : undefined;
    if (m.kind === 'read') {
      assert.equal(asTool, '', `${m.tool}: a read prints nothing, so Claude Code runs its normal flow`);
      if (m.gateway) assert.equal(viaGateway, '', `api_call ${m.id}: a read prints nothing`);
      continue;
    }
    for (const out of [asTool, viaGateway]) {
      const decision = JSON.parse(out).hookSpecificOutput;
      assert.equal(decision.permissionDecision, 'ask', m.id);
      assert.match(decision.permissionDecisionReason, /^About to change Google data: /);
      assert.match(decision.permissionDecisionReason, /Method: merchantapi\.accounts\.dataSources\.fetch/);
    }
  }
});

/** A server of generated tools only, as scripts/bundle.mjs writes its entry. */
function generatedEntry(dir, name) {
  const entry = join(dir, `${name}-entry.mjs`);
  writeFileSync(
    entry,
    [
      `import { withOrigin } from '${dist('core/toolset.js')}';`,
      `import { discoveryToolsFor } from '${dist('core/discovery/tools.js')}';`,
      `import { runServer } from '${dist('core/tools.js')}';`,
      `await runServer({ name: '${name}', version: '0.0.0', buildTools: async (cfg) => withOrigin('generated', await discoveryToolsFor('${name}', cfg, [])) });`,
      '',
    ].join('\n'),
  );
  return entry;
}

function childEnv(dir, tokenDir, extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, GSM_TOKEN_DIR: tokenDir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud'), ...extra };
}

/** Connects an MCP client; with `answer`, the client can elicit and gives that answer to every request. */
async function withClient(entry, env, run, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-d2-test', version: '0.0.0' }, { capabilities: answer ? { elicitation: { form: {} } } : {} });
  const asked = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      asked.push(request.params.message);
      return answer;
    });
  }
  await client.connect(transport);
  try {
    return await run(client, asked);
  } finally {
    await client.close();
  }
}

const toolNames = async (client) => (await client.listTools()).tools.map((t) => t.name);

test('runServer without GSM_ALLOW_WRITES lists a D2 read (places autocomplete, with an API key that is never sent)', async () => {
  const dir = tempDir('gsm-d2-gmaps-');
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const names = await withClient(generatedEntry(dir, 'gmaps'), childEnv(dir, tokenDir, { GSM_API_KEY: 'fake-key-never-sent' }), toolNames);
  assert.ok(names.includes('places_places_autocomplete'), 'a read is registered with writes off');
  assert.ok(names.includes('places_places_search_text'));
});

test('runServer: dataSources.fetch is hidden with writes off; with writes on it asks, and a decline runs nothing', async () => {
  const dir = tempDir('gsm-d2-gmerchant-');
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const keyFile = join(dir, 'key.json');
  writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
  // What `gsm setup-service-account` stores: the key's path (a throwaway key in the temp folder).
  writeFileSync(join(tokenDir, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-30T00:00:00Z' }));
  const entry = generatedEntry(dir, 'gmerchant');

  const readOnly = await withClient(entry, childEnv(dir, tokenDir), toolNames);
  assert.equal(readOnly.includes('merchantap_accoun_data_so_fetch'), false, 'a write is not registered with writes off');
  assert.ok(readOnly.includes('merchantap_account_data_sou_get'), 'the reads of the same resource are');

  await withClient(
    entry,
    childEnv(dir, tokenDir, { GSM_ALLOW_WRITES: 'true' }),
    async (client, asked) => {
      const res = await client.callTool({ name: 'merchantap_accoun_data_so_fetch', arguments: { name: 'accounts/1/dataSources/2' } });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /You declined this action\. Nothing was changed\./);
      assert.equal(asked.length, 1, 'the gate asked once');
      assert.match(asked[0], /About to change Google data: merchantap_accoun_data_so_fetch/);
      assert.match(asked[0], /merchantapi\.accounts\.dataSources\.fetch/);
    },
    { action: 'decline' },
  );
  const audit = readFileSync(join(tokenDir, 'audit.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(audit.map((l) => [l.tool, l.methodId, l.risk, l.outcome]), [['merchantap_accoun_data_so_fetch', 'merchantapi.accounts.dataSources.fetch', 'modify', 'declined']]);
});
