#!/usr/bin/env node
/**
 * Builds the four installable Claude plugins from the repo.
 *
 * For each plugin in config/servers.json:
 *   plugins/<plugin>/servers/<server>.mjs   one bundled MCP server per server entry
 *   plugins/<plugin>/bin/gsm.mjs            the installer and login CLI (bundled)
 *   plugins/<plugin>/.mcp.json              MCP config using ${CLAUDE_PLUGIN_ROOT} and user config
 *   plugins/<plugin>/servers.json           the subset of the server map for this plugin
 *   plugins/<plugin>/scopes.json            scopes for this plugin's servers (from data/scopes.json)
 *   plugins/<plugin>/discovery/<api>.<v>.json  only the Discovery snapshots this plugin needs
 *
 * Usage: npm run build   (needs data/discovery and data/scopes.json from scripts/snapshot-discovery.mjs)
 */
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'config', 'servers.json'), 'utf8'));
const scopesFile = join(root, 'data', 'scopes.json');
const scopes = existsSync(scopesFile) ? JSON.parse(readFileSync(scopesFile, 'utf8')) : {};

/** Per-server environment in the generated .mcp.json. Values come from the plugin's user config. */
const SHARED_ENV = {
  GSM_ALLOW_WRITES: '${user_config.allow_writes}',
  GSM_TOKEN_DIR: '${user_config.token_dir}',
};
const SERVER_ENV = {
  'gws-admin': {
    GSM_ADMIN_SUBJECT: '${user_config.admin_subject}',
    GSM_SERVICE_ACCOUNT_KEY_FILE: '${user_config.service_account_key_file}',
  },
};

function entryFor(server) {
  return join(root, server.curated ?? `src/servers/${server.name}.ts`);
}

function apisOf(servers) {
  const seen = new Map();
  for (const s of servers) for (const a of s.apis ?? []) seen.set(`${a.api}.${a.version}`, a);
  return [...seen.values()];
}

async function bundleTo(entry, outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    // Some bundled dependencies (google-auth-library and friends) are CommonJS and call require().
    // An ESM bundle has no require, so define one that resolves Node built-ins.
    banner: {
      js: "import { createRequire as __gsmCreateRequire } from 'node:module'; const require = __gsmCreateRequire(import.meta.url);",
    },
  });
}

const summary = [];
for (const [pluginName] of Object.entries(map.plugins)) {
  const pluginDir = join(root, 'plugins', pluginName);
  const servers = map.servers.filter((s) => s.plugin === pluginName);
  if (!servers.length) throw new Error(`Plugin ${pluginName} has no servers in config/servers.json`);
  if (!existsSync(join(pluginDir, '.claude-plugin', 'plugin.json'))) {
    throw new Error(`Missing plugins/${pluginName}/.claude-plugin/plugin.json`);
  }

  // Start from a clean generated set so renamed servers do not linger.
  for (const sub of ['servers', 'bin', 'discovery']) rmSync(join(pluginDir, sub), { recursive: true, force: true });

  for (const server of servers) {
    const entry = entryFor(server);
    if (!existsSync(entry)) throw new Error(`Entry file missing for ${server.name}: ${entry}`);
    await bundleTo(entry, join(pluginDir, 'servers', `${server.name}.mjs`));
  }

  await bundleTo(join(root, 'src', 'cli', 'gsm.ts'), join(pluginDir, 'bin', 'gsm.mjs'));

  // Discovery snapshots this plugin's servers need.
  for (const { api, version } of apisOf(servers)) {
    const src = join(root, 'data', 'discovery', `${api}.${version}.json`);
    if (!existsSync(src)) throw new Error(`Missing discovery snapshot ${src}. Run: node scripts/snapshot-discovery.mjs`);
    mkdirSync(join(pluginDir, 'discovery'), { recursive: true });
    copyFileSync(src, join(pluginDir, 'discovery', `${api}.${version}.json`));
  }

  // Server map and scopes, trimmed to this plugin.
  const subsetMap = {
    plugins: { [pluginName]: map.plugins[pluginName] },
    groups: map.groups,
    servers,
  };
  writeFileSync(join(pluginDir, 'servers.json'), JSON.stringify(subsetMap, null, 2) + '\n');
  const subsetScopes = Object.fromEntries(servers.map((s) => [s.name, scopes[s.name] ?? []]));
  writeFileSync(join(pluginDir, 'scopes.json'), JSON.stringify(subsetScopes, null, 2) + '\n');

  // MCP config: one entry per server, values from the plugin's user config.
  const mcpServers = {};
  for (const server of servers) {
    mcpServers[server.name] = {
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/servers/' + server.name + '.mjs'],
      env: { ...SHARED_ENV, ...(SERVER_ENV[server.name] ?? {}) },
    };
  }
  writeFileSync(join(pluginDir, '.mcp.json'), JSON.stringify({ mcpServers }, null, 2) + '\n');

  summary.push(`${pluginName}: ${servers.map((s) => s.name).join(', ')}`);
}

console.log('Built plugins:');
for (const line of summary) console.log('  ' + line);
