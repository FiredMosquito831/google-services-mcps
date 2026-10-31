#!/usr/bin/env node
/**
 * Downloads Google Discovery documents for every {api, version} in the "generated" lists of
 * config/products.json and writes compacted copies to data/discovery/. The "include" subset of a
 * generated entry is not applied here: the snapshot holds the whole document, and the subset is
 * applied when the tools are built.
 * Also writes data/scopes.json: per server, the union of the method scopes of
 * its discovery APIs.
 * And data/discovery/_revisions.json: per snapshot, the `revision` of the document Google served and the time it was
 * fetched (ISO, UTC). The snapshot files themselves keep their trimmed shape. A failed API keeps its recorded revision.
 * scripts/check-discovery-freshness.mjs compares these records with Google's current documents.
 *
 * Usage: node scripts/snapshot-discovery.mjs [--offline [--cache <dir>]]
 * Exit code is 1 only when every fetch failed. Failures are listed in
 * data/discovery/_errors.json. A failed API keeps its previous snapshot, if any.
 * --offline reads each document from the raw cache that scripts/build-catalog.mjs keeps (data/cache-discovery, or
 * --cache <dir>) and sends no request; a document the cache lacks fails as a fetch does. A cached document whose
 * revision is the one recorded keeps its record; another gets the cache's revision and the cache file's time.
 * Each snapshot keeps the key order of the snapshot it replaces (new keys after), so a refresh rewrites only what changed.
 * For tests: --root <dir> reads config/ and writes data/ under <dir>; --origin <loopback URL> sends every request to a
 * local server (scripts/discovery-urls.mjs).
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateUrls, flagValue, parseTestOrigin, routeUrl } from './discovery-urls.mjs';

let ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ORIGIN;
let CACHE_DIR;
const OFFLINE = process.argv.includes('--offline');
try {
  const rootArg = flagValue(process.argv, '--root');
  if (rootArg) ROOT = resolve(rootArg);
  ORIGIN = parseTestOrigin(flagValue(process.argv, '--origin'));
  const cacheArg = flagValue(process.argv, '--cache');
  if (cacheArg && !OFFLINE) throw new Error('--cache is for --offline');
  CACHE_DIR = cacheArg ? resolve(cacheArg) : join(ROOT, 'data', 'cache-discovery');
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
const PRODUCTS_FILE = join(ROOT, 'config', 'products.json');
const OUT_DIR = join(ROOT, 'data', 'discovery');
const SCOPES_FILE = join(ROOT, 'data', 'scopes.json');
const ERRORS_FILE = join(OUT_DIR, '_errors.json');
const REVISIONS_FILE = join(OUT_DIR, '_revisions.json');
const REVISIONS_COMMENT =
  'Written by scripts/snapshot-discovery.mjs. For each snapshot in this folder: the revision field of the Discovery document Google served and the time it was fetched (ISO, UTC). "unknown (snapshot 2026-10-15)" marks a snapshot written before revisions were recorded; the date is that of the commit that last changed the file. scripts/check-discovery-freshness.mjs compares these records with Google\'s current documents.';

/**
 * Description limits, in characters. A method's description becomes its tool's description, and a parameter's becomes
 * the description of the tool argument, so a clipped text loses what the tool needs: a filter's syntax, the fields an
 * updateMask takes, the values of a parameter, a warning such as "clears all files". About 99 % of the methods and
 * parameters of the generated APIs fit whole (2026-10-31: 99.4 % of 3,458 methods within 1,500, 99.0 % of 7,891
 * parameters within 1,000). The tool description, with its note and method line, stays within 2,048 characters
 * (TOOL_DESCRIPTION_MAX in src/core/discovery/tools.ts). Until 1.29.0 the limits were 300 and 200.
 */
const METHOD_DESC_MAX = 1500;
const PARAM_DESC_MAX = 1000;
const SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clip(text, max) {
  if (typeof text !== 'string') return undefined;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function compactParam(name, p) {
  return {
    name,
    location: p.location,
    type: p.type,
    format: p.format,
    required: p.required || undefined,
    repeated: p.repeated || undefined,
    enum: p.enum,
    default: p.default,
    description: clip(p.description, PARAM_DESC_MAX),
  };
}

function compactMethod(m) {
  return {
    id: m.id,
    path: m.path,
    flatPath: m.flatPath,
    httpMethod: m.httpMethod,
    description: clip(m.description, METHOD_DESC_MAX),
    parameters: Object.entries(m.parameters ?? {}).map(([name, p]) => compactParam(name, p)),
    parameterOrder: m.parameterOrder,
    request: m.request?.$ref,
    response: m.response?.$ref,
    scopes: m.scopes,
    supportsMediaUpload: m.supportsMediaUpload || undefined,
    mediaUpload: m.mediaUpload ? true : undefined,
    supportsMediaDownload: m.supportsMediaDownload || undefined,
  };
}

function compactResources(resources = {}) {
  const out = {};
  for (const [name, res] of Object.entries(resources)) {
    const node = {};
    if (res.methods) {
      node.methods = Object.fromEntries(Object.entries(res.methods).map(([key, m]) => [key, compactMethod(m)]));
    }
    if (res.resources) node.resources = compactResources(res.resources);
    out[name] = node;
  }
  return out;
}

function compactDoc(raw) {
  return {
    name: raw.name,
    version: raw.version,
    title: raw.title,
    rootUrl: raw.rootUrl,
    servicePath: raw.servicePath,
    baseUrl: raw.baseUrl,
    schemas: raw.schemas ?? {},
    resources: compactResources(raw.resources),
  };
}

function countMethods(resources, acc = { total: 0, uploads: 0 }) {
  for (const res of Object.values(resources)) {
    for (const m of Object.values(res.methods ?? {})) {
      acc.total++;
      if (m.supportsMediaUpload || m.mediaUpload) acc.uploads++;
    }
    if (res.resources) countMethods(res.resources, acc);
  }
  return acc;
}

function collectScopes(resources, into) {
  for (const res of Object.values(resources)) {
    for (const m of Object.values(res.methods ?? {})) {
      for (const scope of m.scopes ?? []) into.add(scope);
    }
    if (res.resources) collectScopes(res.resources, into);
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNamedList = (v) => Array.isArray(v) && v.every((x) => isPlainObject(x) && typeof x.name === 'string');

/**
 * `fresh` with the key order of `previous`: an object's keys that both have come in previous's order, then fresh's new
 * keys in fresh's order; a list of named entries (a method's parameters) in previous's name order, new names after.
 * Every value is fresh's. A refresh then rewrites only what changed, not the order Google happened to serve.
 */
function alignTo(fresh, previous) {
  if (Array.isArray(fresh)) {
    if (!Array.isArray(previous)) return fresh;
    if (isNamedList(fresh) && isNamedList(previous)) {
      const rank = new Map(previous.map((p, i) => [p.name, i]));
      const before = new Map(previous.map((p) => [p.name, p]));
      const pos = (x, i) => rank.get(x.name) ?? previous.length + i;
      return fresh
        .map((x, i) => [x, pos(x, i)])
        .sort((a, b) => a[1] - b[1])
        .map(([x]) => alignTo(x, before.get(x.name)));
    }
    return fresh.map((x, i) => alignTo(x, previous[i]));
  }
  if (!isPlainObject(fresh) || !isPlainObject(previous)) return fresh;
  const out = {};
  for (const key of Object.keys(previous)) if (key in fresh) out[key] = alignTo(fresh[key], previous[key]);
  for (const key of Object.keys(fresh)) if (!(key in out)) out[key] = fresh[key];
  return out;
}

/**
 * --offline: the document from the raw cache, with its revision record: the recorded one when the revision is the same
 * (Google served this document then), else the cache's revision and the time the cache file was written.
 */
async function readCached(key, recorded) {
  const file = join(CACHE_DIR, `${key}.json`);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(`not in the cache (${file}); run without --offline, or node scripts/build-catalog.mjs, to fetch it`);
  }
  const raw = JSON.parse(text);
  const revision = typeof raw.revision === 'string' && raw.revision ? raw.revision : 'none in the document';
  if (recorded?.revision === revision) return { raw, record: recorded };
  return { raw, record: { revision, fetchedAt: (await stat(file)).mtime.toISOString() } };
}

/** Returns the parsed document, or throws. A 404 moves on to the next candidate. */
async function fetchDiscovery(key, api, version) {
  const errors = [];
  for (const url of candidateUrls(key, api, version)) {
    let lastError;
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(routeUrl(url, ORIGIN), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.status === 404) throw Object.assign(new Error(`HTTP 404 at ${url}`), { notFound: true });
        if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        if (err.notFound) break;
        await sleep(500 * attempt);
      }
    }
    errors.push(lastError?.message ?? String(lastError));
  }
  throw new Error(errors.join(' | '));
}

/**
 * Writes data/discovery/_revisions.json: one entry per wanted API, sorted by key. A fetched API gets its new revision
 * and fetch time; an API whose fetch failed keeps its recorded entry, or, when it has an older snapshot but no record,
 * "unknown (not recorded)". APIs no longer wanted are dropped, as their snapshot files are.
 */
async function writeRevisions(wanted, fetchedRevisions) {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(REVISIONS_FILE, 'utf8')).snapshots ?? {};
  } catch {
    previous = {};
  }
  const snapshots = {};
  for (const key of [...wanted.keys()].sort()) {
    const entry = fetchedRevisions.get(key) ?? previous[key];
    if (entry) {
      snapshots[key] = entry;
      continue;
    }
    const hasOldSnapshot = await stat(join(OUT_DIR, `${key}.json`)).then(
      () => true,
      () => false,
    );
    if (hasOldSnapshot) snapshots[key] = { revision: 'unknown (not recorded)', fetchedAt: null };
  }
  await writeFile(REVISIONS_FILE, `${JSON.stringify({ $comment: REVISIONS_COMMENT, snapshots }, null, 2)}\n`, 'utf8');
}

async function readExistingDoc(key) {
  try {
    return JSON.parse(await readFile(join(OUT_DIR, `${key}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

async function main() {
  // One server per product: its name and its generated APIs (config/products.json is the source of truth).
  const { products } = JSON.parse(await readFile(PRODUCTS_FILE, 'utf8'));
  const servers = Object.values(products).map((p) => ({ name: p.server.name, apis: p.generated }));

  const wanted = new Map();
  for (const server of servers) {
    for (const a of server.apis ?? []) wanted.set(`${a.api}.${a.version}`, a);
  }

  await mkdir(OUT_DIR, { recursive: true });

  let recordedRevisions = {};
  if (OFFLINE) {
    try {
      recordedRevisions = JSON.parse(await readFile(REVISIONS_FILE, 'utf8')).snapshots ?? {};
    } catch {
      recordedRevisions = {};
    }
  }

  const compacted = new Map();
  const fetchedRevisions = new Map();
  const failures = [];
  for (const [key, { api, version }] of wanted) {
    try {
      let raw;
      let record;
      if (OFFLINE) {
        ({ raw, record } = await readCached(key, recordedRevisions[key]));
      } else {
        raw = await fetchDiscovery(key, api, version);
        record = {
          revision: typeof raw.revision === 'string' && raw.revision ? raw.revision : 'none in the document',
          fetchedAt: new Date().toISOString(),
        };
      }
      const previous = await readExistingDoc(key);
      const doc = previous ? alignTo(compactDoc(raw), previous) : compactDoc(raw);
      await writeFile(join(OUT_DIR, `${key}.json`), JSON.stringify(doc), 'utf8');
      compacted.set(key, doc);
      fetchedRevisions.set(key, record);
      console.log(`ok      ${key} (${countMethods(doc.resources).total} methods)`);
    } catch (err) {
      failures.push({ api, version, error: err.message ?? String(err) });
      console.log(`FAILED  ${key}: ${err.message ?? err}`);
    }
  }

  await writeFile(ERRORS_FILE, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
  await writeRevisions(wanted, fetchedRevisions);

  // Remove snapshot files for APIs that are no longer listed in servers.json. Files that start with "_" are this
  // script's own records (_errors.json, _revisions.json), not snapshots.
  const expected = new Set([...wanted.keys()].map((key) => `${key}.json`));
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith('.json') && !file.startsWith('_') && !expected.has(file)) {
      await rm(join(OUT_DIR, file));
      console.log(`removed stale ${file}`);
    }
  }

  // Scopes per server, from fresh snapshots or, for failed APIs, the previous snapshot.
  const scopes = {};
  for (const server of servers) {
    const into = new Set();
    for (const a of server.apis ?? []) {
      const key = `${a.api}.${a.version}`;
      const doc = compacted.get(key) ?? (await readExistingDoc(key));
      if (doc) collectScopes(doc.resources, into);
    }
    scopes[server.name] = [...into].sort();
  }
  await writeFile(SCOPES_FILE, `${JSON.stringify(scopes, null, 2)}\n`, 'utf8');

  // Summary.
  const fetchedCount = compacted.size;
  console.log(`\nAPIs fetched: ${fetchedCount}/${wanted.size}, failed: ${failures.length}`);
  console.log('api.version                         methods  uploads     KB');
  let totalBytes = 0;
  for (const key of wanted.keys()) {
    const doc = compacted.get(key);
    const size = (await stat(join(OUT_DIR, `${key}.json`)).catch(() => ({ size: 0 }))).size;
    totalBytes += size;
    const counts = doc ? countMethods(doc.resources) : { total: 0, uploads: 0 };
    console.log(
      `${(key + (doc ? '' : ' (not fetched)')).padEnd(35)} ${String(counts.total).padStart(7)} ${String(counts.uploads).padStart(8)} ${(size / 1024).toFixed(1).padStart(8)}`,
    );
  }
  for (const file of [ERRORS_FILE, SCOPES_FILE]) {
    totalBytes += (await stat(file).catch(() => ({ size: 0 }))).size;
  }
  console.log(`\nTotal size of data/discovery (+ scopes.json): ${(totalBytes / 1024).toFixed(1)} KB (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  if (totalBytes > SIZE_LIMIT_BYTES) {
    console.log('WARNING: total size is above 15 MB. Trim descriptions further (METHOD_DESC_MAX, PARAM_DESC_MAX) or the schemas.');
  }
  for (const f of failures) console.log(`failure: ${f.api}.${f.version}: ${f.error}`);

  if (wanted.size > 0 && failures.length === wanted.size) {
    console.error('All discovery fetches failed.');
    process.exitCode = 1;
  }
}

await main();
