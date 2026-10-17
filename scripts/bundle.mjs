#!/usr/bin/env node
/**
 * Builds the installable product plugins: one folder per product, plugins/<product id>/.
 * config/products.json is the source of truth; config/servers.json is generated from it
 * (scripts/gen-servers.mjs). Each product is one plugin with one MCP server.
 *
 * Steps:
 *   1. Compile src to dist (tsc -p tsconfig.json), so the helpers the build imports are current.
 *      Then bundle the installer to gsm.mjs at the repo root (from src/cli/gsm.ts): `node gsm.mjs` works from any folder.
 *   2. Clean the generated parts of each plugin folder. Other files are left alone.
 *   3. Per plugin:
 *      servers/<server>.mjs       bundled from build/entries/<server>.ts (curated, discovery and gateway tools)
 *      bin/gsm.mjs                the CLI (bundled from src/cli/gsm.ts)
 *      bin/gsm-hook.mjs           the PreToolUse consent hook (bundled from src/hook/pretooluse.ts)
 *      tool-kinds.json            safety overrides for Discovery methods (config/tool-kinds.json)
 *      discovery/<api>.<v>.json   the Discovery snapshots of the product's generated APIs
 *      catalog.json               the catalog subset of the product's gateway APIs
 *      method-kinds.json          read, write, dynamic or destructive for every gateway method (used by the hook)
 *      tool-map.json              every tool of the server, from --dump-tools, with its full Claude name
 *      servers.json, scopes.json, .mcp.json, hooks/hooks.json, .claude-plugin/plugin.json, skills/<id>/SKILL.md
 *   4. .claude-plugin/marketplace.json, one entry per product.
 *
 * A product that fails is reported and the others are still built; the exit code is 1 then.
 *
 * Usage: npm run build   (needs data/discovery, data/scopes.json and data/catalog.json; see
 * scripts/snapshot-discovery.mjs and scripts/build-catalog.mjs)
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR = { name: 'FiredMosquito831' };
const MANIFEST_VERSION = '1.0.1';
const TOOL_NAME_MAX = 64;
/** When two API versions give one method two kinds, the riskier one is kept. A dynamic method is kept as dynamic (decided per call). */
const RANK = { read: 0, write: 1, dynamic: 2, destructive: 3 };

const readJson = (file) => {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const posix = (p) => p.split(sep).join('/');

const products = readJson(join(ROOT, 'config', 'products.json')).products;
const map = readJson(join(ROOT, 'config', 'servers.json'));
const toolKinds = readJson(join(ROOT, 'config', 'tool-kinds.json'));
const scopesAll = readJson(join(ROOT, 'data', 'scopes.json'));
const catalog = readJson(join(ROOT, 'data', 'catalog.json'));
const pluginsDir = join(ROOT, 'plugins');
const entryDir = join(ROOT, 'build', 'entries');

/** Safety overrides keyed by method id. The "notes" object is documentation, not an override. */
const overrides = Object.fromEntries(Object.entries(toolKinds).filter(([k, v]) => k !== 'notes' && typeof v === 'string'));

/** Generated parts of a plugin folder. Anything else in the folder is kept. */
const GENERATED = [
  'servers',
  'bin',
  'discovery',
  'hooks',
  'skills',
  'tool-map.json',
  'method-kinds.json',
  'catalog.json',
  'tool-kinds.json',
  'servers.json',
  'scopes.json',
  '.mcp.json',
];

/** Per-server environment in .mcp.json. Values come from the plugin's user config. */
function serverEnv(group, serverName) {
  const env = {
    GSM_ALLOW_WRITES: '${user_config.allow_writes}',
    GSM_CONFIRMATION: '${user_config.confirmation}',
    GSM_TOKEN_DIR: '${user_config.token_dir}',
    GSM_HOOK_ACTIVE: '1',
  };
  if (group === 'workspace-admin') {
    env.GSM_ADMIN_SUBJECT = '${user_config.admin_subject}';
    env.GSM_SERVICE_ACCOUNT_KEY_FILE = '${user_config.service_account_key_file}';
  }
  // Empty values fall back to the token-directory file, so an unset option is harmless.
  if (serverName === 'gads') {
    env.GSM_ADS_DEVELOPER_TOKEN = '${user_config.ads_developer_token}';
    env.GSM_ADS_LOGIN_CUSTOMER_ID = '${user_config.ads_login_customer_id}';
  }
  return env;
}

const CONSENT_CONFIG = {
  allow_writes: {
    type: 'boolean',
    title: 'Allow write tools',
    description:
      'Modifying and deleting tools are listed only when this is on, and every change still asks first unless confirmation is off.',
    default: false,
  },
  confirmation: {
    type: 'string',
    title: 'Confirm before changes',
    description:
      'every-change asks before any change or delete (recommended). destructive-only asks only before deleting or sending. off asks for nothing; deny rules still apply. Change it here at any time.',
    options: ['every-change', 'destructive-only', 'off'],
    default: 'every-change',
  },
  token_dir: {
    type: 'string',
    title: 'Token directory (optional)',
    description: 'Where OAuth tokens are stored. Leave empty for ~/.google-services-mcps.',
    required: false,
  },
};

const ADS_CONFIG = {
  ads_developer_token: {
    type: 'string',
    title: 'Google Ads developer token (optional)',
    description:
      'Optional. Google Ads access is granted to the Cloud project of your OAuth client; the developer token is no longer required. Sent only when set. Stored in the system credential store, not in a file. Leave empty to use the token-directory file instead.',
    sensitive: true,
    required: false,
  },
  ads_login_customer_id: {
    type: 'string',
    title: 'Manager (login) customer ID (optional)',
    description: '10-digit ID of the manager account, without dashes, when you reach client accounts through one.',
    required: false,
  },
};

const ADMIN_CONFIG = {
  admin_subject: {
    type: 'string',
    title: 'Workspace super admin email (admin tools only)',
    description: 'A super admin in your domain. The admin server impersonates this account through domain-wide delegation.',
    required: false,
  },
  service_account_key_file: {
    type: 'file',
    title: 'Service account key file (admin tools only)',
    description: 'JSON key of the service account that has domain-wide delegation for the admin scopes.',
    required: false,
  },
};

/** Import specifier from a generated entry to a file under src, with the .js extension TypeScript uses. */
function importFromEntry(absPath) {
  const rel = posix(relative(entryDir, absPath)).replace(/\.ts$/, '.js');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Source of build/entries/<server>.ts. The curated module (if any) comes first, then the Discovery
 * tools, then the gateway tools. Each part is included only when the server has it.
 *
 * The Discovery tools are given the curated tool names as reserved, so a generated method that
 * would take a curated name gets its hashed form instead (see assignToolNames). The curated names
 * are read from the curated module at run time, so they are always the ones the server registers.
 */
function entrySource(product, server, curatedFile) {
  const lines = ['// Generated by scripts/bundle.mjs. Do not edit: build/ is git-ignored and rebuilt by npm run build.'];
  const parts = [];
  if (curatedFile) {
    lines.push(`import { buildTools as curatedTools } from '${importFromEntry(join(ROOT, curatedFile))}';`);
    parts.push('...curated');
  }
  if ((server.apis ?? []).length > 0) {
    lines.push(
      `import { discoveryToolsFor, toolNamesOf } from '${importFromEntry(join(ROOT, 'src', 'core', 'discovery', 'tools.ts'))}';`,
    );
    const reserved = curatedFile ? 'toolNamesOf(curated)' : '[]';
    parts.push(`...(await discoveryToolsFor('${server.name}', cfg, ${reserved}))`);
  }
  if ((server.gatewayApis ?? []).length > 0) {
    lines.push(`import { gatewayTools } from '${importFromEntry(join(ROOT, 'src', 'core', 'gateway.ts'))}';`);
    parts.push(`...gatewayTools({ product: '${product}', group: '${server.group}', apis: ${JSON.stringify(server.gatewayApis)}, cfg })`);
  }
  lines.push(`import { runServer } from '${importFromEntry(join(ROOT, 'src', 'core', 'tools.ts'))}';`, '');

  lines.push('await runServer({');
  lines.push(`  name: '${server.name}',`);
  lines.push(`  version: '${MANIFEST_VERSION}',`);
  lines.push('  buildTools: async (cfg) => {');
  if (curatedFile) lines.push('    const curated = await curatedTools(cfg);');
  lines.push('    return [');
  for (const p of parts) lines.push(`      ${p},`);
  lines.push('    ];', '  },', '});', '');
  return lines.join('\n');
}

/**
 * Bundles one entry file, minified (names kept off, no sourcemap). The banner gives the CommonJS
 * dependencies a require() in ESM output. It is plain text, not minified, so it works either way.
 */
async function bundleTo(entry, outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: true,
    keepNames: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    banner: {
      js: "import { createRequire as __gsmCreateRequire } from 'node:module'; const require = __gsmCreateRequire(import.meta.url);",
    },
  });
}

/** Runs one bundled server with --dump-tools. Its stderr lines are printed under the server's name. */
function dumpTools(serverFile, tokenDir, label) {
  const res = spawnSync(process.execPath, [serverFile, '--dump-tools'], {
    env: { ...process.env, GSM_ALLOW_WRITES: 'true', GSM_TOKEN_DIR: tokenDir },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  for (const line of (res.stderr ?? '').split(/\r?\n/)) if (line.trim()) console.log(`  ${label}: ${line.trim()}`);
  if (res.status !== 0) throw new Error(`${label} --dump-tools exited with ${res.status}`);
  const parsed = JSON.parse(res.stdout);
  if (!Array.isArray(parsed.tools)) throw new Error(`${label} --dump-tools printed no tools array`);
  return parsed.tools;
}

/** Full Claude tool name: mcp__plugin_<plugin>_<server>__<tool>, with characters outside A-Za-z0-9_- replaced by "_". */
function fullToolName(plugin, server, tool) {
  return `mcp__plugin_${plugin}_${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, '_');
}

function toolMapFrom(plugin, server, dumped) {
  const seen = new Set();
  return dumped.map((t) => {
    const name = fullToolName(plugin, server, t.name);
    if (name.length > TOOL_NAME_MAX) throw new Error(`${name} is ${name.length} characters (limit ${TOOL_NAME_MAX})`);
    if (seen.has(name)) throw new Error(`${plugin}/${server}: duplicate tool name ${name}`);
    seen.add(name);
    const entry = { name, kind: t.kind, scopes: t.scopes ?? [] };
    if (t.methodId !== undefined) entry.methodId = t.methodId;
    if (t.title !== undefined) entry.title = t.title;
    return entry;
  });
}

/**
 * Kind of every gateway method of a product, keyed by method id. The gateway keeps the first catalog
 * entry of an id, and the hook must never be looser than the gateway, so when API versions disagree
 * the riskier kind is kept. A dynamic method is written as dynamic: the hook decides it per call from
 * the request body (src/core/dynamic.ts), and a dynamic method is never forced to read or write.
 */
function methodKindsFor(gatewayApis, methods) {
  const table = {};
  for (const ref of gatewayApis) {
    const api = catalog.apis.find((a) => a.name === ref.api && a.version === ref.version);
    if (!api) throw new Error(`Gateway API ${ref.api}.${ref.version} is not in data/catalog.json`);
    for (const m of api.methods) {
      if (!Array.isArray(m)) throw new Error(`Catalog method of ${ref.api}.${ref.version} is not an array`);
      const [id, httpMethod] = m;
      const methodName = id.slice(id.lastIndexOf('.') + 1);
      const kind = methods.classifyMethod(httpMethod, methodName, id, overrides);
      if (!(kind in RANK)) throw new Error(`classifyMethod returned ${kind} for ${id}`);
      if (table[id] === undefined || RANK[kind] > RANK[table[id]]) table[id] = kind;
    }
  }
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Catalog subset of the gateway APIs, in catalog order. */
function catalogSubset(gatewayApis) {
  const keys = new Set(gatewayApis.map((g) => `${g.api}.${g.version}`));
  const apis = catalog.apis.filter((a) => keys.has(`${a.name}.${a.version}`));
  const methodCount = apis.reduce((n, a) => n + a.methods.length, 0);
  return { generatedAt: catalog.generatedAt, apiCount: apis.length, methodCount, apis };
}

/** Scopes the curated tools of one server ask for: the union of their tool scopes. */
async function curatedScopes(curatedFile, dist) {
  const mod = await import(pathToFileURL(join(ROOT, 'dist', curatedFile.replace(/^src\//, '').replace(/\.ts$/, '.js'))).href);
  const tools = await mod.buildTools(dist.loadConfig());
  return [...new Set(tools.flatMap((t) => t.scopes ?? []))].sort();
}

function pluginManifest(product, id, group) {
  const userConfig = { ...CONSENT_CONFIG };
  if (group === 'workspace-admin') Object.assign(userConfig, ADMIN_CONFIG);
  if (id === 'gads') Object.assign(userConfig, ADS_CONFIG);
  return {
    name: id,
    displayName: product.title,
    version: MANIFEST_VERSION,
    description: product.description,
    author: AUTHOR,
    keywords: ['google', 'mcp', id, group],
    userConfig,
  };
}

function hooksFile(id) {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: `^mcp__plugin_${id}_`,
          hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/gsm-hook.mjs'], timeout: 10 }],
        },
      ],
    },
  };
}

/** How to log in, per auth group. The plugin folder is written as <plugin> in the skill. */
const LOGIN_TEXT = {
  cloud: (p) =>
    `Sign in with the OAuth desktop client, once: \`node ${p}/bin/gsm.mjs setup-client <client_secret.json>\`, then \`node ${p}/bin/gsm.mjs login cloud\`. Application Default Credentials also work for this group.`,
  'workspace-user': (p) =>
    `Sign in with the OAuth desktop client, once: \`node ${p}/bin/gsm.mjs setup-client <client_secret.json>\`, then \`node ${p}/bin/gsm.mjs login workspace-user\`.`,
  searchconsole: (p) =>
    `Sign in with the OAuth desktop client, once: \`node ${p}/bin/gsm.mjs setup-client <client_secret.json>\`, then \`node ${p}/bin/gsm.mjs login searchconsole\`.`,
  business: (p) =>
    `Sign in with the OAuth desktop client, once: \`node ${p}/bin/gsm.mjs setup-client <client_secret.json>\`, then \`node ${p}/bin/gsm.mjs login business\`.`,
  developer: (p) =>
    `Sign in with the OAuth desktop client, once: \`node ${p}/bin/gsm.mjs setup-client <client_secret.json>\`, then \`node ${p}/bin/gsm.mjs login developer\`.`,
  apikey: (p) => `No sign-in. Store the API key once: \`node ${p}/bin/gsm.mjs setup-apikey\`, which reads the key from GSM_API_KEY_INPUT or stdin.`,
  'workspace-admin': (p) =>
    `Use a service account with domain-wide delegation: \`node ${p}/bin/gsm.mjs setup-admin --subject <super admin email> --key-file <service account JSON>\`.`,
  'service-account': (p) =>
    `No sign-in. Add the service account's email in Play Console (Users and permissions) or Merchant Center (Admin), then set up its key once: \`node ${p}/bin/gsm.mjs setup-service-account --key-file <service account JSON>\`. Or set GOOGLE_APPLICATION_CREDENTIALS to the key.`,
};

function skillFile(product, id, server, toolCount, titles) {
  const generated = titles.generated.map((a) => `- ${a.title} (${a.api} ${a.version})`);
  const gateway = titles.gateway.map((a) => `- ${a.title} (${a.api} ${a.version}), reached through api_search, api_describe and api_call`);
  return [
    '---',
    `name: ${id}`,
    `description: ${product.description} Served by the ${server} MCP server with ${toolCount} tools. Use for requests about these Google APIs.`,
    '---',
    '',
    `# ${product.title}`,
    '',
    product.description,
    '',
    [
      `The \`${server}\` MCP server exposes ${toolCount} tools.`,
      titles.generated.length ? 'Per-method tools cover the Discovery APIs listed below.' : '',
      titles.gateway.length
        ? 'Gateway APIs are reached through three generic tools: api_search finds a method, api_describe shows its parameters, and api_call runs it.'
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    '',
    '## Log in',
    '',
    `Replace \`<plugin>\` with this plugin's folder, the one that holds \`bin/gsm.mjs\`. ${LOGIN_TEXT[product.group]('<plugin>')}`,
    '',
    '## Safety',
    '',
    'Reads never ask for approval. Changes and deletions ask first, unless the user has set the confirmation option to off in the plugin settings. Deny, ask and allow rules in the policy file (policy.json in the token directory) apply on top of this.',
    '',
    '## APIs',
    '',
    ...generated,
    ...gateway,
    '',
  ].join('\n');
}

/** Builds one product's plugin folder. Returns its summary line. */
async function buildPlugin(id, product, ctx) {
  const pluginDir = join(pluginsDir, id);
  const server = map.servers.find((s) => s.plugin === id);
  if (!server) throw new Error(`No server for product ${id} in config/servers.json. Run node scripts/gen-servers.mjs.`);
  if (server.name !== product.server.name) throw new Error(`Server name for ${id} differs between products.json and servers.json`);

  // Clean the generated parts of this plugin.
  for (const item of GENERATED) rmSync(join(pluginDir, item), { recursive: true, force: true });
  mkdirSync(pluginDir, { recursive: true });

  // The server bundle, from a generated entry.
  const curatedFile = server.curated ?? null;
  if (curatedFile && !existsSync(join(ROOT, curatedFile))) throw new Error(`Curated module missing: ${curatedFile}`);
  const entry = join(entryDir, `${server.name}.ts`);
  mkdirSync(entryDir, { recursive: true });
  writeFileSync(entry, entrySource(id, server, curatedFile), 'utf8');
  const serverFile = join(pluginDir, 'servers', `${server.name}.mjs`);
  await bundleTo(entry, serverFile);

  // The CLI and the consent hook.
  await bundleTo(join(ROOT, 'src', 'cli', 'gsm.ts'), join(pluginDir, 'bin', 'gsm.mjs'));
  await bundleTo(join(ROOT, 'src', 'hook', 'pretooluse.ts'), join(pluginDir, 'bin', 'gsm-hook.mjs'));

  // Safety overrides and the Discovery snapshots of the generated APIs.
  writeJson(join(pluginDir, 'tool-kinds.json'), toolKinds);
  for (const { api, version } of server.apis ?? []) {
    const src = join(ROOT, 'data', 'discovery', `${api}.${version}.json`);
    if (!existsSync(src)) throw new Error(`Missing discovery snapshot ${src}. Run: node scripts/snapshot-discovery.mjs`);
    mkdirSync(join(pluginDir, 'discovery'), { recursive: true });
    copyFileSync(src, join(pluginDir, 'discovery', `${api}.${version}.json`));
  }

  // Gateway: the catalog subset, and the kind of every gateway method for the hook.
  const gateway = server.gatewayApis ?? [];
  let methodKinds = null;
  if (gateway.length) {
    writeJson(join(pluginDir, 'catalog.json'), catalogSubset(gateway));
    methodKinds = methodKindsFor(gateway, ctx.methods);
    writeJson(join(pluginDir, 'method-kinds.json'), methodKinds);
  }

  // Tool map: what the bundled server registers with writes on, with full Claude names.
  const dumped = dumpTools(serverFile, ctx.tokenDir, server.name);
  const toolMap = toolMapFrom(id, server.name, dumped);
  writeJson(join(pluginDir, 'tool-map.json'), toolMap);

  // Registry and scope subsets for this plugin. A curated server's scopes come from its curated tools.
  const scopes = curatedFile ? await curatedScopes(curatedFile, ctx.dist) : [];
  const { label, ...rest } = server;
  writeJson(join(pluginDir, 'servers.json'), {
    $comment: `Generated by scripts/bundle.mjs for the ${id} plugin. Do not edit.`,
    plugins: { [id]: map.plugins[id] },
    groups: { [server.group]: map.groups[server.group] },
    servers: [{ ...rest, ...(scopes.length ? { scopes } : {}), label }],
  });
  writeJson(join(pluginDir, 'scopes.json'), { [server.name]: scopesAll[server.name] ?? [] });

  // MCP config, hook config, plugin manifest and skill.
  writeJson(join(pluginDir, '.mcp.json'), {
    mcpServers: {
      [server.name]: {
        command: 'node',
        args: [`\${CLAUDE_PLUGIN_ROOT}/servers/${server.name}.mjs`],
        env: serverEnv(server.group, server.name),
      },
    },
  });
  writeJson(join(pluginDir, 'hooks', 'hooks.json'), hooksFile(id));
  writeJson(join(pluginDir, '.claude-plugin', 'plugin.json'), pluginManifest(product, id, server.group));

  const titles = { generated: [], gateway: [] };
  for (const { api, version } of server.apis ?? []) {
    const doc = readJson(join(ROOT, 'data', 'discovery', `${api}.${version}.json`));
    titles.generated.push({ api, version, title: doc.title ?? `${api} ${version}` });
  }
  for (const ref of gateway) {
    const api = catalog.apis.find((a) => a.name === ref.api && a.version === ref.version);
    titles.gateway.push({ ...ref, title: api?.title ?? `${ref.api} ${ref.version}` });
  }
  mkdirSync(join(pluginDir, 'skills', id), { recursive: true });
  writeFileSync(join(pluginDir, 'skills', id, 'SKILL.md'), skillFile(product, id, server.name, toolMap.length, titles), 'utf8');

  return {
    id,
    tools: toolMap.length,
    gatewayMethods: methodKinds ? Object.keys(methodKinds).length : 0,
    generatedApis: (server.apis ?? []).length,
    gatewayApis: gateway.length,
  };
}

async function main() {
  // 1. Compile, so dist/ holds the helpers the build imports.
  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const compiled = spawnSync(process.execPath, [tsc, '-p', join(ROOT, 'tsconfig.json')], { cwd: ROOT, stdio: 'inherit' });
  if (compiled.status !== 0) throw new Error('tsc failed, so dist/ is not current. Fix the compile errors and run the build again.');
  const methods = await import(pathToFileURL(join(ROOT, 'dist', 'core', 'discovery', 'methods.js')).href);
  const dist = await import(pathToFileURL(join(ROOT, 'dist', 'core', 'config.js')).href);

  // The installer at the repo root, gsm.mjs. It is bundled from the same CLI source as each plugin's bin/gsm.mjs. It finds
  // the plugins in this repository, so `node gsm.mjs ...` works from any folder and does not need dist/.
  await bundleTo(join(ROOT, 'src', 'cli', 'gsm.ts'), join(ROOT, 'gsm.mjs'));
  console.log('built gsm.mjs (the installer at the repo root)');

  // Every folder under plugins/ must be a product. A stale folder stops the build, so none ships by accident.
  const stale = existsSync(pluginsDir)
    ? readdirSync(pluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !(d.name in products))
        .map((d) => d.name)
    : [];
  if (stale.length) throw new Error(`plugins/ has folders that are not products: ${stale.join(', ')}. Delete them, then build again.`);

  rmSync(entryDir, { recursive: true, force: true });
  const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-dump-'));
  const ctx = { methods, dist, tokenDir };
  const built = [];
  const failures = [];
  try {
    for (const [id, product] of Object.entries(products)) {
      try {
        built.push(await buildPlugin(id, product, ctx));
        console.log(`built ${id}`);
      } catch (err) {
        failures.push(`${id}: ${err.message}`);
        console.error(`FAILED ${id}: ${err.message}`);
      }
    }
  } finally {
    rmSync(tokenDir, { recursive: true, force: true });
  }

  // Marketplace: one entry per product.
  const marketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json');
  const marketplace = readJson(marketplacePath);
  writeJson(marketplacePath, {
    name: marketplace.name,
    owner: marketplace.owner,
    description: 'One plugin per Google product. Install the products you need, then turn each server on or off for a session with /mcp.',
    plugins: Object.entries(products).map(([id, p]) => ({ name: id, source: `./plugins/${id}`, description: p.description })),
  });

  console.log('\nplugin      tools  gateway methods  generated APIs  gateway APIs');
  for (const s of built) {
    console.log(
      `${s.id.padEnd(11)} ${String(s.tools).padStart(5)} ${String(s.gatewayMethods).padStart(16)} ${String(s.generatedApis).padStart(15)} ${String(s.gatewayApis).padStart(13)}`,
    );
  }
  console.log(`built ${built.length} of ${Object.keys(products).length} plugins, ${built.reduce((n, s) => n + s.tools, 0)} tools in total`);
  if (failures.length) {
    throw new Error(`${failures.length} plugin(s) failed:\n  ${failures.join('\n  ')}`);
  }
}

main().catch((err) => {
  console.error(`bundle: ${err.message}`);
  process.exitCode = 1;
});
