// Search Console surfaces Google retired or deprecated (1.35.3):
// - the Mobile-Friendly Test tool and API: "Also starting December 1, 2023, we'll be retiring Search Console's "Mobile
//   Usability" report, the Mobile-Friendly Test tool and Mobile-Friendly Test API."
//   (https://developers.google.com/search/blog/2023/04/page-experience-in-search). Its generated tool is left out by the
//   include list of gsc's searchconsole entry in config/products.json (data, no code).
// - searchAnalytics.query's searchType: "Deprecated, use type instead"
//   (https://developers.google.com/webmaster-tools/v1/searchanalytics/query). sc_search_analytics_query sends type.
// - a sitemap's indexed count (WmxSitemapContent.indexed: "*Deprecated; do not use.*") and the URL inspection's
//   mobileUsabilityResult ("deprecated": true) are no longer advertised.
// The HTTP layer is stubbed (OAuth2Client.prototype.request); nothing leaves the machine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const { loadConfig } = await import(DIST('core/config.js'));
const { discoveryToolsFor, methodIncluded } = await import(DIST('core/discovery/tools.js'));

const RETIRED = 'searchconsole.urlTestingTools.mobileFriendlyTest.run';

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-gsc-retired-'));
after(() => rmSync(tokenDir, { recursive: true, force: true }));
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
const token = { access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' };
writeFileSync(join(tokenDir, 'searchconsole.token.json'), JSON.stringify(token));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });

let calls = [];
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  calls.push({ method: String(opts.method ?? 'GET').toUpperCase(), url: opts.url, body: opts.data });
  return { data: { rows: [] }, status: 200, headers: new Headers(), config: opts };
};
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

/** Every method of a snapshot as { id, resource, methodName }. */
function methodsOf(doc) {
  const out = [];
  const walk = (resources, chain) => {
    for (const [name, r] of Object.entries(resources ?? {})) {
      for (const [methodName, m] of Object.entries(r.methods ?? {})) out.push({ id: m.id, resource: [...chain, name], methodName });
      walk(r.resources, [...chain, name]);
    }
  };
  walk(doc.resources, []);
  return out;
}

test('the searchconsole include list of gsc leaves out exactly the retired Mobile-Friendly Test', () => {
  const entry = readJson('config', 'products.json').products.gsc.generated.find((e) => e.api === 'searchconsole');
  assert.ok(Array.isArray(entry.include), 'an include list');
  const left = methodsOf(readJson('data', 'discovery', 'searchconsole.v1.json')).filter((m) => !methodIncluded(m, entry.include));
  assert.deepEqual(left.map((m) => m.id), [RETIRED]);
  const note = readJson('config', 'products.json').notes.searchconsole;
  assert.match(note, /retired the Mobile-Friendly Test tool and API on December 1, 2023/);
});

test('no gsc tool calls the Mobile-Friendly Test: generated tools, the tool map, and api_methods', async () => {
  const tools = await discoveryToolsFor('gsc', cfg);
  assert.equal(tools.some((t) => t.methodId === RETIRED), false);
  assert.equal(tools.length, 19 + 1, '19 generated tools and api_methods');
  const rows = await tools.find((t) => t.name === 'api_methods').handler({});
  assert.equal(rows.some((r) => r.method === RETIRED), false);
  const map = readJson('plugins', 'gsc', 'tool-map.json');
  assert.equal(map.some((t) => t.methodId === RETIRED || /mobile_friendl/.test(t.name)), false);
});

test('sc_search_analytics_query sends type, never the deprecated searchType', async () => {
  const mod = await import(DIST('servers/searchconsole.js'));
  const tool = (await mod.buildTools(cfg)).find((t) => t.name === 'sc_search_analytics_query');
  const args = { site_url: 'sc-domain:example.com', start_date: '2026-10-01', end_date: '2026-10-28' };
  calls = [];
  await tool.handler(args, ctx);
  assert.equal(calls[0].body.type, 'web', 'web by default, as before');
  assert.equal('searchType' in calls[0].body, false);
  calls = [];
  await tool.handler({ ...args, type: 'discover' }, ctx);
  assert.equal(calls[0].body.type, 'discover');
  assert.equal('searchType' in calls[0].body, false);
  assert.deepEqual(Object.keys(calls[0].body), ['startDate', 'endDate', 'dimensions', 'type', 'rowLimit', 'startRow'], 'the body keeps its order');
});

test('descriptions and notes no longer advertise the deprecated sitemap indexed count or mobile usability', async () => {
  const mod = await import(DIST('servers/searchconsole.js'));
  const tools = new Map((await mod.buildTools(cfg)).map((t) => [t.name, t]));
  const sitemapGet = tools.get('sc_sitemap_get').description;
  assert.doesNotMatch(sitemapGet, /and indexed URL counts/);
  assert.match(sitemapGet, /Deprecated; do not use/);
  assert.match(sitemapGet, /sc_url_inspect/);
  for (const t of tools.values()) assert.doesNotMatch(t.description, /mobile usability|mobile-friendly/i, t.name);
  const notes = readJson('config', 'products.json').products.gsc.toolsets.google.notes;
  assert.doesNotMatch(notes.sc_sitemaps_list, /submitted and indexed counts/);
  assert.match(notes.sc_sitemaps_list, /deprecated the indexed count/);
  assert.doesNotMatch(notes.sc_url_inspect, /canonical, mobile usability/);
});
