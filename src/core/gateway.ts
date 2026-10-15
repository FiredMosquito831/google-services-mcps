/**
 * Gateway tools for one product. Three generic tools cover every API of the
 * product, so the tool list stays small while the surface stays complete:
 *
 *   api_search    find methods by text, API name or safety kind
 *   api_describe  show one method's parameters, body fields and response
 *   api_call      run one method
 *
 * Method facts (id, HTTP verb, path template, scopes, flags) come from the
 * catalog (data/catalog.json, or catalog.json in an installed plugin). Parameter
 * and schema details come from the full Discovery document, cached for seven
 * days under <tokenDir>/discovery-cache.
 *
 * Safety rules, enforced here and not left to the caller:
 *  - a method id is matched exactly against the product's catalog entries;
 *  - upload methods are refused;
 *  - each path value is one URL segment, and "." and ".." segments are refused;
 *  - query names must be declared by the Discovery document, and credential and
 *    upload parameters are never accepted;
 *  - a GET never sends a body;
 *  - a method whose scopes the stored grant does not hold is refused before any
 *    request, and before the gate;
 *  - every write or destructive call calls ctx.gate first, and no request is sent
 *    when the gate throws. Without a gate, writes are refused;
 *  - secrets are redacted from the gate arguments, from errors and from results;
 *  - the apikey group's client (discovery/apikey-client.ts) adds the API key as the key
 *    query parameter. The gateway never builds the key into a URL, and the key never
 *    appears in an error message.
 *
 * api_call is kind 'dynamic': runServer registers it always and does not gate it, so
 * the handler gates each write or destructive call itself. Reads are not gated. A method
 * whose kind is dynamic (the Google Ads mutate methods) is classed per call from its body
 * (core/dynamic.ts), so a validate-only call is a read. A Google Ads call also carries the
 * developer-token header (core/ads.ts), and a missing token is refused before the gate.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { RuntimeConfig } from './config.js';
import type { AuthGroup } from './registry.js';
import { classifyMethod } from './discovery/methods.js';
import { buildUrl, loadToolKinds, sendAuthorized } from './discovery/tools.js';
import type { GateFn } from './approval.js';
import { adsHeaders, isGoogleAdsUrl } from './ads.js';
import { resolveDynamicKind } from './dynamic.js';
import { describeError, scopeHint, type ActionKind, type ToolContext, type ToolDef, type ToolKind } from './tools.js';

// ---------------------------------------------------------------------------
// Public types

export interface GatewayInput {
  product: string;
  group: string;
  apis: Array<{ api: string; version: string }>;
  cfg: RuntimeConfig;
}

/** Test seam: replaces the authorized API request. Production code never sets it. */
export type TestRequest = (req: {
  url: string;
  method: HttpVerb;
  params?: Record<string, unknown>;
  data?: unknown;
}) => Promise<{ status: number; data: unknown }>;

// ---------------------------------------------------------------------------
// Constants and schemas

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
type HttpVerb = (typeof HTTP_VERBS)[number];

/** Auth groups the gateway serves. apikey has no OAuth login: its client adds the API key to each request. */
const GROUPS: readonly string[] = ['cloud', 'workspace-user', 'workspace-admin', 'searchconsole', 'business', 'developer', 'apikey'];
const API_KEY_GROUP = 'apikey';

const DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 30_000;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
const PATH_PLACEHOLDER = /\{\+?(\w+)\}/g;
const MAX_PATH_VALUE = 512;

/** Query names the gateway refuses: credentials, the API key and upload controls. Compared lowercase. */
const RESERVED_QUERY = new Set(['access_token', 'oauth_token', 'key', 'uploadtype', 'upload_protocol']);

/** Keys whose values are never returned or shown. Compared after removing "-" and "_", lowercase. */
const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'clientsecret',
  'privatekey',
  'privatekeydata',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'apikey',
  'apikeystring',
  'keystring',
  'authorization',
  'cookie',
  'setcookie',
  'credential',
  'credentials',
  'sessiontoken',
]);

/** Secret-looking text: PEM keys, Google access and refresh tokens, API keys, bearer headers. */
const SECRET_TEXT: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bya29\.[A-Za-z0-9._~+/=-]+/g,
  /\b1\/\/[A-Za-z0-9._~+/=-]{12,}/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
];

const searchShape = {
  query: z.string().min(1).max(200).describe('Text to find in the method id, HTTP path, API name or API title. Case-insensitive.'),
  api: z.string().min(1).max(100).optional().describe('Restrict to one API by name, for example "gmail".'),
  kind: z
    .enum(['read', 'write', 'destructive', 'dynamic'])
    .optional()
    .describe('Keep only methods of this safety kind. dynamic is decided per call from the body (Google Ads mutate).'),
  limit: z.number().int().min(1).max(100).optional().describe('Maximum results to return (default 25).'),
};

const describeShape = {
  method: z.string().min(1).max(300).describe('Full method id, for example "gmail.users.messages.send".'),
};

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const callShape = {
  method: z.string().min(1).max(300).describe('Full method id, for example "gmail.users.messages.list".'),
  pathParams: z
    .record(z.string(), z.string())
    .optional()
    .describe('Values for the {name} placeholders in the method path, as strings.'),
  query: z
    .record(z.string(), z.union([scalar, z.array(scalar)]))
    .optional()
    .describe('Query parameters declared by the method, for example {"pageSize": 10}.'),
  body: z.record(z.string(), z.unknown()).optional().describe('JSON request body, for methods that take one.'),
};

type SearchArgs = z.infer<z.ZodObject<typeof searchShape>>;
type DescribeArgs = z.infer<z.ZodObject<typeof describeShape>>;
type CallArgs = z.infer<z.ZodObject<typeof callShape>>;

const TOOL_TEXT = {
  search: {
    title: 'Search API methods',
    description:
      "Search the methods of this product's APIs by text (method id, HTTP path, API name or title). Returns method ids, HTTP verbs, paths, safety kind and scopes. Use api_describe for parameters, then api_call to run a method. Upload methods are not listed.",
  },
  describe: {
    title: 'Describe an API method',
    description:
      'Describe one method: HTTP verb, path, safety kind, scopes, parameters (path and query), the top-level fields of the request body, and the response schema name. Takes the full method id.',
  },
  call: {
    title: 'Call an API method',
    description:
      "Call one method of this product's APIs. Path values go in pathParams, declared query parameters in query, and the JSON body in body. Reads run directly. Writes and deletes ask the user for approval first, and are refused without it. Upload methods are not supported.",
  },
} as const;

// ---------------------------------------------------------------------------
// Catalog

interface CatalogMethod {
  id: string;
  httpMethod: HttpVerb;
  path: string;
  scopes: string[];
  flags: string;
  upload: boolean;
}

interface CatalogApi {
  name: string;
  version: string;
  title: string;
  description: string;
  rootUrl: string;
  servicePath: string;
  /** Where the full Discovery document is served, when it is not the directory path (for example googleads). */
  discoveryRestUrl?: string;
  methods: CatalogMethod[];
}

interface Catalog {
  file: string;
  apis: CatalogApi[];
}

/** Same walk-up as resolveDataDir: GSM_DATA_DIR first, else up from this module. */
export function catalogPath(fromUrl: string = import.meta.url): string | undefined {
  const inDir = (dir: string): string | undefined =>
    [join(dir, 'catalog.json'), join(dir, 'data', 'catalog.json')].find((p) => existsSync(p));

  const override = process.env.GSM_DATA_DIR?.trim();
  if (override) return inDir(override);

  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    const hit = inDir(dir);
    if (hit) return hit;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isVerb = (v: string): v is HttpVerb => (HTTP_VERBS as readonly string[]).includes(v);

/** Tuples that cannot be called (unknown verb, bad shape) are dropped: they cannot be served safely. */
function parseMethod(t: unknown): CatalogMethod[] {
  if (!Array.isArray(t) || typeof t[0] !== 'string' || typeof t[2] !== 'string') return [];
  const verb = String(t[1] ?? '').toUpperCase();
  if (!isVerb(verb)) return [];
  const flags = typeof t[4] === 'string' ? t[4] : '';
  const scopes = Array.isArray(t[3]) ? t[3].filter((s): s is string => typeof s === 'string') : [];
  return [{ id: t[0], httpMethod: verb, path: t[2], scopes, flags, upload: flags.includes('u') }];
}

function parseCatalogApis(raw: unknown, file: string): CatalogApi[] {
  const list = (raw as { apis?: unknown } | null)?.apis;
  if (!Array.isArray(list)) throw new Error(`${file} has no "apis" list. Rebuild it with: node scripts/build-catalog.mjs`);
  return list.map((item): CatalogApi => {
    const a = (item ?? {}) as Record<string, unknown>;
    const methods = Array.isArray(a.methods) ? a.methods : [];
    return {
      name: str(a.name),
      version: str(a.version),
      title: str(a.title),
      description: str(a.description),
      rootUrl: str(a.rootUrl),
      servicePath: str(a.servicePath),
      discoveryRestUrl: str(a.discoveryRestUrl).startsWith('https://') ? str(a.discoveryRestUrl) : undefined,
      methods: methods.flatMap(parseMethod),
    };
  });
}

const catalogCache = new Map<string, CatalogApi[]>();

function loadCatalog(): Catalog {
  const file = catalogPath();
  if (!file) {
    throw new Error('The API catalog (catalog.json) was not found. Set GSM_DATA_DIR, or build it with: node scripts/build-catalog.mjs');
  }
  let apis = catalogCache.get(file);
  if (!apis) {
    apis = parseCatalogApis(JSON.parse(readFileSync(file, 'utf8')), file);
    catalogCache.set(file, apis);
  }
  return { file, apis };
}

/** Kind overrides from config/tool-kinds.json, looked up as the discovery engine does: beside the catalog, then one level up. */
function overridesFor(file: string): Record<string, ToolKind> {
  const dir = dirname(file);
  for (const root of [dir, dirname(dir)]) {
    const kinds = loadToolKinds(root);
    if (Object.keys(kinds.overrides).length > 0) return kinds.overrides;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Product index

interface IndexEntry {
  id: string;
  api: CatalogApi;
  method: CatalogMethod;
  /** read, write, destructive, or dynamic (decided per call from the body; see callKindOf). */
  kind: ToolKind;
}

interface ProductIndex {
  /** The product's APIs that the catalog has. */
  apis: CatalogApi[];
  /** Name.version pairs the product lists but the catalog lacks. */
  missing: string[];
  byId: Map<string, IndexEntry>;
}

function buildIndex(input: GatewayInput, catalog: Catalog): ProductIndex {
  const overrides = overridesFor(catalog.file);
  const apis: CatalogApi[] = [];
  const missing: string[] = [];
  for (const ref of input.apis) {
    const found = catalog.apis.find((a) => a.name === ref.api && a.version === ref.version);
    if (found) apis.push(found);
    else missing.push(`${ref.api}.${ref.version}`);
  }

  const byId = new Map<string, IndexEntry>();
  for (const api of apis) {
    for (const method of api.methods) {
      if (byId.has(method.id)) continue;
      const methodName = method.id.slice(method.id.lastIndexOf('.') + 1);
      const kind = classifyMethod(method.httpMethod, methodName, method.id, overrides);
      byId.set(method.id, { id: method.id, api, method, kind });
    }
  }
  return { apis, missing, byId };
}

function apiList(idx: ProductIndex): string {
  const names = idx.apis.map((a) => `${a.name}.${a.version}`);
  if (idx.missing.length > 0) names.push(`(not in the catalog: ${idx.missing.join(', ')})`);
  return names.length > 0 ? names.join(', ') : 'none';
}

interface Core {
  input: GatewayInput;
  index(): ProductIndex;
}

function createCore(input: GatewayInput): Core {
  let cached: ProductIndex | undefined;
  return {
    input,
    index: () => {
      if (!cached) cached = buildIndex(input, loadCatalog());
      return cached;
    },
  };
}

function resolveMethod(core: Core, id: string): IndexEntry {
  const entry = core.index().byId.get(id);
  if (!entry) {
    throw new Error(`Method "${id}" is not in product "${core.input.product}". This product's APIs: ${apiList(core.index())}.`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Discovery documents (full, as Google serves them)

interface RawParam {
  name?: string;
  type?: string;
  format?: string;
  location?: string;
  required?: boolean;
  repeated?: boolean;
  description?: string;
  enum?: string[];
}

interface RawSchema {
  type?: string;
  $ref?: string;
  description?: string;
  properties?: Record<string, RawSchema>;
  items?: RawSchema;
}

interface RawMethod {
  id?: string;
  path?: string;
  httpMethod?: string;
  parameters?: Record<string, RawParam> | RawParam[];
  request?: string | { $ref?: string };
  response?: string | { $ref?: string };
}

interface RawResource {
  methods?: Record<string, RawMethod>;
  resources?: Record<string, RawResource>;
}

interface RawDiscovery {
  name?: string;
  version?: string;
  parameters?: Record<string, RawParam>;
  schemas?: Record<string, RawSchema>;
  resources?: Record<string, RawResource>;
}

function parseDiscovery(text: string, api: string, version: string): RawDiscovery {
  let doc: RawDiscovery;
  try {
    doc = JSON.parse(text) as RawDiscovery;
  } catch {
    throw new Error(`The Discovery document for ${api}.${version} is not valid JSON.`);
  }
  if (!doc || typeof doc !== 'object' || !doc.resources) throw new Error(`${api}.${version} is not a Discovery document.`);
  return doc;
}

/** The Discovery document, from <tokenDir>/discovery-cache when it is under seven days old, else fetched and cached. */
let fetchOverride: typeof fetch | undefined;

async function loadRawDiscovery(api: string, version: string, cfg: RuntimeConfig, discoveryRestUrl?: string): Promise<RawDiscovery> {
  if (!SAFE_NAME.test(api) || !SAFE_NAME.test(version)) {
    throw new Error(`The catalog has an unexpected API name or version: ${api}.${version}.`);
  }
  const dir = join(cfg.tokenDir, 'discovery-cache');
  const file = join(dir, `${api}.${version}.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < DISCOVERY_TTL_MS) {
    try {
      return parseDiscovery(readFileSync(file, 'utf8'), api, version);
    } catch {
      // A damaged cache file is ignored and replaced below.
    }
  }

  const url = discoveryRestUrl ?? `https://www.googleapis.com/discovery/v1/apis/${encodeURIComponent(api)}/${encodeURIComponent(version)}/rest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let text: string;
  try {
    const res = await (fetchOverride ?? fetch)(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    const why = controller.signal.aborted
      ? `no answer within ${DISCOVERY_TIMEOUT_MS / 1000} seconds`
      : (err as Error).message;
    throw new Error(`Could not fetch the Discovery document for ${api}.${version}: ${why}.`);
  } finally {
    clearTimeout(timer);
  }

  const doc = parseDiscovery(text, api, version);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, text, 'utf8');
  } catch {
    // The cache is an optimisation. A failed write only means the next call fetches again.
  }
  return doc;
}

function findRawMethod(doc: RawDiscovery, id: string): RawMethod | undefined {
  const walk = (resources: Record<string, RawResource> | undefined): RawMethod | undefined => {
    for (const resource of Object.values(resources ?? {})) {
      for (const method of Object.values(resource.methods ?? {})) {
        if (method.id === id) return method;
      }
      const nested = walk(resource.resources);
      if (nested) return nested;
    }
    return undefined;
  };
  return walk(doc.resources);
}

async function rawMethodFor(entry: IndexEntry, cfg: RuntimeConfig): Promise<{ doc: RawDiscovery; raw: RawMethod }> {
  const doc = await loadRawDiscovery(entry.api.name, entry.api.version, cfg, entry.api.discoveryRestUrl);
  const raw = findRawMethod(doc, entry.id);
  if (!raw) {
    throw new Error(
      `The Discovery document for ${entry.api.name}.${entry.api.version} has no method ${entry.id}. Refresh the catalog, or delete the cached file under discovery-cache.`,
    );
  }
  return { doc, raw };
}

interface ParamInfo {
  name: string;
  location: string;
  required: boolean;
  type: string;
  description: string;
  enum?: string[];
}

/** Parameters come as a map in the full document (an array in compacted snapshots). Both are accepted. */
function paramsOf(src: Record<string, RawParam> | RawParam[] | undefined): ParamInfo[] {
  const entries: Array<[string, RawParam]> = Array.isArray(src)
    ? src.map((p): [string, RawParam] => [p.name ?? '', p])
    : Object.entries(src ?? {});
  return entries
    .filter(([name]) => name !== '')
    .map(([name, p]) => {
      const base = p.type ?? 'string';
      return {
        name,
        location: p.location ?? 'query',
        required: p.required === true,
        type: p.repeated ? `${base}[]` : base,
        description: clip(p.description, 200),
        enum: p.enum,
      };
    });
}

function refOf(x: string | { $ref?: string } | undefined): string | undefined {
  return typeof x === 'string' ? x : x?.$ref;
}

/** A property's type, one level deep. A $ref is named, not expanded. */
function typeLabel(s: RawSchema): string {
  if (s.$ref) return s.$ref;
  if (s.type === 'array') return `array<${s.items ? typeLabel(s.items) : 'any'}>`;
  return s.type ?? (s.properties ? 'object' : 'any');
}

function propertiesOf(schema: RawSchema | undefined): Array<{ name: string; type: string; description: string }> {
  return Object.entries(schema?.properties ?? {})
    .slice(0, 40)
    .map(([name, p]) => ({ name, type: typeLabel(p), description: clip(p.description, 120) }));
}

function clip(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

// ---------------------------------------------------------------------------
// Redaction

const normalizeKey = (k: string): string => k.replace(/[-_]/g, '').toLowerCase();

function redactText(text: string): string {
  return SECRET_TEXT.reduce((acc, re) => acc.replace(re, '[redacted]'), text);
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]): [string, unknown] => [k, SECRET_KEYS.has(normalizeKey(k)) ? '[redacted]' : redactValue(v)]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Errors

function loginHint(group: string): string {
  if (group === API_KEY_GROUP) return 'set GSM_API_KEY, or put {"apiKey": "..."} in apikey.json in the token folder';
  return group === 'workspace-admin' ? 'gsm setup-admin --subject <email> --key-file <file>' : `gsm login ${group}`;
}

/**
 * Turns an API error into a message for the model. Uses the shared formatter, which adds the scope hint on a 403.
 * Never includes request config (it holds the token), and never the API key.
 */
function httpError(err: unknown, group: string, apiKey?: string): string {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  const status = Number(e?.code ?? e?.status ?? e?.response?.status);
  let text = describeError(err, group);
  if (status === 401) {
    text += ` | The stored login for "${group}" was rejected or has expired. Log in again: ${loginHint(group)}.`;
  }
  if (group === API_KEY_GROUP && !apiKey && [400, 401, 403].includes(status)) {
    text += ` | No API key is set. To set one: ${loginHint(group)}.`;
  }
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  return redactText(text);
}

/** The error for a method the stored grant cannot run. Names the scopes it needs and the command that fixes it. */
function scopeRefusal(id: string, needed: string[], group: string): string {
  return `The stored login for "${group}" holds none of the scopes ${id} needs (${needed.join(', ')}). ${scopeHint(group)}`;
}

// ---------------------------------------------------------------------------
// Request validation

/** Path values: every placeholder must be given and declared by the Discovery document; each value is one segment, or several for {+name}, with no "." or ".." segments. */
function validatePathParams(path: string, given: Record<string, string>, declared: ReadonlySet<string>): Record<string, string> {
  const names = new Set([...path.matchAll(PATH_PLACEHOLDER)].map((m) => m[1] ?? ''));
  for (const key of Object.keys(given)) {
    if (!names.has(key)) {
      throw new Error(`"${key}" is not a path parameter of this method. Path parameters: ${[...names].join(', ') || 'none'}.`);
    }
  }
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = given[name];
    if (value === undefined || value === '') throw new Error(`Missing path parameter "${name}".`);
    if (!declared.has(name)) throw new Error(`The Discovery document does not declare path parameter "${name}". Refusing to build the URL.`);
    if (value.length > MAX_PATH_VALUE) throw new Error(`Path parameter "${name}" is longer than ${MAX_PATH_VALUE} characters.`);
    if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
      throw new Error(`Path parameter "${name}" must not contain "." or ".." segments.`);
    }
    out[name] = value;
  }
  return out;
}

function validateQuery(given: Record<string, unknown>, allowed: ReadonlySet<string>): Record<string, unknown> {
  for (const key of Object.keys(given)) {
    if (RESERVED_QUERY.has(key.toLowerCase())) {
      throw new Error(`Query parameter "${key}" is set by the gateway and cannot be passed.`);
    }
    if (!allowed.has(key)) {
      throw new Error(`"${key}" is not a query parameter of this method. Allowed: ${[...allowed].sort().join(', ') || 'none'}.`);
    }
  }
  return given;
}

/** The final URL must stay on the API's origin and under its base path. Defence in depth behind the segment checks. */
function checkUrl(url: string, rootUrl: string, servicePath: string): void {
  const base = new URL(buildUrl(rootUrl, servicePath, '', {}));
  const got = new URL(url);
  if (got.origin !== base.origin || !got.pathname.startsWith(base.pathname)) {
    throw new Error('Refusing to send: the request URL leaves the API root.');
  }
}

// ---------------------------------------------------------------------------
// Operations

function toSearchRow(e: IndexEntry): Record<string, unknown> {
  return {
    method: e.id,
    httpMethod: e.method.httpMethod,
    path: e.method.path,
    kind: e.kind,
    scopes: e.method.scopes,
    description: clip(e.api.description, 160),
  };
}

function runSearch(core: Core, args: SearchArgs): unknown {
  const idx = core.index();
  const needle = args.query.trim().toLowerCase();
  if (!needle) throw new Error('query must contain some text.');

  // Upload methods cannot be called here, so they are not offered.
  let entries = [...idx.byId.values()].filter((e) => !e.method.upload);
  if (args.api) {
    const want = args.api.trim().toLowerCase();
    if (!idx.apis.some((a) => a.name.toLowerCase() === want)) {
      throw new Error(`API "${args.api}" is not one of product "${core.input.product}"'s APIs. Its APIs: ${apiList(idx)}.`);
    }
    entries = entries.filter((e) => e.api.name.toLowerCase() === want);
  }
  if (args.kind) entries = entries.filter((e) => e.kind === args.kind);

  const matches = entries
    .filter((e) => [e.id, e.method.path, e.api.name, e.api.title].some((field) => field.toLowerCase().includes(needle)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const limit = args.limit ?? 25;
  return {
    total: matches.length,
    returned: Math.min(limit, matches.length),
    results: matches.slice(0, limit).map(toSearchRow),
  };
}

async function runDescribe(core: Core, args: DescribeArgs): Promise<unknown> {
  const entry = resolveMethod(core, args.method);
  const { doc, raw } = await rawMethodFor(entry, core.input.cfg);
  const reqRef = refOf(raw.request);
  return {
    method: entry.id,
    httpMethod: entry.method.httpMethod,
    path: entry.method.path,
    kind: entry.kind,
    scopes: entry.method.scopes,
    flags: entry.method.flags,
    parameters: paramsOf(raw.parameters).map((p) => ({
      name: p.name,
      location: p.location,
      required: p.required,
      type: p.type,
      description: p.description,
      enum: p.enum?.slice(0, 30),
    })),
    requestBody: reqRef ? { schema: reqRef, properties: propertiesOf(doc.schemas?.[reqRef]) } : null,
    response: refOf(raw.response) ?? null,
  };
}

interface WireRequest {
  url: string;
  method: HttpVerb;
  params?: Record<string, unknown>;
  data?: unknown;
}

/**
 * Sends one request through authFor, the same path the per-method tools use. The apikey
 * group's client adds the key, so this function never builds it into the URL. Only
 * reached after the gate, for writes.
 */
function sendRequest(cfg: RuntimeConfig, group: string, req: WireRequest): Promise<{ status: number; data: unknown }> {
  return sendAuthorized(group as AuthGroup, cfg, req);
}

let requestOverride: TestRequest | undefined;

/**
 * The safety kind of one call. A method of kind dynamic is classed from its request body (resolveDynamicKind).
 * A dynamic method with no rule for its API is destructive, so the call asks.
 */
function callKindOf(entry: IndexEntry, body: unknown): ActionKind {
  if (entry.kind !== 'dynamic') return entry.kind;
  return resolveDynamicKind(entry.id, body) ?? 'destructive';
}

async function runCall(core: Core, args: CallArgs, ctx: ToolContext | undefined): Promise<unknown> {
  const { input } = core;
  const entry = resolveMethod(core, args.method);
  const { method, api } = entry;

  if (method.upload) throw new Error('upload methods are not supported by the gateway');
  if (!GROUPS.includes(input.group)) throw new Error(`Unknown auth group "${input.group}" for product "${input.product}".`);
  const group = input.group as AuthGroup;

  // A method whose scopes the stored grant does not hold is refused before the gate, so no approval is asked for it.
  // The apikey group has no OAuth grant, so the check does not apply there.
  if (input.group !== API_KEY_GROUP && !hasScopeOf(ctx, method.scopes)) {
    throw new Error(scopeRefusal(entry.id, method.scopes, input.group));
  }

  const hasBody = args.body !== undefined;
  if (method.httpMethod === 'GET' && hasBody) throw new Error(`${entry.id} is a GET method, so it takes no body.`);

  // Read-only: fetches the Discovery document (cached) to learn which parameters the method declares.
  const { doc, raw } = await rawMethodFor(entry, input.cfg);
  if (hasBody && !refOf(raw.request)) throw new Error(`${entry.id} takes no request body.`);

  const declaredPath = new Set(paramsOf(raw.parameters).filter((p) => p.location === 'path').map((p) => p.name));
  const allowedQuery = new Set(
    [...paramsOf(raw.parameters), ...paramsOf(doc.parameters)].filter((p) => p.location === 'query').map((p) => p.name),
  );
  const pathParams = validatePathParams(method.path, args.pathParams ?? {}, declaredPath);
  const query = validateQuery(args.query ?? {}, allowedQuery);

  const url = buildUrl(api.rootUrl, api.servicePath, method.path, pathParams);
  checkUrl(url, api.rootUrl, api.servicePath);
  const data = method.httpMethod === 'GET' ? undefined : args.body;

  // A Google Ads call with no developer token is refused here, before any approval is asked.
  if (isGoogleAdsUrl(url)) adsHeaders(input.cfg);

  const kind = callKindOf(entry, args.body);
  if (kind !== 'read') {
    // The gate sees the arguments with secrets redacted. The request below uses the real values.
    await gateOf(ctx)({
      kind,
      target: entry.id,
      methodId: entry.id,
      args: redactValue({ method: args.method, pathParams: args.pathParams, query: args.query, body: args.body }),
    });
  }

  // The query holds only the validated parameters. The apikey client adds the key itself, so the gateway never does.
  const params = Object.keys(query).length > 0 ? query : undefined;
  const isApiKey = input.group === API_KEY_GROUP;
  let res: { status: number; data: unknown };
  try {
    res = requestOverride
      ? await requestOverride({ url, method: method.httpMethod, params, data })
      : await sendRequest(input.cfg, input.group, { url, method: method.httpMethod, params, data });
  } catch (err) {
    throw new Error(httpError(err, input.group, isApiKey ? input.cfg.apiKey : undefined));
  }
  return { status: res.status, data: redactValue(res.data) };
}

// ---------------------------------------------------------------------------
// Tool definitions

/** The gate used when the caller passes no context. It refuses, so writes never run without an approval. */
const noGate: GateFn = async () => {
  throw new Error('Writes and deletes need the approval gate, and none is wired for this call. Only read methods run here.');
};

/** The context's gate, or the refusing one when there is no context. Fails closed. */
function gateOf(ctx: ToolContext | undefined): GateFn {
  const gate = ctx?.gate;
  return typeof gate === 'function' ? gate.bind(ctx) : noGate;
}

/**
 * The context's scope check. Without a context no grant is known, so the check passes, as it does for an
 * unknown grant. runServer always passes a context.
 */
function hasScopeOf(ctx: ToolContext | undefined, anyOf: string[]): boolean {
  return typeof ctx?.hasScope === 'function' ? ctx.hasScope(anyOf) : true;
}

/**
 * The three gateway tools. runServer calls each handler with its ToolContext. api_call is
 * kind 'dynamic': it gates each write or destructive call itself, after the scope check, and
 * reads are not gated.
 */
export function gatewayTools(input: GatewayInput): ToolDef[] {
  const core = createCore(input);
  return [
    {
      name: 'api_search',
      title: TOOL_TEXT.search.title,
      description: TOOL_TEXT.search.description,
      kind: 'read',
      inputSchema: searchShape,
      handler: async (args: SearchArgs) => runSearch(core, args),
    },
    {
      name: 'api_describe',
      title: TOOL_TEXT.describe.title,
      description: TOOL_TEXT.describe.description,
      kind: 'read',
      inputSchema: describeShape,
      handler: async (args: DescribeArgs) => runDescribe(core, args),
    },
    {
      name: 'api_call',
      title: TOOL_TEXT.call.title,
      description: TOOL_TEXT.call.description,
      kind: 'dynamic',
      inputSchema: callShape,
      handler: async (args: CallArgs, ctx: ToolContext) => runCall(core, args, ctx),
    },
  ];
}

// ---------------------------------------------------------------------------
// Test seams

/** Replaces the Discovery fetch (global fetch by default). Pass undefined to restore it. */
export function setFetchForTests(fn: typeof fetch | undefined): void {
  fetchOverride = fn;
}

/** Replaces the authorized API request, so tests never touch the network or tokens. Pass undefined to restore it. */
export function setRequestForTests(fn: TestRequest | undefined): void {
  requestOverride = fn;
}
