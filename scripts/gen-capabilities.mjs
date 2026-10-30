#!/usr/bin/env node
/**
 * Writes the capability inventory from the built plugins:
 *   docs/CAPABILITIES.md            overview: every product, its server, login, tool counts, APIs
 *   docs/capabilities/<product>.md  every tool of that product: name, safety class, method, scopes
 *
 * Reads config/products.json, data/catalog.json and plugins/<id>/tool-map.json, so run it after
 * `npm run build`. Curated tools are the tools with no method id that are not gateway or list
 * tools; generated tools carry the Discovery method id; gateway tools are api_search, api_describe,
 * api_call; api_methods lists a server's generated methods.
 *
 * Usage: node scripts/gen-capabilities.mjs
 *        node scripts/gen-capabilities.mjs --check   exit 1 when a written file would change (writes nothing)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The toolset counts use the installer's own rule (src/cli/toolset-count.ts), compiled by npm run build.
const countModule = join(root, 'dist', 'cli', 'toolset-count.js');
if (!existsSync(countModule)) {
  console.error('dist/cli/toolset-count.js is missing. Run npm run build (or npx tsc -p tsconfig.json) first.');
  process.exit(1);
}
const { toolsetCount, RUNTIME_TOOL_NAMES } = await import(pathToFileURL(countModule).href);
const checkOnly = process.argv.includes('--check');
/** Files whose content differs from what this run builds (--check). */
const stale = [];

/** Writes a file, or with --check only compares it (line endings aside) and records it when it differs. */
function emit(file, text) {
  if (!checkOnly) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    return;
  }
  const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : undefined;
  if (current !== text) stale.push(relative(root, file).replace(/\\/g, '/'));
}
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

const products = readJson('config/products.json');
const catalog = readJson('data/catalog.json');
const marketplace = readJson('.claude-plugin/marketplace.json');

const GATEWAY_TOOLS = new Set(['api_search', 'api_describe', 'api_call']);
const LIST_TOOL = 'api_methods';

const LOGIN = {
  cloud: 'Desktop OAuth client, then `login cloud`',
  searchconsole: 'Desktop OAuth client, then `login searchconsole`',
  'workspace-user': 'Desktop OAuth client, then `login workspace-user`',
  'workspace-admin': 'Service account with domain-wide delegation, then `setup-admin`',
  'service-account': 'Service account key, then `setup-service-account` (no login)',
  business: 'Desktop OAuth client, then `login business`',
  developer: 'Desktop OAuth client, then `login developer`',
  apikey: 'API key, then `setup-apikey` (no login)',
};

const apiByKey = new Map(catalog.apis.map((a) => [`${a.name}/${a.version}`, a]));
const apiLine = (entry) => {
  const api = apiByKey.get(`${entry.api}/${entry.version}`);
  const methods = api ? api.methods.length : 0;
  return { key: `${entry.api}/${entry.version}`, title: api?.title ?? entry.api, methods };
};

function shortName(fullName, plugin, server) {
  const prefix = `mcp__plugin_${plugin}_${server}__`.replace(/[^A-Za-z0-9_-]/g, '_');
  return fullName.startsWith(prefix) ? fullName.slice(prefix.length) : fullName;
}

function classify(tool, short) {
  if (GATEWAY_TOOLS.has(short)) return 'gateway';
  if (short === LIST_TOOL) return 'list';
  if (tool.methodId) return 'generated';
  return 'curated';
}

const perProduct = [];
for (const [id, p] of Object.entries(products.products)) {
  const serverName = p.server?.name ?? id;
  const mapFile = join(root, 'plugins', id, 'tool-map.json');
  const tools = existsSync(mapFile)
    ? JSON.parse(readFileSync(mapFile, 'utf8')).map((t) => ({ ...t, short: shortName(t.name, id, serverName) }))
    : [];
  const rows = tools.map((t) => ({ ...t, group: classify(t, t.short) }));
  const count = (pred) => rows.filter(pred).length;
  perProduct.push({
    id,
    title: p.title,
    description: p.description,
    group: p.group,
    server: serverName,
    curatedModule: p.server?.curated ?? null,
    rows,
    counts: {
      total: rows.length,
      curated: count((r) => r.group === 'curated'),
      generated: count((r) => r.group === 'generated'),
      gateway: count((r) => r.group === 'gateway'),
      read: count((r) => r.kind === 'read'),
      write: count((r) => r.kind === 'write'),
      destructive: count((r) => r.kind === 'destructive'),
      dynamic: count((r) => r.kind === 'dynamic'),
    },
    generatedApis: (p.generated ?? []).map(apiLine),
    gatewayApis: (p.gateway ?? []).map(apiLine),
    unassigned: [],
    // Tools per toolset, from the tool map and the toolset rule. effective is all when the product lacks the toolset.
    toolsets: Object.fromEntries(
      ['all', 'google', 'curated'].map((t) => [t, existsSync(mapFile) ? toolsetCount(mapFile, id, serverName, t, toolsetLists(p)) : undefined]),
    ),
    google: p.toolsets?.google,
  });
}

/** A product's listed toolsets as tool names (what scripts/gen-servers.mjs writes into config/servers.json). */
function toolsetLists(product) {
  const google = product.toolsets?.google?.tools;
  return Array.isArray(google) ? { google } : undefined;
}

/** "106", or "106 (all)" when the product has no such toolset and falls back to all tools. */
function toolsetCell(count, toolset) {
  if (!count) return '?';
  return count.effective === toolset ? String(count.count) : `${count.count} (all)`;
}

const totals = perProduct.reduce(
  (acc, p) => {
    acc.tools += p.counts.total;
    acc.gatewayApis += p.gatewayApis.length;
    acc.generatedApis += p.generatedApis.length;
    acc.gatewayMethods += p.gatewayApis.reduce((n, a) => n + a.methods, 0);
    return acc;
  },
  { tools: 0, gatewayApis: 0, generatedApis: 0, gatewayMethods: 0 },
);

// ---- Per-product detail files ----
const detailDir = join(root, 'docs', 'capabilities');
for (const p of perProduct) {
  const lines = [];
  lines.push(`# ${p.title} (\`${p.id}\`)`);
  lines.push('');
  lines.push(p.description);
  lines.push('');
  lines.push(`- Plugin: \`${p.id}\`, MCP server: \`${p.server}\`, login: ${LOGIN[p.group] ?? p.group}`);
  lines.push(`- Install: \`claude plugin install ${p.id}@${marketplace.name}\``);
  lines.push(
    `- Tools: ${p.counts.total} total. Curated ${p.counts.curated}, per-method ${p.counts.generated}, gateway ${p.counts.gateway}. Read ${p.counts.read}, write ${p.counts.write}, destructive ${p.counts.destructive}, dynamic ${p.counts.dynamic}.`,
  );
  lines.push('');
  lines.push('Read tools never ask. Write, destructive and dynamic tools ask before they run, unless the plugin option `confirmation` is set to `off` or `destructive-only` (see docs/SECURITY.md).');
  lines.push('');
  const ts = p.toolsets;
  lines.push(
    `Toolsets (the plugin option \`toolset\`, \`GSM_TOOLSET\`): all ${toolsetCell(ts.all, 'all')}, google ${toolsetCell(ts.google, 'google')}, curated ${toolsetCell(ts.curated, 'curated')} tools, each with the ${RUNTIME_TOOL_NAMES.length} runtime tools of the map counted. "(all)" means the product has no such toolset yet, so it lists every tool.`,
  );
  lines.push('');
  if (p.google) {
    lines.push(`## Toolset google (${p.google.tools.length})`);
    lines.push('');
    const official = p.google.tools.some((tool) => (p.google.matches?.[tool] ?? []).length > 0);
    const source = Array.isArray(p.google.source) ? p.google.source.join(', ') : p.google.source;
    lines.push(
      official
        ? `The tools that match Google's official MCP server for this product${source ? ` (${source})` : ''}.`
        : `Google has no official MCP server for this product. The google toolset is a lean set chosen here${source ? `: ${source}` : ''}.`,
    );
    lines.push('');
    lines.push("| Tool | Google's tool | Note |");
    lines.push('|---|---|---|');
    for (const tool of p.google.tools) {
      const matches = p.google.matches?.[tool] ?? [];
      lines.push(`| \`${tool}\` | ${matches.length ? matches.map((m) => `\`${m}\``).join(', ') : '(none)'} | ${p.google.notes?.[tool] ?? ''} |`);
    }
    lines.push('');
  }
  for (const group of ['curated', 'generated', 'gateway', 'list']) {
    const set = p.rows.filter((r) => r.group === group);
    if (!set.length) continue;
    const heading = { curated: 'Curated tools', generated: 'Per-method tools', gateway: 'Gateway tools', list: 'Listing tool' }[group];
    lines.push(`## ${heading} (${set.length})`);
    lines.push('');
    lines.push('| Tool | Safety | Method or purpose | Scopes |');
    lines.push('|---|---|---|---|');
    for (const r of set) {
      const scopes = (r.scopes ?? []).slice(0, 2).map((s) => s.replace('https://www.googleapis.com/auth/', '')).join(', ');
      lines.push(`| \`${r.short}\` | ${r.kind} | ${r.methodId ?? r.title ?? ''} | ${scopes || '(none)'} |`);
    }
    lines.push('');
  }
  lines.push('## Generated APIs');
  lines.push('');
  if (!p.generatedApis.length) lines.push('None.');
  for (const a of p.generatedApis) lines.push(`- ${a.title} (\`${a.key}\`), ${a.methods} methods in the catalog`);
  lines.push('');
  lines.push('## Gateway APIs (reached through api_search, api_describe, api_call)');
  lines.push('');
  if (!p.gatewayApis.length) lines.push('None.');
  for (const a of p.gatewayApis) lines.push(`- ${a.title} (\`${a.key}\`), ${a.methods} methods`);
  lines.push('');
  emit(join(detailDir, `${p.id}.md`), lines.join('\n') + '\n');
}

// ---- Overview ----
const out = [];
out.push('# Capabilities');
out.push('');
out.push('Install with the simplest command: `npx google-services-mcps install --agent claude --plugin <id>` (see docs/TUTORIAL.md).');
out.push('');
out.push(
  `Generated by \`scripts/gen-capabilities.mjs\`. ${perProduct.length} products, each with one MCP server; ${totals.tools} tools built; ${catalog.apis.length} catalog entries (${catalog.methodCount ?? '?'} methods) in the Discovery catalog; ${totals.generatedApis} APIs with per-method tools and ${totals.gatewayApis} APIs through the gateway.`,
);
out.push('');
out.push('Each product has a file under `docs/capabilities/` that lists every tool.');
out.push('');
// The Toolsets column comes after APIs: scripts/gen-site.mjs reads the Tools and APIs columns next to each other.
out.push('| Product | What it covers | Server | Login | Tools (read / write / destructive / dynamic) | APIs (per-method / gateway) | Toolsets (all / google / curated) | Detail |');
out.push('|---|---|---|---|---|---|---|---|');
for (const p of perProduct) {
  const c = p.counts;
  const ts = p.toolsets;
  out.push(
    `| \`${p.id}\` | ${p.title}: ${p.description} | \`${p.server}\` | ${LOGIN[p.group] ?? p.group} | ${c.total} (${c.read} / ${c.write} / ${c.destructive} / ${c.dynamic}) | ${p.generatedApis.length} / ${p.gatewayApis.length} | ${toolsetCell(ts.all, 'all')} / ${toolsetCell(ts.google, 'google')} / ${toolsetCell(ts.curated, 'curated')} | [${p.id}](capabilities/${p.id}.md) |`,
  );
}
out.push('');
out.push(
  `Toolsets: the plugin option \`toolset\` (\`GSM_TOOLSET\`, \`gsm install --toolset\`) picks which tools a server lists. all is every tool (the default). google is the tools that match Google's official MCP server for the product, or a small set chosen here where Google has no server (gsc, gmeet, gtasks, gapps, gtm, gyoutube, gbusiness, gadmin, and gsearch beside its Developer Knowledge tools). curated is the hand-written tools and the gateway tools. "(all)" means the product has no such toolset yet, so it lists every tool. Each count includes the ${RUNTIME_TOOL_NAMES.length} runtime tools of the tool map (health, sign-in and account tools); a server lists only those of its sign-in kind, and write tools only when writes are allowed. Antigravity is reported to refuse a server with more than 100 tools (not verified); \`gsm install --agent agy\` warns.`,
);
out.push('');
out.push('## What the safety classes mean');
out.push('');
out.push('- **read**: never asks. Lists, gets, searches and reports.');
out.push('- **write**: creates or changes data. Asks first unless the confirmation option is off.');
out.push('- **destructive**: deletes, removes, sends, disables or otherwise cannot be undone easily. Asks first, and the confirmation is shown twice (hook prompt and exact preview), unless the option is off.');
out.push('- **dynamic**: the risk depends on the call. Google Ads mutate is read when validateOnly is set, destructive when any operation removes, and write otherwise.');
out.push('');
out.push('## Gateway tools (products with gateway APIs)');
out.push('');
out.push('Products with gateway APIs also expose `api_search`, `api_describe` and `api_call`, which reach those APIs.');
out.push('');
out.push('- `api_search`: find methods by text in an API the product covers. Read.');
out.push('- `api_describe`: parameters, request body and scopes of one method. Read.');
out.push('- `api_call`: call any method of the product, subject to the same safety classes.');
out.push('');
emit(join(root, 'docs', 'CAPABILITIES.md'), out.join('\n') + '\n');
if (checkOnly) {
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}. Run: node scripts/gen-capabilities.mjs`);
    process.exit(1);
  }
  console.log(`docs/CAPABILITIES.md and ${perProduct.length} files under docs/capabilities/ are up to date: ${totals.tools} tools`);
} else {
  console.log(`wrote docs/CAPABILITIES.md and ${perProduct.length} files under docs/capabilities/: ${totals.tools} tools`);
}
