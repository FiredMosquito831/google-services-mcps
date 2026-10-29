/**
 * Product ids (the plugin ids) and the server registry the CLI works from.
 *
 *  - plugin layout: the plugin's own servers.json, read as the registry (the file findRoots found).
 *  - repo layout: config/products.json. Its shape (products keyed by id, each with a server, a group and
 *    API lists) is not the registry shape, so it is converted here. Each product id is the plugin id.
 *
 * gsm login and gsm scopes take their server specs from this registry (requirementsForSpecs). gsm setup-admin
 * still calls requirementsFor(), which loads config/servers.json in the repo layout.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthGroup, Registry, ServerSpec } from '../core/registry.js';
import type { InstallRoots } from './paths.js';

/** One line per auth group, shown in help-like output and kept in the converted registry. */
export const GROUP_TEXT: Record<string, string> = {
  cloud: 'Application Default Credentials or OAuth user token with cloud-platform scope',
  'workspace-user': 'OAuth user token (Gmail, Drive, Calendar and the user-data APIs)',
  'workspace-admin': 'Service account with domain-wide delegation, impersonating a super admin',
  'service-account': 'Service account key for Google Play and Merchant Center (no user login)',
  searchconsole: 'OAuth user token with webmasters scope',
  business: 'OAuth user token with the scopes of the business APIs',
  developer: 'OAuth user token with the scopes of the developer APIs',
  apikey: 'API key saved with node gsm.mjs setup-apikey (no OAuth login)',
};

/** One API of a product: the Discovery name and version, for example monitoring v3. */
export interface ApiEntry {
  api: string;
  version: string;
}

/** The products object of config/products.json, or a throw when the file has none. */
function productsObject(raw: unknown): Record<string, Record<string, unknown>> {
  const products = typeof raw === 'object' && raw !== null ? (raw as { products?: unknown }).products : undefined;
  if (typeof products !== 'object' || products === null || Array.isArray(products)) {
    throw new Error('config/products.json has no "products" object');
  }
  return products as Record<string, Record<string, unknown>>;
}

/** Converts config/products.json into the registry shape. Throws when a product has no server or group. */
export function registryFromProducts(raw: unknown, dataRoot: string): Registry {
  const plugins: Record<string, string> = {};
  const servers: ServerSpec[] = [];
  for (const [id, value] of Object.entries(productsObject(raw))) {
    const server = value.server as { name?: unknown; curated?: unknown } | undefined;
    if (typeof server?.name !== 'string' || typeof value.group !== 'string') {
      throw new Error(`product "${id}" in config/products.json needs server.name and group`);
    }
    const generated = apiEntries(value.generated);
    const curated = typeof server.curated === 'string' && server.curated !== '';
    const label = typeof value.title === 'string' ? value.title : id;
    plugins[id] = label;
    servers.push({
      name: server.name,
      plugin: id,
      group: value.group as AuthGroup,
      kind: curated ? (generated.length > 0 ? 'curated+discovery' : 'curated') : 'discovery',
      apis: generated,
      label,
    });
  }
  return { dataRoot, plugins, groups: GROUP_TEXT as Registry['groups'], servers };
}

/** The API entries in a JSON list. Entries without a string api and version are dropped. */
function apiEntries(value: unknown): ApiEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ApiEntry[] = [];
  for (const entry of value as Array<Partial<ApiEntry> | null>) {
    if (typeof entry?.api === 'string' && typeof entry.version === 'string') out.push({ api: entry.api, version: entry.version });
  }
  return out;
}

/** Reads a plugin's servers.json. dataRoot is the folder that holds it. */
export function loadRegistryFile(file: string): Registry {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Omit<Registry, 'dataRoot'>>;
  return {
    dataRoot: dirname(file),
    plugins: raw.plugins ?? {},
    groups: (raw.groups ?? {}) as Registry['groups'],
    servers: raw.servers ?? [],
    ...(raw.groupScopes ? { groupScopes: raw.groupScopes } : {}),
  };
}

/**
 * The registry for this layout. Plugin layout: the servers.json that findRoots found, which is the
 * plugin's own map. Repo layout: config/products.json, converted.
 */
export function loadProductRegistry(roots: InstallRoots): Registry {
  if (roots.layout === 'plugin') return loadRegistryFile(roots.mapFile);
  return registryFromProducts(JSON.parse(readFileSync(roots.mapFile, 'utf8')) as unknown, roots.root);
}

/**
 * The plugin ids the CLI accepts: the distinct plugin of each server. A plugin folder's servers.json
 * holds only its own servers, so its list is just the product it bundles.
 */
export function productIds(reg: Registry): string[] {
  const fromServers = [...new Set(reg.servers.map((s) => s.plugin))];
  return fromServers.length > 0 ? fromServers : Object.keys(reg.plugins);
}

/** Where the per-method tool count of a product comes from. */
export type ToolSource = 'tool-map' | 'products' | 'none';

/** One product as the listing commands and the install summary show it. */
export interface ProductRow {
  id: string;
  title: string;
  /** One sentence on what the product covers. Empty when the product map does not carry it (a plugin folder). */
  description?: string;
  group: string;
  generated: ApiEntry[];
  gateway: ApiEntry[];
  /**
   * Per-method tools: the entries of the plugin's tool-map.json when the plugin folder has one,
   * else generatedToolCount from config/products.json, else undefined.
   */
  tools: number | undefined;
  toolSource: ToolSource;
  /** The plugin folder: plugins/<id> in the repo, or the folder this CLI runs from in a plugin. */
  folder: string;
  folderExists: boolean;
}

/** The plugin folder of a product for this layout. */
export function pluginFolderFor(roots: InstallRoots, id: string): string {
  return roots.layout === 'repo' ? join(roots.root, 'plugins', id) : roots.root;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The number of entries in a plugin's tool-map.json, or undefined when the file is missing or unreadable. */
function toolMapCount(file: string): number | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.length : undefined;
  } catch {
    return undefined;
  }
}

/** The product rows of this layout, optionally only the ids given. Repo rows keep config/products.json order. */
export function productRows(roots: InstallRoots, registry: Registry, only?: readonly string[]): ProductRow[] {
  const rows = roots.layout === 'repo' ? repoRows(roots) : pluginRows(roots, registry);
  return only ? rows.filter((row) => only.includes(row.id)) : rows;
}

function repoRows(roots: InstallRoots): ProductRow[] {
  const raw = JSON.parse(readFileSync(roots.mapFile, 'utf8')) as unknown;
  return Object.entries(productsObject(raw)).map(([id, value]) => {
    const folder = pluginFolderFor(roots, id);
    const fromMap = toolMapCount(join(folder, 'tool-map.json'));
    const configCount = typeof value.generatedToolCount === 'number' ? value.generatedToolCount : undefined;
    return {
      id,
      title: typeof value.title === 'string' ? value.title : id,
      description: typeof value.description === 'string' ? value.description : '',
      group: typeof value.group === 'string' ? value.group : '',
      generated: apiEntries(value.generated),
      gateway: apiEntries(value.gateway),
      tools: fromMap ?? configCount,
      toolSource: fromMap !== undefined ? 'tool-map' : configCount !== undefined ? 'products' : 'none',
      folder,
      folderExists: isDirectory(folder),
    };
  });
}

function pluginRows(roots: InstallRoots, registry: Registry): ProductRow[] {
  const fromMap = toolMapCount(join(roots.root, 'tool-map.json'));
  return productIds(registry).map((id) => {
    const server = registry.servers.find((s) => s.plugin === id);
    return {
      id,
      title: server?.label ?? registry.plugins[id] ?? id,
      group: server?.group ?? '',
      generated: server?.apis ?? [],
      gateway: server?.gatewayApis ?? [],
      tools: fromMap,
      toolSource: fromMap !== undefined ? 'tool-map' : 'none',
      folder: roots.root,
      folderExists: true,
    };
  });
}
