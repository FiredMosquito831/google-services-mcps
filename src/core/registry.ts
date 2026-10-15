/**
 * Loads the server map (servers.json or config/servers.json) and the scope
 * lists (scopes.json or data/scopes.json). Works both in the repo (dev) and
 * inside an installed plugin folder (bundled), by walking up from a module
 * URL until a servers.json or config/servers.json is found.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One auth group per token file, or 'apikey' for products that take an API key
 * instead of an OAuth login (no token file).
 */
export type AuthGroup = 'cloud' | 'workspace-user' | 'workspace-admin' | 'searchconsole' | 'business' | 'developer' | 'apikey';

export interface ApiRef {
  api: string;
  version: string;
  /**
   * Generated APIs only: the resource or method paths whose methods become tools (see DiscoverySource.include).
   * Absent means every method of the API.
   */
  include?: string[];
}

export interface ServerSpec {
  name: string;
  plugin: string;
  group: AuthGroup;
  kind: 'curated' | 'discovery' | 'curated+discovery';
  curated?: string;
  /** APIs with per-method tools: every method of each one becomes a tool. */
  apis?: ApiRef[];
  /** APIs reached through the gateway tools (api_search, api_describe, api_call) of this server, not per-method tools. */
  gatewayApis?: ApiRef[];
  /** Scopes the curated tools need, in addition to the discovery method scopes. */
  scopes?: string[];
  label: string;
}

export interface Registry {
  /** Directory that holds the server map and the discovery snapshots at runtime. */
  dataRoot: string;
  plugins: Record<string, string>;
  groups: Record<AuthGroup, string>;
  servers: ServerSpec[];
}

const registryCache = new Map<string, Registry>();

/** Accepts a file: URL (import.meta.url) or a plain path. */
function toPath(fromUrl: string): string {
  return fromUrl.startsWith('file:') ? fileURLToPath(fromUrl) : fromUrl;
}

export function loadRegistry(fromUrl: string = import.meta.url): Registry {
  const startDir = dirname(toPath(fromUrl));

  let dir = startDir;
  for (;;) {
    let file: string | undefined;
    let root: string | undefined;
    if (existsSync(join(dir, 'servers.json'))) {
      file = join(dir, 'servers.json');
      root = dir;
    } else if (existsSync(join(dir, 'config', 'servers.json'))) {
      file = join(dir, 'config', 'servers.json');
      root = dir;
    }

    if (file && root) {
      const cached = registryCache.get(file);
      if (cached) return cached;
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Omit<Registry, 'dataRoot'>>;
      const reg: Registry = {
        dataRoot: root,
        plugins: raw.plugins ?? {},
        groups: (raw.groups ?? {}) as Registry['groups'],
        servers: raw.servers ?? [],
      };
      registryCache.set(file, reg);
      return reg;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`loadRegistry: no servers.json or config/servers.json found above ${startDir}`);
    }
    dir = parent;
  }
}

export function serverByName(reg: Registry, name: string): ServerSpec {
  const found = reg.servers.find((s) => s.name === name);
  if (!found) throw new Error(`Unknown server: ${name}`);
  return found;
}

const scopesCache = new WeakMap<Registry, Record<string, string[]> | null>();

/** Reads the discovery scope lists: data/scopes.json (repo layout) or scopes.json (plugin layout). */
function discoveryScopes(reg: Registry): Record<string, string[]> | null {
  if (scopesCache.has(reg)) return scopesCache.get(reg) ?? null;
  const candidates = [join(reg.dataRoot, 'data', 'scopes.json'), join(reg.dataRoot, 'scopes.json')];
  const file = candidates.find((p) => existsSync(p));
  const parsed = file ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>) : null;
  scopesCache.set(reg, parsed);
  return parsed;
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/** Union of curated and discovery scopes for one server. */
export function scopesForServer(reg: Registry, name: string): string[] {
  const server = serverByName(reg, name);
  const curated = server.scopes ?? [];
  if (!server.apis?.length) return unique(curated);

  const all = discoveryScopes(reg);
  if (!all) {
    throw new Error(`scopesForServer: scopes.json not found under ${reg.dataRoot}. Run: node scripts/snapshot-discovery.mjs`);
  }
  return unique([...curated, ...(all[name] ?? [])]);
}

/** Union of scopes across every server in an auth group, optionally narrowed to some servers. */
export function scopesForGroup(reg: Registry, group: AuthGroup, onlyServers?: string[]): string[] {
  const names = reg.servers
    .filter((s) => s.group === group)
    .filter((s) => !onlyServers || onlyServers.includes(s.name))
    .map((s) => s.name);
  return unique(names.flatMap((name) => scopesForServer(reg, name)));
}
