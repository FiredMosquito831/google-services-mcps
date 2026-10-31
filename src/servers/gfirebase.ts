/**
 * Curated Firebase tools of the gfirebase server. They match tools of Google's Firebase MCP server (firebase-tools, the
 * `firebase mcp` command, and the Firestore MCP server it proxies): firestore_get_document, firestore_list_documents,
 * firestore_query_collection, remoteconfig_get_template and auth_get_users. Google's other Firebase tools that call an
 * API (projects, apps, SDK configs, security rules, App Hosting, Crashlytics, Data Connect, Cloud Messaging) are
 * generated tools here already; the ones that drive the local Firebase CLI (init, deploy, the emulators) are not copied.
 *
 *   firestore_get_document      read  Firestore v1 projects.databases.documents.get.
 *   firestore_list_documents    read  Firestore v1 projects.databases.documents.list.
 *   firestore_query_collection  read  Firestore v1 projects.databases.documents.runQuery (a POST that reads; declared a
 *                                     read here as Google marks it, as bq_query_read is).
 *   remoteconfig_get_template   read  Remote Config v1 projects.getRemoteConfig.
 *   auth_get_users              read  Identity Toolkit v1 projects.accounts.lookup (by uid, email or phone number) or
 *                                     projects.accounts.query (a page of users). Password hashes and salts are left out.
 *
 * Firestore, Remote Config and Identity Toolkit v1 have no per-method tools in this server (Firestore is a gcloud API,
 * Remote Config is in no API list, Identity Toolkit v1 is a gateway API here). These tools call them directly; their
 * request contracts are tests/fixtures/discovery/{firestore.v1,firebaseremoteconfig.v1,identitytoolkit.v1}.json.
 *
 * Firestore values: documents come back as plain JSON (a string, a number, true or false, null, a list, an object),
 * with integers as numbers when they are exact in JavaScript and as strings when they are not; timestamps and
 * references as strings; a geo point as {latitude, longitude}; bytes as base64 text. raw_values: true returns Google's
 * typed values instead. Filter values are plain JSON too; an object with exactly one Firestore value key (such as
 * {"timestampValue": "2026-10-30T00:00:00Z"}) is sent as that typed value.
 *
 * Auth: OAuth user token from `gsm login developer`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { fitItems } from '../core/result-shape.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

const FIRESTORE = 'https://firestore.googleapis.com/v1';
const REMOTE_CONFIG = 'https://firebaseremoteconfig.googleapis.com/v1';
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';

/** The scopes of Firestore's documents.get, list and runQuery, as Discovery lists them. */
const FIRESTORE_SCOPES = googleScopes('cloud-platform', 'datastore');
/** The scope of Remote Config's projects.getRemoteConfig (Discovery lists only cloud-platform). */
const REMOTE_CONFIG_SCOPES = googleScopes('cloud-platform');
/**
 * accounts.lookup lists cloud-platform; accounts.query lists cloud-platform and firebase. One tool declares one any-of
 * list, so it is the scope both accept.
 */
const AUTH_USERS_SCOPES = googleScopes('cloud-platform');

/** The value kinds of a Firestore Value (Discovery: Value). An object with exactly one of these keys is a typed value. */
const VALUE_KINDS = new Set([
  'nullValue',
  'booleanValue',
  'integerValue',
  'doubleValue',
  'timestampValue',
  'stringValue',
  'bytesValue',
  'referenceValue',
  'geoPointValue',
  'arrayValue',
  'mapValue',
]);

/**
 * A project id as given, checked only for what would change the request's path: letters, digits, hyphens, and the dot
 * and colon of older domain-scoped ids (example.com:my-app). Google checks the rest.
 */
export function projectIdOf(text: string): string {
  const id = text.trim();
  if (!/^[a-z0-9][a-z0-9.:-]*$/.test(id)) throw new Error(`"${text}" is not a Google Cloud project id: use its id, such as my-app-1234 (lower case letters, digits and hyphens).`);
  return id;
}

/** The segments of a path such as users/alice/orders, trimmed of slashes. Throws on an empty segment. */
function segmentsOf(path: string, what: string): string[] {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  const parts = trimmed === '' ? [] : trimmed.split('/');
  if (parts.length === 0 || parts.some((p) => p === '' || p === '.' || p === '..')) throw new Error(`${what} "${path}" is not a path of the form collection/document/... .`);
  return parts;
}

/** projects/<p>/databases/<d>/documents, the root every document path hangs from. Each part is URL-encoded. */
export function documentsRoot(projectId: string, database = '(default)'): string {
  const db = database.trim() || '(default)';
  return `projects/${encodeURIComponent(projectIdOf(projectId))}/databases/${encodeURIComponent(db)}/documents`;
}

/** The resource path of a document (an even number of segments, such as users/alice). */
export function documentPath(projectId: string, database: string | undefined, path: string): string {
  const parts = segmentsOf(path, 'document_path');
  if (parts.length % 2 !== 0) throw new Error(`document_path "${path}" names a collection, not a document: a document path has an even number of parts, such as users/alice.`);
  return `${documentsRoot(projectId, database)}/${parts.map(encodeURIComponent).join('/')}`;
}

/** The parent and collection id of a collection (an odd number of segments, such as users or users/alice/orders). */
export function collectionOf(projectId: string, database: string | undefined, path: string): { parent: string; collectionId: string } {
  const parts = segmentsOf(path, 'collection_path');
  if (parts.length % 2 !== 1) throw new Error(`collection_path "${path}" names a document, not a collection: a collection path has an odd number of parts, such as users or users/alice/orders.`);
  const collectionId = parts[parts.length - 1] as string;
  const parent = [documentsRoot(projectId, database), ...parts.slice(0, -1).map(encodeURIComponent)].join('/');
  return { parent, collectionId };
}

/** A plain JSON value as a Firestore Value. An object with exactly one Firestore value key is passed as that typed value. */
export function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && VALUE_KINDS.has(keys[0] as string)) return value as Record<string, unknown>;
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFirestoreValue(v)])) } };
  }
  throw new Error(`A value of type ${typeof value} cannot be sent to Firestore.`);
}

interface FsValue {
  nullValue?: unknown;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
}

/** A Firestore Value as plain JSON (see the module comment). An unknown kind is returned as Google sent it. */
export function fromFirestoreValue(value: FsValue): unknown {
  if ('nullValue' in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) {
    const n = Number(value.integerValue);
    return Number.isSafeInteger(n) ? n : value.integerValue;
  }
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.referenceValue !== undefined) return value.referenceValue;
  if (value.geoPointValue !== undefined) return { latitude: value.geoPointValue.latitude ?? 0, longitude: value.geoPointValue.longitude ?? 0 };
  if (value.arrayValue !== undefined) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if (value.mapValue !== undefined) return fieldsOf(value.mapValue.fields);
  return value;
}

const fieldsOf = (fields: Record<string, FsValue> | undefined) => Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k, fromFirestoreValue(v)]));

interface FsDocument {
  name?: string;
  fields?: Record<string, FsValue>;
  createTime?: string;
  updateTime?: string;
}

/** One document, short: its path below /documents/, its id, its fields (plain JSON unless raw), and its times. */
export function documentSummary(doc: FsDocument, raw = false) {
  const name = doc.name ?? '';
  const at = name.indexOf('/documents/');
  const path = at >= 0 ? name.slice(at + '/documents/'.length) : name;
  return {
    path,
    id: path.split('/').pop() ?? '',
    fields: raw ? (doc.fields ?? {}) : fieldsOf(doc.fields),
    ...(doc.createTime ? { create_time: doc.createTime } : {}),
    ...(doc.updateTime ? { update_time: doc.updateTime } : {}),
  };
}

/** Field filter operators of Firestore (FieldFilter.op) and the unary ones (UnaryFilter.op), which take no value. */
export const FIELD_OPS = ['EQUAL', 'NOT_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'ARRAY_CONTAINS', 'ARRAY_CONTAINS_ANY', 'IN', 'NOT_IN'] as const;
export const UNARY_OPS = ['IS_NULL', 'IS_NOT_NULL', 'IS_NAN', 'IS_NOT_NAN'] as const;

const queryFilter = z.object({
  field: z.string().trim().min(1).describe('The field path, dot-separated for nested fields, such as status or address.city.'),
  op: z.enum([...FIELD_OPS, ...UNARY_OPS]).describe('The comparison. IN, NOT_IN and ARRAY_CONTAINS_ANY take a list; IS_NULL, IS_NOT_NULL, IS_NAN and IS_NOT_NAN take no value.'),
  value: z.unknown().optional().describe('The value to compare with, as plain JSON. For a timestamp, give {"timestampValue": "2026-10-30T00:00:00Z"}.'),
});

/** A Firestore Filter from one filter of the tool. */
export function filterOf(f: z.infer<typeof queryFilter>) {
  const field = { fieldPath: f.field };
  if ((UNARY_OPS as readonly string[]).includes(f.op)) {
    if (f.value !== undefined) throw new Error(`Filter on ${f.field}: ${f.op} takes no value.`);
    return { unaryFilter: { field, op: f.op } };
  }
  if (f.value === undefined) throw new Error(`Filter on ${f.field}: ${f.op} needs a value.`);
  if (['IN', 'NOT_IN', 'ARRAY_CONTAINS_ANY'].includes(f.op) && !Array.isArray(f.value)) throw new Error(`Filter on ${f.field}: ${f.op} needs a list of values.`);
  return { fieldFilter: { field, op: f.op, value: toFirestoreValue(f.value) } };
}

/** The RunQueryRequest of firestore_query_collection: the collection, the filters joined with AND, the order, offset and limit. */
export function runQueryBody(input: {
  collectionId: string;
  filters?: Array<z.infer<typeof queryFilter>>;
  order_by?: Array<{ field: string; direction?: 'ASCENDING' | 'DESCENDING' }>;
  limit?: number;
  offset?: number;
  all_descendants?: boolean;
}) {
  const filters = (input.filters ?? []).map(filterOf);
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
  return {
    structuredQuery: {
      from: [{ collectionId: input.collectionId, ...(input.all_descendants ? { allDescendants: true } : {}) }],
      ...(where ? { where } : {}),
      ...(input.order_by?.length ? { orderBy: input.order_by.map((o) => ({ field: { fieldPath: o.field }, ...(o.direction ? { direction: o.direction } : {}) })) } : {}),
      ...(input.offset ? { offset: input.offset } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    },
  };
}

/**
 * Documents of firestore_query_collection when no limit is given (before 1.29.0: none was sent, and Firestore returned
 * every match). Google's Firebase MCP server uses 10.
 */
export const FIRESTORE_QUERY_DEFAULT = 10;
/** Users of auth_get_users when no limit is given (before 1.29.0: none was sent, and Google returns 500). Google's Firebase MCP server uses 100. */
export const AUTH_USERS_DEFAULT = 100;

/**
 * A page of documents or users that pages by offset: next_offset when the page was full (more may match), and, when the
 * items do not fit the result limit, only those that fit, with next_offset after the last one shown.
 */
function offsetPage<T extends Record<string, unknown>>(answer: T, key: string, offset: number, limit: number, budget: number, what: string): T {
  const items = answer[key] as unknown[];
  const full = limit > 0 && items.length >= limit;
  const paged = { ...(full ? { next_offset: offset + items.length } : {}), ...answer };
  return fitItems(paged, key, budget, (shown) => ({
    fields: { next_offset: offset + shown, count: shown },
    how_to_continue: `Google returned ${items.length} ${what}; the first ${shown} fit the result limit (${budget} characters). Call again with offset=${offset + shown} and the same other arguments for the next ones.`,
  }));
}

/** Identity Toolkit fields never returned: the password hash and salt (Google returns them to an OAuth caller). */
const SECRET_USER_FIELDS = ['passwordHash', 'salt'];

/** One user record without its password hash and salt. */
export function userSummary(user: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(user).filter(([k]) => !SECRET_USER_FIELDS.includes(k)));
}

const projectId = z.string().describe('The Firebase (Google Cloud) project id, such as my-app-1234. firebase_projects_list lists them.');
const database = z.string().optional().describe('The Firestore database id. Default (default).');
const rawValues = z.boolean().optional().describe("true returns Firestore's typed values (stringValue, integerValue and so on) instead of plain JSON.");
const fieldPaths = z.array(z.string().trim().min(1)).optional().describe('Return only these fields (a field mask), such as ["name", "address.city"]. Default: every field.');

const getDocumentShape = {
  project_id: projectId,
  database,
  document_path: z.string().describe('The document path below the database root, such as users/alice or users/alice/orders/o-1.'),
  field_paths: fieldPaths,
  read_time: z.string().optional().describe('Read the document as it was at this time (RFC 3339), within the last hour, or older with point-in-time recovery.'),
  raw_values: rawValues,
};

const listDocumentsShape = {
  project_id: projectId,
  database,
  collection_path: z.string().describe('The collection path, such as users, or users/alice/orders for a subcollection.'),
  page_size: z.number().int().min(1).optional().describe('Documents per page. Google decides the default.'),
  page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
  order_by: z.string().optional().describe('The order, such as "priority desc, __name__". Default: by document id.'),
  field_paths: fieldPaths,
  show_missing: z.boolean().optional().describe('true also lists missing documents: ones that do not exist but have subcollections (no fields).'),
  raw_values: rawValues,
};

const queryShape = {
  project_id: projectId,
  database,
  collection_path: z.string().describe('The collection path, such as users, or users/alice/orders for a subcollection.'),
  filters: z.array(queryFilter).optional().describe('Conditions joined with AND, such as [{"field": "status", "op": "EQUAL", "value": "active"}]. None: every document.'),
  order_by: z
    .array(z.object({ field: z.string().trim().min(1), direction: z.enum(['ASCENDING', 'DESCENDING']).optional() }))
    .optional()
    .describe('The order, such as [{"field": "createdAt", "direction": "DESCENDING"}]. Ordering on a field Firestore has no index for fails with a link to create one.'),
  limit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`The most documents to return. Default ${FIRESTORE_QUERY_DEFAULT}, as in Google's Firebase MCP server; next_offset, when the page is full, reads on.`),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Documents to skip first (next_offset of the previous answer). Firestore bills skipped documents as reads.'),
  all_descendants: z.boolean().optional().describe('true queries every collection with this id under the parent (a collection group query), not only the one at collection_path.'),
  raw_values: rawValues,
};

const remoteConfigShape = {
  project_id: projectId,
  version_number: z.union([z.string().regex(/^\d+$/), z.number().int().min(1)]).optional().describe('A template version to read. Default: the active template.'),
};

const getUsersShape = {
  project_id: projectId,
  uids: z.array(z.string().trim().min(1)).optional().describe('User ids (localId) to look up.'),
  emails: z.array(z.string().trim().min(1)).optional().describe('Email addresses to look up.'),
  phone_numbers: z.array(z.string().trim().min(1)).optional().describe('Phone numbers to look up, in E.164 form such as +15555550100.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(`Without uids, emails or phone numbers: the most users to list, 1 to 500 (Google's limit). Default ${AUTH_USERS_DEFAULT}, as in Google's Firebase MCP server; next_offset, when the page is full, reads on.`),
  offset: z.number().int().min(0).optional().describe('Without uids, emails or phone numbers: users to skip first (next_offset of the previous answer).'),
};

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('developer', cfg));

  return [
    defineTool({
      name: 'firestore_get_document',
      title: 'Get a Firestore document',
      description:
        "Read one Firestore document by its path, such as users/alice (matches firestore_get_document in Google's Firebase MCP server). Returns its fields as plain JSON, its id and its create and update times. firestore_list_documents or firestore_query_collection find documents. A read.",
      kind: 'read',
      scopes: FIRESTORE_SCOPES,
      inputSchema: getDocumentShape,
      async handler(args) {
        const input = z.object(getDocumentShape).parse(args);
        const name = documentPath(input.project_id, input.database, input.document_path);
        const res = await call<FsDocument>({ url: `${FIRESTORE}/${name}`, query: { 'mask.fieldPaths': input.field_paths, readTime: input.read_time } });
        return documentSummary(res.data, input.raw_values);
      },
    }),
    defineTool({
      name: 'firestore_list_documents',
      title: 'List Firestore documents',
      description:
        "List the documents of a Firestore collection, a page at a time, such as users or users/alice/orders (matches firestore_list_documents in Google's Firebase MCP server). Returns each document's path, id and fields as plain JSON, and next_page_token when there are more. firestore_query_collection filters. A read.",
      kind: 'read',
      scopes: FIRESTORE_SCOPES,
      inputSchema: listDocumentsShape,
      async handler(args) {
        const input = z.object(listDocumentsShape).parse(args);
        const { parent, collectionId } = collectionOf(input.project_id, input.database, input.collection_path);
        const res = await call<{ documents?: FsDocument[]; nextPageToken?: string }>({
          url: `${FIRESTORE}/${parent}/${encodeURIComponent(collectionId)}`,
          query: {
            pageSize: input.page_size,
            pageToken: input.page_token,
            orderBy: input.order_by,
            'mask.fieldPaths': input.field_paths,
            showMissing: input.show_missing,
          },
        });
        return { documents: (res.data.documents ?? []).map((d) => documentSummary(d, input.raw_values)), next_page_token: res.data.nextPageToken || undefined };
      },
    }),
    defineTool({
      name: 'firestore_query_collection',
      title: 'Query a Firestore collection',
      description:
        "Find documents in a Firestore collection by field conditions joined with AND, with an order and a limit (matches firestore_query_collection in Google's Firebase MCP server). Values are plain JSON. Returns each matching document's path, id and fields. A query that needs a composite index fails with Google's link to create it. A read (Firestore runQuery).",
      kind: 'read',
      scopes: FIRESTORE_SCOPES,
      inputSchema: queryShape,
      async handler(args) {
        const input = z.object(queryShape).parse(args);
        const { parent, collectionId } = collectionOf(input.project_id, input.database, input.collection_path);
        const limit = input.limit ?? FIRESTORE_QUERY_DEFAULT;
        const offset = input.offset ?? 0;
        const body = runQueryBody({ collectionId, filters: input.filters, order_by: input.order_by, limit, offset, all_descendants: input.all_descendants });
        const res = await call<Array<{ document?: FsDocument; readTime?: string }>>({ url: `${FIRESTORE}/${parent}:runQuery`, method: 'POST', body });
        const parts = Array.isArray(res.data) ? res.data : [];
        const documents = parts.filter((p) => p.document).map((p) => documentSummary(p.document as FsDocument, input.raw_values));
        return offsetPage({ documents, count: documents.length }, 'documents', offset, limit, cfg.maxResultChars, 'documents');
      },
    }),
    defineTool({
      name: 'remoteconfig_get_template',
      title: 'Get the Remote Config template',
      description:
        "Read a project's Firebase Remote Config template: its parameters, conditions, parameter groups and version, the active one or a given version (matches remoteconfig_get_template in Google's Firebase MCP server). A read.",
      kind: 'read',
      scopes: REMOTE_CONFIG_SCOPES,
      inputSchema: remoteConfigShape,
      async handler(args) {
        const input = z.object(remoteConfigShape).parse(args);
        const project = projectIdOf(input.project_id);
        const res = await call<Record<string, unknown>>({
          url: `${REMOTE_CONFIG}/projects/${encodeURIComponent(project)}/remoteConfig`,
          query: { versionNumber: input.version_number === undefined ? undefined : String(input.version_number) },
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'auth_get_users',
      title: 'Get Firebase Authentication users',
      description:
        "Read Firebase Authentication (Identity Platform) users of a project: by uid, email or phone number, or a page of users when none is given (matches auth_get_users in Google's Firebase MCP server). Password hashes and salts are left out. Not the sign-in of this server: that is auth_login. A read.",
      kind: 'read',
      scopes: AUTH_USERS_SCOPES,
      inputSchema: getUsersShape,
      async handler(args) {
        const input = z.object(getUsersShape).parse(args);
        const project = encodeURIComponent(projectIdOf(input.project_id));
        const lookup = Boolean(input.uids?.length || input.emails?.length || input.phone_numbers?.length);
        if (lookup) {
          const res = await call<{ users?: Array<Record<string, unknown>> }>({
            url: `${IDENTITY}/projects/${project}/accounts:lookup`,
            method: 'POST',
            body: {
              ...(input.uids?.length ? { localId: input.uids } : {}),
              ...(input.emails?.length ? { email: input.emails } : {}),
              ...(input.phone_numbers?.length ? { phoneNumber: input.phone_numbers } : {}),
            },
          });
          const users = (res.data.users ?? []).map(userSummary);
          return { users, count: users.length };
        }
        const limit = input.limit ?? AUTH_USERS_DEFAULT;
        const offset = input.offset ?? 0;
        const res = await call<{ userInfo?: Array<Record<string, unknown>>; recordsCount?: string }>({
          url: `${IDENTITY}/projects/${project}/accounts:query`,
          method: 'POST',
          body: { returnUserInfo: true, limit: String(limit), ...(offset ? { offset: String(offset) } : {}) },
        });
        const users = (res.data.userInfo ?? []).map(userSummary);
        return offsetPage({ users, count: users.length }, 'users', offset, limit, cfg.maxResultChars, 'users');
      },
    }),
  ];
}
