/**
 * Read-only listings for `gsm products`, `gsm apis`, `gsm methods` and `gsm version`.
 * None of them writes a file or calls Google.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActionKind } from '../core/tools.js';
import type { Registry } from '../core/registry.js';
import { loadCatalog, loadKindOverrides, type Catalog, type CatalogApi } from './catalog.js';
import type { InstallRoots } from './paths.js';
import { productRows, type ApiEntry, type ProductRow } from './products.js';
import { loadClassifier } from './method-kinds.js';
import type { Output } from './report.js';
import { formatTable, truncate } from './table.js';
import { UsageError } from './types.js';

export interface ListingEnv {
  roots: InstallRoots;
  registry: Registry;
  /** The CLI file's URL, used to find the catalog and the classifier. */
  moduleUrl: string;
  out: Output;
}

/** `gsm methods` prints this many rows unless --limit is given. */
export const METHODS_DEFAULT_LIMIT = 200;

// ---------- products ----------

function productJson(row: ProductRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    group: row.group,
    tools: row.tools ?? null,
    toolSource: row.toolSource,
    generatedApis: row.generated.length,
    gatewayApis: row.gateway.length,
    pluginFolder: row.folderExists,
    folder: row.folder,
  };
}

export function runProducts(env: ListingEnv, json: boolean): number {
  const rows = productRows(env.roots, env.registry);
  if (json) {
    env.out.log(JSON.stringify(rows.map(productJson), null, 2));
    return 0;
  }
  const table = formatTable(
    ['ID', 'TITLE', 'GROUP', 'TOOLS', 'GENERATED', 'GATEWAY', 'FOLDER'],
    rows.map((r) => [
      r.id,
      truncate(r.title, 48),
      r.group,
      r.tools === undefined ? '-' : String(r.tools),
      String(r.generated.length),
      String(r.gateway.length),
      r.folderExists ? 'yes' : 'no',
    ]),
  );
  for (const line of table) env.out.log(line);
  env.out.log('');
  env.out.log(
    `${rows.length} products. TOOLS is the per-method tool count in the plugin's tool-map.json, ` +
      'or generatedToolCount in config/products.json when the plugin folder has no tool-map.json.',
  );
  return 0;
}

// ---------- apis ----------

export interface ApisRequest {
  /** A product id. Undefined lists every API of the catalog. */
  product?: string;
  search?: string;
  limit?: number;
  json: boolean;
}

interface ApiListing {
  name: string;
  version: string;
  title: string;
  /** Method count from the catalog, or null when the catalog has no such API. */
  methods: number | null;
  /** generated or gateway. For the whole catalog: unassigned (repo) or other (plugin), when no known product has it. */
  kind: string;
}

const keyOf = (name: string, version: string): string => `${name}@${version}`;

function findApi(catalog: Catalog, name: string, version: string): CatalogApi | undefined {
  return catalog.apis.find((a) => a.name === name && a.version === version);
}

function listingOfProduct(product: ProductRow, catalog: Catalog): ApiListing[] {
  const out: ApiListing[] = [];
  const add = (entries: readonly ApiEntry[], kind: 'generated' | 'gateway'): void => {
    for (const e of entries) {
      const api = findApi(catalog, e.api, e.version);
      out.push({ name: e.api, version: e.version, title: api?.title ?? '', methods: api ? api.methods.length : null, kind });
    }
  };
  add(product.generated, 'generated');
  add(product.gateway, 'gateway');
  return out;
}

function listingOfCatalog(catalog: Catalog, rows: readonly ProductRow[], layout: InstallRoots['layout']): ApiListing[] {
  // Generated wins over gateway when two products list the same API.
  const kindOf = new Map<string, 'generated' | 'gateway'>();
  for (const row of rows) for (const e of row.generated) kindOf.set(keyOf(e.api, e.version), 'generated');
  for (const row of rows) for (const e of row.gateway) if (!kindOf.has(keyOf(e.api, e.version))) kindOf.set(keyOf(e.api, e.version), 'gateway');
  const none = layout === 'repo' ? 'unassigned' : 'other';
  return catalog.apis.map((api) => ({
    name: api.name,
    version: api.version,
    title: api.title,
    methods: api.methods.length,
    kind: kindOf.get(keyOf(api.name, api.version)) ?? none,
  }));
}

export function runApis(env: ListingEnv, req: ApisRequest): number {
  const rows = productRows(env.roots, env.registry);
  let product: ProductRow | undefined;
  if (req.product !== undefined) {
    product = rows.find((r) => r.id === req.product);
    if (!product) throw new UsageError(unknownProductMessage(req.product, rows));
  }
  const catalog = loadCatalog(env.moduleUrl);
  const listed = product ? listingOfProduct(product, catalog) : listingOfCatalog(catalog, rows, env.roots.layout);
  const needle = req.search?.toLowerCase();
  const matched = needle ? listed.filter((a) => a.name.toLowerCase().includes(needle) || a.title.toLowerCase().includes(needle)) : listed;
  const shown = req.limit === undefined ? matched : matched.slice(0, req.limit);

  if (req.json) {
    env.out.log(
      JSON.stringify({ product: product?.id ?? null, catalog: catalog.file, total: matched.length, shown: shown.length, apis: shown }, null, 2),
    );
    return 0;
  }
  if (product) env.out.log(`${product.id} (${product.title}): ${product.generated.length} generated and ${product.gateway.length} gateway APIs`);
  if (shown.length === 0) {
    env.out.log(needle ? `no APIs match "${req.search}".` : 'no APIs.');
  } else {
    const table = formatTable(
      ['NAME', 'VERSION', 'KIND', 'METHODS', 'TITLE'],
      shown.map((a) => [a.name, a.version, a.kind, a.methods === null ? '-' : String(a.methods), truncate(a.title, 70)]),
    );
    for (const line of table) env.out.log(line);
  }
  env.out.log('');
  env.out.log(shown.length === matched.length ? `${matched.length} APIs` : `showing ${shown.length} of ${matched.length} APIs. Use --limit <n> to see more.`);
  env.out.log(`catalog: ${catalog.file}`);
  return 0;
}

function unknownProductMessage(id: string, rows: readonly ProductRow[]): string {
  return `unknown product "${id}". Valid product ids: ${rows.map((r) => r.id).join(', ')}`;
}

// ---------- methods ----------

export interface MethodsRequest {
  api: string;
  /** A version such as v3. Undefined picks the preferred version, else the first one. */
  version?: string;
  search?: string;
  limit?: number;
  json: boolean;
}

const lastSegment = (id: string): string => id.slice(id.lastIndexOf('.') + 1);

export async function runMethods(env: ListingEnv, req: MethodsRequest): Promise<number> {
  const catalog = loadCatalog(env.moduleUrl);
  const candidates = catalog.apis.filter((a) => a.name === req.api);
  if (candidates.length === 0) throw new UsageError(`unknown API "${req.api}". Find the name with: gsm apis --search ${req.api}`);
  const versions = candidates.map((a) => a.version).join(', ');

  let api: CatalogApi | undefined;
  if (req.version !== undefined) {
    api = candidates.find((a) => a.version === req.version);
    if (!api) throw new UsageError(`${req.api} has no version ${req.version}. Its versions: ${versions}`);
  } else {
    api = candidates.find((a) => a.preferred) ?? candidates[0];
  }
  if (!api) throw new UsageError(`${req.api} has no versions`);

  const classifier = await loadClassifier(env.moduleUrl);
  const overrides = loadKindOverrides(catalog.file);
  const all = api.methods.map((m) => ({
    id: m.id,
    verb: m.verb,
    path: m.path,
    kind: classifier.classify(m.verb, lastSegment(m.id), m.id, overrides),
  }));
  const needle = req.search?.toLowerCase();
  const matched = needle ? all.filter((m) => m.id.toLowerCase().includes(needle) || m.path.toLowerCase().includes(needle)) : all;
  const shown = matched.slice(0, req.limit ?? METHODS_DEFAULT_LIMIT);
  const counts: Record<ActionKind, number> = { read: 0, write: 0, destructive: 0 };
  for (const m of matched) counts[m.kind] += 1;

  if (req.json) {
    env.out.log(
      JSON.stringify(
        {
          api: api.name,
          version: api.version,
          title: api.title,
          versions: candidates.map((a) => a.version),
          total: all.length,
          matched: matched.length,
          shown: shown.length,
          kinds: counts,
          classifier: classifier.source,
          methods: shown,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const matchWord = needle ? 'matching ' : '';
  env.out.log(
    `${api.name} ${api.version} (${api.title}): ${matched.length} ${matchWord}methods, ` +
      `read ${counts.read}, write ${counts.write}, destructive ${counts.destructive}`,
  );
  if (candidates.length > 1 && req.version === undefined) {
    env.out.log(`versions: ${versions}. Showing ${api.version}${api.preferred ? ' (preferred)' : ''}; pass a version to choose another.`);
  }
  if (shown.length === 0) {
    env.out.log(needle ? `no methods match "${req.search}".` : 'no methods.');
  } else {
    const table = formatTable(
      ['ID', 'VERB', 'PATH', 'KIND'],
      shown.map((m) => [m.id, m.verb, m.path, m.kind]),
    );
    for (const line of table) env.out.log(line);
  }
  env.out.log('');
  if (shown.length < matched.length) {
    env.out.log(`showing ${shown.length} of ${matched.length} methods. Use --limit <n> or --search <text> to see more.`);
  }
  env.out.log(
    classifier.source === 'core'
      ? 'kind: classifyMethod from dist/core/discovery/methods.js (config/tool-kinds.json overrides applied)'
      : 'kind: built-in copy of the classification rules (dist/core/discovery/methods.js not found beside this CLI)',
  );
  return 0;
}

// ---------- version ----------

function readJsonObject(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** The suite version from the package (repo) or the plugin manifest, and the Node version. */
export function versionLines(roots: InstallRoots): string[] {
  const lines: string[] = [];
  if (roots.layout === 'repo') {
    const pkg = readJsonObject(join(roots.root, 'package.json'));
    const products = readJsonObject(roots.mapFile);
    lines.push(`suite version: ${String(pkg?.version ?? 'unknown')} (package.json)`);
    lines.push(`products file version: ${String(products?.version ?? 'unknown')} (config/products.json)`);
  } else {
    const manifest = readJsonObject(join(roots.root, '.claude-plugin', 'plugin.json'));
    lines.push(`suite version: ${String(manifest?.version ?? 'unknown')} (.claude-plugin/plugin.json)`);
  }
  lines.push(`node version: ${process.version}`);
  return lines;
}

export function runVersion(env: Pick<ListingEnv, 'roots' | 'out'>): number {
  for (const line of versionLines(env.roots)) env.out.log(line);
  return 0;
}
