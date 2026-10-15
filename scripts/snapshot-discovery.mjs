#!/usr/bin/env node
/**
 * Downloads Google Discovery documents for every {api, version} listed in
 * config/servers.json and writes compacted copies to data/discovery/.
 * Also writes data/scopes.json: per server, the union of the method scopes of
 * its discovery APIs.
 *
 * Usage: node scripts/snapshot-discovery.mjs
 * Exit code is 1 only when every fetch failed. Failures are listed in
 * data/discovery/_errors.json. A failed API keeps its previous snapshot, if any.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVERS_FILE = join(ROOT, 'config', 'servers.json');
const OUT_DIR = join(ROOT, 'data', 'discovery');
const SCOPES_FILE = join(ROOT, 'data', 'scopes.json');
const ERRORS_FILE = join(OUT_DIR, '_errors.json');

const METHOD_DESC_MAX = 300;
const PARAM_DESC_MAX = 200;
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

/**
 * servers.json names some APIs the way the user thinks of them. Discovery
 * publishes these under another name, so they are looked up under the alias.
 */
const DISCOVERY_ALIASES = {
  'reports.v1': 'admin/reports_v1',
  'datatransfer.v1': 'admin/datatransfer_v1',
};

/**
 * Candidate URLs in order: the documented path, the alias path (if any), then the
 * API's own host. The host form serves some APIs that the path form answers with 404.
 */
function candidateUrls(key, api, version) {
  const urls = [`https://www.googleapis.com/discovery/v1/apis/${api}/${version}/rest`];
  if (DISCOVERY_ALIASES[key]) urls.push(`https://www.googleapis.com/discovery/v1/apis/${DISCOVERY_ALIASES[key]}/rest`);
  urls.push(`https://${api.toLowerCase()}.googleapis.com/$discovery/rest?version=${version}`);
  return urls;
}

/** Returns the parsed document, or throws. A 404 moves on to the next candidate. */
async function fetchDiscovery(key, api, version) {
  const errors = [];
  for (const url of candidateUrls(key, api, version)) {
    let lastError;
    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
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

async function readExistingDoc(key) {
  try {
    return JSON.parse(await readFile(join(OUT_DIR, `${key}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

async function main() {
  const { servers } = JSON.parse(await readFile(SERVERS_FILE, 'utf8'));

  const wanted = new Map();
  for (const server of servers) {
    for (const a of server.apis ?? []) wanted.set(`${a.api}.${a.version}`, a);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const compacted = new Map();
  const failures = [];
  for (const [key, { api, version }] of wanted) {
    try {
      const doc = compactDoc(await fetchDiscovery(key, api, version));
      await writeFile(join(OUT_DIR, `${key}.json`), JSON.stringify(doc), 'utf8');
      compacted.set(key, doc);
      console.log(`ok      ${key} (${countMethods(doc.resources).total} methods)`);
    } catch (err) {
      failures.push({ api, version, error: err.message ?? String(err) });
      console.log(`FAILED  ${key}: ${err.message ?? err}`);
    }
  }

  await writeFile(ERRORS_FILE, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');

  // Remove snapshot files for APIs that are no longer listed in servers.json.
  const expected = new Set([...wanted.keys()].map((key) => `${key}.json`));
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith('.json') && file !== '_errors.json' && !expected.has(file)) {
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
