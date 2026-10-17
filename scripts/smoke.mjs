#!/usr/bin/env node
/**
 * End-to-end smoke test of the product plugins, over real stdio MCP.
 *
 * Static checks, for every product folder under plugins/ (each must be a product in config/products.json):
 *   - the generated files exist: .claude-plugin/plugin.json, .mcp.json, servers.json, scopes.json,
 *     tool-map.json, hooks/hooks.json, bin/gsm.mjs, bin/gsm-hook.mjs, skills/<id>/SKILL.md, and
 *     method-kinds.json when the server has gateway APIs
 *   - hooks/hooks.json has the matcher ^mcp__plugin_<id>_ for the PreToolUse hook
 *   - every full tool name starts with mcp__plugin_<id>_<server>__, is at most 64 characters and is unique
 *
 * Runtime checks: starts every server from plugins/<plugin>/.mcp.json with an empty token directory, so
 * nothing reaches Google and no real credentials are read. Checks:
 *   - tools/list works, and names are unique and at most 64 characters with the server prefix
 *   - the tools registered with writes off are the tool-map entries of kind read or dynamic, and with
 *     writes on they are all tool-map entries (the tool-map is what the hook reads, so it must match)
 *   - with writes on, destructive tools return a preview when confirm is not set
 *   - a read tool without a login fails with a clear message, not a crash
 *
 * Usage: npm run build && node scripts/smoke.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = join(root, 'plugins');
const products = readJson(join(root, 'config', 'products.json')).products;
const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-smoke-'));
const failures = [];
const fail = (msg) => failures.push(msg);
const TOOL_NAME_MAX = 64;
const READ_KINDS = new Set(['read', 'dynamic']);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

async function connect(pluginDir, serverName, env) {
  const mcp = readJson(join(pluginDir, '.mcp.json')).mcpServers[serverName];
  const script = mcp.args[0].replace('${CLAUDE_PLUGIN_ROOT}', pluginDir);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [script],
    // The servers start with no login: an empty token folder, and no ADC file, so a real gcloud login on this machine
    // cannot change what the smoke test checks.
    env: {
      ...process.env,
      GSM_TOKEN_DIR: tokenDir,
      GSM_ALLOW_WRITES: 'false',
      APPDATA: join(tokenDir, 'appdata'),
      GOOGLE_APPLICATION_CREDENTIALS: join(tokenDir, 'no-adc.json'),
      ...env,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gsm-smoke', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

function textOf(result) {
  return (result.content ?? []).map((c) => c.text ?? '').join('\n');
}

/** The auth group of each plugin, from its servers.json. */
const groupOf = new Map();

/** The plugin's files and tool map. Returns the tool map, or null when the plugin is unusable. */
function staticChecks(id) {
  const dir = join(pluginsDir, id);
  const required = [
    '.claude-plugin/plugin.json',
    '.mcp.json',
    'servers.json',
    'scopes.json',
    'tool-map.json',
    'hooks/hooks.json',
    'bin/gsm.mjs',
    'bin/gsm-hook.mjs',
    `skills/${id}/SKILL.md`,
  ];
  for (const rel of required) if (!existsSync(join(dir, rel))) fail(`${id}: missing ${rel}`);
  if (!existsSync(join(dir, 'tool-map.json'))) return null;

  const registry = readJson(join(dir, 'servers.json'));
  const servers = registry.servers;
  if (Object.keys(registry.plugins).join(',') !== id) fail(`${id}: servers.json lists plugins ${Object.keys(registry.plugins).join(', ')}`);
  if (servers.length !== 1) fail(`${id}: expected one server, found ${servers.length}`);
  const server = servers[0]?.name;
  groupOf.set(id, servers[0]?.group);

  const hooks = readJson(join(dir, 'hooks', 'hooks.json'));
  const matcher = hooks.hooks?.PreToolUse?.[0]?.matcher;
  if (matcher !== `^mcp__plugin_${id}_`) fail(`${id}: hook matcher is ${matcher}, expected ^mcp__plugin_${id}_`);

  if (servers.some((s) => s.gatewayApis?.length) && !existsSync(join(dir, 'method-kinds.json'))) {
    fail(`${id}: has gateway APIs but no method-kinds.json`);
  }
  if (existsSync(join(dir, 'method-kinds.json'))) {
    const kinds = readJson(join(dir, 'method-kinds.json'));
    for (const [method, kind] of Object.entries(kinds)) {
      // dynamic: the kind is decided per call from the body (the Google Ads mutate methods).
      if (!['read', 'write', 'destructive', 'dynamic'].includes(kind)) fail(`${id}: method ${method} has kind ${kind}`);
    }
  }

  const toolMap = readJson(join(dir, 'tool-map.json'));
  const prefix = `mcp__plugin_${id}_${server}__`;
  const names = toolMap.map((t) => t.name);
  if (new Set(names).size !== names.length) fail(`${id}: tool-map.json has duplicate names`);
  for (const name of names) {
    if (!name.startsWith(prefix)) fail(`${id}: tool ${name} does not start with ${prefix}`);
    if (name.length > TOOL_NAME_MAX) fail(`${id}: tool name ${name} is ${name.length} characters (limit ${TOOL_NAME_MAX})`);
    if (!/^[A-Za-z0-9_-]+$/.test(name)) fail(`${id}: tool name ${name} has characters outside A-Za-z0-9_-`);
  }
  return toolMap;
}

const plugins = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
for (const id of Object.keys(products)) if (!plugins.includes(id)) fail(`plugins/${id} is missing`);
for (const name of plugins) if (!(name in products)) fail(`plugins/${name} is not a product in config/products.json`);

// The sign-in and account tools (write-hinted in the tool map). Listed with writes off by design; see the checks below.
const SIGN_IN_TOOLS = new Set([
  'auth_status',
  'accounts_list',
  'account_set_default',
  'account_remove',
  'auth_login',
  'auth_setup_client',
  'auth_setup_admin',
  'auth_setup_service_account',
]);
// Groups that need a login (or a key set up) register only the tools that need no scope until then.
const NEEDS_LOGIN_FIRST = new Set(['workspace-admin', 'workspace-user', 'searchconsole', 'business', 'developer', 'service-account']);

const toolMaps = new Map();
for (const id of plugins) {
  if (!(id in products)) continue;
  const toolMap = staticChecks(id);
  if (toolMap) toolMaps.set(id, toolMap);
}

const report = [];

// Writes off: the tools listed are exactly the read and dynamic entries of the tool map.
for (const plugin of plugins) {
  const pluginDir = join(pluginsDir, plugin);
  if (!existsSync(join(pluginDir, '.mcp.json'))) continue;
  const servers = Object.keys(readJson(join(pluginDir, '.mcp.json')).mcpServers);
  for (const server of servers) {
    const client = await connect(pluginDir, server, {});
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      if (dupes.length) fail(`${server}: duplicate tool names ${[...new Set(dupes)].join(', ')}`);
      const prefix = `mcp__plugin_${plugin}_${server}__`;
      const longestFull = Math.max(0, ...names.map((n) => (prefix + n).length));
      if (longestFull > TOOL_NAME_MAX) fail(`${server}: full tool name is ${longestFull} characters (limit ${TOOL_NAME_MAX})`);

      // A dynamic tool (the gateway's api_call) is listed with writes off, and it refuses writes itself.
      const toolMap = toolMaps.get(plugin) ?? [];
      // The sign-in and account tools are registered with writes off on purpose: the hook asks before each call to them.
      // Which of them a server registers depends on its group, so they are kept out of the exact comparison. Each one
      // must still be in the tool map, or the hook would treat it as destructive.
      for (const n of names) {
        if (SIGN_IN_TOOLS.has(n) && !toolMap.some((t) => t.name === prefix + n)) fail(`${server}: ${n} is not in tool-map.json, so the hook would ask for every call`);
      }
      const expectedOff = toolMap
        .filter((t) => READ_KINDS.has(t.kind))
        .map((t) => t.name.slice(prefix.length))
        .filter((n) => !SIGN_IN_TOOLS.has(n))
        .sort();
      const listedOff = names.filter((n) => !SIGN_IN_TOOLS.has(n)).sort();
      // The tools a server lists with writes off must be read entries of its tool map.
      const unexpected = listedOff.filter((n) => !expectedOff.includes(n));
      if (unexpected.length) fail(`${server}: with writes off, tools not in tool-map.json: ${unexpected.slice(0, 5).join(', ')}`);
      // Groups that need a login (or a key set up) register only the tools that need no scope until then, so for them only
      // the subset rule above holds. The admin group does the same.
      if (!NEEDS_LOGIN_FIRST.has(groupOf.get(plugin)) && JSON.stringify(expectedOff) !== JSON.stringify(listedOff)) {
        const missing = expectedOff.filter((n) => !listedOff.includes(n));
        fail(`${server}: with writes off, ${missing.length} tool-map tools are not registered: ${missing.slice(0, 5).join(', ')}`);
      }
      const writeTools = tools.filter(
        (t) => t.annotations?.readOnlyHint !== true && !READ_KINDS.has(toolKindOf(toolMap, prefix, t.name)) && !SIGN_IN_TOOLS.has(t.name),
      );
      if (writeTools.length) fail(`${server}: write tools visible with writes off: ${writeTools.map((t) => t.name).slice(0, 5).join(', ')}`);

      // Read tool with no login must fail cleanly. The list tool and the gateway search tool take no login.
      const readTool = tools.find((t) => !['api_methods', 'api_search', 'api_describe'].includes(t.name) && t.annotations?.readOnlyHint === true);
      if (readTool) {
        const res = await client.callTool({ name: readTool.name, arguments: {} });
        textOf(res);
      }

      report.push({ plugin, server, tools: tools.length, read: tools.filter((t) => t.annotations?.readOnlyHint === true).length });
    } finally {
      await client.close();
    }
  }
}

function toolKindOf(toolMap, prefix, shortName) {
  return toolMap.find((t) => t.name === prefix + shortName)?.kind;
}

// Writes on: the names stay within the limit, and every tool-map entry is registered.
for (const plugin of plugins) {
  const pluginDir = join(pluginsDir, plugin);
  if (!existsSync(join(pluginDir, '.mcp.json'))) continue;
  const servers = Object.keys(readJson(join(pluginDir, '.mcp.json')).mcpServers);
  for (const server of servers) {
    const client = await connect(pluginDir, server, { GSM_ALLOW_WRITES: 'true' });
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      const prefix = `mcp__plugin_${plugin}_${server}__`;
      const longestFull = Math.max(0, ...names.map((n) => (prefix + n).length));
      if (longestFull > TOOL_NAME_MAX) fail(`${server} (writes on): full tool name is ${longestFull} characters (limit ${TOOL_NAME_MAX})`);
      if (new Set(names).size !== names.length) fail(`${server} (writes on): duplicate tool names`);
      if (!tools.some((t) => t.annotations?.readOnlyHint !== true)) fail(`${server} (writes on): no write tools registered`);
      const expected = (toolMaps.get(plugin) ?? [])
        .map((t) => t.name.slice(prefix.length))
        .filter((n) => !SIGN_IN_TOOLS.has(n))
        .sort();
      const registered = names.filter((n) => !SIGN_IN_TOOLS.has(n));
      const unexpected = registered.filter((n) => !expected.includes(n));
      if (unexpected.length) fail(`${server} (writes on): tools not in tool-map.json: ${unexpected.slice(0, 5).join(', ')}`);
      if (!NEEDS_LOGIN_FIRST.has(groupOf.get(plugin)) && registered.length !== expected.length) {
        fail(`${server} (writes on): ${registered.length} tools registered, ${expected.length} in tool-map.json`);
      }
    } finally {
      await client.close();
    }
  }
}

// Writes on: destructive tools must preview without confirm, and must not call Google.
{
  const client = await connect(join(pluginsDir, 'gcloud'), 'gcloud', { GSM_ALLOW_WRITES: 'true' });
  try {
    const { tools } = await client.listTools();
    if (!tools.some((t) => t.name === 'cloud_project_delete')) fail('gcloud: cloud_project_delete missing with writes on');
    const res = await client.callTool({ name: 'cloud_project_delete', arguments: { project_id: 'smoke-test-123' } });
    const text = textOf(res);
    // Without confirmation the call is held back: a preview when the client can answer, or a refusal when it cannot.
    if (!/"status": "preview"|cannot ask for confirmation|Not performed|was not run/.test(text)) {
      fail(`gcloud: destructive call without confirm was not held back: ${text.slice(0, 200)}`);
    }

    // Read tool without login: must return a clear error.
    const r2 = await client.callTool({ name: 'cloud_project_get', arguments: { project_id: 'smoke-test-123' } });
    if (!r2.isError || !/Not logged in|client_secret|Application Default|Could not load|credentials/i.test(textOf(r2))) {
      fail(`gcloud: unauthenticated read did not fail clearly: ${textOf(r2).slice(0, 200)}`);
    }
  } finally {
    await client.close();
  }
}

// Admin server without service account config: must fail with a clear message.
{
  const client = await connect(join(pluginsDir, 'gadmin'), 'gadmin', {});
  try {
    const res = await client.callTool({ name: 'admin_users_list', arguments: {} });
    if (!res.isError || !/GSM_SERVICE_ACCOUNT_KEY_FILE|GSM_ADMIN_SUBJECT|Admin tools need/.test(textOf(res))) {
      fail(`gadmin: missing admin config did not fail clearly: ${textOf(res).slice(0, 200)}`);
    }
  } finally {
    await client.close();
  }
}

rmSync(tokenDir, { recursive: true, force: true });

console.log('Plugins started and listed:');
for (const r of report) console.log(`  ${r.plugin}/${r.server}: ${r.tools} tools (${r.read} read)`);
console.log(`Plugins: ${plugins.length}, servers: ${report.length}, tools (writes off): ${report.reduce((n, r) => n + r.tools, 0)}`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\nSmoke test passed.');
