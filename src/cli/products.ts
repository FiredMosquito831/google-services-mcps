/**
 * Product ids (the plugin ids) and the server registry the CLI works from.
 *
 *  - plugin layout: the plugin's own servers.json, read as the registry (the file findRoots found).
 *  - repo layout: config/products.json. Its shape (products keyed by id, each with a server, a group and
 *    API lists) is not the registry shape, so it is converted here. Each product id is the plugin id. Each server then
 *    takes what it is built from from its plugin folder (withPluginFolders), so the counts match the plugin's own CLI.
 *
 * gsm login, gsm scopes and gsm setup-admin take their server specs from this registry (requirementsForSpecs).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AuthGroup, FieldMaskDefaults, FieldsDefaults, Registry, ScopePolicy, ServerSpec } from '../core/registry.js';
import type { InstallRoots } from './paths.js';
import { LISTED_TOOLSETS, PREFER_PROFILES, type PreferredScopes, type ServerToolsets, type ServerToolsetScopes } from '../core/toolset.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

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
    const policy = value.scopePolicy;
    servers.push({
      name: server.name,
      plugin: id,
      group: value.group as AuthGroup,
      kind: curated ? (generated.length > 0 ? 'curated+discovery' : 'curated') : 'discovery',
      apis: generated,
      // The product's scope rules (checked by scripts/gen-servers.mjs). Only a product that has them gets the key.
      ...(typeof policy === 'object' && policy !== null && !Array.isArray(policy) ? { scopePolicy: policy as ScopePolicy } : {}),
      // The product's scopes for methods whose Discovery document lists none (checked by scripts/gen-servers.mjs).
      ...(typeof value.scopeOverrides === 'object' && value.scopeOverrides !== null && !Array.isArray(value.scopeOverrides)
        ? { scopeOverrides: value.scopeOverrides as Record<string, string[]> }
        : {}),
      // The product's request defaults for some methods (checked by scripts/gen-servers.mjs): the fields value and the
      // response field mask sent when a call gives none.
      ...(isPlainObject(value.fieldsDefaults) ? { fieldsDefaults: value.fieldsDefaults as Record<string, FieldsDefaults> } : {}),
      ...(isPlainObject(value.fieldMaskDefaults) ? { fieldMaskDefaults: value.fieldMaskDefaults as Record<string, FieldMaskDefaults> } : {}),
      // The product's listed toolsets, as tool names (scripts/gen-servers.mjs writes the same into config/servers.json).
      ...toolsetsField(value.toolsets),
      // Their preferred scopes per profile (preferScopes), as gen-servers writes them (toolsetScopes).
      ...toolsetScopesField(value.toolsets),
      label,
    });
  }
  return { dataRoot, plugins, groups: GROUP_TEXT as Registry['groups'], servers };
}

/**
 * The toolsets field of a server entry from a product's "toolsets": per listed toolset, its tool names (the "tools" list
 * of { tools, matches, notes }). Empty when the product lists none. Checked by scripts/gen-servers.mjs.
 */
function toolsetsField(value: unknown): { toolsets?: ServerToolsets } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: ServerToolsets = {};
  for (const name of LISTED_TOOLSETS) {
    const entry = (value as Record<string, unknown>)[name];
    const tools = Array.isArray(entry) ? entry : (entry as { tools?: unknown } | undefined)?.tools;
    if (Array.isArray(tools)) out[name] = tools.filter((t): t is string => typeof t === 'string');
  }
  return Object.keys(out).length > 0 ? { toolsets: out } : {};
}

/**
 * The toolsetScopes field of a server entry: per listed toolset, its "preferScopes" ({ readonly?, readwrite? }: scope
 * lists). Empty when no toolset gives any. Checked by scripts/gen-servers.mjs.
 */
function toolsetScopesField(value: unknown): { toolsetScopes?: ServerToolsetScopes } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: ServerToolsetScopes = {};
  for (const name of LISTED_TOOLSETS) {
    const prefer = ((value as Record<string, unknown>)[name] as { preferScopes?: unknown } | undefined)?.preferScopes;
    if (typeof prefer !== 'object' || prefer === null || Array.isArray(prefer)) continue;
    const lists: PreferredScopes = {};
    for (const profile of PREFER_PROFILES) {
      const list = (prefer as Record<string, unknown>)[profile];
      if (Array.isArray(list)) lists[profile] = list.filter((s): s is string => typeof s === 'string');
    }
    if (Object.keys(lists).length > 0) out[name] = lists;
  }
  return Object.keys(out).length > 0 ? { toolsetScopes: out } : {};
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
 * plugin's own map. Repo layout: config/products.json, converted, with each server as its plugin folder builds it
 * (withPluginFolders).
 */
export function loadProductRegistry(roots: InstallRoots): Registry {
  if (roots.layout === 'plugin') return loadRegistryFile(roots.mapFile);
  return withPluginFolders(registryFromProducts(JSON.parse(readFileSync(roots.mapFile, 'utf8')) as unknown, roots.root), roots);
}

/** The fields of a server entry that say what the server is built from, as its plugin's servers.json holds them. */
const BUILD_FIELDS = [
  'curated',
  'apis',
  'gatewayApis',
  'scopes',
  'scopePolicy',
  'scopeOverrides',
  'fieldsDefaults',
  'fieldMaskDefaults',
  'toolsets',
  'toolsetScopes',
] as const;

/**
 * Repo layout (the repository's gsm.mjs, and so the npm package's): each server as its own plugin folder builds it.
 * plugins/<id> holds the server's entry in its servers.json (curated module, generated and gateway APIs, scope rules,
 * toolsets), its Discovery snapshots, its catalog.json and its tool kinds, and the plugin's own CLI (the one the sign-in
 * from the chat runs) counts tools and scopes from exactly those. So each server takes the build fields of that entry,
 * and the folder as pluginRoot (the snapshots and the catalog are read there, see pluginModuleUrl in core/registry.ts),
 * and the registry takes the group scope lists the bundle wrote there (groupScopes). Name, group, kind and label stay
 * those of config/products.json, so listings and installs print what they printed before. A product whose plugin folder
 * has no entry for its server keeps the conversion alone.
 */
export function withPluginFolders(reg: Registry, roots: InstallRoots): Registry {
  const groupScopes: Partial<Record<AuthGroup, string[]>> = {};
  const servers = reg.servers.map((spec): ServerSpec => {
    const folder = pluginFolderFor(roots, spec.plugin);
    const file = join(folder, 'servers.json');
    if (!existsSync(file)) return spec;
    const own = loadRegistryFile(file);
    const entry = own.servers.find((s) => s.name === spec.name && s.plugin === spec.plugin && s.group === spec.group);
    if (!entry) return spec;
    for (const [group, scopes] of Object.entries(own.groupScopes ?? {}) as Array<[AuthGroup, string[]]>) {
      groupScopes[group] = [...new Set([...(groupScopes[group] ?? []), ...scopes])].sort();
    }
    const built = Object.fromEntries(BUILD_FIELDS.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]])) as Partial<ServerSpec>;
    return { name: spec.name, plugin: spec.plugin, group: spec.group, kind: spec.kind, ...built, label: spec.label, pluginRoot: folder };
  });
  return { ...reg, servers, ...(Object.keys(groupScopes).length > 0 ? { groupScopes } : {}) };
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
