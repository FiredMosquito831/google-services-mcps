/**
 * The target preview of a generated write or destructive tool (1.27.0). When the tool's method names one resource by its
 * path parameters, and the same API has a GET `get` method for that resource (same resource chain, the same path
 * parameters, no other required parameter, and a read), the server reads that resource before the approval and adds a
 * few fields that name it (its title, display name, summary, subject, name or email) to the approval text. The read is a
 * read: it never asks. It changes nothing, and it never changes what the tool sends. When there is no such GET, or the
 * read fails or is slow, the approval shows the arguments exactly as before.
 *
 * Pure helpers, no network: runServer (src/core/tools.ts) calls the tool's describeTarget, which the generator
 * (src/core/discovery/tools.ts) builds from targetGetFor.
 */
import type { MethodRecord } from './discovery/methods.js';

/** The fields that name a resource, in the order they are shown. Only top-level string values are taken. */
export const TARGET_FIELDS: readonly string[] = ['title', 'displayName', 'summary', 'subject', 'name', 'primaryEmail', 'emailAddress', 'email'];
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

/** A few fields that name the resource, from a GET result: top-level strings of TARGET_FIELDS, cut and capped. */
export function targetFieldsOf(data: unknown): Record<string, string> | undefined {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of TARGET_FIELDS) {
    if (Object.keys(out).length >= TARGET_MAX_FIELDS) break;
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') continue;
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
