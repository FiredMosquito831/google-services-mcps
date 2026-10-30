#!/usr/bin/env node
/**
 * Report-only check: are the repository's Discovery data still what Google publishes? Writes nothing.
 *
 * For every API version in config/servers.json (apis and gatewayApis) and in data/catalog.json, it fetches Google's
 * public Discovery document without credentials, in the URL order of scripts/snapshot-discovery.mjs
 * (scripts/discovery-urls.mjs), and compares it with what the repository holds: the trimmed snapshot in
 * data/discovery/ when there is one (the per-method tools are built from it), else the method list of
 * data/catalog.json (the gateway uses it). A snapshot keeps only the methods under `resources`, so a document is
 * compared with a snapshot on those methods only.
 * It also reads Google's public directory of preferred versions.
 *
 * The report:
 *   - revision: the document's `revision` now, and the one recorded (data/discovery/_revisions.json for snapshots;
 *     the catalog records none). A snapshot made before revisions were recorded says "unknown (snapshot <date>)".
 *   - methods added, removed, and changed (HTTP verb or path), by method id.
 *   - preferred versions that changed since the catalog was built, with the versions our servers use.
 *   - APIs in the directory that the catalog does not have at all. One listed under "unassigned" in
 *     config/products.json is shown with its reason and does not count as a difference.
 *   - documents not checked: needs a key or a sign-in (HTTP 401 or 403), gone (404 at every URL), or failed.
 *
 * Exit codes:
 *   0  no differences
 *   1  differences: methods added, removed or changed, a version gone, a preferred version changed, or a new
 *      directory API. A newer revision with the same methods is reported but is not a difference, because Google
 *      publishes new revisions often, for description and schema edits too.
 *   2  no differences, but some documents (or the directory) could not be fetched; a usage error; or the check could
 *      not run (config/servers.json or data/catalog.json unreadable).
 *
 * Requests: public GETs only, no key and no sign-in, at most 8 at once, 60 s timeout each, one retry after a 429, a
 * 5xx, a timeout or a network error. A 404 moves on to the next candidate URL, as the snapshot does.
 *
 * Usage:
 *   node scripts/check-discovery-freshness.mjs           text summary
 *   node scripts/check-discovery-freshness.mjs --json    the full report as JSON on stdout
 * For tests: --root <dir> reads config/ and data/ under <dir>; --origin <loopback URL> sends every request to a local
 * server (scripts/discovery-urls.mjs).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTORY_PREFERRED_URL, candidateUrls, parseTestOrigin, routeUrl } from './discovery-urls.mjs';

const CONCURRENCY = 8;
const TIMEOUT_MS = 60_000;
const RETRY_WAIT_MS = 1_000;
const TEXT_LIST_MAX = 20;
const USAGE = 'Usage: node scripts/check-discovery-freshness.mjs [--json] [--root <dir>] [--origin <loopback URL>]';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function parseArgs(argv) {
  const opts = { root: join(dirname(fileURLToPath(import.meta.url)), '..'), origin: undefined, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--root' || arg === '--origin') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      if (arg === '--root') opts.root = resolve(value);
      else opts.origin = parseTestOrigin(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  console.error(USAGE);
  process.exit(2);
}
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const readJson = (rel) => JSON.parse(readFileSync(join(opts.root, rel), 'utf8'));
const readJsonIfExists = (rel) => (existsSync(join(opts.root, rel)) ? readJson(rel) : undefined);

let requests = 0;

/**
 * One GET with one retry. Returns { status: 'ok', doc } | { status: 'not-found' | 'needs-key' | 'failed', error }.
 * Messages name the Google URL, not the test origin.
 */
async function getJson(url) {
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_WAIT_MS);
    requests += 1;
    try {
      const res = await fetch(routeUrl(url, opts.origin), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return { status: 'not-found', error: `HTTP 404 at ${url}` };
      if (res.status === 401 || res.status === 403) return { status: 'needs-key', error: `HTTP ${res.status} at ${url}` };
      if (res.ok) {
        try {
          return { status: 'ok', doc: JSON.parse(await res.text()) };
        } catch {
          return { status: 'failed', error: `not JSON at ${url}` };
        }
      }
      lastError = `HTTP ${res.status} at ${url}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS} ms at ${url}` : `${err?.message ?? err} at ${url}`;
    }
  }
  return { status: 'failed', error: lastError };
}

/** The first candidate URL that serves a Discovery document. Without one: needs-key, else failed, else gone (all 404). */
async function fetchDocument(key, name, version) {
  const errors = [];
  const seen = new Set();
  for (const url of candidateUrls(key, name, version)) {
    const r = await getJson(url);
    if (r.status === 'ok') {
      if (r.doc?.kind === 'discovery#restDescription') return { status: 'checked', doc: r.doc, url };
      errors.push(`not a Discovery document at ${url}`);
      seen.add('failed');
      continue;
    }
    errors.push(r.error);
    seen.add(r.status);
  }
  const status = seen.has('needs-key') ? 'needs-key' : seen.has('failed') ? 'failed' : 'gone';
  return { status, error: errors.join(' | ') };
}

/** Method id -> "VERB path". With resourcesOnly, top-level methods are left out (the snapshot's view). */
function documentMethods(doc, resourcesOnly) {
  const out = new Map();
  const walk = (container) => {
    for (const m of Object.values(container?.methods ?? {})) if (m?.id) out.set(m.id, `${m.httpMethod} ${m.path}`);
    for (const r of Object.values(container?.resources ?? {})) walk(r);
  };
  if (resourcesOnly) for (const r of Object.values(doc?.resources ?? {})) walk(r);
  else walk(doc);
  return out;
}

function catalogMethods(entry) {
  return new Map(entry.methods.map((m) => [m[0], `${m[1]} ${m[2]}`]));
}

function compareMethods(recorded, now) {
  const added = [...now.keys()].filter((id) => !recorded.has(id)).sort();
  const removed = [...recorded.keys()].filter((id) => !now.has(id)).sort();
  const changed = [...recorded.keys()]
    .filter((id) => now.has(id) && recorded.get(id) !== now.get(id))
    .sort()
    .map((id) => ({ id, was: recorded.get(id), now: now.get(id) }));
  return { recorded: recorded.size, now: now.size, added, removed, changed };
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

const isUnknown = (revision) => typeof revision !== 'string' || revision.startsWith('unknown') || revision === 'none in the document';

async function main() {
  const servers = readJson('config/servers.json').servers ?? [];
  const catalog = readJson('data/catalog.json');
  const products = readJsonIfExists('config/products.json');
  const recordedRevisions = readJsonIfExists('data/discovery/_revisions.json')?.snapshots ?? {};
  const catalogDate = typeof catalog.generatedAt === 'string' ? catalog.generatedAt.slice(0, 10) : 'date unknown';

  // Every API version to check, with the servers that use it.
  const targets = new Map();
  const target = (name, version) => {
    const key = `${name}.${version}`;
    if (!targets.has(key)) targets.set(key, { key, name, version, usedBy: [] });
    return targets.get(key);
  };
  for (const server of servers) {
    for (const list of ['apis', 'gatewayApis']) {
      for (const a of server[list] ?? []) target(a.api, a.version).usedBy.push(`${server.name} ${list}`);
    }
  }
  const catalogByKey = new Map();
  for (const entry of catalog.apis ?? []) {
    catalogByKey.set(`${entry.name}.${entry.version}`, entry);
    target(entry.name, entry.version);
  }
  const list = [...targets.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const startedAt = new Date().toISOString();
  const directoryResult = await getJson(DIRECTORY_PREFERRED_URL);

  let done = 0;
  const apis = await mapLimit(list, CONCURRENCY, async (t) => {
    const snapshotRel = `data/discovery/${t.key}.json`;
    const snapshot = readJsonIfExists(snapshotRel);
    const catalogEntry = catalogByKey.get(t.key);
    const against = snapshot ? snapshotRel : catalogEntry ? 'data/catalog.json' : null;
    const recordedRevision = snapshot
      ? recordedRevisions[t.key]?.revision ?? 'unknown (not recorded)'
      : `unknown (the catalog of ${catalogDate} records no revision)`;
    const fetched = await fetchDocument(t.key, t.name, t.version);
    done += 1;
    if (process.stderr.isTTY && (done % 50 === 0 || done === list.length)) process.stderr.write(`checked ${done}/${list.length}\n`);
    const row = { key: t.key, name: t.name, version: t.version, usedBy: t.usedBy, against, status: fetched.status };
    if (fetched.status !== 'checked') {
      row.error = fetched.error;
      row.revision = { recorded: recordedRevision, now: null, changed: null };
      return row;
    }
    row.url = fetched.url;
    const now = typeof fetched.doc.revision === 'string' ? fetched.doc.revision : null;
    row.revision = { recorded: recordedRevision, now, changed: isUnknown(recordedRevision) || now === null ? null : now !== recordedRevision };
    if (snapshot) row.methods = compareMethods(documentMethods(snapshot, true), documentMethods(fetched.doc, true));
    else if (catalogEntry) row.methods = compareMethods(catalogMethods(catalogEntry), documentMethods(fetched.doc, false));
    return row;
  });

  // Preferred versions: the catalog's preferred flags against the directory now.
  const directory = { url: DIRECTORY_PREFERRED_URL, status: directoryResult.status === 'ok' ? 'checked' : 'failed' };
  const preferredChanges = [];
  const uncovered = [];
  if (directoryResult.status === 'ok' && Array.isArray(directoryResult.doc?.items)) {
    const live = new Map();
    for (const item of directoryResult.doc.items) {
      if (!live.has(item.name)) live.set(item.name, { versions: new Set(), item });
      live.get(item.name).versions.add(item.version);
    }
    directory.preferredEntries = directoryResult.doc.items.length;
    const recorded = new Map();
    const catalogNames = new Set();
    for (const entry of catalog.apis ?? []) {
      catalogNames.add(entry.name);
      if (!recorded.has(entry.name)) recorded.set(entry.name, new Set());
      if (entry.preferred) recorded.get(entry.name).add(entry.version);
    }
    const sorted = (set) => [...set].sort();
    for (const name of [...catalogNames].sort()) {
      const was = sorted(recorded.get(name) ?? new Set());
      const now = sorted(live.get(name)?.versions ?? new Set());
      if (was.join() === now.join()) continue;
      const usedBy = [];
      for (const server of servers) {
        for (const l of ['apis', 'gatewayApis']) {
          for (const a of server[l] ?? []) if (a.api === name) usedBy.push(`${server.name} ${l} ${a.version}`);
        }
      }
      preferredChanges.push({
        name,
        recorded: was,
        now,
        notInCatalog: now.filter((v) => !catalogByKey.has(`${name}.${v}`)),
        usedBy,
      });
    }
    const unassigned = new Map((products?.unassigned ?? []).map((u) => [u.api, u.reason]));
    for (const [name, { versions, item }] of [...live.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (catalogNames.has(name)) continue;
      uncovered.push({
        name,
        versions: sorted(versions),
        title: item.title ?? null,
        documentationLink: item.documentationLink ?? null,
        knownReason: unassigned.get(name) ?? null,
      });
    }
  } else {
    directory.error = directoryResult.status === 'ok' ? 'the directory has no items list' : directoryResult.error;
  }

  const checked = apis.filter((a) => a.status === 'checked');
  const withMethodChanges = checked.filter((a) => a.methods && (a.methods.added.length || a.methods.removed.length || a.methods.changed.length));
  const sum = (pick) => checked.reduce((n, a) => n + (a.methods ? pick(a.methods).length : 0), 0);
  const summary = {
    apiVersions: apis.length,
    againstSnapshot: apis.filter((a) => a.against?.startsWith('data/discovery/')).length,
    againstCatalog: apis.filter((a) => a.against === 'data/catalog.json').length,
    checked: checked.length,
    needsKey: apis.filter((a) => a.status === 'needs-key').length,
    gone: apis.filter((a) => a.status === 'gone').length,
    failed: apis.filter((a) => a.status === 'failed').length,
    revisionNewer: checked.filter((a) => a.revision.changed === true).length,
    revisionSame: checked.filter((a) => a.revision.changed === false).length,
    revisionUnknown: checked.filter((a) => a.revision.changed === null).length,
    apisWithMethodChanges: withMethodChanges.length,
    methodsAdded: sum((m) => m.added),
    methodsRemoved: sum((m) => m.removed),
    methodsChanged: sum((m) => m.changed),
    preferredChanges: preferredChanges.length,
    uncoveredNew: uncovered.filter((u) => !u.knownReason).length,
    uncoveredKnown: uncovered.filter((u) => u.knownReason).length,
  };
  const differences =
    summary.apisWithMethodChanges > 0 || summary.gone > 0 || summary.preferredChanges > 0 || summary.uncoveredNew > 0;
  const incomplete = summary.failed > 0 || directory.status !== 'checked';
  const result = differences ? 'differences' : incomplete ? 'incomplete' : 'fresh';
  const exitCode = differences ? 1 : incomplete ? 2 : 0;

  const report = {
    tool: 'scripts/check-discovery-freshness.mjs',
    checkedAt: startedAt,
    requests,
    result,
    exitCode,
    summary,
    directory,
    preferredChanges,
    uncovered,
    apis,
  };

  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(textReport(report, catalogDate));
  process.exitCode = exitCode;
}

function textReport(r, catalogDate) {
  const s = r.summary;
  const out = [];
  const more = (items) => (items.length > TEXT_LIST_MAX ? [`      ... and ${items.length - TEXT_LIST_MAX} more (see --json)`] : []);
  out.push(`Discovery freshness check, ${r.checkedAt} (public GETs, no credentials; ${r.requests} requests)`);
  out.push(`API versions: ${s.apiVersions} (${s.againstSnapshot} compared with data/discovery snapshots, ${s.againstCatalog} with data/catalog.json)`);
  out.push(`Checked: ${s.checked}. Needs a key, not checked: ${s.needsKey}. Gone (404 at every URL): ${s.gone}. Failed: ${s.failed}.`);
  out.push(`Revisions: ${s.revisionNewer} differ from the recorded one, ${s.revisionSame} the same, ${s.revisionUnknown} with no recorded revision to compare.`);
  out.push(`Methods differ in ${s.apisWithMethodChanges} of ${s.checked} checked API versions: ${s.methodsAdded} added, ${s.methodsRemoved} removed, ${s.methodsChanged} changed (verb or path).`);
  const changedApis = r.apis.filter((a) => a.methods && (a.methods.added.length || a.methods.removed.length || a.methods.changed.length));
  if (changedApis.length) {
    out.push('');
    out.push('Methods added, removed or changed:');
    for (const a of changedApis) {
      const m = a.methods;
      out.push(`  ${a.key} (${a.usedBy.length ? a.usedBy.join(', ') : 'catalog only'}; against ${a.against}): +${m.added.length} -${m.removed.length} ~${m.changed.length}; revision ${a.revision.recorded} -> ${a.revision.now ?? 'none'}`);
      for (const id of m.added.slice(0, TEXT_LIST_MAX)) out.push(`      + ${id}`);
      out.push(...more(m.added));
      for (const id of m.removed.slice(0, TEXT_LIST_MAX)) out.push(`      - ${id}`);
      out.push(...more(m.removed));
      for (const c of m.changed.slice(0, TEXT_LIST_MAX)) out.push(`      ~ ${c.id}: ${c.was} -> ${c.now}`);
      out.push(...more(m.changed));
    }
  }
  out.push('');
  if (r.directory.status !== 'checked') {
    out.push(`Preferred versions: not checked (${r.directory.error}).`);
  } else {
    out.push(`Preferred versions changed since the catalog (${catalogDate}): ${r.preferredChanges.length}`);
    for (const p of r.preferredChanges) {
      const missing = p.notInCatalog.length ? `; not in the catalog: ${p.notInCatalog.join(', ')}` : '';
      out.push(`  ${p.name}: ${p.recorded.join(', ') || '(none)'} -> ${p.now.join(', ') || '(none)'}${missing}; used: ${p.usedBy.join(', ') || 'no server'}`);
    }
    out.push(`Directory APIs the catalog does not have: ${s.uncoveredNew} new, ${s.uncoveredKnown} known`);
    for (const u of r.uncovered) {
      out.push(`  ${u.name} ${u.versions.join(', ')}${u.title ? ` "${u.title}"` : ''}${u.knownReason ? ` (known: ${u.knownReason})` : ' (new)'}`);
    }
  }
  const notChecked = r.apis.filter((a) => a.status !== 'checked');
  if (notChecked.length) {
    out.push('');
    out.push('Not checked:');
    const label = { 'needs-key': 'needs a key or a sign-in, not checked', gone: 'gone', failed: 'failed' };
    for (const a of notChecked) out.push(`  ${a.key}: ${label[a.status]} (${a.error})`);
  }
  out.push('');
  const verdict = {
    fresh: 'no differences (exit 0)',
    differences: 'differences found (exit 1). Refreshing the snapshots changes the tools; that is a separate decision.',
    incomplete: 'no differences in what was checked, but some documents could not be fetched (exit 2)',
  };
  out.push(`Result: ${verdict[r.result]}`);
  return `${out.join('\n')}\n`;
}

// An error that stops the check (an unreadable config/servers.json or data/catalog.json) exits 2, never 1.
await main().catch((err) => {
  console.error(`The check could not run: ${err?.message ?? err}`);
  process.exitCode = 2;
});
