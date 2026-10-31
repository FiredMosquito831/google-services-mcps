// The Google Ads parity tools (1.16.0): the structured form of ads_search (fields, resource, conditions, orderings and
// limit, from which the GAQL SELECT is written) and ads_resource_metadata (the fields of a resource, from
// googleAdsFields:search). Both match tools of Google's Google Ads MCP server. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GSM_ADS_DEVELOPER_TOKEN;
delete process.env.GSM_ADS_LOGIN_CUSTOMER_ID;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const ads = await import(DIST('servers/gads.js'));
const { buildGaql, searchQueryOf, assertCondition, resourceMetadataQueries } = ads;

const BASE = 'https://googleads.googleapis.com/v26';
const ADWORDS = 'https://www.googleapis.com/auth/adwords';
const CUSTOMER = '1234567890';

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-ads-parity-'));
after(() => rmSync(tokenDir, { recursive: true, force: true }));
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'business.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer', scope: ADWORDS }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await ads.buildTools(cfg)).map((t) => [t.name, t]));
const run = (name, args) => tools.get(name).handler(args, { gate: async () => assert.fail('a read never asks'), grantedScopes: null, hasScope: () => true });

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  calls.push({ method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, body: opts.data });
  return { data: await respond(opts, calls.length), status: 200, headers: new Headers(), config: opts };
};
const reset = (fn = () => ({})) => {
  calls = [];
  respond = fn;
};

// ---- the tools ----

test('ads_resource_metadata and ads_search are reads with the adwords scope, and name the Google tool they match', () => {
  for (const [name, official] of [
    ['ads_search', 'search'],
    ['ads_resource_metadata', 'get_resource_metadata'],
  ]) {
    const t = tools.get(name);
    assert.equal(t.kind, 'read', name);
    assert.deepEqual(t.scopes, [ADWORDS], name);
    assert.equal(t.inputSchema.confirm, undefined, `${name}: no model-controlled confirm`);
    assert.ok(t.description.includes(`matches ${official} in Google's Google Ads MCP server`), name);
  }
  // ads_list_customers and ads_mutate are unchanged: no new input, the same kinds.
  assert.deepEqual(Object.keys(tools.get('ads_list_customers').inputSchema), []);
  assert.deepEqual(Object.keys(tools.get('ads_mutate').inputSchema), ['customer_id', 'operations', 'validate_only']);
  assert.equal(tools.get('ads_mutate').kind, 'dynamic');
  assert.deepEqual(Object.keys(tools.get('ads_search').inputSchema), ['customer_id', 'query', 'fields', 'resource', 'conditions', 'orderings', 'limit', 'page_token']);
});

// ---- GAQL from parts ----

test('buildGaql writes the SELECT Google builds: fields, FROM, WHERE with AND, ORDER BY, LIMIT and PARAMETERS', () => {
  assert.equal(
    buildGaql({
      fields: ['campaign.id', 'campaign.name', 'metrics.clicks', 'campaign.id'],
      resource: 'campaign',
      conditions: ["campaign.status = 'ENABLED'", ' segments.date DURING LAST_30_DAYS '],
      orderings: ['metrics.clicks desc', 'campaign.name'],
      limit: 10,
    }),
    "SELECT campaign.id, campaign.name, metrics.clicks FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS ORDER BY metrics.clicks DESC, campaign.name LIMIT 10 PARAMETERS omit_unselected_resource_names=true",
  );
  assert.equal(buildGaql({ fields: ['ad_group_criterion.keyword.text'], resource: 'keyword_view' }), 'SELECT ad_group_criterion.keyword.text FROM keyword_view PARAMETERS omit_unselected_resource_names=true');
});

test('buildGaql refuses names that are not plain GAQL names, so nothing can be added to the query through them', () => {
  const bad = [
    [{ fields: ['campaign.id FROM ad_group'], resource: 'campaign' }, /not a GAQL field name/],
    [{ fields: ['campaign.id,metrics.clicks'], resource: 'campaign' }, /not a GAQL field name/],
    [{ fields: ['id'], resource: 'campaign' }, /not a GAQL field name/],
    [{ fields: ['Campaign.Id'], resource: 'campaign' }, /not a GAQL field name/],
    [{ fields: [], resource: 'campaign' }, /at least one field/],
    [{ fields: ['campaign.id'], resource: 'campaign WHERE campaign.id > 0' }, /not a Google Ads resource name/],
    [{ fields: ['campaign.id'], resource: 'campaign;' }, /not a Google Ads resource name/],
    [{ fields: ['campaign.id'], resource: 'campaign', orderings: ['metrics.clicks DESC LIMIT 1'] }, /not an ordering/],
    [{ fields: ['campaign.id'], resource: 'campaign', orderings: ['metrics.clicks, campaign.id'] }, /not an ordering/],
    [{ fields: ['campaign.id'], resource: 'campaign', limit: 0 }, /limit must be/],
    [{ fields: ['campaign.id'], resource: 'campaign', limit: 2.5 }, /limit must be/],
  ];
  for (const [parts, message] of bad) assert.throws(() => buildGaql(parts), message, JSON.stringify(parts));
});

test('a condition stays one condition: no clause words, semicolons or open quotes outside quoted values', () => {
  const refused = [
    ['campaign.id > 0 LIMIT 5', /LIMIT outside a quoted value/],
    ['campaign.id > 0 ORDER BY campaign.id', /ORDER outside a quoted value/],
    ['campaign.id > 0 PARAMETERS include_drafts=true', /PARAMETERS outside a quoted value/],
    ['campaign.id IN (SELECT x FROM y)', /SELECT outside a quoted value/],
    ['campaign.id > 0; DELETE', /semicolon/],
    ["campaign.name = 'open", /quote that is not closed/],
    ['campaign.name = "open', /quote that is not closed/],
    ['   ', /empty/],
    ["''", /empty/],
  ];
  for (const [condition, message] of refused) assert.throws(() => assertCondition(condition), message, condition);
  // Quoted values may hold any text, escaped quotes included; parts of dotted field names are not clause words.
  for (const condition of [
    "campaign.name = 'Limit from where; order by'",
    'campaign.name = "say \\"select\\" now"',
    "campaign.name = 'it\\'s LIMIT'",
    "ad_group_criterion.keyword.text LIKE '%order%'",
    'segments.date DURING LAST_7_DAYS',
    'metrics.impressions > 0 AND metrics.clicks >= 1',
    "ad_group.labels CONTAINS ANY ('customers/1/labels/2')",
    'x.order = 1',
    'x.limit_y = 2',
  ]) {
    assert.doesNotThrow(() => assertCondition(condition), condition);
  }
});

test('searchQueryOf: a query as text, or fields and resource; never both, never neither, never parts alone', () => {
  assert.equal(searchQueryOf({ query: 'SELECT campaign.id FROM campaign' }), 'SELECT campaign.id FROM campaign');
  assert.match(searchQueryOf({ fields: ['campaign.id'], resource: 'campaign' }), /^SELECT campaign\.id FROM campaign PARAMETERS/);
  assert.throws(() => searchQueryOf({ query: 'SELECT campaign.id FROM campaign', fields: ['campaign.id'] }), /not both/);
  assert.throws(() => searchQueryOf({ query: 'SELECT campaign.id FROM campaign', limit: 5 }), /not both/);
  assert.throws(() => searchQueryOf({}), /Give query/);
  assert.throws(() => searchQueryOf({ fields: ['campaign.id'] }), /Give query/);
  assert.throws(() => searchQueryOf({ resource: 'campaign', conditions: ['campaign.id > 0'] }), /Give query/);
});

test('ads_search in the structured form posts only the written query (never pageSize) and returns it with the rows', async () => {
  reset(() => ({ results: [{ campaign: { id: '1', name: 'A' } }] }));
  const out = await run('ads_search', { customer_id: CUSTOMER, fields: ['campaign.id', 'campaign.name'], resource: 'campaign', conditions: ["campaign.status = 'ENABLED'"], orderings: ['campaign.id'], limit: 5 });
  const query = "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status = 'ENABLED' ORDER BY campaign.id LIMIT 5 PARAMETERS omit_unselected_resource_names=true";
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/customers/${CUSTOMER}/googleAds:search`);
  assert.deepEqual(calls[0].body, { query });
  assert.equal(Object.hasOwn(calls[0].body, 'pageSize'), false);
  assert.deepEqual(out, { query, rowCount: 1, results: [{ campaign: { id: '1', name: 'A' } }] });
});

test('ads_search refuses a bad structured call, or both forms at once, before any request is sent', async () => {
  reset();
  const bad = [
    { customer_id: CUSTOMER, fields: ['campaign.id'], resource: 'campaign', conditions: ['campaign.id > 0 LIMIT 1'] },
    { customer_id: CUSTOMER, fields: ['campaign.id FROM ad_group'], resource: 'campaign' },
    { customer_id: CUSTOMER, fields: ['campaign.id'], resource: "campaign' OR '1" },
    { customer_id: CUSTOMER, query: 'SELECT campaign.id FROM campaign', resource: 'campaign', fields: ['campaign.id'] },
    { customer_id: CUSTOMER, fields: ['campaign.id'] },
    { customer_id: CUSTOMER },
    { customer_id: CUSTOMER, fields: Array.from({ length: 400 }, (_, i) => `campaign.field_number_${i}`), resource: 'campaign' },
  ];
  for (const args of bad) await assert.rejects(run('ads_search', args), undefined, JSON.stringify(args).slice(0, 120));
  assert.equal(calls.length, 0, 'no request was sent');
});

// ---- ads_resource_metadata ----

test('resourceMetadataQueries: the two field queries of get_resource_metadata, with a checked resource name', () => {
  assert.deepEqual(resourceMetadataQueries('ad_group'), [
    "SELECT name, category, selectable, filterable, sortable WHERE name LIKE 'ad_group.%' AND category = 'ATTRIBUTE'",
    "SELECT name, category, selectable, filterable, sortable WHERE selectable_with CONTAINS ANY('ad_group')",
  ]);
  for (const resource of ["campaign' OR name LIKE '%", 'campaign.id', 'Campaign', '', 'campaign)']) {
    assert.throws(() => resourceMetadataQueries(resource), /not a Google Ads resource name/, resource);
  }
});

test('ads_resource_metadata runs both queries on googleAdsFields:search, follows pages, and merges the names', async () => {
  const pages = {
    attributes: [{ name: 'campaign.id', category: 'ATTRIBUTE', selectable: true, filterable: true, sortable: true }, { name: 'campaign.labels', category: 'ATTRIBUTE', selectable: true, filterable: true, sortable: false }],
    first: [{ name: 'metrics.clicks', category: 'METRIC', selectable: true, filterable: true, sortable: true }, { name: 'campaign.id', category: 'ATTRIBUTE', selectable: true, filterable: true, sortable: true }],
    second: [{ name: 'segments.date', category: 'SEGMENT', selectable: true, filterable: true, sortable: true }, { name: 'customer.id', category: 'ATTRIBUTE', selectable: true, filterable: false, sortable: false }],
  };
  reset((opts) => {
    if (opts.data.query.includes("LIKE 'campaign.%'")) return { results: pages.attributes };
    return opts.data.pageToken === 'p2' ? { results: pages.second } : { results: pages.first, nextPageToken: 'p2' };
  });
  const out = await run('ads_resource_metadata', { resource: 'campaign' });
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body.pageToken ?? null]),
    [
      ['POST', `${BASE}/googleAdsFields:search`, null],
      ['POST', `${BASE}/googleAdsFields:search`, null],
      ['POST', `${BASE}/googleAdsFields:search`, 'p2'],
    ],
  );
  assert.deepEqual(calls[0].body, { query: resourceMetadataQueries('campaign')[0] });
  for (const c of calls) assert.equal(Object.hasOwn(c.body, 'pageSize'), false);
  assert.deepEqual(out, {
    resource: 'campaign',
    selectable: ['campaign.id', 'campaign.labels', 'metrics.clicks', 'segments.date', 'customer.id'],
    filterable: ['campaign.id', 'campaign.labels', 'metrics.clicks', 'segments.date'],
    sortable: ['campaign.id', 'metrics.clicks', 'segments.date'],
  });
});

test('ads_resource_metadata says so when Google knows no fields, and refuses a bad name before any request', async () => {
  reset(() => ({ results: [] }));
  const out = await run('ads_resource_metadata', { resource: 'no_such_resource' });
  assert.deepEqual(out.selectable, []);
  assert.match(out.note, /returned no fields for "no_such_resource"/);
  reset();
  await assert.rejects(run('ads_resource_metadata', { resource: "campaign' OR '1'='1" }), /not a Google Ads resource name/);
  assert.equal(calls.length, 0);
});

// ---- the google toolset ----

test("the gads google list covers the 3 tools of Google's Google Ads MCP server, all reads; ads_mutate stays out", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gads.toolsets.google;
  assert.deepEqual(google.tools, ['ads_list_customers', 'ads_search', 'ads_resource_metadata']);
  assert.deepEqual(google.matches, { ads_list_customers: ['list_accessible_customers'], ads_search: ['search'], ads_resource_metadata: ['get_resource_metadata'] });
  assert.equal(google.tools.includes('ads_mutate'), false);
  assert.match(google.notes.ads_search, /Google's server is read-only, so ads_mutate/);
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'gads', 'tool-map.json'), 'utf8'));
  for (const name of google.tools) assert.equal(map.find((t) => t.name === `mcp__plugin_gads_gads__${name}`)?.kind, 'read', name);
});
