/**
 * Turns Google Discovery documents into MCP tools for one server.
 *
 * Every method of every API listed for the server becomes one tool, except
 * media-upload methods, which are skipped and reported. Each server also gets
 * one read tool, "api_methods", that lists the generated methods.
 *
 * Snapshots are read from data/discovery (see scripts/snapshot-discovery.mjs).
 * Safety overrides and per-API notes come from config/tool-kinds.json.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z, type ZodRawShape } from 'zod';
import type { RuntimeConfig } from '../config.js';
import { getAuthClient, getCloudAdcClient, loadUserTokens, type AuthKind } from '../auth.js';
import type { ToolDef, ToolKind } from '../tools.js';
import { loadRegistry, serverByName, type ApiRef, type AuthGroup, type ServerSpec } from '../registry.js';
import { assignToolNames, flattenMethods, MAX_TOOL_NAME, nameBudget, type DiscoveryDoc, type MethodRecord } from './methods.js';
import { clipText, paramToZod, schemaToZod, PARAM_DESC_MAX } from './schema.js';

/**
 * Name of the per-server list tool. It is unique within its server, and short,
 * because the full name must fit Claude Code's 64-character limit.
 */
export const LIST_METHODS_SUFFIX = 'api_methods';

/** runServer adds a confirm flag to destructive tools, so no API parameter may use this name. */
const RESERVED_ARGS = ['confirm'];

type HttpMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ToolKindsFile {
  overrides: Record<string, ToolKind>;
  notes: Record<string, string>;
}

export interface RequestField {
  /** Name of the tool argument. */
  arg: string;
  /** Name of the API parameter, or "body" for the request body. */
  api: string;
  location: 'path' | 'query' | 'body';
}

export interface RequestPlan {
  fullId: string;
  httpMethod: string;
  rootUrl: string;
  servicePath: string;
  path: string;
  fields: RequestField[];
}

export interface BuiltRequest {
  method: HttpMethodName;
  url: string;
  params: Record<string, unknown>;
  data?: unknown;
}

export interface DiscoverySource {
  /** Short API key from config/servers.json. */
  apiName: string;
  apiVersion: string;
  doc: DiscoveryDoc;
}

export interface GeneratedTools {
  tools: ToolDef[];
  /** fullIds of media-upload methods, which are not generated. */
  skippedUploads: string[];
}

// ---------------------------------------------------------------------------
// Data locations

function hasSnapshots(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.json') && !f.startsWith('_'));
  } catch {
    return false;
  }
}

/**
 * Directory that contains the "discovery" folder. GSM_DATA_DIR overrides it.
 * Otherwise walks up from this module: a "discovery" folder means the plugin
 * layout, a "data/discovery" folder means the repo layout. Returns undefined if
 * neither is found.
 */
export function resolveDataDir(fromUrl: string = import.meta.url): string | undefined {
  const override = process.env.GSM_DATA_DIR?.trim();
  if (override) return override;

  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    if (hasSnapshots(join(dir, 'discovery'))) return dir;
    if (hasSnapshots(join(dir, 'data', 'discovery'))) return join(dir, 'data');
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Reads config/tool-kinds.json (repo layout) or tool-kinds.json (plugin layout). Missing file means no overrides. */
export function loadToolKinds(dataRoot: string): ToolKindsFile {
  const file = [join(dataRoot, 'config', 'tool-kinds.json'), join(dataRoot, 'tool-kinds.json')].find((p) => existsSync(p));
  const result: ToolKindsFile = { overrides: {}, notes: {} };
  if (!file) return result;

  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'notes') {
      if (value && typeof value === 'object') {
        for (const [api, text] of Object.entries(value as Record<string, unknown>)) {
          if (typeof text === 'string') result.notes[api] = text;
        }
      }
      continue;
    }
    if (value === 'read' || value === 'write' || value === 'destructive') {
      result.overrides[key] = value;
    } else {
      process.stderr.write(`[tool-kinds] ignored ${key}: ${JSON.stringify(value)} (expected read, write or destructive)\n`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Auth

type Auth = OAuth2Client | JWT;
const authCache = new Map<AuthGroup, Promise<Auth>>();

/**
 * One authorized client per auth group, cached for the life of the process. The
 * cloud group falls back to Application Default Credentials when no OAuth token
 * is stored, as the curated cloud server does.
 */
export function authFor(group: AuthGroup, cfg: RuntimeConfig): Promise<Auth> {
  const cached = authCache.get(group);
  if (cached) return cached;

  const pending = (async (): Promise<Auth> => {
    if (group === 'cloud' && !loadUserTokens('cloud', cfg)) return getCloudAdcClient();
    // 'business' is not yet a member of AuthKind in core/auth.ts (core change requested).
    return getAuthClient(group as AuthKind, cfg);
  })();
  authCache.set(group, pending);
  // A failed attempt (for example, not logged in yet) is not cached.
  pending.catch(() => authCache.delete(group));
  return pending;
}

// ---------------------------------------------------------------------------
// URLs and requests

function requireValue(values: Record<string, unknown>, name: string): string {
  const value = values[name];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing path parameter "${name}".`);
  }
  return String(value);
}

/**
 * Builds the request URL. {param} is one encoded segment. {+param} keeps its
 * slashes, so resource names such as "projects/p/locations/us" pass through.
 */
export function buildUrl(rootUrl: string, servicePath: string, path: string, values: Record<string, unknown>): string {
  const expanded = path
    .replace(/\{\+(\w+)\}/g, (_match, name: string) =>
      requireValue(values, name)
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/'),
    )
    .replace(/\{(\w+)\}/g, (_match, name: string) => encodeURIComponent(requireValue(values, name)));

  const base = [rootUrl.replace(/\/+$/, ''), servicePath.replace(/^\/+|\/+$/g, '')].filter((p) => p.length > 0).join('/');
  return `${base}/${expanded.replace(/^\/+/, '')}`;
}

/**
 * Query string with repeated keys for array values (ids=a&ids=b), which is how
 * Google APIs read repeated parameters. gaxios's default would join them with commas.
 */
export function serializeQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  return search.toString();
}

/** Turns tool arguments into the HTTP request. Makes no network call. */
export function buildRequest(plan: RequestPlan, args: Record<string, unknown>): BuiltRequest {
  const pathValues: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};
  let data: unknown;

  for (const field of plan.fields) {
    const value = args[field.arg];
    if (field.location === 'path') {
      pathValues[field.api] = value;
    } else if (value === undefined || value === null) {
      continue;
    } else if (field.location === 'query') {
      params[field.api] = value;
    } else {
      data = value;
    }
  }

  return {
    method: plan.httpMethod as HttpMethodName,
    url: buildUrl(plan.rootUrl, plan.servicePath, plan.path, pathValues),
    params,
    data,
  };
}

// ---------------------------------------------------------------------------
// Tool generation

function buildMethodTool(
  m: MethodRecord,
  name: string,
  doc: DiscoveryDoc,
  group: AuthGroup,
  cfg: RuntimeConfig,
  note: string | undefined,
): ToolDef {
  const shape: ZodRawShape = {};
  const fields: RequestField[] = [];
  const argFor = (param: string): string => (RESERVED_ARGS.includes(param) ? `${param}Param` : param);

  for (const p of m.parameters.filter((p) => p.location === 'path')) {
    const arg = argFor(p.name);
    shape[arg] = paramToZod({ ...p, required: true });
    fields.push({ arg, api: p.name, location: 'path' });
  }
  for (const p of m.parameters.filter((p) => p.location !== 'path')) {
    const arg = argFor(p.name);
    shape[arg] = paramToZod(p);
    fields.push({ arg, api: p.name, location: 'query' });
  }

  if (m.requestRef) {
    const taken = new Set([...Object.keys(shape), ...RESERVED_ARGS]);
    let bodyArg = 'body';
    for (let i = 0; taken.has(bodyArg); i++) bodyArg = i === 0 ? 'requestBody' : `requestBody${i}`;
    shape[bodyArg] = schemaToZod({ $ref: m.requestRef }, { schemas: doc.schemas }).optional();
    fields.push({ arg: bodyArg, api: 'body', location: 'body' });
  }

  const parts = [m.description || `Calls ${m.fullId}.`];
  if (note) parts.push(`Note: ${note}`);
  parts.push(`Method ${m.fullId}: ${m.httpMethod} ${m.path}.`);

  const plan: RequestPlan = {
    fullId: m.fullId,
    httpMethod: m.httpMethod,
    rootUrl: doc.rootUrl,
    servicePath: doc.servicePath,
    path: m.path,
    fields,
  };

  const tool: ToolDef = {
    name,
    title: m.fullId,
    description: parts.join(' '),
    kind: m.kind,
    inputSchema: shape,
    async handler(args) {
      const req = buildRequest(plan, args as Record<string, unknown>);
      const client = await authFor(group, cfg);
      const hasParams = Object.keys(req.params).length > 0;
      const res = await client.request({
        url: req.url,
        method: req.method,
        params: hasParams ? req.params : undefined,
        paramsSerializer: serializeQuery,
        data: req.data,
      });
      return res.data;
    },
  };

  if (m.kind === 'destructive') {
    tool.preview = (args) => {
      const req = buildRequest(plan, args as Record<string, unknown>);
      return { method: m.fullId, url: req.url, query: req.params, body: req.data ?? null };
    };
  }
  return tool;
}

interface ListRow {
  method: string;
  tool: string;
  httpMethod: string;
  kind: ToolKind;
  description: string;
}

function buildListTool(name: string, serverName: string, rows: ListRow[]): ToolDef {
  return {
    name,
    title: `${serverName}: API methods`,
    description: `List the ${rows.length} generated API methods of ${serverName}: method id, tool name, HTTP verb, safety kind and description. Pass contains to filter by text.`,
    kind: 'read',
    inputSchema: {
      contains: z
        .string()
        .optional()
        .describe('Case-insensitive text to match in the method id, tool name or description.'),
    },
    async handler(args) {
      const needle = typeof args.contains === 'string' ? args.contains.toLowerCase() : '';
      return rows
        .filter((r) => !needle || `${r.method} ${r.tool} ${r.description}`.toLowerCase().includes(needle))
        .map(({ method, tool, httpMethod, kind, description }) => ({ method, tool, httpMethod, kind, description }));
    },
  };
}

/**
 * Pure generation step: no file or network access beyond what the inputs hold.
 * The server's name sets the list tool's name.
 */
export function generateDiscoveryTools(
  serverName: string,
  group: AuthGroup,
  sources: DiscoverySource[],
  kinds: ToolKindsFile,
  cfg: RuntimeConfig,
  maxNameLength: number = MAX_TOOL_NAME,
): GeneratedTools {
  const entries: Array<{ method: MethodRecord; doc: DiscoveryDoc }> = [];
  const skippedUploads: string[] = [];

  for (const src of sources) {
    for (const method of flattenMethods(src.doc, src.apiName, src.apiVersion, kinds.overrides)) {
      if (method.uploadable) {
        skippedUploads.push(method.fullId);
        continue;
      }
      entries.push({ method, doc: src.doc });
    }
  }

  // Deterministic order, so names and tool lists do not depend on file order.
  entries.sort((a, b) => {
    const ka = `${a.method.apiName}|${a.method.apiVersion}|${a.method.fullId}`;
    const kb = `${b.method.apiName}|${b.method.apiVersion}|${b.method.fullId}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const listName = LIST_METHODS_SUFFIX;
  const names = assignToolNames(
    entries.map((e) => e.method),
    [listName],
    maxNameLength,
  );

  const tools: ToolDef[] = [];
  const rows: ListRow[] = [];
  entries.forEach((entry, i) => {
    const name = names[i]!;
    const m = entry.method;
    tools.push(buildMethodTool(m, name, entry.doc, group, cfg, kinds.notes[m.apiName]));
    rows.push({
      method: m.fullId,
      tool: name,
      httpMethod: m.httpMethod,
      kind: m.kind,
      description: clipText(m.description, PARAM_DESC_MAX) ?? '',
    });
  });
  tools.push(buildListTool(listName, serverName, rows));

  return { tools, skippedUploads };
}

function uniqueApis(apis: ApiRef[]): ApiRef[] {
  const seen = new Map<string, ApiRef>();
  for (const a of apis) seen.set(`${a.api}.${a.version}`, a);
  return [...seen.values()];
}

/**
 * Tools for one server: every method of its discovery APIs plus the list tool.
 * Returns [] for a server without discovery APIs. Missing snapshots are
 * reported on stderr and skipped, so the server still starts.
 */
export async function discoveryToolsFor(serverName: string, cfg: RuntimeConfig): Promise<ToolDef[]> {
  const reg = loadRegistry();
  const server: ServerSpec = serverByName(reg, serverName);
  const apis = uniqueApis(server.apis ?? []);
  if (apis.length === 0) return [];

  const dataDir = resolveDataDir();
  if (!dataDir) {
    process.stderr.write(`[${serverName}] no discovery snapshots found. Run: node scripts/snapshot-discovery.mjs\n`);
    return [];
  }

  const sources: DiscoverySource[] = [];
  const missing: string[] = [];
  for (const a of apis) {
    const file = join(dataDir, 'discovery', `${a.api}.${a.version}.json`);
    if (!existsSync(file)) {
      missing.push(`${a.api}.${a.version}`);
      continue;
    }
    sources.push({ apiName: a.api, apiVersion: a.version, doc: JSON.parse(readFileSync(file, 'utf8')) as DiscoveryDoc });
  }
  if (missing.length > 0) {
    process.stderr.write(`[${serverName}] no discovery snapshot for: ${missing.join(', ')}. Run: node scripts/snapshot-discovery.mjs\n`);
  }

  const kinds = loadToolKinds(reg.dataRoot);
  const generated = generateDiscoveryTools(serverName, server.group, sources, kinds, cfg, nameBudget(server.plugin, serverName));
  if (generated.skippedUploads.length > 0) {
    process.stderr.write(
      `[${serverName}] skipped ${generated.skippedUploads.length} media-upload method(s): ${generated.skippedUploads.join(', ')}\n`,
    );
  }
  return generated.tools;
}
