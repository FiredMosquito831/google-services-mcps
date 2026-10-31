/**
 * Flattens Discovery resource trees into method records, classifies each method
 * as read, write or destructive, and assigns MCP tool names.
 */
import { createHash } from 'node:crypto';
import type { ToolKind } from '../tools.js';
import type { DiscoveryParam, SchemaNode } from './schema.js';

/** The compacted Discovery document as stored in data/discovery/{api}.{version}.json. */
export interface DiscoveryDoc {
  name: string;
  version: string;
  title?: string;
  rootUrl: string;
  servicePath: string;
  baseUrl?: string;
  schemas: Record<string, SchemaNode>;
  resources: Record<string, DiscoveryResource>;
}

export interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
}

export interface DiscoveryMethod {
  id?: string;
  path: string;
  flatPath?: string;
  httpMethod: string;
  description?: string;
  parameters?: DiscoveryParam[];
  parameterOrder?: string[];
  request?: string;
  response?: string;
  scopes?: string[];
  supportsMediaUpload?: boolean;
  mediaUpload?: boolean;
  supportsMediaDownload?: boolean;
}

export interface MethodRecord {
  /** Short API key as listed in config/servers.json, for example "monitoring". */
  apiName: string;
  apiVersion: string;
  /** Discovery method id, for example "gmail.users.messages.list". */
  fullId: string;
  httpMethod: string;
  path: string;
  flatPath?: string;
  parameters: DiscoveryParam[];
  parameterOrder: string[];
  requestRef?: string;
  responseRef?: string;
  scopes: string[];
  description: string;
  uploadable: boolean;
  kind: ToolKind;
  /** Resource chain from the top level down, for example ["users", "messages"]. */
  resource: string[];
  methodName: string;
}

export const MAX_TOOL_NAME = 40;

/**
 * Read-only POST methods are recognised by name prefix. Deliberately narrow: a POST
 * that runs work, mints credentials, writes an export, runs DML through a query, or
 * sends a test message is a write, and it asks first. Exceptions go in the exact list
 * or in config/tool-kinds.json.
 */
export const READ_POST_PREFIXES = [
  'get',
  'list',
  'search',
  'batchGet',
  'lookup',
  'check',
  'validate',
  'inspect',
  'fetch',
  'download',
  'describe',
  'preview',
  'analyze',
  'detect',
  'evaluate',
];

/** Read-only POST methods that are recognised by exact name. */
export const READ_POST_EXACT = [
  // Chrome UX Report: public performance data, read only.
  'queryRecord',
  'queryHistoryRecord',
  'getIamPolicy',
  'testIamPermissions',
  'runReport',
  'runRealtimeReport',
  'runPivotReport',
  'batchRunReports',
  'runAccessReport',
  'queryAuditLogs',
];

/** Destructive by method name (last segment), compared without case, hyphens or underscores. */
export const DESTRUCTIVE_NAMES = [
  'delete',
  'remove',
  'trash',
  'empty',
  'cancel',
  'stop',
  'disable',
  'revoke',
  'reset',
  'deactivate',
  'suspend',
  'deprovision',
  'purge',
  'terminate',
  'destroy',
  'clear',
  'unsubscribe',
  'send',
  'sendDraft',
  'batchDelete',
  'batchRemove',
  'close',
  'archive',
  'move-to-trash',
];

/**
 * The words of a method name, lowercased: split at camelCase boundaries, at digits and at separators.
 * generateKeywordIdeas -> generate, keyword, ideas; countTokens -> count, tokens; move-to-trash -> move, to, trash.
 */
export function methodWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

/** The credential words a method name is tested for, whole: a singular word, never a plural or a longer compound. */
const CREDENTIAL_WORDS: ReadonlySet<string> = new Set(['token', 'credential', 'secret', 'password', 'key']);

/**
 * Credential words in a method name (the last id segment): a token, a key string, a secret, a password or an
 * authorization. A POST (or any non-GET) with one of them mints, reveals or uses a credential, so it is a write
 * even when its name is read-like: fetchAccessToken, fetchReadToken, getKeyString, getSyncAuthorization.
 * GET methods are not decided by this rule. The GET credential reveals are listed in config/tool-kinds.json.
 *
 * True when a word of the method name (methodWords) is one of them, whole. A longer word that merely contains one
 * does not count: "Keyword" is not a key and "countTokens" counts LLM tokens (1.41.3, owner decision Q1 of
 * 2026-10-31). "authoriz" stays a prefix, as it was: authorization, authorize and authorized are one word each.
 * Method names are the words verbs are built from, so tokens, keys and keywords are not credential words. A method
 * that mints, reveals or uses a credential and the rule would let through is listed as a write in
 * config/tool-kinds.json instead.
 */
export function hasCredentialWord(name: string): boolean {
  return methodWords(name).some((word) => CREDENTIAL_WORDS.has(word) || word.startsWith('authoriz'));
}

const normalizeName = (s: string): string => s.replace(/[-_]/g, '').toLowerCase();
const DESTRUCTIVE_SET = new Set(DESTRUCTIVE_NAMES.map(normalizeName));

/**
 * Escapes a pattern and joins its "*" parts with ".+", so "*" stands for one or more characters.
 * A pattern with no "*" matches only itself.
 */
export function patternMatches(pattern: string, fullId: string): boolean {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${body}$`).test(fullId);
}

/**
 * The override for a method, from config/tool-kinds.json. An exact method id wins. Otherwise the first
 * key with a "*" that matches the id gives the kind, so "googleads.*.mutate" covers every Google Ads mutate method.
 */
export function overrideKind(overrides: Readonly<Record<string, ToolKind>>, fullId: string): ToolKind | undefined {
  const exact = overrides[fullId];
  if (exact) return exact;
  for (const [pattern, kind] of Object.entries(overrides)) {
    if (pattern.includes('*') && patternMatches(pattern, fullId)) return kind;
  }
  return undefined;
}

/**
 * Safety class of one method. An override (from config/tool-kinds.json, by exact id or by pattern) wins.
 * Then DELETE and the destructive names. Then a non-GET method with a credential word in its name (hasCredentialWord)
 * is a write. Then GET, and POST methods with a read-only name. Everything else is a write.
 * A dynamic override means the kind is decided per call (see core/dynamic.ts).
 */
export function classifyMethod(
  httpMethod: string,
  methodName: string,
  fullId: string,
  overrides: Readonly<Record<string, ToolKind>> = {},
): ToolKind {
  const override = overrideKind(overrides, fullId);
  if (override) return override;

  const http = httpMethod.toUpperCase();
  if (http === 'DELETE') return 'destructive';
  if (DESTRUCTIVE_SET.has(normalizeName(methodName))) return 'destructive';
  if (http !== 'GET' && hasCredentialWord(methodName)) return 'write';
  if (http === 'GET') return 'read';
  if (http === 'POST') {
    if (READ_POST_EXACT.includes(methodName)) return 'read';
    if (READ_POST_PREFIXES.some((prefix) => methodName.startsWith(prefix))) return 'read';
  }
  return 'write';
}

/**
 * Flattens one compacted document into method records. apiName is the key from
 * config/servers.json (used for the tool prefix), not the Discovery doc name.
 */
export function flattenMethods(
  doc: DiscoveryDoc,
  apiName: string,
  apiVersion: string,
  overrides: Readonly<Record<string, ToolKind>> = {},
): MethodRecord[] {
  const out: MethodRecord[] = [];

  const visit = (resources: Record<string, DiscoveryResource> | undefined, chain: string[]): void => {
    for (const [resourceName, resource] of Object.entries(resources ?? {})) {
      const here = [...chain, resourceName];
      for (const [methodName, m] of Object.entries(resource.methods ?? {})) {
        const fullId = m.id ?? [doc.name, ...here, methodName].join('.');
        const httpMethod = m.httpMethod.toUpperCase();
        out.push({
          apiName,
          apiVersion,
          fullId,
          httpMethod,
          path: m.path,
          flatPath: m.flatPath,
          parameters: m.parameters ?? [],
          parameterOrder: m.parameterOrder ?? [],
          requestRef: m.request,
          responseRef: m.response,
          scopes: m.scopes ?? [],
          description: m.description ?? '',
          uploadable: Boolean(m.supportsMediaUpload || m.mediaUpload),
          kind: classifyMethod(httpMethod, methodName, fullId, overrides),
          resource: here,
          methodName,
        });
      }
      visit(resource.resources, here);
    }
  };

  visit(doc.resources, []);
  return out;
}

/**
 * Short tool prefix for an API. Known APIs have a hand-picked alias. Others are
 * lowercased and cut to 10 characters.
 */
const API_ALIASES: Record<string, string> = {
  monitoring: 'monitor',
  logging: 'logging',
  cloudtrace: 'trace',
  clouderrorreporting: 'errors',
  cloudbilling: 'billing',
  cloudquotas: 'quotas',
  cloudasset: 'assets',
  cloudresourcemanager: 'crm',
  bigquery: 'bigquery',
  storage: 'storage',
  firestore: 'firestore',
  spanner: 'spanner',
  sqladmin: 'sql',
  pubsub: 'pubsub',
  run: 'cloudrun',
  cloudfunctions: 'functions',
  secretmanager: 'secrets',
  cloudkms: 'kms',
  artifactregistry: 'artifacts',
  container: 'gke',
  compute: 'compute',
  docs: 'docs',
  sheets: 'sheets',
  slides: 'slides',
  forms: 'forms',
  tasks: 'tasks',
  people: 'people',
  chat: 'chat',
  script: 'appsscript',
  meet: 'meet',
  reports: 'reports',
  licensing: 'license',
  groupssettings: 'groupset',
  alertcenter: 'alerts',
  datatransfer: 'transfer',
  vault: 'vault',
  cloudidentity: 'cloudid',
  customsearch: 'cse',
  siteVerification: 'siteverif',
  indexing: 'indexing',
  analyticsadmin: 'gaadmin',
  analyticsdata: 'gadata',
  tagmanager: 'tagmgr',
  youtube: 'youtube',
  youtubeAnalytics: 'ytanalyt',
  mybusinessaccountmanagement: 'mbaccount',
  mybusinessbusinessinformation: 'mbinfo',
  mybusinessverifications: 'mbverify',
  businessprofileperformance: 'bpperf',
  mybusinessnotifications: 'mbnotify',
};

export function shortApiName(api: string): string {
  return API_ALIASES[api] ?? api.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
}

/** camelCase or PascalCase to snake_case, lowercase. "getIAMPolicy" becomes "get_iam_policy". */
export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Four hex characters from the SHA-256 of the method id. Deterministic. */
export function nameHash(fullId: string): string {
  return createHash('sha256').update(fullId).digest('hex').slice(0, 4);
}

/** Joins segments with "_". Used to measure a candidate name. */
const joinSegments = (segs: readonly string[]): string => segs.join('_');

/**
 * Joins the segments into a name of at most `limit` characters. The first
 * segment (the API prefix) is kept. Each step cuts one character from the
 * longest remaining segment (never below 3 characters), so the words stay
 * readable. Returns the name and whether it fits.
 */
export function fitSegments(segments: string[], limit: number): { name: string; fits: boolean } {
  const segs = [...segments];
  while (joinSegments(segs).length > limit) {
    let idx = -1;
    for (let i = 1; i < segs.length; i++) {
      const len = segs[i]!.length;
      if (len > 3 && (idx < 0 || len > segs[idx]!.length)) idx = i;
    }
    if (idx < 0) break;
    segs[idx] = segs[idx]!.slice(0, -1).replace(/_+$/, '');
  }
  const name = joinSegments(segs);
  return { name, fits: name.length <= limit };
}

type NamePart = Pick<MethodRecord, 'apiName' | 'resource' | 'methodName' | 'fullId'>;

function segmentsOf(m: NamePart): string[] {
  return [shortApiName(m.apiName), ...m.resource.map(snakeCase), snakeCase(m.methodName)].filter((s) => s.length > 0);
}

/**
 * Longest tool name Claude Code accepts for a plugin's MCP tool. The full name is
 * mcp__plugin_<plugin>_<server>__<tool>, and the total must stay at or under 64.
 * So the room left for <tool> is 64 minus the fixed parts and the two names.
 */
export const CLAUDE_TOOL_NAME_MAX = 64;

export function nameBudget(plugin: string, server: string): number {
  const fixed = 'mcp__plugin_'.length + plugin.length + 1 + server.length + 2;
  return CLAUDE_TOOL_NAME_MAX - fixed;
}

/** Shortened segments, cut to (maxLen - 5) characters, then a 4-character fullId hash. Never longer than maxLen. */
function hashedName(segments: string[], fullId: string, maxLen: number): string {
  const limit = maxLen - 5;
  const head = fitSegments(segments, limit).name.slice(0, limit).replace(/_+$/, '');
  return `${head}_${nameHash(fullId)}`;
}

/**
 * Tool name for one method: prefix_resource_chain_method, snake_case, at most
 * maxLen characters (40 by default; per server, see nameBudget). When it still
 * does not fit after shortening, the name is truncated and a 4-character hash of
 * fullId is appended.
 */
export function toolNameFor(method: NamePart, maxLen: number = MAX_TOOL_NAME): string {
  const segments = segmentsOf(method);
  const fit = fitSegments(segments, maxLen);
  return fit.fits ? fit.name : hashedName(segments, method.fullId, maxLen);
}

/**
 * Tool names for a set of methods on one server, in the same order as the input.
 * Names that collide (after shortening) get the fullId hash appended, on every
 * member of the colliding group, so the result does not depend on input order.
 * Names listed in `reserved` are treated as taken.
 */
export function assignToolNames(
  methods: ReadonlyArray<NamePart & Pick<MethodRecord, 'apiVersion'>>,
  reserved: readonly string[] = [],
  maxLen: number = MAX_TOOL_NAME,
): string[] {
  const bases = methods.map((m) => toolNameFor(m, maxLen));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const reservedSet = new Set(reserved);

  const names = methods.map((m, i) => {
    const base = bases[i]!;
    const collides = (counts.get(base) ?? 0) > 1 || reservedSet.has(base);
    return collides ? hashedName(segmentsOf(m), m.fullId, maxLen) : base;
  });

  // Last resort for identical method ids from two versions of one API: a counter.
  const taken = new Set(reserved);
  const order = names.map((_, i) => i).sort((a, b) => {
    const ka = `${methods[a]!.apiName}|${methods[a]!.apiVersion}|${methods[a]!.fullId}`;
    const kb = `${methods[b]!.apiName}|${methods[b]!.apiVersion}|${methods[b]!.fullId}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  for (const i of order) {
    let name = names[i]!;
    let n = 2;
    while (taken.has(name)) {
      const suffix = `_${n++}`;
      name = `${name.slice(0, maxLen - suffix.length)}${suffix}`;
    }
    names[i] = name;
    taken.add(name);
  }
  return names;
}
