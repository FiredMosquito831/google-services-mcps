// 1.41.4: the seven methods the owner named as reads (Q1 of specs/2026-10-30-adversarial-review.md, decisions of
// 2026-10-31): Google Ads generateKeywordIdeas, generateKeywordHistoricalMetrics and suggestKeywordThemes, and the
// four Vertex AI countTokens bindings. They are reads by exact id in config/tool-kinds.json, not by a name rule: a
// POST is a write unless a read rule names it, which is why removing the credential rule alone (1.41.3) left them
// writes. This file checks each one where it is used: both classifiers for every catalog version, the built plugin
// tables the hook reads, a running server's tools/list with writes off, and the bundled hook itself.
// The Search Ads 360 copies, firebaseml and generativelanguage countTokens are NOT in the set; the last test pins that
// they still ask, so a later decision can see the difference.
// Every test works in temp folders with fake tokens. No network call is made: read tools are listed, never called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8').replace(/^﻿/, ''));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);
const { classifyMethod } = await import(pathToFileURL(join(ROOT, 'dist', 'core', 'discovery', 'methods.js')).href);
const { fallbackClassify } = await import(pathToFileURL(join(ROOT, 'dist', 'cli', 'method-kinds.js')).href);
const { loadKindOverrides } = await import(pathToFileURL(join(ROOT, 'dist', 'cli', 'catalog.js')).href);

const overrides = loadKindOverrides(join(ROOT, 'data', 'catalog.json'));
const kindsFile = readJson('config', 'tool-kinds.json');

/** The owner's set: three Google Ads methods, and the four Vertex AI countTokens bindings. */
const ADS_READS = [
  { id: 'googleads.customers.generateKeywordIdeas', tool: 'mcp__plugin_gads_gads__googleads_customers_generate_keyword_idea' },
  { id: 'googleads.customers.generateKeywordHistoricalMetrics', tool: null },
  { id: 'googleads.customers.suggestKeywordThemes', tool: null },
];
const COUNT_TOKENS = [
  'aiplatform.projects.locations.publishers.models.countTokens',
  'aiplatform.publishers.models.countTokens',
  'aiplatform.projects.locations.endpoints.countTokens',
  'aiplatform.endpoints.countTokens',
];
const APPROVED = [...ADS_READS.map((m) => m.id), ...COUNT_TOKENS];

/** Still writes: the same RPCs on other APIs, left for the owner to decide. */
const LEFT_OUT = [
  'searchads360.customers.generateKeywordIdeas',
  'searchads360.customers.generateKeywordHistoricalMetrics',
  'searchads360.customers.suggestKeywordThemes',
  'searchads360.customers.generateKeywordForecastMetrics',
  'googleads.customers.generateKeywordForecastMetrics',
  'firebaseml.projects.locations.publishers.models.countTokens',
  'generativelanguage.models.countTokens',
];

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

test('the seven ids are reads by exact id, as the catalog spells them, and no other id is added', () => {
  for (const id of APPROVED) assert.equal(kindsFile[id], 'read', `${id}: the exact read entry`);
  // The entries around this decision are unchanged: the 1.24.2 and 1.24.5 reads, the credential writes, the
  // destructive ones. A count would drift with every later decision, so the neighbouring ids are named instead.
  assert.equal(kindsFile['apikeys.projects.locations.keys.getKeyString'], 'write');
  assert.equal(kindsFile['aiplatform.projects.locations.publishers.models.generateContent'], 'read');
  assert.equal(kindsFile['aiplatform.projects.locations.publishers.models.embedContent'], 'read');
});

test('both classifiers give read for every catalog version of the seven', () => {
  const catalog = readJson('data', 'catalog.json');
  const seen = new Map();
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      if (!APPROVED.includes(id)) continue;
      if (!seen.has(id)) seen.set(id, []);
      seen.get(id).push(`${api.name}:${api.version}`);
      assert.equal(classifyMethod(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}: classifyMethod`);
      assert.equal(fallbackClassify(verb, nameOf(id), id, overrides), 'read', `${id} ${api.version}: the plugin copy`);
    }
  }
  assert.deepEqual([...seen.keys()].sort(), [...APPROVED].sort());
  // The Vertex bindings exist in two versions each; the Ads ones in one.
  assert.deepEqual(seen.get('aiplatform.endpoints.countTokens').sort(), ['aiplatform:v1', 'aiplatform:v1beta1']);
  assert.deepEqual(seen.get('googleads.customers.generateKeywordIdeas'), ['googleads:v26']);
});

test('the built plugin tables carry read: gateway entries in method-kinds.json, the generated tool in tool-map.json', () => {
  const gads = readJson('plugins', 'gads', 'method-kinds.json');
  for (const m of ADS_READS) assert.equal(gads[m.id], 'read', `gads gateway ${m.id}`);
  const gai = readJson('plugins', 'gai', 'method-kinds.json');
  for (const id of COUNT_TOKENS) assert.equal(gai[id], 'read', `gai gateway ${id}`);
  for (const m of ADS_READS) {
    if (m.tool === null) continue;
    const entry = readJson('plugins', 'gads', 'tool-map.json').find((t) => t.name === m.tool);
    assert.ok(entry, `${m.tool} is in the gads tool map`);
    assert.equal(entry.kind, 'read', `${m.tool}: the hook reads this kind`);
  }
});

test('the generated tool is listed with writes off, and the gateway methods no longer ask', async () => {
  const dir = tempDir('gsm-credential-reads-');
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens, { recursive: true });
  // A fake sign-in holding every scope the gads tool map lists. Fake values only.
  const map = readJson('plugins', 'gads', 'tool-map.json');
  const group = readJson('plugins', 'gads', 'servers.json').servers[0].group;
  const scopes = [...new Set(map.flatMap((t) => t.scopes ?? []))].sort();
  writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
  );
  // Writes off: GSM_ALLOW_WRITES is not set at all, which is the default a plugin gets.
  const env = { ...base, GSM_TOKEN_DIR: tokens, HOME: dir, USERPROFILE: dir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud') };
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, 'plugins', 'gads', 'servers', 'gads.mjs')],
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gsm-credential-reads-test', version: '0.0.0' });
  const names = [];
  try {
    await client.connect(transport);
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      names.push(...page.tools.map((t) => t.name));
      cursor = page.nextCursor;
    } while (cursor);
  } finally {
    await client.close();
  }
  assert.ok(names.includes('googleads_customers_generate_keyword_idea'), 'the read tool is listed with writes off');
});

test('the bundled hook asks nothing for them, and still asks for the copies left out', () => {
  const dir = tempDir('gsm-credential-reads-hook-');
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens, { recursive: true });
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_')));
  const env = { ...base, GSM_TOKEN_DIR: tokens, HOME: dir, USERPROFILE: dir };

  function decision(hook, input) {
    const result = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.error, undefined, `hook did not run: ${result.error}`);
    assert.equal(result.status, 0, `exit code 0, stderr: ${result.stderr}`);
    return result.stdout;
  }
  const gadsHook = join(ROOT, 'plugins', 'gads', 'bin', 'gsm-hook.mjs');
  const gaiHook = join(ROOT, 'plugins', 'gai', 'bin', 'gsm-hook.mjs');
  const event = (toolName, toolInput) => ({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput });

  // The generated read tool, and the three gateway methods through api_call: no output at all, so Claude Code runs
  // its normal permission flow as for any other read.
  assert.equal(decision(gadsHook, event('mcp__plugin_gads_gads__googleads_customers_generate_keyword_idea', {})), '', 'the generated tool');
  for (const m of ADS_READS) {
    assert.equal(decision(gadsHook, event('mcp__plugin_gads_gads__api_call', { method: m.id, body: {} })), '', `gads api_call ${m.id}`);
  }
  for (const id of COUNT_TOKENS) {
    assert.equal(decision(gaiHook, event('mcp__plugin_gai_gai__api_call', { method: id, body: {} })), '', `gai api_call ${id}`);
  }

  // Not decided here: these still ask, which is the point of leaving them out.
  for (const id of LEFT_OUT) {
    const hook = id.startsWith('searchads360.') || id.startsWith('googleads.') ? gadsHook : gaiHook;
    const plugin = hook === gadsHook ? 'gads' : 'gai';
    const out = decision(hook, event(`mcp__plugin_${plugin}_${plugin}__api_call`, { method: id, body: {} }));
    assert.notEqual(out, '', `${id} still asks`);
    assert.match(out, /"permissionDecision":"ask"/, `${id}`);
  }
});
