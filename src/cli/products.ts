/**
 * Product ids (the plugin ids) and the server registry the CLI works from.
 *
 *  - plugin layout: the plugin's own servers.json, read by the registry loader (core/registry.ts, unchanged).
 *  - repo layout: config/products.json. Its shape (products keyed by id, each with a server, a group and
 *    API lists) is not the registry shape, so it is converted here. Each product id is the plugin id.
 *
 * Known limit: core/scopes.ts requirementsFor() calls loadRegistry() itself, so in the repo layout the
 * tool counts of gsm login, scopes and setup-admin still come from config/servers.json until core takes
 * the registry as an argument.
 */
import { readFileSync } from 'node:fs';
import { loadRegistry, type AuthGroup, type Registry, type ServerSpec } from '../core/registry.js';
import type { InstallRoots } from './paths.js';

/** One line per auth group, shown in help-like output and kept in the converted registry. */
export const GROUP_TEXT: Record<string, string> = {
  cloud: 'Application Default Credentials or OAuth user token with cloud-platform scope',
  'workspace-user': 'OAuth user token (Gmail, Drive, Calendar and the user-data APIs)',
  'workspace-admin': 'Service account with domain-wide delegation, impersonating a super admin',
  searchconsole: 'OAuth user token with webmasters scope',
  business: 'OAuth user token with the scopes of the business APIs',
  developer: 'OAuth user token with the scopes of the developer APIs',
  apikey: 'API key saved with gsm setup-apikey (no OAuth login)',
};

interface ApiEntry {
  api: string;
  version: string;
}

/** Converts config/products.json into the registry shape. Throws when a product has no server or group. */
export function registryFromProducts(raw: unknown, dataRoot: string): Registry {
  const products = typeof raw === 'object' && raw !== null ? (raw as { products?: unknown }).products : undefined;
  if (typeof products !== 'object' || products === null || Array.isArray(products)) {
    throw new Error('config/products.json has no "products" object');
  }
  const plugins: Record<string, string> = {};
  const servers: ServerSpec[] = [];
  for (const [id, value] of Object.entries(products as Record<string, Record<string, unknown>>)) {
    const server = value.server as { name?: unknown; curated?: unknown } | undefined;
    if (typeof server?.name !== 'string' || typeof value.group !== 'string') {
      throw new Error(`product "${id}" in config/products.json needs server.name and group`);
    }
    const generated = Array.isArray(value.generated) ? (value.generated as ApiEntry[]) : [];
    const curated = typeof server.curated === 'string' && server.curated !== '';
    const label = typeof value.title === 'string' ? value.title : id;
    plugins[id] = label;
    servers.push({
      name: server.name,
      plugin: id,
      group: value.group as AuthGroup,
      kind: curated ? (generated.length > 0 ? 'curated+discovery' : 'curated') : 'discovery',
      apis: generated.map((e) => ({ api: e.api, version: e.version })),
      label,
    });
  }
  return { dataRoot, plugins, groups: GROUP_TEXT as Registry['groups'], servers };
}

/** The registry for this layout. `moduleUrl` is the caller's import.meta.url (used by the plugin layout). */
export function loadProductRegistry(roots: InstallRoots, moduleUrl: string): Registry {
  if (roots.layout === 'plugin') return loadRegistry(moduleUrl);
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
