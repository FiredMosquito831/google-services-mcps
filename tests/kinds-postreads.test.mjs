// 1.24.5: more POST methods that only read, reclassified as reads (spec 2026-10-29-tool-profiles, decision 5 of
// 2026-10-30): Search Console searchanalytics.query, the Monitoring Prometheus POST queries and timeSeries.query,
// Postmaster v2 domainStats.query and batchQuery, Vertex AI generateContent and embedContent, Identity Toolkit
// accounts.query and Firestore runQuery. Each one is pinned in config/tool-kinds.json, given by both classifiers for
// every catalog version, carried by the built plugins (generated tools in tool-map.json, gateway methods in
// method-kinds.json), decided by the real plugin hook, and seen by a running server. Vertex AI countTokens is not
// reclassified: a POST with no read rule is a write, and since 1.41.3 its name is no longer a credential name either
// (whole words: "Tokens" is not "token"; tests/credential-words.test.mjs).
// Every test works in temp folders. No network call is made: the read tools are listed, never called.
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
 * The owner-approved set. Per method id: the plugin that carries it, its generated tool (or null: gateway only), and
 * the catalog versions it has. Every entry is a POST that the verb and name rules make a write. Vertex AI
 * generateContent has four bindings (publisher models and endpoints, each with and without projects/locations); Identity
 * Toolkit accounts.query has two (project and tenant); all bindings of one RPC are listed, as for Discovery Engine answer.
 */
const POST_READS = [
  { id: 'webmasters.searchanalytics.query', plugin: 'gsc', tool: 'searchcons_searchanalytics_query', versions: ['searchconsole:v1'] },
  { id: 'monitoring.projects.location.prometheus.api.v1.query', plugin: 'gcloud', tool: null, versions: ['monitoring:v1'] },
  { id: 'monitoring.projects.location.prometheus.api.v1.query_range', plugin: 'gcloud', tool: null, versions: ['monitoring:v1'] },
  { id: 'monitoring.projects.location.prometheus.api.v1.query_exemplars', plugin: 'gcloud', tool: null, versions: ['monitoring:v1'] },
  { id: 'monitoring.projects.location.prometheus.api.v1.series', plugin: 'gcloud', tool: null, versions: ['monitoring:v1'] },
  { id: 'monitoring.projects.location.prometheus.api.v1.labels', plugin: 'gcloud', tool: null, versions: ['monitoring:v1'] },
  { id: 'monitoring.projects.timeSeries.query', plugin: 'gcloud', tool: 'monitor_projects_time_series_query', versions: ['monitoring:v3'] },
  { id: 'gmailpostmastertools.domains.domainStats.query', plugin: 'gmail', tool: 'gmailpostm_domains_domain_stats_query', versions: ['gmailpostmastertools:v2'] },
  { id: 'gmailpostmastertools.domainStats.batchQuery', plugin: 'gmail', tool: 'gmailpostm_domain_stats_batch_query', versions: ['gmailpostmastertools:v2'] },
  { id: 'aiplatform.projects.locations.publishers.models.generateContent', plugin: 'gai', tool: null, versions: ['aiplatform:v1', 'aiplatform:v1beta1'] },
  { id: 'aiplatform.publishers.models.generateContent', plugin: 'gai', tool: null, versions: ['aiplatform:v1', 'aiplatform:v1beta1'] },
  { id: 'aiplatform.projects.locations.endpoints.generateContent', plugin: 'gai', tool: null, versions: ['aiplatform:v1', 'aiplatform:v1beta1'] },
  { id: 'aiplatform.endpoints.generateContent', plugin: 'gai', tool: null, versions: ['aiplatform:v1', 'aiplatform:v1beta1'] },
  { id: 'aiplatform.projects.locations.publishers.models.embedContent', plugin: 'gai', tool: null, versions: ['aiplatform:v1', 'aiplatform:v1beta1'] },
  { id: 'identitytoolkit.projects.accounts.query', plugin: 'gfirebase', tool: null, versions: ['identitytoolkit:v1'] },
  { id: 'identitytoolkit.projects.tenants.accounts.query', plugin: 'gfirebase', tool: null, versions: ['identitytoolkit:v1'] },
  { id: 'firestore.projects.databases.documents.runQuery', plugin: 'gcloud', tool: null, versions: ['firestore:v1', 'firestore:v1beta1'] },
];

/** Vertex AI countTokens: approved by the owner, held back because a POST with no read rule is a write. */
const COUNT_TOKENS = [
  'aiplatform.projects.locations.publishers.models.countTokens',
  'aiplatform.publishers.models.countTokens',
  'aiplatform.projects.locations.endpoints.countTokens',
  'aiplatform.endpoints.countTokens',
];

const kindsFile = readJson('config', 'tool-kinds.json');
const overrides = Object.fromEntries(Object.entries(kindsFile).filter(([key]) => key !== 'notes'));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);
const full = (plugin, tool) => `mcp__plugin_${plugin}_${plugin}__${tool}`;
const CREDENTIAL = /token|credential|secret|password|authoriz|key/i;

test('config/tool-kinds.json pins the 17 POST reads, adds no note, and keeps BigQuery jobs.query a write', () => {
  for (const m of POST_READS) assert.equal(kindsFile[m.id], 'read', m.id);
  assert.equal(POST_READS.length, 17);
  // A note is appended to the description of every generated tool of its API, so none was added.
  for (const api of ['webmasters', 'monitoring', 'gmailpostmastertools', 'aiplatform', 'identitytoolkit', 'firestore']) {
    assert.equal(kindsFile.notes[api], undefined, api);
  }
  assert.equal(kindsFile['bigquery.jobs.query'], 'write', 'jobs.query runs any SQL, DML included');
});

test('both classifiers read the 17 methods on every catalog version, and the verb rules alone give write', () => {
  const catalog = readJson('data', 'catalog.json');
  const seen = new Map(POST_READS.map((m) => [m.id, []]));
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!seen.has(id)) continue;
      assert.equal(verb, 'POST', `${id} ${api.version} is a POST`);
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}: classifyMethod`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}: the plugin copy`);
      // Without the override the rules give write, so the entry in tool-kinds.json is what changes it.
      assert.equal(classifyMethod(verb, nameOf(id), id, {}), 'write', `${id} ${api.version}: the verb and name rules`);
      seen.get(id).push(`${api.name}:${api.version}`);
    }
  }
  for (const m of POST_READS) assert.deepEqual(seen.get(m.id).sort(), m.versions, `${m.id}: the catalog versions`);
});

test('the credential rule holds: no reclassified name has a credential word, and countTokens stays a write', () => {
  for (const m of POST_READS) assert.equal(CREDENTIAL.test(nameOf(m.id)), false, m.id);
  const catalog = readJson('data', 'catalog.json');
  const found = new Set();
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!COUNT_TOKENS.includes(id)) continue;
      found.add(id);
      assert.equal(kindsFile[id], undefined, `${id}: no override`);
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), 'write', `${id} ${api.version}: a POST with no read rule is a write`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), 'write', `${id} ${api.version}: the plugin copy`);
    }
  }
  assert.deepEqual([...found].sort(), [...COUNT_TOKENS].sort());
  const gai = readJson('plugins', 'gai', 'method-kinds.json');
  for (const id of COUNT_TOKENS) assert.equal(gai[id], 'write', `gai gateway ${id}`);
  assert.equal(kindsFile['apikeys.projects.locations.keys.getKeyString'], 'write');
});

test('the built plugins carry the reads: the generated tool in tool-map.json, the gateway method in method-kinds.json', () => {
  for (const m of POST_READS) {
    if (m.tool) {
      const entry = readJson('plugins', m.plugin, 'tool-map.json').find((t) => t.name === full(m.plugin, m.tool));
      assert.ok(entry, `${m.plugin} lists ${m.tool}`);
      assert.equal(entry.methodId, m.id, m.tool);
      assert.equal(entry.kind, 'read', m.tool);
    } else {
      assert.equal(readJson('plugins', m.plugin, 'method-kinds.json')[m.id], 'read', `${m.plugin} gateway ${m.id}`);
    }
    assert.deepEqual(readJson('plugins', m.plugin, 'tool-kinds.json'), kindsFile, `${m.plugin} carries config/tool-kinds.json`);
  }
});

test('the curated tools that call these methods are reads, as their generated and gateway copies now are', () => {
  const curated = [
    ['gsc', 'sc_search_analytics_query', ['webmasters.searchanalytics.query']],
    ['gcloud', 'monitoring_query_promql', ['monitoring.projects.location.prometheus.api.v1.query', 'monitoring.projects.location.prometheus.api.v1.query_range']],
    ['gai', 'vertex_generate_content', ['aiplatform.projects.locations.publishers.models.generateContent', 'aiplatform.projects.locations.endpoints.generateContent']],
    ['gai', 'vertex_embed_content', ['aiplatform.projects.locations.publishers.models.embedContent']],
    ['gfirebase', 'firestore_query_collection', ['firestore.projects.databases.documents.runQuery']],
    ['gfirebase', 'auth_get_users', ['identitytoolkit.projects.accounts.query']],
  ];
  for (const [plugin, tool, methods] of curated) {
    const entry = readJson('plugins', plugin, 'tool-map.json').find((t) => t.name === full(plugin, tool));
    assert.equal(entry?.kind, 'read', `${plugin} ${tool}`);
    for (const id of methods) assert.equal(classifyMethod('POST', nameOf(id), id, overrides), 'read', `${tool}: ${id}`);
  }
});

/** Runs a built plugin's own hook with a temp token folder (no policy file) and the default confirmation mode. */
function runPluginHook(plugin, toolName, toolInput) {
  const tokenDir = tempDir('gsm-postreads-hook-');
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  const event = { session_id: 's', hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 't' };
  const res = spawnSync(process.execPath, [join(ROOT, 'plugins', plugin, 'bin', 'gsm-hook.mjs')], { input: JSON.stringify(event), env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

test("the plugins' own hooks: each read runs without a prompt, as a tool or through api_call; countTokens still asks", () => {
  for (const m of POST_READS) {
    const out = m.tool
      ? runPluginHook(m.plugin, full(m.plugin, m.tool), { siteUrl: 'x' })
      : runPluginHook(m.plugin, full(m.plugin, 'api_call'), { method: m.id, pathParams: {} });
    assert.equal(out, '', `${m.id}: a read prints nothing, so Claude Code runs its normal flow`);
  }
  const asked = JSON.parse(runPluginHook('gai', full('gai', 'api_call'), { method: COUNT_TOKENS[0], pathParams: {} })).hookSpecificOutput;
  assert.equal(asked.permissionDecision, 'ask');
  assert.match(asked.permissionDecisionReason, /Method: aiplatform\.projects\.locations\.publishers\.models\.countTokens/);
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

/** A stored login of the group with exactly these scopes (fake token values; nothing is sent to Google). */
function fakeLogin(dir, group, scopes) {
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  return tokenDir;
}

function childEnv(dir, tokenDir) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, GSM_TOKEN_DIR: tokenDir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud') };
}

async function toolNamesOf(entry, env) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-postreads-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    return (await client.listTools()).tools.map((t) => t.name);
  } finally {
    await client.close();
  }
}

test('runServer with writes off and a read-only login lists the reclassified generated tools', async () => {
  const gscDir = tempDir('gsm-postreads-gsc-');
  const gsc = await toolNamesOf(generatedEntry(gscDir, 'gsc'), childEnv(gscDir, fakeLogin(gscDir, 'searchconsole', ['https://www.googleapis.com/auth/webmasters.readonly'])));
  assert.ok(gsc.includes('searchcons_searchanalytics_query'), 'a read is registered with writes off');
  assert.equal(gsc.includes('searchcons_sitemaps_submit'), false, 'a write of the same API is not');

  const gmailDir = tempDir('gsm-postreads-gmail-');
  const gmail = await toolNamesOf(
    generatedEntry(gmailDir, 'gmail'),
    childEnv(gmailDir, fakeLogin(gmailDir, 'workspace-user', ['https://www.googleapis.com/auth/postmaster.traffic.readonly'])),
  );
  assert.ok(gmail.includes('gmailpostm_domains_domain_stats_query'), 'domainStats.query is registered with writes off');
  assert.ok(gmail.includes('gmailpostm_domain_stats_batch_query'), 'domainStats.batchQuery is registered with writes off');
});
