#!/usr/bin/env node
/**
 * Writes the product table in README.md, between the markers
 *   <!-- products:start -->  and  <!-- products:end -->
 *
 * Reads config/products.json (product ids, titles, login groups, generated and gateway API lists) and
 * plugins/<id>/tool-map.json for the tool count. When a plugin folder has no tool-map.json, the count
 * falls back to generatedToolCount in config/products.json. Only the marked block of README.md changes.
 * Uses Node built-ins and the compiled dist/core/runtime-tools.js (the rule for which map entries a server registers).
 * Run it after `npm run build` so that the tool maps and dist/ exist.
 *
 * Usage:
 *   node scripts/gen-readme.mjs          rewrite the marked block
 *   node scripts/gen-readme.mjs --check  exit 1 when the marked block is out of date (writes nothing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(root, 'README.md');
const START = '<!-- products:start -->';
const END = '<!-- products:end -->';
const MAX_DESCRIPTION = 120;
const checkOnly = process.argv.includes('--check');

const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'products.json'), 'utf8'));
const products = config.products;

// The tools a server registers (src/core/runtime-tools.ts, the rule the skills and docs/CAPABILITIES.md count with).
const runtimeModule = path.join(root, 'dist', 'core', 'runtime-tools.js');
if (!fs.existsSync(runtimeModule)) {
  console.error('dist/core/runtime-tools.js is missing. Run npm run build (or npx tsc -p tsconfig.json) first.');
  process.exit(1);
}
const { registersEntry } = await import(pathToFileURL(runtimeModule).href);
const { SERVICE_ACCOUNT_SCOPES_BY_SERVER } = await import(pathToFileURL(path.join(root, 'dist', 'core', 'service-account-scopes.js')).href);

/**
 * Count the tools the server registers, from the built tool map (registersEntry: without the runtime tools of other
 * sign-in kinds, and for the service-account group without tools its key never covers), or fall back to the count
 * recorded in config/products.json.
 */
function toolCount(id) {
  const mapPath = path.join(root, 'plugins', id, 'tool-map.json');
  if (fs.existsSync(mapPath)) {
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (!Array.isArray(map)) throw new Error(`${id}: plugins/${id}/tool-map.json is not an array`);
    const p = products[id];
    const server = p.server?.name ?? id;
    const keyScopes = p.group === 'service-account' ? SERVICE_ACCOUNT_SCOPES_BY_SERVER[server] ?? [] : undefined;
    const prefix = `mcp__plugin_${id}_${server}__`;
    const count = map.filter((t) => registersEntry(t.name.startsWith(prefix) ? t.name.slice(prefix.length) : t.name, t.scopes, p.group, keyScopes)).length;
    return { count, source: 'tool-map' };
  }
  return { count: products[id].generatedToolCount, source: 'config' };
}

const CLAUSE_BREAKS = [', ', ' that ', ' plus ', ' with ', ': '];

/** True when every "(" in the text has its ")" before the end. */
function balanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** The longest clause-break cut that fits, keeps parentheses balanced and leaves a readable phrase. */
function clauseCut(text) {
  let best = -1;
  for (const brk of CLAUSE_BREAKS) {
    let at = text.indexOf(brk);
    while (at !== -1) {
      if (at >= 30 && at <= MAX_DESCRIPTION - 3 && balanced(text.slice(0, at)) && at > best) best = at;
      at = text.indexOf(brk, at + 1);
    }
  }
  return best;
}

/**
 * A short "what it manages" text. A description that fits is used whole. Otherwise it is cut at a clause
 * boundary, and parenthesised lists are dropped when no boundary falls outside them. Cut text ends with "...".
 */
function summary(text) {
  if (text.length <= MAX_DESCRIPTION) return text;
  let at = clauseCut(text);
  let base = text;
  if (at === -1) {
    base = text.replace(/\s*\([^()]*\)/g, '');
    at = clauseCut(base);
  }
  if (at === -1) {
    at = base.slice(0, MAX_DESCRIPTION - 3).lastIndexOf(' ');
  }
  return `${base.slice(0, at).replace(/[\s,;:]+$/, '')}...`;
}

/** Escape text for a Markdown table cell. */
function cell(text) {
  return String(text).replace(/\|/g, '\\|');
}

function buildBlock() {
  const rows = [];
  let totalTools = 0;
  let totalGateway = 0;
  let fromConfig = [];
  for (const id of Object.keys(products)) {
    const p = products[id];
    const docPath = `docs/products/${id}.md`;
    if (!fs.existsSync(path.join(root, docPath))) throw new Error(`missing ${docPath}`);
    const tools = toolCount(id);
    if (tools.source === 'config') fromConfig.push(id);
    const gateway = p.gateway.length;
    totalTools += tools.count;
    totalGateway += gateway;
    rows.push(
      `| [\`${id}\`](${docPath}) | ${cell(summary(p.description))} | \`${p.group}\` | ${tools.count} | ${gateway} | \`npx google-services-mcps install --agent claude --plugin ${id}\` |`,
    );
  }
  const lines = [
    START,
    '',
    'Generated by `scripts/gen-readme.mjs` from `config/products.json` and `plugins/<id>/tool-map.json`. Edit the generator, not this table.',
    '',
    '| Product | What it manages | Login group | Tools | Gateway APIs | Install (Claude Code) |',
    '|---|---|---|---:|---:|---|',
    ...rows,
    '',
    `**Totals:** ${Object.keys(products).length} products, ${totalTools} tools, ${totalGateway} gateway APIs.`,
    '',
    "**Tools** counts the tools the plugin's server registers: every per-method, hand-written and `api_*` gateway tool, and its own runtime tools (`health` and the sign-in tools of its group). Write and destructive tools are listed only when **Allow write tools** is on. **Gateway APIs** are reached through `api_search`, `api_describe` and `api_call`.",
    END,
  ];
  return { block: lines.join('\n'), totalTools, totalGateway, fromConfig };
}

const { block, totalTools, totalGateway, fromConfig } = buildBlock();
const readme = fs.readFileSync(readmePath, 'utf8');
const startAt = readme.indexOf(START);
const endAt = readme.indexOf(END);
if (startAt < 0 || endAt < 0) throw new Error(`README.md needs both ${START} and ${END}`);
if (readme.indexOf(START, startAt + 1) >= 0 || readme.indexOf(END, endAt + 1) >= 0) {
  throw new Error('README.md has more than one products block');
}
if (endAt < startAt) throw new Error('the products:end marker comes before products:start');

const updated = readme.slice(0, startAt) + block + readme.slice(endAt + END.length);
const note = fromConfig.length ? ` (tool counts from config/products.json for: ${fromConfig.join(', ')})` : '';

if (checkOnly) {
  if (updated !== readme) {
    console.error('README.md products block is out of date. Run: node scripts/gen-readme.mjs');
    process.exit(1);
  }
  console.log(`README.md products block is up to date: ${Object.keys(products).length} products, ${totalTools} tools, ${totalGateway} gateway APIs${note}.`);
  process.exit(0);
}

if (updated === readme) {
  console.log(`README.md products block unchanged: ${Object.keys(products).length} products, ${totalTools} tools, ${totalGateway} gateway APIs${note}.`);
} else {
  fs.writeFileSync(readmePath, updated, 'utf8');
  console.log(`README.md products block written: ${Object.keys(products).length} products, ${totalTools} tools, ${totalGateway} gateway APIs${note}.`);
}
