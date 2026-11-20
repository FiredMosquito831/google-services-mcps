/**
 * The target preview of a generated write or destructive tool (1.27.0). When the tool's method names one resource by its
 * path parameters, and the same API has a GET `get` method for that resource (same resource chain, the same path
 * parameters, no other required parameter, and a read), the server reads that resource before the approval and adds a
 * few fields that name it (its title, display name, summary, subject, name or email) to the approval text. A People
 * Person keeps those names one level down, so two explicit paths are also read: names[0].displayName and
 * emailAddresses[0].value, each only when the matching top-level field is absent. There is no other nested walk. The
 * read is a read: it never asks. It changes nothing, and it never changes what the tool sends. When there is no such
 * GET, or the read fails or is slow, the approval shows the arguments exactly as before.
 *
 * Pure helpers, no network: runServer (src/core/tools.ts) calls the tool's describeTarget, which the generator
 * (src/core/discovery/tools.ts) builds from targetGetFor.
 */
import type { MethodRecord } from './discovery/methods.js';

/** The fields that name a resource, in the order they are shown. Only these top-level strings and the two explicit
 * nested paths below are taken; there is no general walk into the answer. */
export const TARGET_FIELDS: readonly string[] = ['title', 'displayName', 'summary', 'subject', 'name', 'primaryEmail', 'emailAddress', 'email'];
/** The only nested naming values read: a People Person's first name and first email address. Element 0 only, never a
 * later element, and no other `value` property is read. */
const TARGET_NESTED = [
  { field: 'displayName', path: ['names', 0, 'displayName'] },
  { field: 'email', path: ['emailAddresses', 0, 'value'] },
] as const;
/** The top-level email fields that take precedence over the nested People address. */
const TOP_EMAIL_FIELDS = ['primaryEmail', 'emailAddress', 'email'] as const;
/** At most this many fields are shown. */
export const TARGET_MAX_FIELDS = 4;
/** A longer value is cut to this many characters and ends with "...". */
export const TARGET_VALUE_CHARS = 200;
/** The read is given up after this long; the approval then shows the arguments only. */
export const TARGET_READ_TIMEOUT_MS = 5000;
/** The key that holds the fields in the approval's arguments. It says the fields were read, and are not sent. */
export const TARGET_PREVIEW_KEY = 'target (read from Google now, not sent)';

const pathNames = (m: Pick<MethodRecord, 'parameters'>): string =>
  m.parameters
    .filter((p) => p.location === 'path')
    .map((p) => p.name)
    .sort()
    .join(',');

const sameChain = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * The GET that reads the resource a write or destructive method acts on, or undefined. It must be named get, use GET,
 * be a read (so never a credential reveal, which config/tool-kinds.json makes a write), sit in the same resource chain,
 * take exactly the same path parameters (a create names its parent, not the new resource, so it has none), and need no
 * other parameter.
 */
export function targetGetFor(m: MethodRecord, methods: readonly MethodRecord[]): MethodRecord | undefined {
  if (m.kind !== 'write' && m.kind !== 'destructive') return undefined;
  const names = pathNames(m);
  if (names === '') return undefined;
  return methods.find(
    (g) =>
      g !== m &&
      g.httpMethod === 'GET' &&
      g.methodName === 'get' &&
      g.kind === 'read' &&
      sameChain(g.resource, m.resource) &&
      pathNames(g) === names &&
      !g.parameters.some((p) => p.location !== 'path' && p.required === true),
  );
}

/** A non-blank string, or undefined. */
const namingString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** The value at one of the explicit nested paths; an array is followed only at the declared numeric index. */
function nestedString(record: Record<string, unknown>, path: readonly (string | number)[]): string | undefined {
  let at: unknown = record;
  for (const part of path) {
    if (typeof part === 'number') {
      if (!Array.isArray(at)) return undefined;
      at = at[part];
    } else {
      if (at === null || typeof at !== 'object' || Array.isArray(at)) return undefined;
      at = (at as Record<string, unknown>)[part];
    }
  }
  return namingString(at);
}

/** A few fields that name the resource, from a GET result: the listed top-level strings (or the two explicit nested
 * People paths), cut and capped. A top-level value always wins, and no unrelated field is walked. */
export function targetFieldsOf(data: unknown): Record<string, string> | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of TARGET_FIELDS) {
    if (Object.keys(out).length >= TARGET_MAX_FIELDS) break;
    let value = namingString(record[field]);
    const nested = TARGET_NESTED.find((n) => n.field === field);
    if (value === undefined && nested) {
      // A nested address is used only when no top-level email was named; there is no fallback to a later element.
      if (nested.field !== 'email' || TOP_EMAIL_FIELDS.every((f) => namingString(record[f]) === undefined)) {
        value = nestedString(record, nested.path);
      }
    }
    if (value === undefined) continue;
    out[field] = value.length > TARGET_VALUE_CHARS ? `${value.slice(0, TARGET_VALUE_CHARS)}...` : value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The promise's value, or undefined when it fails or takes longer than ms. It never throws. */
export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise.catch(() => undefined), late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
