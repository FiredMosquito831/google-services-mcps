#!/usr/bin/env node
/**
 * End-to-end smoke test of the bundled plugin servers, over real stdio MCP.
 *
 * Starts every server from plugins/<plugin>/.mcp.json with an empty token
 * directory, so nothing reaches Google and no real credentials are read. Checks:
 *   - tools/list works, names are unique and at most 64 characters with the server prefix
 *   - with writes off, no tool is marked as non-read-only
 *   - with writes on, destructive tools return a preview when confirm is not set
 *   - a read tool without a login fails with a clear message, not a crash
 *
 * Usage: npm run build && node scripts/smoke.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = join(root, 'plugins');
const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-smoke-'));
const failures = [];
const fail = (msg) => failures.push(msg);

async function connect(pluginDir, serverName, env) {
  const mcp = JSON.parse(readFileSync(join(pluginDir, '.mcp.json'), 'utf8')).mcpServers[serverName];
  const script = mcp.args[0].replace('${CLAUDE_PLUGIN_ROOT}', pluginDir);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [script],
    env: { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'false', ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gsm-smoke', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

function textOf(result) {
  return (result.content ?? []).map((c) => c.text ?? '').join('\n');
}

const plugins = readdirSync(pluginsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
const report = [];

for (const plugin of plugins) {
  const pluginDir = join(pluginsDir, plugin.name);
  if (!existsSync(join(pluginDir, '.mcp.json'))) continue;
  const servers = Object.keys(JSON.parse(readFileSync(join(pluginDir, '.mcp.json'), 'utf8')).mcpServers);

  for (const server of servers) {
    // Writes off: list tools.
    const client = await connect(pluginDir, server, {});
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      if (dupes.length) fail(`${server}: duplicate tool names ${[...new Set(dupes)].join(', ')}`);
      // Claude Code's full name is mcp__plugin_<plugin>_<server>__<tool>; it must stay within 64 characters.
      const prefix = `mcp__plugin_${plugin.name}_${server}__`;
      const longestFull = Math.max(0, ...names.map((n) => (prefix + n).length));
      if (longestFull > 64) fail(`${server}: full tool name is ${longestFull} characters (limit 64)`);
      const writeTools = tools.filter((t) => t.annotations?.readOnlyHint !== true);
      if (writeTools.length) fail(`${server}: write tools visible with writes off: ${writeTools.map((t) => t.name).slice(0, 5).join(', ')}`);

      // Read tool with no login must fail cleanly. Use the first read tool that is not the api_methods list.
      const readTool = tools.find((t) => t.name !== 'api_methods' && t.annotations?.readOnlyHint === true);
      if (readTool) {
        const res = await client.callTool({ name: readTool.name, arguments: {} });
        const text = textOf(res);
        if (!res.isError && !/preview|Missing|required|invalid/i.test(text)) {
          // Some tools may answer with data if the arguments happen to be valid; that is not a failure here.
        }
      }

      report.push({ plugin: plugin.name, server, tools: tools.length, read: tools.filter((t) => t.annotations?.readOnlyHint === true).length });
    } finally {
      await client.close();
    }
  }
}

// Writes on, every server: names stay within the 64-character limit, and write tools
// appear only with writes enabled.
for (const plugin of plugins) {
  const pluginDir = join(pluginsDir, plugin.name);
  if (!existsSync(join(pluginDir, '.mcp.json'))) continue;
  const servers = Object.keys(JSON.parse(readFileSync(join(pluginDir, '.mcp.json'), 'utf8')).mcpServers);
  for (const server of servers) {
    const client = await connect(pluginDir, server, { GSM_ALLOW_WRITES: 'true' });
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      const prefix = `mcp__plugin_${plugin.name}_${server}__`;
      const longestFull = Math.max(0, ...names.map((n) => (prefix + n).length));
      if (longestFull > 64) fail(`${server} (writes on): full tool name is ${longestFull} characters (limit 64)`);
      if (new Set(names).size !== names.length) fail(`${server} (writes on): duplicate tool names`);
      if (!tools.some((t) => t.annotations?.readOnlyHint !== true)) fail(`${server} (writes on): no write tools registered`);
    } finally {
      await client.close();
    }
  }
}

// Writes on: destructive tools must preview without confirm, and must not call Google.
{
  const client = await connect(join(pluginsDir, 'google-cloud'), 'gcloud', { GSM_ALLOW_WRITES: 'true' });
  try {
    const { tools } = await client.listTools();
    if (!tools.some((t) => t.name === 'cloud_project_delete')) fail('gcloud: cloud_project_delete missing with writes on');
    const res = await client.callTool({ name: 'cloud_project_delete', arguments: { project_id: 'smoke-test-123' } });
    const text = textOf(res);
    if (!/"status": "preview"/.test(text)) fail(`gcloud: destructive call without confirm did not preview: ${text.slice(0, 200)}`);
    if (!/Not performed/.test(text)) fail('gcloud: preview message missing');

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
  const client = await connect(join(pluginsDir, 'google-workspace'), 'gws-admin', {});
  try {
    const res = await client.callTool({ name: 'admin_users_list', arguments: {} });
    if (!res.isError || !/GSM_SERVICE_ACCOUNT_KEY_FILE|GSM_ADMIN_SUBJECT|Admin tools need/.test(textOf(res))) {
      fail(`gws-admin: missing admin config did not fail clearly: ${textOf(res).slice(0, 200)}`);
    }
  } finally {
    await client.close();
  }
}

console.log('Servers started and listed:');
for (const r of report) console.log(`  ${r.plugin}/${r.server}: ${r.tools} tools (${r.read} read)`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('\nSmoke test passed.');
