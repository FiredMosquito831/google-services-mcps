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
import { verboseOn, type RuntimeConfig } from '../config.js';
import { getAuthClient, type AuthKind } from '../auth.js';
import { isIdempotentMethod, requestWithRetry } from '../http.js';
import type { ToolContext, ToolDef, ToolKind } from '../tools.js';
import { loadRegistry, serverByName, type ApiRef, type AuthGroup, type PageSizeDefault, type ServerSpec } from '../registry.js';
import {
  assignToolNames,
  flattenMethods,
  MAX_TOOL_NAME,
  nameBudget,
  type DiscoveryDoc,
  type DiscoveryMethod,
  type DiscoveryResource,
  type MethodRecord,
} from './methods.js';
import { clipText, paramToZod, schemaToZod } from './schema.js';
import { ApiKeyClient } from './apikey-client.js';
import { adsHeaders, isGoogleAdsUrl, redactedError } from '../ads.js';
import { resolveDynamicKind } from '../dynamic.js';
import { redactCredentials } from '../credential-fields.js';
import { targetFieldsOf, targetGetFor } from '../target-preview.js';
import { contentRange, fromBytes, MediaBody, mediaPart, rangeHeader } from '../media.js';
import { base64PartBytes } from '../result-shape.js';

/**
 * Name of the per-server list tool. It is unique within its server, and short,
 * because the full name must fit Claude Code's 64-character limit.
 */
export const LIST_METHODS_SUFFIX = 'api_methods';

/**
 * Argument names the generated tools reserve. An API parameter with one of these names is renamed
 * (confirm becomes confirmParam), so it cannot be mistaken for a tool's own argument.
 */
const RESERVED_ARGS = ['confirm'];

/**
 * The longest tool description the suite sends. Claude Code cut longer descriptions before version 2.1.296 (since then
 * 4,096 for tools loaded at start; the 2026-10-30 review's reading of code.claude.com/docs/en/mcp), and other clients may
 * still. A generated tool's description is its method's description, the API's note and the method line; when the three
 * pass this, the method's description is cut to fit, so the note and the method line are never lost.
 */
export const TOOL_DESCRIPTION_MAX = 2048;

/** A method's description in the rows api_methods returns: a short line per method, as before 1.29.1. */
const METHOD_ROW_DESC_MAX = 200;

/**
 * HTTP verbs whose repeat has no further effect (RFC 9110 section 9.2.2), for the idempotentHint of a generated tool.
 * Not the retry rule of http.ts, which repeats a request only when it is safe to.
 */
const IDEMPOTENT_VERBS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

type HttpMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface ToolKindsFile {
  /** Exact method ids, or patterns with "*" (see overrideKind in methods.ts). */
  overrides: Record<string, ToolKind>;
  notes: Record<string, string>;
}

export interface RequestField {
  /** Name of the tool argument. */
  arg: string;
  /** Name of the API parameter, "body" for the request body, or the header name for a header. */
  api: string;
  location: 'path' | 'query' | 'body' | 'header';
}

export interface RequestPlan {
  fullId: string;
  httpMethod: string;
  rootUrl: string;
  servicePath: string;
  path: string;
  fields: RequestField[];
  /** Query values sent when the call gives none (config/products.json fieldsDefaults). Absent for most methods. */
  queryDefaults?: Record<string, string | number>;
  /** Headers sent when the call gives none (config/products.json fieldMaskDefaults). Absent for most methods. */
  headerDefaults?: Record<string, string>;
  /** The document's regional hosts (rootForPath). Absent for a document that lists none. */
  endpoints?: readonly RegionalEndpoint[];
}

export interface BuiltRequest {
  method: HttpMethodName;
  url: string;
  params: Record<string, unknown>;
  data?: unknown;
  /** Present only when the method sends a header (a response field mask). */
  headers?: Record<string, string>;
}

/** The header that carries a response field mask (Places API (New), and other APIs that document it). */
export const FIELD_MASK_HEADER = 'X-Goog-FieldMask';

/** One of a Discovery document's `endpoints`: a host that serves the API's paths for one location. */
export interface RegionalEndpoint {
  location?: string;
  endpointUrl?: string;
}

/**
 * A compacted snapshot (scripts/snapshot-discovery.mjs) also lists the document's system parameters by name, and its
 * regional and locational hosts.
 */
type SnapshotDoc = DiscoveryDoc & { systemParameters?: string[]; endpoints?: RegionalEndpoint[] };

/** The plan field for a document's regional hosts, or nothing when it lists none (the plan is then as before). */
function endpointsOf(doc: DiscoveryDoc): Pick<RequestPlan, 'endpoints'> {
  const endpoints = (doc as SnapshotDoc).endpoints;
  return endpoints?.length ? { endpoints } : {};
}

/** An endpoint host the suite sends to: https, under googleapis.com, and not a pre-production host. */
function usableEndpoint(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.googleapis.com') && !/(^|[.-])preprod([.-]|$)/.test(u.hostname) && u.pathname === '/';
  } catch {
    return false;
  }
}

/**
 * The root URL for a request: when the document lists endpoints and the request path names a location
 * (".../locations/<id>/...") that one of them serves, the first such endpoint in the document's order (only https hosts
 * under googleapis.com, never a pre-production host); otherwise the document's root, exactly as before. Data from the
 * documents: Discovery Engine lists "us" (us.rep), Speech its regions, Vertex AI, Document AI and Cloud Run theirs.
 */
export function rootForPath(rootUrl: string, endpoints: readonly RegionalEndpoint[] | undefined, path: string): string {
  if (!endpoints?.length) return rootUrl;
  const found = /(?:^|\/)locations\/([^/:?#]+)/.exec(path)?.[1];
  if (!found) return rootUrl;
  let location: string;
  try {
    location = decodeURIComponent(found);
  } catch {
    return rootUrl;
  }
  return endpoints.find((e) => e.location === location && usableEndpoint(e.endpointUrl))?.endpointUrl ?? rootUrl;
}

/** The argument for Google's `fields` system parameter (a partial response), and the one for a response field mask. */
const FIELDS_ARG = 'fields';
const FIELD_MASK_ARG = 'field_mask';

/**
 * True when the method's tool takes `fields`: its document lists the fields system parameter (every snapshot does), and
 * the method does not declare a parameter of that name itself.
 */
function takesFields(doc: DiscoveryDoc, m: Pick<MethodRecord, 'parameters'>): boolean {
  return ((doc as SnapshotDoc).systemParameters ?? []).includes('fields') && !m.parameters.some((p) => p.name === 'fields');
}

function fieldsText(fallback: string | undefined): string {
  const lead = 'Partial response: the fields to return, for example "id,name" or "items(id,name),nextPageToken".';
  return fallback === undefined
    ? `${lead} Omit for the method's default fields.`
    : `${lead} This method returns no default fields, so "${fallback}" is sent when it is omitted.`;
}

/** The argument that asks for a media download (Google's alt system parameter), and the one that picks a part of a file. */
const ALT_ARG = 'alt';
const OFFSET_ARG = 'offset';

/** The method as the snapshot holds it, for the flags MethodRecord leaves out (supportsMediaDownload). */
function snapshotMethod(doc: DiscoveryDoc, m: Pick<MethodRecord, 'resource' | 'methodName'>): DiscoveryMethod | undefined {
  let node: DiscoveryResource | undefined = { resources: doc.resources };
  for (const name of m.resource) node = node?.resources?.[name];
  return node?.methods?.[m.methodName];
}

/**
 * How a method's answer may be a file: 'download' for a method Discovery marks supportsMediaDownload (its content comes
 * with alt=media; some, such as Drive's export, answer with content anyway), 'file' for a GET whose answer is an HttpBody
 * (an image tile, a GeoTIFF), undefined for every other method.
 */
function mediaKindOf(doc: DiscoveryDoc, m: MethodRecord): 'download' | 'file' | undefined {
  if (snapshotMethod(doc, m)?.supportsMediaDownload) return 'download';
  if (m.httpMethod === 'GET' && /HttpBody$/.test(m.responseRef ?? '')) return 'file';
  return undefined;
}

function altText(partBytes: number): string {
  return `media returns the content (the file) instead of its metadata, ${partBytes} bytes a part: text as text, anything else as base64 (data_base64), with offset and next_offset for the parts. Omit for the metadata.`;
}

function offsetText(partBytes: number): string {
  return `When the answer is a file: the first byte of the part to return, 0 for the first, then next_offset of the previous answer (parts of up to ${partBytes} bytes; join them in order).`;
}

function fieldMaskText(fallback: string): string {
  return `Response field mask, sent as the ${FIELD_MASK_HEADER} header: the fields to return, comma-separated, no spaces. Google answers an error without one, and the fields asked for set the price. Default: ${fallback}`;
}

export interface DiscoverySource {
  /** Short API key from config/servers.json. */
  apiName: string;
  apiVersion: string;
  doc: DiscoveryDoc;
  /**
   * Optional subset of the API's methods. Each entry is a resource path such as "customers.campaigns" (every
   * method of that resource) or a method path such as "customers.mutate" (one method). Paths are relative to
   * the API, without its name. Absent means every method.
   */
  include?: readonly string[];
  /**
   * Scopes a method of this API asks for when the Discovery document lists none (ServerSpec.scopeOverrides, declared in
   * config/products.json). A method that lists scopes keeps its own. Absent: a method without scopes declares none.
   */
  scopesWhenNone?: readonly string[];
  /**
   * Method id to the `fields` value its tool sends when a call gives none: the methods Google documents as returning no
   * default fields (ServerSpec.fieldsDefaults, declared in config/products.json). Absent: no default.
   */
  fieldsDefaults?: Readonly<Record<string, string>>;
  /**
   * Method id to the response field mask its tool sends in X-Goog-FieldMask when a call gives none: the methods that fail
   * without one (ServerSpec.fieldMaskDefaults). Such a tool takes field_mask, not fields. Absent: no mask.
   */
  fieldMasks?: Readonly<Record<string, string>>;
  /**
   * Method id to the page size its tool sends when a call gives none: list methods whose Google default page is far over
   * the result limit (ServerSpec.pageSizeDefaults). Absent: Google's default.
   */
  pageSizes?: Readonly<Record<string, PageSizeDefault>>;
}

/** The request defaults of one method, from its source (see DiscoverySource). */
interface MethodDefaults {
  fields?: string;
  fieldMask?: string;
  pageSize?: PageSizeDefault;
}

type DefaultsSource = Pick<DiscoverySource, 'fieldsDefaults' | 'fieldMasks' | 'pageSizes'>;

function defaultsOf(src: DefaultsSource, id: string): MethodDefaults {
  return {
    ...(src.fieldsDefaults?.[id] !== undefined ? { fields: src.fieldsDefaults[id] } : {}),
    ...(src.fieldMasks?.[id] !== undefined ? { fieldMask: src.fieldMasks[id] } : {}),
    ...(src.pageSizes?.[id] !== undefined ? { pageSize: src.pageSizes[id] } : {}),
  };
}

/** The query and header defaults a method's request plan carries, or nothing when it has none. */
function planDefaults(d: MethodDefaults): Pick<RequestPlan, 'queryDefaults' | 'headerDefaults'> {
  const query: Record<string, string | number> = {
    ...(d.fields !== undefined ? { fields: d.fields } : {}),
    ...(d.pageSize !== undefined ? { [d.pageSize.parameter]: d.pageSize.value } : {}),
  };
  return {
    ...(Object.keys(query).length > 0 ? { queryDefaults: query } : {}),
    ...(d.fieldMask !== undefined ? { headerDefaults: { [FIELD_MASK_HEADER]: d.fieldMask } } : {}),
  };
}

/**
 * A query parameter Google's text says is required: its description starts with "Required." (the convention of Google's
 * newer APIs), or carries "required: true" (the YouTube Analytics document puts its field options in the text). Not when
 * the same text says what happens without it ("Defaults to all fields if not set", "If not present, ... is replaced").
 * Discovery itself marks such parameters required only now and then, so the tools left them optional until 1.30.1.
 */
const REQUIRED_TEXT = /^Required\.|\brequired: true\b/;
const OPTIONAL_TEXT = /\bif (?:it is )?not (?:set|present|specified|provided)\b|\bif omitted\b/i;

export function requiredByText(description: string | undefined): boolean {
  return description !== undefined && REQUIRED_TEXT.test(description) && !OPTIONAL_TEXT.test(description);
}

/** True when the method is in the subset (see DiscoverySource.include). */
export function methodIncluded(m: Pick<MethodRecord, 'resource' | 'methodName'>, include: readonly string[] | undefined): boolean {
  if (!include) return true;
  const chain = m.resource.join('.');
  const full = [...m.resource, m.methodName].join('.');
  return include.some((path) => path === chain || path === full);
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
    if (value === 'read' || value === 'write' || value === 'destructive' || value === 'dynamic') {
      result.overrides[key] = value;
    } else {
      process.stderr.write(`[tool-kinds] ignored ${key}: ${JSON.stringify(value)} (expected read, write, destructive or dynamic)\n`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Auth

type Auth = OAuth2Client | JWT | ApiKeyClient;

/**
 * The client of an auth group. The apikey group gets an ApiKeyClient, which adds the key to each request. Every other
 * group goes through getAuthClient, which picks the account's OAuth client, else the ADC login, and caches per account.
 * Nothing is cached here, so a new login (or a new ADC login) is used at once.
 */
export function authFor(group: AuthGroup, cfg: RuntimeConfig): Promise<Auth> {
  if (group === 'apikey') return Promise.resolve(new ApiKeyClient(cfg));
  return getAuthClient(group as AuthKind, cfg);
}

/** One request for an auth group. The apikey group's client adds the key itself, so callers never put it in the URL. */
export interface AuthorizedRequest {
  url: string;
  method: HttpMethodName;
  params?: Record<string, unknown>;
  data?: unknown;
  /** Extra request headers, such as a response field mask. Absent for most requests. */
  headers?: Record<string, string>;
  /**
   * How to read the answer (core/media.ts). 'bytes': as bytes, then JSON and text as the HTTP library parses them, and
   * anything else (an image, a GeoTIFF) as a MediaBody. 'media': always a MediaBody (a media download, alt=media).
   * Absent: as before (the API key client always reads bytes, and returns a MediaBody only for content that is not text).
   */
  read?: 'bytes' | 'media';
}

/** A response header from either shape the HTTP layer returns (a Headers object, or a plain object). */
function headerOf(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const h = headers as { get?: (n: string) => string | null } & Record<string, unknown>;
  if (typeof h.get === 'function') return h.get(name) ?? undefined;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key && typeof h[key] === 'string' ? (h[key] as string) : undefined;
}

/**
 * Sends one request through the client of its auth group (see authFor). OAuth
 * clients serialize repeated query keys with serializeQuery. Used by the per-method
 * tools and by the gateway's api_call, so both take the same path. Each request goes
 * through requestWithRetry (core/http.ts): a 429 or 503 is repeated, and so is a 403
 * rate-limit answer for a GET.
 *
 * A request to the Google Ads host carries the developer-token header when a token is
 * configured, and the login-customer-id header when it is set (see core/ads.ts). A
 * missing token blocks nothing. A configured token is removed from any error that comes back.
 */
export async function sendAuthorized(
  group: AuthGroup,
  cfg: RuntimeConfig,
  req: AuthorizedRequest,
): Promise<{ status: number; data: unknown }> {
  const ads = isGoogleAdsUrl(req.url) ? adsHeaders(cfg) : undefined;
  // The request's own headers (a field mask), then the Google Ads headers, which no request header replaces.
  const headers = { ...(req.headers ?? {}), ...(ads ?? {}) };
  const client = await authFor(group, cfg);
  // An OAuth or ADC client retries inside its own request method (core/auth.ts), so every request sent through it is covered.
  if (client instanceof ApiKeyClient) {
    return requestWithRetry(() => client.request(req), { idempotent: isIdempotentMethod(req.method) });
  }
  const hasParams = req.params !== undefined && Object.keys(req.params).length > 0;
  try {
    const res = await client.request({
      url: req.url,
      method: req.method,
      params: hasParams ? req.params : undefined,
      paramsSerializer: serializeQuery,
      data: req.data,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(req.read ? { responseType: 'arraybuffer' as const } : {}),
    });
    if (req.read) {
      // Read as bytes: a file becomes a MediaBody; JSON and text are parsed as the library would (core/media.ts).
      const range = res.status === 206 ? contentRange(headerOf(res.headers, 'content-range')) : undefined;
      return { status: res.status, data: fromBytes(res.data, headerOf(res.headers, 'content-type'), { media: req.read === 'media', ...(range ? { range } : {}) }) };
    }
    return { status: res.status, data: res.data };
  } catch (err) {
    if (ads) throw redactedError(err, ads['developer-token'] ?? '');
    throw err;
  }
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

/**
 * Turns tool arguments into the HTTP request. Makes no network call. A query or header default of the plan is sent only
 * when the call gives no value for it.
 */
export function buildRequest(plan: RequestPlan, args: Record<string, unknown>): BuiltRequest {
  const pathValues: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  let data: unknown;

  for (const field of plan.fields) {
    const value = args[field.arg];
    if (field.location === 'path') {
      pathValues[field.api] = value;
    } else if (value === undefined || value === null) {
      continue;
    } else if (field.location === 'query') {
      params[field.api] = value;
    } else if (field.location === 'header') {
      headers[field.api] = String(value);
    } else {
      data = value;
    }
  }
  for (const [name, value] of Object.entries(plan.queryDefaults ?? {})) if (params[name] === undefined) params[name] = value;
  for (const [name, value] of Object.entries(plan.headerDefaults ?? {})) if (headers[name] === undefined) headers[name] = value;

  // A path that names a location the document has a host for goes to that host (rootForPath); any other, as before.
  let url = buildUrl(plan.rootUrl, plan.servicePath, plan.path, pathValues);
  const root = rootForPath(plan.rootUrl, plan.endpoints, new URL(url).pathname);
  if (root !== plan.rootUrl) url = buildUrl(root, plan.servicePath, plan.path, pathValues);

  return {
    method: plan.httpMethod as HttpMethodName,
    url,
    params,
    data,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
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
  scopesWhenNone?: readonly string[],
  target?: MethodRecord,
  src: DefaultsSource = {},
): ToolDef {
  const shape: ZodRawShape = {};
  const fields: RequestField[] = [];
  const argFor = (param: string): string => (RESERVED_ARGS.includes(param) ? `${param}Param` : param);
  const defaults = defaultsOf(src, m.fullId);

  for (const p of m.parameters.filter((p) => p.location === 'path')) {
    const arg = argFor(p.name);
    shape[arg] = paramToZod({ ...p, required: true });
    fields.push({ arg, api: p.name, location: 'path' });
  }
  for (const p of m.parameters.filter((p) => p.location !== 'path')) {
    const arg = argFor(p.name);
    const size = defaults.pageSize?.parameter === p.name ? defaults.pageSize : undefined;
    shape[arg] = paramToZod({
      ...p,
      ...(requiredByText(p.description) ? { required: true } : {}),
      // A page size this tool sends when the call gives none (pageSizeDefaults) is the default it describes.
      ...(size ? { default: `${size.value} (sent when the call gives none; Google's default is ${size.googleDefault})` } : {}),
    });
    fields.push({ arg, api: p.name, location: 'query' });
  }

  if (m.requestRef) {
    const taken = new Set([...Object.keys(shape), ...RESERVED_ARGS]);
    let bodyArg = 'body';
    for (let i = 0; taken.has(bodyArg); i++) bodyArg = i === 0 ? 'requestBody' : `requestBody${i}`;
    shape[bodyArg] = schemaToZod({ $ref: m.requestRef }, { schemas: doc.schemas }).optional();
    fields.push({ arg: bodyArg, api: 'body', location: 'body' });
  }

  // Response fields, after every other argument. A method that needs a field mask takes field_mask (sent as a header);
  // any other read of a document that lists the fields system parameter takes fields (a partial response). Writes do not:
  // on every generated tool the argument grew tools/list by 5.7 % (1.30.0), and a write's answer is the resource it wrote.
  // A write that Google requires fields for still sends its default (fieldsDefaults).
  const free = (arg: string): boolean => !(arg in shape) && !RESERVED_ARGS.includes(arg);
  if (defaults.fieldMask !== undefined && free(FIELD_MASK_ARG)) {
    shape[FIELD_MASK_ARG] = z.string().min(1).optional().describe(fieldMaskText(defaults.fieldMask));
    fields.push({ arg: FIELD_MASK_ARG, api: FIELD_MASK_HEADER, location: 'header' });
  } else if (defaults.fieldMask === undefined && m.kind === 'read' && takesFields(doc, m) && free(FIELDS_ARG)) {
    shape[FIELDS_ARG] = z.string().min(1).optional().describe(fieldsText(defaults.fields));
    fields.push({ arg: FIELDS_ARG, api: 'fields', location: 'query' });
  }
  // A method whose answer may be a file: alt (media downloads) and offset, the part of the file to return. The handler
  // reads such an answer as bytes and returns one part (core/media.ts); offset is not sent to Google.
  const media = mediaKindOf(doc, m);
  const partBytes = base64PartBytes(cfg.maxResultChars);
  if (media === 'download' && free(ALT_ARG)) {
    shape[ALT_ARG] = z.enum(['json', 'media']).optional().describe(altText(partBytes));
    fields.push({ arg: ALT_ARG, api: 'alt', location: 'query' });
  }
  const takesOffset = media !== undefined && free(OFFSET_ARG);
  if (takesOffset) shape[OFFSET_ARG] = z.number().int().min(0).optional().describe(offsetText(partBytes));

  const tail = [...(note ? [`Note: ${note}`] : []), `Method ${m.fullId}: ${m.httpMethod} ${m.path}.`].join(' ');
  const lead = m.description || `Calls ${m.fullId}.`;
  const parts = [clipText(lead, TOOL_DESCRIPTION_MAX - tail.length - 1) ?? lead, tail];

  const plan: RequestPlan = {
    fullId: m.fullId,
    httpMethod: m.httpMethod,
    rootUrl: doc.rootUrl,
    servicePath: doc.servicePath,
    path: m.path,
    fields,
    ...planDefaults(defaults),
    ...endpointsOf(doc),
  };

  const tool: ToolDef = {
    name,
    title: m.fullId,
    // The Discovery method id, so the consent text and the hook can name the method.
    methodId: m.fullId,
    description: parts.join(' '),
    kind: m.kind,
    // The method's own scope list from the Discovery document (any one of them grants it). When the document lists none,
    // the product's declared scopes for that API (scopeOverrides), if it has them.
    scopes: m.scopes.length > 0 ? [...m.scopes] : scopesWhenNone?.length ? [...scopesWhenNone] : undefined,
    // The idempotentHint: a read changes nothing; otherwise the HTTP verb says it (GET, PUT and DELETE are idempotent,
    // POST and PATCH are not). A hint only: the kind decides the gate.
    idempotent: m.kind === 'read' || IDEMPOTENT_VERBS.has(m.httpMethod),
    inputSchema: shape,
    async handler(args, ctx) {
      const req = buildRequest(plan, args as Record<string, unknown>);
      let callKind: ToolKind = m.kind;
      if (m.kind === 'dynamic') {
        // The kind depends on the request body. A call that changes something goes through the gate first.
        // Read calls (validateOnly) are not gated. A method with no dynamic rule asks, as destructive.
        const kind = resolveDynamicKind(m.fullId, req.data) ?? 'destructive';
        callKind = kind;
        if (kind !== 'read') {
          if (typeof ctx?.gate !== 'function') {
            throw new Error(`${name} needs the approval gate, which is not wired for this call, so it was not run.`);
          }
          await ctx.gate({ kind, target: name, methodId: m.fullId, args: req.data });
        }
      }
      // A media download (alt=media) asks for one part with a Range header; a method that may answer with a file reads the
      // answer as bytes. Every other request is sent as before.
      const a = args as Record<string, unknown>;
      const offset = takesOffset && typeof a[OFFSET_ARG] === 'number' ? (a[OFFSET_ARG] as number) : 0;
      const asMedia = media === 'download' && a[ALT_ARG] === 'media';
      const sent: AuthorizedRequest = asMedia ? { ...req, headers: { ...(req.headers ?? {}), Range: rangeHeader(offset, cfg.maxResultChars) }, read: 'media' } : media ? { ...req, read: 'bytes' } : req;
      const res = await sendAuthorized(group, cfg, sent);
      // A file is returned as one part that fits the result limit, never as text.
      if (res.data instanceof MediaBody) return mediaPart(res.data, { offset, maxResultChars: cfg.maxResultChars, canContinue: takesOffset });
      // A read never asks, so the credential fields it returns are replaced (core/credential-fields.ts). A write was approved.
      return callKind === 'read' ? redactCredentials(res.data, { api: doc.name, schema: m.responseRef, schemas: doc.schemas }) : res.data;
    },
  };

  if (m.kind === 'destructive') {
    tool.preview = (args) => {
      const req = buildRequest(plan, args as Record<string, unknown>);
      return { method: m.fullId, url: req.url, query: req.params, body: req.data ?? null, ...(req.headers ? { headers: req.headers } : {}) };
    };
  }
  if (target) {
    // The resource this write acts on, read for the approval only (target-preview.ts). The same path arguments, nothing
    // else; the result passes the credential list before a field is picked. The request the handler sends is not changed.
    // A get that returns no default fields (Drive's comments and approvals) sends its default fields value.
    const targetPlan: RequestPlan = {
      fullId: target.fullId,
      httpMethod: 'GET',
      rootUrl: doc.rootUrl,
      servicePath: doc.servicePath,
      path: target.path,
      fields: target.parameters.filter((p) => p.location === 'path').map((p) => ({ arg: argFor(p.name), api: p.name, location: 'path' as const })),
      ...planDefaults(defaultsOf(src, target.fullId)),
      ...endpointsOf(doc),
    };
    tool.describeTarget = async (args) => {
      const res = await sendAuthorized(group, cfg, buildRequest(targetPlan, args as Record<string, unknown>));
      return targetFieldsOf(redactCredentials(res.data, { api: doc.name, schema: target.responseRef, schemas: doc.schemas }));
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
    // It lists the server's own generated tools and sends nothing to Google.
    openWorld: false,
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
 * The server's name sets the list tool's name. `reserved` names (the curated tools of
 * the same server) are never given to a generated tool: a generated method that would
 * take one gets its hashed form instead, so the curated name stays the same.
 */
export function generateDiscoveryTools(
  serverName: string,
  group: AuthGroup,
  sources: DiscoverySource[],
  kinds: ToolKindsFile,
  cfg: RuntimeConfig,
  maxNameLength: number = MAX_TOOL_NAME,
  reserved: readonly string[] = [],
): GeneratedTools {
  const entries: Array<{ method: MethodRecord; doc: DiscoveryDoc; src: DiscoverySource; target?: MethodRecord; scopesWhenNone?: readonly string[] }> = [];
  const skippedUploads: string[] = [];

  for (const src of sources) {
    const all = flattenMethods(src.doc, src.apiName, src.apiVersion, kinds.overrides);
    for (const method of all) {
      if (!methodIncluded(method, src.include)) continue;
      if (method.uploadable) {
        skippedUploads.push(method.fullId);
        continue;
      }
      // The GET that reads the resource this write acts on, for the approval (target-preview.ts). It need not be a tool.
      const target = targetGetFor(method, all);
      entries.push({ method, doc: src.doc, src, ...(target ? { target } : {}), ...(src.scopesWhenNone ? { scopesWhenNone: src.scopesWhenNone } : {}) });
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
    [listName, ...reserved],
    maxNameLength,
  );

  const tools: ToolDef[] = [];
  const rows: ListRow[] = [];
  entries.forEach((entry, i) => {
    const name = names[i]!;
    const m = entry.method;
    tools.push(buildMethodTool(m, name, entry.doc, group, cfg, kinds.notes[m.apiName], entry.scopesWhenNone, entry.target, entry.src));
    rows.push({
      method: m.fullId,
      tool: name,
      httpMethod: m.httpMethod,
      kind: m.kind,
      description: clipText(m.description, METHOD_ROW_DESC_MAX) ?? '',
    });
  });
  tools.push(buildListTool(listName, serverName, rows));

  return { tools, skippedUploads };
}

/**
 * The request defaults the product declares for one of its APIs (config/products.json fieldsDefaults and
 * fieldMaskDefaults), by method id. Nothing for an API without any.
 */
export function requestDefaultsFor(
  server: Pick<ServerSpec, 'fieldsDefaults' | 'fieldMaskDefaults' | 'pageSizeDefaults'>,
  api: string,
): DefaultsSource {
  const fields = server.fieldsDefaults?.[api];
  const masks = server.fieldMaskDefaults?.[api]?.methods;
  const sizes = server.pageSizeDefaults?.[api]?.methods;
  return {
    ...(fields ? { fieldsDefaults: Object.fromEntries(fields.methods.map((id) => [id, fields.value])) } : {}),
    ...(masks ? { fieldMasks: { ...masks } } : {}),
    ...(sizes ? { pageSizes: { ...sizes } } : {}),
  };
}

function uniqueApis(apis: ApiRef[]): ApiRef[] {
  const seen = new Map<string, ApiRef>();
  for (const a of apis) seen.set(`${a.api}.${a.version}`, a);
  return [...seen.values()];
}

/**
 * Names of a server's curated tools. Pass them to discoveryToolsFor as `reserved`, so the
 * generated tools never take a curated name. Kept free of the curated modules, so the
 * bundled entries can call it without bundling every curated module.
 */
export function toolNamesOf(tools: ReadonlyArray<{ name: string }>): string[] {
  return tools.map((tool) => tool.name);
}

/**
 * Tools for one server: every method of its discovery APIs plus the list tool.
 * Returns [] for a server without discovery APIs. Missing snapshots are
 * reported on stderr and skipped, so the server still starts. `reserved` holds
 * the names of the server's curated tools (see toolNamesOf). The server map, the snapshots and the tool kinds are
 * found from this module, or from `fromUrl` when given (a plugin's bin/gsm.mjs, see pluginModuleUrl in registry.ts).
 */
export async function discoveryToolsFor(
  serverName: string,
  cfg: RuntimeConfig,
  reserved: readonly string[] = [],
  fromUrl?: string,
): Promise<ToolDef[]> {
  const reg = loadRegistry(fromUrl);
  const server: ServerSpec = serverByName(reg, serverName);
  const apis = uniqueApis(server.apis ?? []);
  if (apis.length === 0) return [];

  const dataDir = resolveDataDir(fromUrl);
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
    sources.push({
      apiName: a.api,
      apiVersion: a.version,
      doc: JSON.parse(readFileSync(file, 'utf8')) as DiscoveryDoc,
      include: a.include,
      ...(server.scopeOverrides?.[a.api] ? { scopesWhenNone: server.scopeOverrides[a.api] } : {}),
      ...requestDefaultsFor(server, a.api),
    });
  }
  if (missing.length > 0) {
    process.stderr.write(`[${serverName}] no discovery snapshot for: ${missing.join(', ')}. Run: node scripts/snapshot-discovery.mjs\n`);
  }

  const kinds = loadToolKinds(reg.dataRoot);
  const generated = generateDiscoveryTools(serverName, server.group, sources, kinds, cfg, nameBudget(server.plugin, serverName), reserved);
  noteSkippedUploads(serverName, generated.skippedUploads);
  return generated.tools;
}

/**
 * Reports the media-upload methods that are not generated. This is a normal, expected skip, so it is written to
 * stderr only when GSM_VERBOSE=1. Otherwise every run of every server would print it.
 */
export function noteSkippedUploads(serverName: string, skipped: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  if (skipped.length === 0 || !verboseOn(env)) return;
  process.stderr.write(`[${serverName}] skipped ${skipped.length} media-upload method(s): ${skipped.join(', ')}\n`);
}
