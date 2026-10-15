#!/usr/bin/env node
/**
 * Builds data/catalog.json: one entry per Google Discovery API version listed in the directory,
 * preferred or not, deprecated ones included, plus the SUPPLEMENTAL_ENTRIES. An entry is a name
 * and a version, so one name can have several entries. Each entry keeps its preferred and
 * deprecated flags and only the routing data of each method (id, httpMethod, path, scopes, upload
 * and download flags). Parameters, schemas and request/response refs are left out.
 *
 * Usage:
 *   node scripts/build-catalog.mjs            fetch the directory and any document not yet cached
 *   node scripts/build-catalog.mjs --offline  rebuild from data/cache-discovery/ without network access
 *
 * Outputs:
 *   data/catalog.json          the catalog (compact JSON, sorted by name, then version)
 *   data/catalog-errors.json   fetch or parse failures as [{name, version, error}]
 * Cache (git-ignored):
 *   data/cache-discovery/_directory.json and <name>.<version>.json (raw responses).
 *   A document already in the cache is not downloaded again; delete its file to refetch it.
 *
 * config/catalog-plugins.json is curated by hand. This script only validates it
 * (every directory API name in exactly one plugin) and prints a per-plugin summary.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_DIR = join(DATA_DIR, 'cache-discovery');
const DIRECTORY_CACHE = join(CACHE_DIR, '_directory.json');
const CATALOG_FILE = join(DATA_DIR, 'catalog.json');
const ERRORS_FILE = join(DATA_DIR, 'catalog-errors.json');
const PLUGINS_FILE = join(ROOT, 'config', 'catalog-plugins.json');

const DIRECTORY_URL = 'https://www.googleapis.com/discovery/v1/apis';
const CONCURRENCY = 8;
const RETRIES = 3;
const TIMEOUT_MS = 60_000;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 160;
const DESCRIPTION_MAX_FALLBACK = 80;
const SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
const PLUGIN_KEYS = [
  'google-cloud',
  'google-ai',
  'google-workspace',
  'google-search',
  'google-business',
  'google-developer',
];

/**
 * Versions the directory does not list, fetched from their own discovery URLs. The directory
 * gives no preferred flag for them, so preferred is false. Each one is probed before the build
 * (see probeSupplemental): a URL that does not answer is recorded in catalog-errors.json and its
 * entry is left out.
 */
const SUPPLEMENTAL_ENTRIES = [
  {
    name: 'cloudquotas',
    version: 'v1',
    preferred: false,
    discoveryRestUrl: 'https://cloudquotas.googleapis.com/$discovery/rest?version=v1',
  },
  {
    name: 'cloudquotas',
    version: 'v1beta',
    preferred: false,
    discoveryRestUrl: 'https://cloudquotas.googleapis.com/$discovery/rest?version=v1beta',
  },
  {
    name: 'generativelanguage',
    version: 'v1beta',
    preferred: false,
    discoveryRestUrl: 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta',
  },
  {
    name: 'generativelanguage',
    version: 'v1',
    preferred: false,
    discoveryRestUrl: 'https://generativelanguage.googleapis.com/$discovery/rest?version=v1',
  },
  // Google Ads. v26 is the version used by the gads product: the newest that answers, probed 2026-10-15
  // (v22 to v26 answer, v27 to v29 return 404). Recorded in docs/ads-version.txt; bump both together.
  {
    name: 'googleads',
    version: 'v26',
    preferred: false,
    discoveryRestUrl: 'https://googleads.googleapis.com/$discovery/rest?version=v26',
  },
];

const stats = { cached: 0, downloaded: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const compareEntries = (a, b) => compareText(a.name, b.name) || compareText(a.version, b.version);

/** GET with a 60 s timeout per attempt. Retries 429, 5xx and network errors up to RETRIES times. */
async function fetchText(url) {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await res.text();
      lastError = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS} ms` : err.message;
    }
  }
  throw new Error(`${lastError} (${url})`);
}

/** Runs fn over items with at most `limit` in flight. Results keep the input order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadDirectory(offline) {
  if (offline) {
    try {
      return JSON.parse(await readFile(DIRECTORY_CACHE, 'utf8'));
    } catch (err) {
      throw new Error(`--offline needs ${DIRECTORY_CACHE}; run without --offline first (${err.message})`);
    }
  }
  const text = await fetchText(DIRECTORY_URL);
  const directory = JSON.parse(text);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(DIRECTORY_CACHE, text);
  return directory;
}

/**
 * Every directory version, then the supplemental ones that answered the probe, sorted by name and
 * version. Throws on a duplicate.
 */
function allEntries(directory, supplemental) {
  const entries = [
    ...(directory.items ?? []).map((item) => ({
      name: item.name,
      version: item.version,
      preferred: item.preferred === true,
      title: item.title,
      description: item.description,
      documentationLink: item.documentationLink,
      discoveryRestUrl: item.discoveryRestUrl,
    })),
    ...supplemental,
  ];
  const seen = new Set();
  for (const entry of entries) {
    // Cache files are named name.version and Windows file names ignore case, so compare lowercased.
    const key = `${entry.name}.${entry.version}`.toLowerCase();
    if (seen.has(key)) throw new Error(`two entries for ${entry.name} ${entry.version}`);
    seen.add(key);
  }
  return entries.sort(compareEntries);
}

function cachePath(entry) {
  return join(CACHE_DIR, `${entry.name}.${entry.version}.json`);
}

/** The cached document; online, a missing or unreadable cache file is downloaded and cached again. */
async function loadDocument(entry, offline) {
  try {
    const doc = JSON.parse(await readFile(cachePath(entry), 'utf8'));
    stats.cached += 1;
    return doc;
  } catch (err) {
    if (offline) {
      if (err.code === 'ENOENT') throw new Error('not in cache; run without --offline to fetch it');
      throw err;
    }
    if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
  }
  const url =
    entry.discoveryRestUrl ??
    `https://www.googleapis.com/discovery/v1/apis/${entry.name}/${entry.version}/rest`;
  const text = await fetchText(url);
  const doc = JSON.parse(text);
  await writeFile(cachePath(entry), text);
  stats.downloaded += 1;
  return doc;
}

/** [id, httpMethod, path, scopes, flags]; flags: "u" upload, "d" download, both "ud", else "". */
function compactMethod(method) {
  const upload = method.mediaUpload || method.supportsMediaUpload ? 'u' : '';
  const download = method.supportsMediaDownload ? 'd' : '';
  return [method.id, method.httpMethod, method.path, method.scopes ?? [], upload + download];
}

/** Top-level methods first, then each resource's methods followed by its nested resources, in document order. */
function collectMethods(container, out) {
  for (const method of Object.values(container.methods ?? {})) out.push(compactMethod(method));
  for (const resource of Object.values(container.resources ?? {})) collectMethods(resource, out);
  return out;
}

function buildApi(entry, doc, descriptionMax) {
  const labels = Array.isArray(doc.labels) ? doc.labels : [];
  // A supplemental document is served from its own URL, which the gateway needs to describe its methods.
  const supplemental = SUPPLEMENTAL_ENTRIES.includes(entry) ? { discoveryRestUrl: entry.discoveryRestUrl } : {};
  return {
    name: entry.name,
    version: entry.version,
    preferred: entry.preferred === true,
    title: (entry.title ?? doc.title ?? '').slice(0, TITLE_MAX),
    description: (entry.description ?? doc.description ?? '').slice(0, descriptionMax),
    documentationLink: entry.documentationLink ?? doc.documentationLink ?? null,
    labels,
    deprecated: entry.deprecated === true || doc.deprecated === true || labels.includes('deprecated'),
    rootUrl: doc.rootUrl,
    servicePath: doc.servicePath,
    ...supplemental,
    methods: collectMethods(doc, []),
  };
}

async function readPlugins() {
  try {
    return JSON.parse(await readFile(PLUGINS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Every directory API name must be in exactly one plugin, including names whose fetch failed, so a
 * later successful fetch needs no edit to the plugin map. Returns { problems, warnings }.
 */
function validatePlugins(plugins, directoryNames, failedNames) {
  const problems = [];
  const warnings = [];
  if (!plugins) return { problems: [`${PLUGINS_FILE} is missing`], warnings };
  for (const key of PLUGIN_KEYS) {
    if (!Array.isArray(plugins[key])) problems.push(`plugin "${key}" is missing or not an array`);
    else if (plugins[key].length === 0) problems.push(`plugin "${key}" is empty`);
  }
  const seen = new Map();
  for (const key of PLUGIN_KEYS) {
    for (const name of plugins[key] ?? []) {
      if (seen.has(name)) problems.push(`${name} is in both "${seen.get(name)}" and "${key}"`);
      else seen.set(name, key);
    }
  }
  const known = new Set(directoryNames);
  for (const name of directoryNames) {
    if (!seen.has(name)) problems.push(`${name} is not assigned to any plugin`);
  }
  for (const name of seen.keys()) {
    if (!known.has(name)) problems.push(`${name} is assigned but is not a directory API`);
    else if (failedNames.has(name)) warnings.push(`${name} is assigned; some of its discovery documents failed (see catalog-errors.json)`);
  }
  for (const name of Object.keys(plugins.notes ?? {})) {
    if (!known.has(name)) warnings.push(`note for ${name}, which is not a directory API`);
  }
  return { problems, warnings };
}

/** Per plugin: the catalog entries (every version) of the plugin's API names. */
function summarize(catalog, plugins) {
  return PLUGIN_KEYS.map((key) => {
    const names = new Set(plugins?.[key] ?? []);
    const row = { plugin: key, entries: 0, methods: 0, kb: 0, uploads: 0, downloads: 0 };
    for (const api of catalog.apis) {
      if (!names.has(api.name)) continue;
      row.entries += 1;
      row.methods += api.methods.length;
      row.kb += JSON.stringify(api).length / 1024;
      for (const [, , , , flags] of api.methods) {
        if (flags.includes('u')) row.uploads += 1;
        if (flags.includes('d')) row.downloads += 1;
      }
    }
    row.kb = Math.round(row.kb);
    return row;
  });
}

/**
 * Probes each supplemental URL before the build. A URL that does not answer with a discovery
 * document is recorded in errors and its entry is left out of the catalog. A document that
 * answers is returned with its entry, so the build reuses it rather than fetching it again.
 */
async function probeSupplemental(offline, errors) {
  const answered = new Map();
  for (const entry of SUPPLEMENTAL_ENTRIES) {
    try {
      const doc = await loadDocument(entry, offline);
      if (doc?.kind !== 'discovery#restDescription') {
        throw new Error(`not a discovery document (kind ${doc?.kind ?? 'missing'}) (${entry.discoveryRestUrl})`);
      }
      answered.set(entry, doc);
    } catch (err) {
      errors.push({ name: entry.name, version: entry.version, error: err.message });
      console.warn(`  probe failed, entry skipped: ${entry.name}@${entry.version}: ${err.message}`);
    }
  }
  return answered;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const directory = await loadDirectory(offline);
  const errors = [];
  const probed = await probeSupplemental(offline, errors);
  const entries = allEntries(directory, [...probed.keys()]);
  const supplementalCount = probed.size;
  console.log(
    `${offline ? 'offline' : 'online'}: ${entries.length - supplementalCount} directory versions ` +
      `(${entries.filter((entry) => entry.preferred).length} preferred) + ${supplementalCount} supplemental ` +
      `of ${SUPPLEMENTAL_ENTRIES.length} probed`,
  );

  let done = 0;
  const built = await mapLimit(entries, CONCURRENCY, async (entry) => {
    try {
      const doc = probed.get(entry) ?? (await loadDocument(entry, offline));
      return buildApi(entry, doc, DESCRIPTION_MAX);
    } catch (err) {
      errors.push({ name: entry.name, version: entry.version, error: err.message });
      return null;
    } finally {
      done += 1;
      if (done % 50 === 0 || done === entries.length) console.log(`  processed ${done}/${entries.length}`);
    }
  });
  console.log(`documents: ${stats.cached} from cache, ${stats.downloaded} downloaded`);

  let apis = built.filter(Boolean);
  let text = JSON.stringify(makeCatalog(apis));
  if (Buffer.byteLength(text) > SIZE_LIMIT_BYTES) {
    console.warn(`catalog is over 15 MB; trimming descriptions to ${DESCRIPTION_MAX_FALLBACK} characters`);
    apis = apis.map((api) => ({ ...api, description: api.description.slice(0, DESCRIPTION_MAX_FALLBACK) }));
    text = JSON.stringify(makeCatalog(apis));
  }

  errors.sort(compareEntries);
  await writeFile(CATALOG_FILE, `${text}\n`);
  await writeFile(ERRORS_FILE, `${JSON.stringify(errors, null, 2)}\n`);

  const catalog = JSON.parse(text);
  const label = (api) => `${api.name}@${api.version}`;
  console.log(
    `\nentries=${catalog.apiCount} preferred=${catalog.apis.filter((api) => api.preferred).length} ` +
      `methodCount=${catalog.methodCount} size=${(Buffer.byteLength(text) / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(`failures=${errors.length}${errors.length ? `: ${errors.map((e) => `${e.name}@${e.version}`).join(', ')}` : ''}`);
  const deprecated = catalog.apis.filter((api) => api.deprecated).map(label);
  console.log(`deprecated=${deprecated.length}${deprecated.length ? `: ${deprecated.join(', ')}` : ''}`);

  const plugins = await readPlugins();
  if (plugins) {
    console.log('\nplugin summary (KB = serialized size of the plugin share):');
    console.table(summarize(catalog, plugins));
  }
  const directoryNames = [...new Set((directory.items ?? []).map((item) => item.name))];
  const { problems, warnings } = validatePlugins(
    plugins,
    directoryNames,
    new Set(errors.map((error) => error.name)),
  );
  if (problems.length) {
    console.warn(`\ncategory check: ${problems.length} problem(s)`);
    for (const problem of problems) console.warn(`  - ${problem}`);
  } else {
    console.log('\ncategory check: every directory API name is in exactly one plugin');
  }
  for (const warning of warnings) console.log(`  note: ${warning}`);
}

function makeCatalog(apis) {
  return {
    generatedAt: new Date().toISOString(),
    apiCount: apis.length,
    methodCount: apis.reduce((sum, api) => sum + api.methods.length, 0),
    apis,
  };
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
