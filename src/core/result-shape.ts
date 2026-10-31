/**
 * The shape of every tool result: compact JSON (no indentation) within a character budget.
 *
 * The budget is GSM_MAX_RESULT_CHARS (default DEFAULT_MAX_RESULT_CHARS). A result within it is the compact JSON of the
 * data, with the paging and count fields (PAGING_KEYS) moved to the front of the top-level object and of the objects
 * directly under it, so a page token is never the last thing in a long answer. Nothing else changes.
 *
 * A result over the budget is cut, never in the middle of a value, and stays valid JSON:
 *  1. The largest part that can shrink goes first: an array keeps its leading whole items (at least one); a long string
 *     keeps its start and ends with a marker. When no array or string is large enough, the object that holds the bulk
 *     (a map of many fields) keeps its leading fields. Paging and count fields are never cut.
 *  2. Step 1 repeats until the result fits, with room for a `truncated` object that says what was left out and how to
 *     read on: { limit_chars, shown, omitted, items, how_to_continue } for an array, { limit_chars, field, shown_chars,
 *     omitted_chars, how_to_continue } for a string. A page token from Google continues after the last item Google
 *     sent, not after the last item shown, and how_to_continue says so.
 *
 * Curated tools that page by offset or row (Analytics, Search Console) fit their own rows first with fitItems, so their
 * next offset counts only the rows shown; the runtime then has nothing left to cut.
 */

/**
 * The default budget, in characters. Claude Code warns above 10,000 tokens and saves a result over 25,000 tokens or
 * 50,000 characters to a file (code.claude.com/docs/en/mcp, "MCP output limits and warnings"). Compact JSON of
 * real-shaped tool results measured 2.67 to 4.89 characters per token (median 3.37) with Anthropic's public tokenizer,
 * so 25,000 characters stays under the 10,000-token warning for every measured shape (at most about 9,400 tokens).
 */
export const DEFAULT_MAX_RESULT_CHARS = 25_000;

/** Paging and count fields: listed first, and never cut. */
export const PAGING_KEYS: ReadonlySet<string> = new Set([
  'nextPageToken',
  'next_page_token',
  'pageToken',
  'nextCursor',
  'next_cursor',
  'nextLink',
  'nextSyncToken',
  'next_sync_token',
  'next_offset',
  'nextOffset',
  'next_start_row',
  'next_start_index',
  'row_count',
  'rowCount',
  'totalRows',
  'total_rows',
  'totalSize',
  'total_size',
  'totalCount',
  'total_count',
  'totalItems',
  'totalResults',
  'resultSizeEstimate',
  'result_size_estimate',
  'recordsCount',
  'records_count',
  'pageInfo',
  'incompleteSearch',
  'has_more',
  'hasMore',
  'count',
  'total',
]);

/** Page-token fields: a token in the object that holds a cut array continues after Google's last item, not ours. */
const TOKEN_KEYS: readonly string[] = ['nextPageToken', 'next_page_token', 'pageToken', 'nextCursor', 'next_cursor', 'nextLink'];

/** The page-size arguments a tool may take, in the order they are looked for (see pageSizeArgOf). */
const PAGE_SIZE_ARGS: readonly string[] = ['page_size', 'pageSize', 'max_results', 'maxResults', 'limit', 'row_limit', 'max_rows'];

/** Strings up to this many characters (as JSON) are never cut: ids, names, dates and tokens stay whole. */
const STRING_MIN = 300;
/** A cut string keeps at least this many characters. */
const STRING_KEEP = 100;
/** Bounds on the work: cut steps per round, and rounds that make room for the truncated object. */
const MAX_STEPS = 200;
const MAX_ROUNDS = 8;
/** The truncated object describes at most this many cuts in words, and lists at most this many other cuts. */
const MAX_TOLD = 3;
const MAX_LISTED = 10;

export interface ShapeOptions {
  /** The tool's page-size argument, named in how_to_continue when an array is cut (pageSizeArgOf). */
  pageSizeArg?: string;
}

/** The page-size argument among a tool's input names, if it has one. */
export function pageSizeArgOf(inputNames: readonly string[]): string | undefined {
  return PAGE_SIZE_ARGS.find((name) => inputNames.includes(name));
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The object with its paging and count fields first, in their own order, then the other fields in theirs. */
function pagingFirst<T>(value: T): T {
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  const paging = keys.filter((k) => PAGING_KEYS.has(k));
  if (paging.length === 0 || keys.slice(0, paging.length).every((k) => PAGING_KEYS.has(k))) return value;
  const out: JsonObject = {};
  for (const k of paging) out[k] = value[k] as Json;
  for (const k of keys) if (!PAGING_KEYS.has(k)) out[k] = value[k] as Json;
  return out as T;
}

/** Paging fields first in the top-level object and in each object directly under it (such as the gateway's data). */
function hoist<T>(value: T): T {
  const top = pagingFirst(value);
  if (!isObject(top)) return top;
  let changed = top !== (value as unknown);
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(top)) {
    const inner = isObject(v) ? pagingFirst(v) : v;
    if (inner !== v) changed = true;
    out[k] = inner as Json;
  }
  return (changed ? out : top) as T;
}

interface ArrayCut {
  type: 'array';
  ref: Json[];
  path: string;
  original: number;
  /** The object that holds the array, for its page token. */
  holder: JsonObject | null;
}
interface StringCut {
  type: 'string';
  path: string;
  text: string;
  shown: number;
}
interface ObjectCut {
  type: 'object';
  ref: JsonObject;
  path: string;
  original: number;
}
type Cut = ArrayCut | StringCut | ObjectCut;

interface Candidate {
  type: 'array' | 'string' | 'object';
  value: Json;
  parent: Json[] | JsonObject | null;
  key: string | number | null;
  path: string;
  size: number;
  /** Arrays: the JSON length of each item. Objects: the JSON length of each "key":value entry. */
  parts?: number[];
}

const childPath = (path: string, key: string | number): string =>
  typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;

/** The JSON length of value, collecting every part that can shrink on the way (one pass). */
function measure(value: Json, path: string, parent: Json[] | JsonObject | null, key: string | number | null, out: Candidate[]): number {
  if (Array.isArray(value)) {
    const parts = value.map((item, i) => measure(item, childPath(path, i), value, i, out));
    const size = 2 + parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1);
    if (value.length >= 2) out.push({ type: 'array', value, parent, key, path, size, parts });
    return size;
  }
  if (isObject(value)) {
    const parts: number[] = [];
    for (const [k, v] of Object.entries(value)) {
      // A paging or count field is measured but never offered for cutting.
      const inner = PAGING_KEYS.has(k) ? (JSON.stringify(v)?.length ?? 4) : measure(v, childPath(path, k), value, k, out);
      parts.push(JSON.stringify(k).length + 1 + inner);
    }
    const size = 2 + parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1);
    if (parts.length >= 2) out.push({ type: 'object', value, parent, key, path, size, parts });
    return size;
  }
  const size = JSON.stringify(value)?.length ?? 4;
  if (typeof value === 'string' && size > STRING_MIN) out.push({ type: 'string', value, parent, key, path, size });
  return size;
}

const marker = (omitted: number): string => ` [... ${omitted} more characters cut]`;
const MARKER_RE = / \[\.\.\. (\d+) more characters cut\]$/;

/** How many characters of the original text a cut string keeps (the part before its marker). */
function shownOf(cut: string, text: string): number {
  const m = MARKER_RE.exec(cut);
  return m ? text.length - Number(m[1]) : cut.length;
}

/**
 * The longest start of text (never half of a UTF-16 pair) that, with the cut marker, is at most room characters as
 * JSON. At least STRING_KEEP characters are kept, even when that is more than room.
 */
function cutString(text: string, room: number): string {
  const fits = (n: number) => JSON.stringify(text.slice(0, n) + marker(text.length - n)).length <= room;
  let lo = 0;
  let hi = text.length - 1;
  if (fits(0)) {
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
  }
  let n = Math.max(lo, Math.min(STRING_KEEP, text.length - 1));
  const code = text.charCodeAt(n - 1);
  if (n > 0 && code >= 0xd800 && code <= 0xdbff) n -= 1;
  return text.slice(0, n) + marker(text.length - n);
}

function setValue(root: { value: Json }, c: Candidate, value: Json): void {
  if (c.parent === null) root.value = value;
  else if (Array.isArray(c.parent)) c.parent[c.key as number] = value;
  else c.parent[c.key as string] = value;
}

/** The fields of an object that may be dropped: all but the first, never a paging or count field. */
function droppableKeys(obj: JsonObject): string[] {
  return Object.keys(obj)
    .slice(1)
    .filter((k) => !PAGING_KEYS.has(k));
}

/**
 * The object to cut when no array or string is large enough: from the top, step into the largest child while that child
 * alone holds more than `excess` characters. Where the bulk is spread over many fields (a map such as audits keyed by
 * name, or the schemas of a document), that object loses its trailing fields.
 */
function bulkObject(root: Json, excess: number): { value: JsonObject; path: string } | undefined {
  let node: Json = root;
  let path = '';
  for (let depth = 0; depth < 64; depth++) {
    if (Array.isArray(node)) {
      if (node.length !== 1) return undefined;
      node = node[0] as Json;
      path = childPath(path, 0);
      continue;
    }
    if (!isObject(node)) return undefined;
    let bestKey: string | undefined;
    let bestSize = -1;
    for (const [k, v] of Object.entries(node)) {
      if (PAGING_KEYS.has(k) || typeof v !== 'object' || v === null) continue;
      const size = JSON.stringify(v).length;
      if (size > bestSize) {
        bestSize = size;
        bestKey = k;
      }
    }
    const best = bestKey === undefined ? undefined : node[bestKey];
    if (bestKey !== undefined && bestSize >= excess && (isObject(best) || (Array.isArray(best) && best.length === 1))) {
      node = best as Json;
      path = childPath(path, bestKey);
      continue;
    }
    return droppableKeys(node).length > 0 ? { value: node, path } : undefined;
  }
  return undefined;
}

/** One cut of the largest part that can shrink, by `excess` characters or as far as it goes. False when none is left. */
function cutOnce(root: { value: Json }, excess: number, cuts: Cut[]): boolean {
  const found: Candidate[] = [];
  measure(root.value, '', null, null, found);
  // Arrays and strings that are large next to the excess go first, the largest first. Many small ones are not cut one
  // by one: their object loses trailing fields instead (bulkObject), which takes a few steps, not thousands.
  const threshold = Math.max(STRING_MIN, Math.floor(excess / 20));
  const arraysAndStrings = found.filter((c) => c.type !== 'object' && c.size >= threshold);
  let pick: Candidate | undefined;
  if (arraysAndStrings.length) {
    pick = arraysAndStrings.reduce((a, b) => (b.size > a.size ? b : a));
  } else {
    const bulk = bulkObject(root.value, excess);
    const asCandidate = bulk && found.find((c) => c.type === 'object' && c.value === bulk.value);
    if (asCandidate) pick = asCandidate;
    else {
      // No object to cut either: the largest remaining array or string, however small.
      const rest = found.filter((c) => c.type !== 'object');
      if (rest.length) pick = rest.reduce((a, b) => (b.size > a.size ? b : a));
    }
  }
  if (!pick) return false;

  if (pick.type === 'array') {
    // Keep the most leading items that bring the array down by `excess`; at least one.
    const items = pick.value as Json[];
    const parts = pick.parts as number[];
    const goal = pick.size - excess;
    let keep = 1;
    let size = 2 + parts[0]!;
    for (let k = 2; k < items.length; k++) {
      const next = size + 1 + parts[k - 1]!;
      if (next > goal) break;
      size = next;
      keep = k;
    }
    if (!cuts.some((c) => c.type === 'array' && c.ref === items)) {
      cuts.push({ type: 'array', ref: items, path: pick.path, original: items.length, holder: isObject(pick.parent) ? pick.parent : null });
    }
    items.length = keep;
    return true;
  }
  if (pick.type === 'string') {
    // A string cut before is cut again from its original text, so it carries one marker.
    const path = pick.path;
    const prior = cuts.find((c): c is StringCut => c.type === 'string' && c.path === path);
    const original = prior ? prior.text : (pick.value as string);
    const cut = cutString(original, Math.max(0, pick.size - excess));
    if (JSON.stringify(cut).length >= pick.size) return false;
    const shown = shownOf(cut, original);
    if (prior) prior.shown = shown;
    else cuts.push({ type: 'string', path, text: original, shown });
    setValue(root, pick, cut);
    return true;
  }
  // An object, when no array or string large enough is left: keep its leading fields.
  const obj = pick.value as JsonObject;
  const keys = Object.keys(obj);
  const parts = pick.parts as number[];
  let saved = 0;
  const drop: string[] = [];
  for (const k of droppableKeys(obj).reverse()) {
    if (saved >= excess) break;
    saved += parts[keys.indexOf(k)]! + 1;
    drop.push(k);
  }
  if (!cuts.some((c) => c.type === 'object' && c.ref === obj)) cuts.push({ type: 'object', ref: obj, path: pick.path, original: keys.length });
  for (const k of drop) delete obj[k];
  return true;
}

/** What was left out and how to read on: the truncated object. */
function describeCuts(cuts: Cut[], budget: number, opts: ShapeOptions, rootLabel: string): JsonObject {
  const sizeArg = opts.pageSizeArg;
  const lines: string[] = [];
  const entries: JsonObject[] = [];
  for (const cut of cuts) {
    const where = cut.path || rootLabel;
    if (cut.type === 'array') {
      const shown = cut.ref.length;
      const omitted = cut.original - shown;
      const token = cut.holder ? TOKEN_KEYS.find((k) => typeof cut.holder?.[k] === 'string' && cut.holder[k] !== '') : undefined;
      if (token) {
        lines.push(
          `Only the first ${shown} of the ${cut.original} items in ${where} fit the result limit (${budget} characters). ${token} continues after all ${cut.original}, so it would skip the other ${omitted}: to see them, repeat this call with ${sizeArg ? `${sizeArg}=${shown}` : `a page size of ${shown}`} and the same page token as this call, then follow the ${token} of that answer. A filter or fewer fields also shortens the answer.`,
        );
      } else {
        lines.push(
          `Only the first ${shown} of the ${cut.original} items in ${where} fit the result limit (${budget} characters). To see the others, narrow the call: a filter, fewer fields, or ${sizeArg ? `a smaller ${sizeArg}` : 'a smaller page'} with paging. GSM_MAX_RESULT_CHARS raises the limit.`,
        );
      }
      entries.push({ shown, omitted, items: where });
    } else if (cut.type === 'string') {
      lines.push(
        `The field ${where} was cut after ${cut.shown} of its ${cut.text.length} characters to fit the result limit (${budget} characters). Ask for a smaller part (an offset, a range, a lower max_chars or fewer fields), or raise GSM_MAX_RESULT_CHARS.`,
      );
      entries.push({ field: where, shown_chars: cut.shown, omitted_chars: cut.text.length - cut.shown });
    } else {
      const shownKeys = Object.keys(cut.ref).length;
      lines.push(`Only ${shownKeys} of the ${cut.original} fields of ${where} fit the result limit (${budget} characters). Ask for fewer fields, or raise GSM_MAX_RESULT_CHARS.`);
      entries.push({ object: where, shown_keys: shownKeys, omitted_keys: cut.original - shownKeys });
    }
  }
  // The note stays short when there are many cuts: the first few are described, the rest counted.
  const [primary, ...more] = entries;
  const told = [...new Set(lines)];
  const sentences = told.slice(0, MAX_TOLD);
  if (told.length > MAX_TOLD) sentences.push(`${told.length - MAX_TOLD} other parts were cut as well.`);
  return {
    limit_chars: budget,
    ...(primary ?? {}),
    ...(more.length ? { other_cuts: more.slice(0, MAX_LISTED) } : {}),
    ...(more.length > MAX_LISTED ? { other_cuts_not_listed: more.length - MAX_LISTED } : {}),
    how_to_continue: sentences.join(' '),
  };
}

/** The cut data with the truncated object after its paging fields. Data that is not an object is wrapped. */
function withNote(value: Json, note: JsonObject, wrapKey: string): Json {
  if (!isObject(value)) return { truncated: note, [wrapKey]: value };
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(value)) if (PAGING_KEYS.has(k)) out[k] = v;
  // A truncated flag of the tool's own (such as a text clipped by max_chars) is kept inside the note.
  const earlier = value.truncated;
  out.truncated = earlier === undefined ? note : { ...note, earlier };
  for (const [k, v] of Object.entries(value)) if (!PAGING_KEYS.has(k) && k !== 'truncated') out[k] = v;
  return hoist(out);
}

/**
 * The text of a tool result: compact JSON within `budget` characters (see the file comment). Always valid JSON. Only a
 * budget too small for the truncated object itself (a few hundred characters) can be exceeded.
 */
export function shapeResult(data: unknown, budget: number, opts: ShapeOptions = {}): string {
  const plain = JSON.stringify(hoist(data));
  if (plain === undefined) return 'null';
  if (plain.length <= budget) return plain;

  const root = { value: JSON.parse(plain) as Json };
  const wrapKey = Array.isArray(root.value) ? 'items' : 'text';
  const rootLabel = isObject(root.value) ? 'the result' : wrapKey;
  const cuts: Cut[] = [];
  // Room kept for the truncated object. A round cuts until the data plus this room fits; when the note turns out longer,
  // the room grows and the next round cuts a little more.
  let room = 600;
  let exhausted = false;
  for (let round = 0; round < MAX_ROUNDS && !exhausted; round++) {
    for (let step = 0; step < MAX_STEPS; step++) {
      const excess = JSON.stringify(root.value).length + room - budget;
      if (excess <= 0) break;
      if (!cutOnce(root, excess, cuts)) {
        exhausted = true;
        break;
      }
    }
    const text = JSON.stringify(withNote(root.value, describeCuts(cuts, budget, opts, rootLabel), wrapKey));
    if (text.length <= budget) return text;
    room += text.length - budget + 20;
  }
  // Nothing more can be cut at whole items (or the budget is smaller than the note): the start of the compact text.
  const note: JsonObject = {
    limit_chars: budget,
    omitted_chars: plain.length,
    how_to_continue: `The result (${plain.length} characters) could not be cut to the result limit (${budget} characters) at whole items. Narrow the call (a filter, fewer fields, a smaller page), or raise GSM_MAX_RESULT_CHARS.`,
  };
  const bare = JSON.stringify({ truncated: note });
  const keep = budget - bare.length - 20;
  if (keep <= STRING_KEEP + 40) return bare;
  const partial = cutString(plain, keep);
  note.omitted_chars = plain.length - shownOf(partial, plain);
  return JSON.stringify({ truncated: note, partial });
}

/**
 * For a curated tool that pages by offset or row: the answer with only the leading items of answer[key] that fit the
 * budget, the fields `describe` gives for that number (such as the next offset after the last row shown), and a
 * truncated object. An answer that fits is returned as it is.
 */
export function fitItems<T extends Record<string, unknown>>(
  answer: T,
  key: string,
  budget: number,
  describe: (shown: number, total: number) => { fields?: Record<string, unknown>; how_to_continue: string },
): T {
  const items = answer[key];
  if (!Array.isArray(items) || (JSON.stringify(hoist(answer))?.length ?? 0) <= budget) return answer;
  const build = (shown: number): T => {
    const told = describe(shown, items.length);
    const fields = told.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(answer)) if (PAGING_KEYS.has(k)) out[k] = k in fields ? fields[k] : v;
    for (const [k, v] of Object.entries(fields)) if (PAGING_KEYS.has(k)) out[k] = v;
    out.truncated = { limit_chars: budget, shown, omitted: items.length - shown, items: key, how_to_continue: told.how_to_continue };
    for (const [k, v] of Object.entries(answer)) {
      if (PAGING_KEYS.has(k) || k === 'truncated') continue;
      out[k] = k === key ? items.slice(0, shown) : k in fields ? fields[k] : v;
    }
    for (const [k, v] of Object.entries(fields)) if (!(k in out)) out[k] = v;
    return out as T;
  };
  // The most items that fit, from their sizes, then checked on the real text (the note's numbers change its length).
  let total = (JSON.stringify(build(0))?.length ?? 0) + 2;
  let shown = 0;
  for (const item of items) {
    total += (JSON.stringify(item)?.length ?? 4) + 1;
    if (total > budget) break;
    shown += 1;
  }
  while (shown > 0 && (JSON.stringify(build(shown))?.length ?? 0) > budget) shown -= 1;
  return build(shown);
}

/**
 * Bytes of a file per call when a download tool returns it as base64 in parts: what fits the result budget with 1,000
 * characters for the fields around it, a multiple of 3 so the base64 parts join into the base64 of the whole file.
 */
export function base64PartBytes(maxResultChars: number): number {
  return Math.max(3, Math.floor((maxResultChars - 1000) / 4) * 3);
}

/** One part of a file for a download tool's offset: the bytes from offset, as base64, and next_offset when more remain. */
export function base64Part(bytes: Buffer, offset: number, part: number) {
  if (offset > bytes.length) throw new Error(`offset ${offset} is past the end of the file (${bytes.length} bytes).`);
  const slice = bytes.subarray(offset, offset + part);
  const end = offset + slice.length;
  return {
    size_bytes: bytes.length,
    offset,
    bytes_read: slice.length,
    ...(end < bytes.length ? { next_offset: end } : {}),
    data_base64: slice.toString('base64'),
  };
}

/** The sentence a too-large download adds: how to read the file in parts with offset. */
export function base64PartsNote(size: number, part: number): string {
  return `Or read it in parts of ${part} bytes: call again with offset 0, then each next_offset (${Math.ceil(size / part)} calls), and join the data_base64 parts in order.`;
}

/**
 * The longest start of text, at most maxChars characters, whose JSON string (quotes and escapes counted) is at most
 * room characters; never half of a UTF-16 pair. For tools that read a text in parts: the next part starts after it.
 */
export function fitText(text: string, maxChars: number, room: number): string {
  const limit = Math.min(text.length, maxChars);
  const fits = (n: number) => JSON.stringify(text.slice(0, n)).length <= room;
  if (fits(limit)) return text.slice(0, limit);
  let lo = 0;
  let hi = limit;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  const code = text.charCodeAt(lo - 1);
  if (lo > 0 && code >= 0xd800 && code <= 0xdbff) lo -= 1;
  return text.slice(0, lo);
}
