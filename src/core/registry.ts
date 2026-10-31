/**
 * Loads the server map (servers.json or config/servers.json) and the scope
 * lists (scopes.json or data/scopes.json). Works both in the repo (dev) and
 * inside an installed plugin folder (bundled), by walking up from a module
 * URL until a servers.json or config/servers.json is found.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyMethod } from './discovery/methods.js';
import { loadToolKinds } from './discovery/tools.js';
import { catalogPath } from './gateway.js';
import type { ToolKind } from './tools.js';
import type { ServerToolsets, ServerToolsetScopes } from './toolset.js';

/**
 * One auth group per token file, or 'apikey' for products that take an API key
 * instead of an OAuth login (no token file).
 */
export type AuthGroup = 'cloud' | 'workspace-user' | 'workspace-admin' | 'searchconsole' | 'business' | 'developer' | 'apikey' | 'service-account';

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
  /** How a login of this product picks its scopes, when the product needs a rule beyond the profiles (see ScopePolicy). */
  scopePolicy?: ScopePolicy;
  /**
   * The toolsets this product lists by name (config/products.json toolsets): tool names per toolset, such as
   * { google: [...] }. Absent for a product that lists none. all and curated are never listed (see core/toolset.ts).
   */
  toolsets?: ServerToolsets;
  /**
   * The scopes a listed toolset's login takes first, per profile (config/products.json toolsets.<name>.preferScopes),
   * such as { google: { readwrite: [...] } }. Each one is narrower than what the greedy rule would pick for the tools it
   * covers, with the same reach for those tools. Absent for a product that has none, whose logins resolve as before.
   */
  toolsetScopes?: ServerToolsetScopes;
  /**
   * Per generated API of the product, the scopes a method of that API asks for when its Discovery document lists none
   * (config/products.json scopeOverrides; Google's Business Profile documents list no scope). A method that lists scopes
   * keeps its own. Absent for a product that has none.
   */
  scopeOverrides?: Record<string, string[]>;
  /**
   * Per generated API of the product, the methods Google documents as needing the `fields` system parameter (they return
   * no default fields), and the value their tools send when a call gives none (config/products.json fieldsDefaults; Drive's
   * about, approvals, comments and replies). Absent for a product that has none.
   */
  fieldsDefaults?: Record<string, FieldsDefaults>;
  /**
   * Per generated API of the product, the methods that need a response field mask (the X-Goog-FieldMask header; Google
   * returns an error without one) and the mask their tools send when a call gives none (config/products.json
   * fieldMaskDefaults; Places search and details). Absent for a product that has none.
   */
  fieldMaskDefaults?: Record<string, FieldMaskDefaults>;
  /**
   * Per generated API of the product, the list methods whose Google default page is far over the result limit, and the
   * page size their tools send when a call gives none (config/products.json pageSizeDefaults; Admin Reports activities,
   * for one). Absent for a product that has none.
   */
  pageSizeDefaults?: Record<string, PageSizeDefaults>;
  /**
   * Per generated API of the product, a note for some of its methods (config/products.json methodNotes; gsearch's Fact
   * Check pages and Web Risk submissions, which an API key cannot run). The note goes into that method's tool description
   * only, after the API's note from config/tool-kinds.json, which every tool of the API carries. Absent for a product that
   * has none, so its tools are described as before.
   */
  methodNotes?: Record<string, MethodNotes>;
  label: string;
  /**
   * The plugin folder the server is built from (plugins/<id>), set only by the CLI of the repository layout (the
   * repository's gsm.mjs and the npm package's), which reads every product. The server's Discovery snapshots, gateway
   * catalog and tool kinds are then read in that folder, as the plugin's own CLI reads them (see pluginModuleUrl).
   * Absent everywhere else (a plugin's CLI, a server, the bundle): those are found from the module, as before. Never
   * written to a servers.json.
   */
  pluginRoot?: string;
}

/** One API's entry of ServerSpec.fieldsDefaults. source and reason are the evidence, for people; tools read value and methods. */
export interface FieldsDefaults {
  value: string;
  methods: string[];
  source?: string;
  reason?: string;
}

/** One API's entry of ServerSpec.fieldMaskDefaults: the default mask per method id, with the evidence for people. */
export interface FieldMaskDefaults {
  methods: Record<string, string>;
  source?: string;
  reason?: string;
}

/** The page size one list method's tool sends when a call gives none, with Google's default and the reason. */
export interface PageSizeDefault {
  /** The method's page size parameter (maxResults, pageSize). */
  parameter: string;
  value: number;
  googleDefault: number;
  reason?: string;
}

/** One API's entry of ServerSpec.pageSizeDefaults. */
export interface PageSizeDefaults {
  methods: Record<string, PageSizeDefault>;
  source?: string;
  reason?: string;
}

/** One API's entry of ServerSpec.methodNotes: the note per method id, with the evidence for people. */
export interface MethodNotes {
  methods: Record<string, string>;
  source?: string;
  reason?: string;
}

/**
 * The module URL a server's data is looked up from: its plugin's bin/gsm.mjs, the file the plugin's own CLI runs. Each
 * lookup that walks up from a module (loadRegistry, resolveDataDir, catalogPath) then finds the plugin's servers.json,
 * Discovery snapshots, catalog.json and tool-kinds.json, as that CLI does. Undefined for a server without pluginRoot: each
 * lookup then starts from its own module, as before.
 */
export function pluginModuleUrl(spec: Pick<ServerSpec, 'pluginRoot'>): string | undefined {
  return spec.pluginRoot === undefined ? undefined : pathToFileURL(join(spec.pluginRoot, 'bin', 'gsm.mjs')).href;
}

/**
 * A product's rules for the scopes a login requests, declared in config/products.json. Absent for most products: their
 * logins pick scopes by the profile alone. The rules only change what a login asks Google for. Tool kinds, the gate and
 * the runtime check (a tool registers when the token holds one of its scopes) are the same with or without them.
 */
export interface ScopePolicy {
  /**
   * Scopes that only the listed profiles may request for this product's tools (readonly, readwrite, full). An empty list
   * means no profile requests the scope; an exact --scopes list still can. Example: Gmail's https://mail.google.com/
   * is listed with ["full"], so readwrite uses the narrower gmail.modify and permanent delete needs full.
   */
  onlyIn?: Record<string, string[]>;
  /**
   * Named optional parts: the APIs (Discovery names) whose methods a login leaves out unless it names the part (gsm login
   * --with <name>, or auth_login with "with"). Example: { "postmaster": ["gmailpostmastertools"] }. An entry may also be a
   * scope URL (since 1.35.0): no profile asks for that scope unless the part is named, and a login that names it asks for
   * it for the tools that accept it. Example: { "monetary": [".../yt-analytics-monetary.readonly"] }.
   */
  optional?: Record<string, string[]>;
  /**
   * Scopes a login of this product asks for first, per profile (readonly, readwrite, full), before the greedy rule covers
   * the rest. Each one is asked for when a tool of the product that the profile targets accepts it (for readonly, when it
   * is view-only too), even when an earlier scope covers that tool already, so two scopes of different reach can both be
   * asked for. Example: Meet's { "readwrite": [".../meetings.space.readonly"] } keeps the reads' reach over every space the
   * user can see, beside meetings.space.created, which the writes need. A preference adds reach; it never replaces a scope
   * a tool needs (the reach rule). A toolset's preferScopes (ServerSpec.toolsetScopes) come before it.
   */
  prefer?: Partial<Record<'readonly' | 'readwrite' | 'full', string[]>>;
}

export interface Registry {
  /** Directory that holds the server map and the discovery snapshots at runtime. */
  dataRoot: string;
  plugins: Record<string, string>;
  groups: Record<AuthGroup, string>;
  servers: ServerSpec[];
  /**
   * Every scope the servers of a login group can use (tools and gateway methods), per group. A plugin's servers.json
   * holds only its own server, so the bundle writes its group's full list here; the login keeps a stored scope only when
   * the list has it. Absent in the repository map, which has every server, so the list is computed from the servers there.
   */
  groupScopes?: Partial<Record<AuthGroup, string[]>>;
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
        ...(raw.groupScopes ? { groupScopes: raw.groupScopes } : {}),
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

// ---------------------------------------------------------------------------
// Gateway methods: the methods the gateway (core/gateway.ts) can reach for a server

/** A gateway method as the gateway serves it. The first catalog entry of an id is the one used. */
export interface GatewayMethod {
  /** Method id, for example "adsense.accounts.list". */
  id: string;
  /** Safety kind, classified the way the gateway classifies it (config/tool-kinds.json overrides apply). */
  kind: ToolKind;
  /** Scopes that grant the method (any one of them). Empty means the method is always allowed. */
  scopes: string[];
}

export interface GatewayMethods {
  /** The catalog file the gateway reads (GSM_DATA_DIR, else found by walking up), or undefined when there is none. */
  file: string | undefined;
  /** The methods of the listed APIs, in list order. Upload methods are left out, because the gateway refuses them. */
  methods: GatewayMethod[];
  /** Listed APIs (name.version) that the catalog does not have. Empty when there is no catalog. */
  missingApis: string[];
}

interface CatalogRow {
  id: string;
  verb: string;
  scopes: string[];
  upload: boolean;
}

interface CatalogApi {
  name: string;
  version: string;
  methods: CatalogRow[];
}

/** Same verbs the gateway accepts (HTTP_VERBS in core/gateway.ts). */
const GATEWAY_VERBS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const catalogCache = new Map<string, CatalogApi[]>();

/** One catalog row, read the way the gateway reads it (parseMethod in core/gateway.ts). Rows it could not call are dropped. */
function parseRow(row: unknown): CatalogRow[] {
  if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[2] !== 'string') return [];
  const verb = String(row[1] ?? '').toUpperCase();
  if (!GATEWAY_VERBS.includes(verb)) return [];
  const flags = typeof row[4] === 'string' ? row[4] : '';
  const scopes = Array.isArray(row[3]) ? row[3].filter((s): s is string => typeof s === 'string') : [];
  return [{ id: row[0], verb, scopes, upload: flags.includes('u') }];
}

/** The catalog's APIs, read the way the gateway reads them (parseCatalogApis in core/gateway.ts). Cached per file. */
function readCatalogApis(file: string): CatalogApi[] {
  const cached = catalogCache.get(file);
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { apis?: unknown };
  if (!Array.isArray(raw.apis)) throw new Error(`${file} has no "apis" list. Rebuild it with: node scripts/build-catalog.mjs`);
  const apis: CatalogApi[] = raw.apis.map((item): CatalogApi => {
    const a = (item ?? {}) as Record<string, unknown>;
    return {
      name: typeof a.name === 'string' ? a.name : '',
      version: typeof a.version === 'string' ? a.version : '',
      methods: Array.isArray(a.methods) ? a.methods.flatMap(parseRow) : [],
    };
  });
  catalogCache.set(file, apis);
  return apis;
}

/** Kind overrides beside the catalog, then one level up, as the gateway looks them up (overridesFor in core/gateway.ts). */
function overridesFor(file: string): Record<string, ToolKind> {
  const dir = dirname(file);
  for (const root of [dir, dirname(dir)]) {
    const overrides = loadToolKinds(root).overrides;
    if (Object.keys(overrides).length > 0) return overrides;
  }
  return {};
}

/**
 * The methods the gateway serves for the listed APIs, with the scopes and kind the gateway checks at call time.
 * The catalog is the one the gateway reads: GSM_DATA_DIR, else found by walking up from the module, or from `fromUrl`
 * when given (a plugin's bin/gsm.mjs, see pluginModuleUrl). Reads the catalog only; no Discovery document and no network call.
 */
export function gatewayMethodsOf(apis: readonly ApiRef[], fromUrl?: string): GatewayMethods {
  const file = catalogPath(fromUrl);
  if (!file) return { file: undefined, methods: [], missingApis: [] };

  const catalog = readCatalogApis(file);
  const overrides = overridesFor(file);
  const seen = new Set<string>();
  const methods: GatewayMethod[] = [];
  const missingApis: string[] = [];
  for (const ref of apis) {
    const api = catalog.find((a) => a.name === ref.api && a.version === ref.version);
    if (!api) {
      missingApis.push(`${ref.api}.${ref.version}`);
      continue;
    }
    for (const row of api.methods) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      if (row.upload) continue;
      const methodName = row.id.slice(row.id.lastIndexOf('.') + 1);
      methods.push({ id: row.id, kind: classifyMethod(row.verb, methodName, row.id, overrides), scopes: [...row.scopes] });
    }
  }
  return { file, methods, missingApis };
}

/**
 * Union of the scopes of one server: curated tools, discovery methods and gateway methods. The gateway part is empty
 * when the catalog is missing (see gatewayMethodsOf); the CLI reports that when it builds requirements.
 */
export function scopesForServer(reg: Registry, name: string): string[] {
  const server = serverByName(reg, name);
  const curated = server.scopes ?? [];
  const gateway = gatewayMethodsOf(server.gatewayApis ?? []).methods.flatMap((m) => m.scopes);
  if (!server.apis?.length) return unique([...curated, ...gateway]);

  const all = discoveryScopes(reg);
  if (!all) {
    throw new Error(`scopesForServer: scopes.json not found under ${reg.dataRoot}. Run: node scripts/snapshot-discovery.mjs`);
  }
  // The scopes the product declares for methods whose Discovery document lists none (scopeOverrides).
  const overrides = Object.values(server.scopeOverrides ?? {}).flat();
  return unique([...curated, ...(all[name] ?? []), ...gateway, ...overrides]);
}

/** Union of scopes across every server in an auth group, optionally narrowed to some servers. */
export function scopesForGroup(reg: Registry, group: AuthGroup, onlyServers?: string[]): string[] {
  const names = reg.servers
    .filter((s) => s.group === group)
    .filter((s) => !onlyServers || onlyServers.includes(s.name))
    .map((s) => s.name);
  return unique(names.flatMap((name) => scopesForServer(reg, name)));
}
