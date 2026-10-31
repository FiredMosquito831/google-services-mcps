// Search Console changes of 1.41.0: sc_search_analytics_query takes typed filters, the data state, the aggregation type and
// the hour dimension (https://developers.google.com/webmaster-tools/v1/searchanalytics/query), and an earlier call sends
// the same body as before; sc_url_inspect compares hosts without case and names Google's limits; an error about a property
// the account cannot use says how to find the exact string; the generated twins name the curated tools. The HTTP layer is
// stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools, filterGroups, withPropertyHint, PROPERTY_HINT } = await import(DIST('servers/searchconsole.js'));
const { discoveryToolsFor } = await import(DIST('core/discovery/tools.js'));
const { describeError } = await import(DIST('core/tools.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-gsc-analytics-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'searchconsole.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({ rows: [] })) => {
  calls = [];
  respond = responder;
};
const SITE = 'sc-domain:example.com';

test('filterGroups: the old groups as given, the typed filters as one AND group after them, nothing when neither', () => {
  const old = [{ filters: [{ dimension: 'query', operator: 'contains', expression: 'buy' }] }];
  assert.equal(filterGroups(undefined, undefined), undefined);
  assert.equal(filterGroups(old, undefined), old, 'the same array, passed on as given');
  assert.equal(filterGroups(old, []), old);
  assert.deepEqual(filterGroups(undefined, [{ dimension: 'country', expression: 'FRA' }]), [{ groupType: 'and', filters: [{ dimension: 'country', expression: 'FRA' }] }]);
  assert.deepEqual(filterGroups(old, [{ dimension: 'page', operator: 'excludingRegex', expression: '\\?' }]), [
    ...old,
    { groupType: 'and', filters: [{ dimension: 'page', operator: 'excludingRegex', expression: '\\?' }] },
  ]);
});

test('analytics: an earlier call sends the same body as before, field for field and in order', async () => {
  reset();
  const groups = [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'mcp' }] }];
  await run('sc_search_analytics_query', { site_url: SITE, start_date: '2026-10-01', end_date: '2026-10-28', dimensions: ['query'], dimension_filter_groups: groups });
  assert.equal(
    JSON.stringify(calls[0].body),
    JSON.stringify({ startDate: '2026-10-01', endDate: '2026-10-28', dimensions: ['query'], type: 'web', rowLimit: 100, startRow: 0, dimensionFilterGroups: groups }),
  );
  reset();
  await run('sc_search_analytics_query', { site_url: SITE, start_date: '2026-10-01', end_date: '2026-10-28' });
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify({ startDate: '2026-10-01', endDate: '2026-10-28', dimensions: [], type: 'web', rowLimit: 100, startRow: 0 }));
});

test('analytics: hour, data_state, aggregation_type and typed filters reach Google as its reference names them', async () => {
  reset(() => ({ rows: [{ keys: ['2026-10-30T10:00:00-07:00'], clicks: 1, impressions: 2, ctr: 0.5, position: 3 }], metadata: { first_incomplete_hour: '2026-10-30T10:00:00-07:00' } }));
  const out = await run('sc_search_analytics_query', {
    site_url: SITE,
    start_date: '2026-10-29',
    end_date: '2026-10-30',
    dimensions: ['hour'],
    data_state: 'hourly_all',
    aggregation_type: 'auto',
    filters: [{ dimension: 'query', operator: 'contains', expression: 'buy' }, { dimension: 'device', expression: 'MOBILE' }],
  });
  const body = calls[0].body;
  assert.deepEqual(body.dimensions, ['hour']);
  assert.equal(body.dataState, 'hourly_all');
  assert.equal(body.aggregationType, 'auto');
  assert.deepEqual(body.dimensionFilterGroups, [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'buy' }, { dimension: 'device', expression: 'MOBILE' }] }]);
  assert.deepEqual(Object.keys(body), ['startDate', 'endDate', 'dimensions', 'type', 'rowLimit', 'startRow', 'dimensionFilterGroups', 'dataState', 'aggregationType']);
  assert.deepEqual(out.metadata, { first_incomplete_hour: '2026-10-30T10:00:00-07:00' }, "Google's metadata comes through");
  // The schema refuses what Google's reference does not list.
  const schema = tools.get('sc_search_analytics_query').inputSchema;
  assert.equal(schema.data_state.safeParse('fresh').success, false);
  assert.equal(schema.aggregation_type.safeParse('byQuery').success, false);
  assert.equal(schema.filters.safeParse([{ dimension: 'date', expression: 'x' }]).success, false, 'date cannot be filtered');
  assert.equal(schema.filters.safeParse([{ dimension: 'query', operator: 'like', expression: 'x' }]).success, false);
  assert.equal(schema.filters.safeParse([{ dimension: 'query', expression: '' }]).success, false);
  assert.equal(schema.dimensions.safeParse(['hour', 'query']).success, true);
});

test('url_inspect: hosts compare without case under a URL prefix; another host or scheme is refused before any request', async () => {
  reset(() => ({ inspectionResult: {} }));
  await run('sc_url_inspect', { site_url: 'https://example.com/', inspection_url: 'https://Example.com/blog/post' });
  assert.equal(calls[0].body.inspectionUrl, 'https://Example.com/blog/post', 'the page is sent as given');
  reset(() => ({ inspectionResult: {} }));
  await run('sc_url_inspect', { site_url: 'https://example.com/blog/', inspection_url: 'https://EXAMPLE.COM/blog/a?x=1' });
  assert.equal(calls.length, 1);
  reset();
  for (const page of ['http://example.com/x', 'https://example.co/x', 'https://example.com.evil/x', 'https://example.com/shop/x']) {
    await assert.rejects(run('sc_url_inspect', { site_url: 'https://example.com/blog/', inspection_url: page }), /is not part of property/, page);
  }
  await assert.rejects(run('sc_url_inspect', { site_url: 'https://example.co', inspection_url: 'https://example.com/x' }), /is not part of property/, 'a prefix of the host is not the host');
  assert.equal(calls.length, 0);
  assert.match(tools.get('sc_url_inspect').description, /cannot test the indexability of a live URL/);
  assert.match(tools.get('sc_url_inspect').description, /2,000 inspections a day and 600 a minute per property/);
});

test("a property the account cannot use: Google's 403 gets the hint, other errors are left as they are", async () => {
  const denied = Object.assign(new Error("User does not have sufficient permission for site 'https://example.com'. See also: https://support.google.com/webmasters/answer/2451999."), { code: 403 });
  reset(() => {
    throw denied;
  });
  await assert.rejects(run('sc_site_get', { site_url: 'https://example.com' }), (err) => err.message.endsWith(PROPERTY_HINT));
  assert.match(describeError(denied, 'searchconsole'), /HTTP 403 .*sufficient permission for site.*Check the exact property string with sc_sites_list/);
  // Once only, and never for a scope error or another status.
  assert.equal(withPropertyHint(denied).message.split(PROPERTY_HINT).length, 2);
  const scope = Object.assign(new Error('Request had insufficient authentication scopes.'), { code: 403 });
  assert.equal(withPropertyHint(scope).message, 'Request had insufficient authentication scopes.');
  const missing = Object.assign(new Error('Sitemap not found.'), { code: 404 });
  assert.equal(withPropertyHint(missing).message, 'Sitemap not found.');
  assert.equal(withPropertyHint(undefined), undefined);
});

test('the generated Search Console twins name the curated tool that runs the same method', async () => {
  const notes = readJson('config', 'products.json').products.gsc.methodNotes.searchconsole.methods;
  const generated = await discoveryToolsFor('gsc', cfg);
  assert.equal(Object.keys(notes).length, 10);
  for (const [id, note] of Object.entries(notes)) {
    const name = /^sc_[a-z_]+/.exec(note)?.[0];
    assert.ok(tools.has(name), `${id}: ${name} is a curated gsc tool`);
    const tool = generated.find((t) => t.methodId === id);
    assert.ok(tool, `${id} is a generated tool`);
    assert.ok(tool.description.includes(` Note: ${note} Method ${id}: `), tool.description);
  }
  assert.deepEqual(readJson('plugins', 'gsc', 'servers.json').servers[0].methodNotes, readJson('config', 'products.json').products.gsc.methodNotes);
});
