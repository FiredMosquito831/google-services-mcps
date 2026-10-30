// The Google Analytics parity tools (1.17.0): ga_run_report (and the conversions report), ga_run_realtime_report,
// ga_run_funnel_report, ga_annotations_list and ga_annotation_create. They match tools of Google's Google Analytics
// MCP server. The HTTP layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a
// temp folder only. The write's gate runs in tests/analytics-gate.test.mjs, through a real server child.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const ga = await import(DIST('servers/ganalytics.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-analytics-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'business.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await ga.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);
const parse = (name, args) => z.object(tools.get(name).inputSchema).safeParse(args);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query: Object.fromEntries(url.searchParams), body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;

const REPORT = {
  dimensionHeaders: [{ name: 'country' }, { name: 'date' }],
  metricHeaders: [
    { name: 'activeUsers', type: 'TYPE_INTEGER' },
    { name: 'engagementRate', type: 'TYPE_FLOAT' },
  ],
  rows: [
    { dimensionValues: [{ value: 'France' }, { value: '20261029' }], metricValues: [{ value: '9007199254740993' }, { value: '0.5' }] },
    { dimensionValues: [{ value: 'Spain' }, { value: '20261029' }], metricValues: [{ value: '7' }, { value: '0.25' }] },
  ],
  rowCount: 5,
  metadata: { currencyCode: 'EUR', timeZone: 'Europe/Paris' },
  kind: 'analyticsData#runReport',
};

test('five tools: four reads and one write; scopes as Discovery lists them; each names the Google tool it matches', () => {
  assert.deepEqual(
    [...tools.values()].map((t) => [t.name, t.kind]),
    [
      ['ga_run_report', 'read'],
      ['ga_run_realtime_report', 'read'],
      ['ga_run_funnel_report', 'read'],
      ['ga_annotations_list', 'read'],
      ['ga_annotation_create', 'write'],
    ],
  );
  for (const name of ['ga_run_report', 'ga_run_realtime_report', 'ga_run_funnel_report']) assert.deepEqual(tools.get(name).scopes, [G('analytics'), G('analytics.readonly')], name);
  assert.deepEqual(tools.get('ga_annotations_list').scopes, [G('analytics.edit'), G('analytics.readonly')]);
  assert.deepEqual(tools.get('ga_annotation_create').scopes, [G('analytics.edit')]);
  const official = { ga_run_report: 'run_report', ga_run_realtime_report: 'run_realtime_report', ga_run_funnel_report: 'run_funnel_report', ga_annotations_list: 'list_property_annotations', ga_annotation_create: 'create_property_annotation' };
  for (const [name, google] of Object.entries(official)) {
    const t = tools.get(name);
    assert.ok(t.description.includes(`matches ${google} in Google's Google Analytics MCP server`), name);
    assert.equal(t.inputSchema.confirm, undefined, `${name}: no model-controlled confirm`);
    assert.ok(name.length <= 49 - 'ganalytics'.length * 2, `${name} fits the name budget`);
  }
  assert.match(tools.get('ga_run_report').description, /run_conversions_report with conversion_spec/);
});

test('propertyName and calendarDate: digits or properties/<digits>; real dates only', () => {
  assert.equal(ga.propertyName('123'), 'properties/123');
  assert.equal(ga.propertyName(456), 'properties/456');
  assert.equal(ga.propertyName(' properties/789 '), 'properties/789');
  for (const bad of ['abc', 'properties/x', '12/34', '', 'accounts/1']) assert.throws(() => ga.propertyName(bad), /not a Google Analytics property id/, bad);
  assert.deepEqual(ga.calendarDate('2026-02-28', 'd'), { year: 2026, month: 2, day: 28 });
  for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', 'today', '2026-1-1']) assert.throws(() => ga.calendarDate(bad, 'start_date'), /not a date in the form YYYY-MM-DD/, bad);
});

test('ga_run_report posts runReport v1beta with the API field names and returns rows keyed by name, values unchanged', async () => {
  reset(() => REPORT);
  const out = await run('ga_run_report', {
    property_id: '123',
    date_ranges: [{ start_date: '30daysAgo', end_date: 'yesterday', name: 'last30' }],
    dimensions: ['country', 'date'],
    metrics: ['activeUsers', 'engagementRate'],
    dimension_filter: { filter: { fieldName: 'country', stringFilter: { value: 'France' } } },
    order_bys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 2,
    offset: 0,
    currency_code: 'EUR',
    return_property_quota: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport');
  assert.deepEqual(calls[0].body, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday', name: 'last30' }],
    dimensions: [{ name: 'country' }, { name: 'date' }],
    metrics: [{ name: 'activeUsers' }, { name: 'engagementRate' }],
    dimensionFilter: { filter: { fieldName: 'country', stringFilter: { value: 'France' } } },
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: '2',
    offset: '0',
    currencyCode: 'EUR',
    returnPropertyQuota: true,
  });
  assert.deepEqual(out, {
    dimension_headers: ['country', 'date'],
    metric_headers: [
      { name: 'activeUsers', type: 'TYPE_INTEGER' },
      { name: 'engagementRate', type: 'TYPE_FLOAT' },
    ],
    rows: [
      { country: 'France', date: '20261029', activeUsers: '9007199254740993', engagementRate: '0.5' },
      { country: 'Spain', date: '20261029', activeUsers: '7', engagementRate: '0.25' },
    ],
    metadata: { currencyCode: 'EUR', timeZone: 'Europe/Paris' },
    row_count: 5,
    next_offset: 2,
  });
});

test('ga_run_report: next_offset counts from the offset given; none on the last page; quota passed back when Google sends it', async () => {
  reset(() => ({ ...REPORT, propertyQuota: { tokensPerDay: { consumed: 3, remaining: 199997 } } }));
  const middle = await run('ga_run_report', { property_id: 1, date_ranges: [{ start_date: 'today', end_date: 'today' }], metrics: ['activeUsers'], offset: 2 });
  assert.equal(middle.next_offset, 4);
  assert.deepEqual(middle.property_quota, { tokensPerDay: { consumed: 3, remaining: 199997 } });
  assert.equal('dimensions' in calls[0].body, false, 'no dimensions given, none sent');
  reset(() => REPORT);
  const last = await run('ga_run_report', { property_id: 1, date_ranges: [{ start_date: 'today', end_date: 'today' }], metrics: ['activeUsers'], offset: 3 });
  assert.equal('next_offset' in last, false);
  reset(() => ({ rowCount: 0 }));
  const empty = await run('ga_run_report', { property_id: 1, date_ranges: [{ start_date: 'today', end_date: 'today' }], metrics: ['activeUsers'] });
  assert.deepEqual(empty, { dimension_headers: [], metric_headers: [], rows: [], row_count: 0 });
});

test('ga_run_report with conversion_spec runs the conversions report on Data API v1alpha', async () => {
  reset(() => REPORT);
  await run('ga_run_report', {
    property_id: '123',
    date_ranges: [{ start_date: '2026-10-01', end_date: '2026-10-28' }],
    dimensions: ['date'],
    metrics: ['conversions'],
    conversion_spec: { conversion_actions: ['conversionActions/1'], attribution_model: 'LAST_CLICK' },
  });
  assert.equal(calls[0].url, 'https://analyticsdata.googleapis.com/v1alpha/properties/123:runReport');
  assert.deepEqual(calls[0].body.conversionSpec, { conversionActions: ['conversionActions/1'], attributionModel: 'LAST_CLICK' });
});

test('ga_run_report refuses bad input before any request: dates, metrics, property, currency', async () => {
  const base = { property_id: '123', date_ranges: [{ start_date: 'today', end_date: 'today' }], metrics: ['activeUsers'] };
  for (const bad of [
    { ...base, date_ranges: [] },
    { ...base, date_ranges: [{ start_date: 'last week', end_date: 'today' }] },
    { ...base, metrics: [] },
    { ...base, currency_code: 'euro' },
    { ...base, limit: 0 },
    { ...base, offset: -1 },
  ]) {
    assert.equal(parse('ga_run_report', bad).success, false, JSON.stringify(bad));
  }
  reset();
  await assert.rejects(run('ga_run_report', { ...base, property_id: 'UA-1234-1' }), /not a Google Analytics property id/);
  assert.equal(calls.length, 0);
});

test('ga_run_realtime_report posts runRealtimeReport with no date ranges or offset, rows keyed by name', async () => {
  reset(() => ({ dimensionHeaders: [{ name: 'country' }], metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }], rows: [{ dimensionValues: [{ value: 'France' }], metricValues: [{ value: '4' }] }], rowCount: 1 }));
  const out = await run('ga_run_realtime_report', { property_id: '123', dimensions: ['country'], metrics: ['activeUsers'], limit: 10, return_property_quota: true });
  assert.equal(calls[0].url, 'https://analyticsdata.googleapis.com/v1beta/properties/123:runRealtimeReport');
  assert.deepEqual(calls[0].body, { dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], limit: '10', returnPropertyQuota: true });
  assert.deepEqual(out.rows, [{ country: 'France', activeUsers: '4' }]);
  assert.equal('offset' in tools.get('ga_run_realtime_report').inputSchema, false);
  assert.equal('date_ranges' in tools.get('ga_run_realtime_report').inputSchema, false);
});

test('ga_run_funnel_report: event names become funnelEventFilter steps; breakdown, next action and type map to the API', async () => {
  const sub = (step) => ({ dimensionHeaders: [{ name: 'funnelStepName' }], metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }], rows: [{ dimensionValues: [{ value: step }], metricValues: [{ value: '10' }] }] });
  reset(() => ({ funnelTable: sub('1. View'), funnelVisualization: sub('1. View'), propertyQuota: { tokensPerHour: { consumed: 1 } }, kind: 'analyticsData#runFunnelReport' }));
  const custom = { funnelFieldFilter: { fieldName: 'pagePath', stringFilter: { value: '/checkout', matchType: 'BEGINS_WITH' } } };
  const out = await run('ga_run_funnel_report', {
    property_id: '123',
    steps: [
      { name: 'View', event_name: 'page_view' },
      { name: 'Checkout', filter_expression: custom, is_directly_followed_by: false, within_duration_from_prior_step: '600s' },
      { name: 'Buy', event_name: 'purchase' },
    ],
    date_ranges: [{ start_date: '28daysAgo', end_date: 'yesterday' }],
    open_funnel: true,
    breakdown_dimension: 'deviceCategory',
    breakdown_limit: 3,
    next_action_dimension: 'eventName',
    next_action_limit: 2,
    trended: true,
    limit: 100,
    return_property_quota: true,
  });
  assert.equal(calls[0].url, 'https://analyticsdata.googleapis.com/v1alpha/properties/123:runFunnelReport');
  assert.deepEqual(calls[0].body, {
    funnel: {
      steps: [
        { name: 'View', filterExpression: { funnelEventFilter: { eventName: 'page_view' } } },
        { name: 'Checkout', filterExpression: custom, isDirectlyFollowedBy: false, withinDurationFromPriorStep: '600s' },
        { name: 'Buy', filterExpression: { funnelEventFilter: { eventName: 'purchase' } } },
      ],
      isOpenFunnel: true,
    },
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    funnelBreakdown: { breakdownDimension: { name: 'deviceCategory' }, limit: '3' },
    funnelNextAction: { nextActionDimension: { name: 'eventName' }, limit: '2' },
    funnelVisualizationType: 'TRENDED_FUNNEL',
    limit: '100',
    returnPropertyQuota: true,
  });
  assert.deepEqual(out.funnel_table.rows, [{ funnelStepName: '1. View', activeUsers: '10' }]);
  assert.deepEqual(out.funnel_visualization.metric_headers, [{ name: 'activeUsers', type: 'TYPE_INTEGER' }]);
  assert.deepEqual(out.property_quota, { tokensPerHour: { consumed: 1 } });
});

test('ga_run_funnel_report: each step needs exactly one of event_name and filter_expression, checked before any request', async () => {
  reset();
  await assert.rejects(run('ga_run_funnel_report', { property_id: '1', steps: [{ name: 'x' }] }), /Step 1 needs exactly one of event_name and filter_expression/);
  await assert.rejects(
    run('ga_run_funnel_report', { property_id: '1', steps: [{ event_name: 'a' }, { event_name: 'b', filter_expression: { funnelEventFilter: { eventName: 'b' } } }] }),
    /Step 2 needs exactly one/,
  );
  assert.equal(parse('ga_run_funnel_report', { property_id: '1', steps: [] }).success, false);
  assert.equal(parse('ga_run_funnel_report', { property_id: '1', steps: [{ event_name: 'a', within_duration_from_prior_step: '5 minutes' }] }).success, false);
  assert.equal(calls.length, 0);
});

test('ga_annotations_list: the v1alpha list with filter and paging; short entries with ISO dates', async () => {
  reset(() => ({
    reportingDataAnnotations: [
      { name: 'properties/123/reportingDataAnnotations/1', title: 'Launch', color: 'BLUE', annotationDate: { year: 2026, month: 10, day: 1 } },
      { name: 'properties/123/reportingDataAnnotations/2', title: 'Sale', description: 'Autumn', color: 'GREEN', annotationDateRange: { startDate: { year: 2026, month: 10, day: 5 }, endDate: { year: 2026, month: 10, day: 9 } } },
      { name: 'properties/123/reportingDataAnnotations/3', title: 'Data gap', color: 'ORANGE', annotationDate: { year: 2026, month: 9, day: 3 }, systemGenerated: true },
    ],
    nextPageToken: 'n2',
  }));
  const out = await run('ga_annotations_list', { property_id: '123', filter: 'title:Sale', page_size: 20, page_token: 'p1' });
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://analyticsadmin.googleapis.com/v1alpha/properties/123/reportingDataAnnotations');
  assert.deepEqual(calls[0].query, { filter: 'title:Sale', pageSize: '20', pageToken: 'p1' });
  assert.deepEqual(out, {
    annotations: [
      { name: 'properties/123/reportingDataAnnotations/1', title: 'Launch', date: '2026-10-01', color: 'BLUE' },
      { name: 'properties/123/reportingDataAnnotations/2', title: 'Sale', description: 'Autumn', start_date: '2026-10-05', end_date: '2026-10-09', color: 'GREEN' },
      { name: 'properties/123/reportingDataAnnotations/3', title: 'Data gap', date: '2026-09-03', color: 'ORANGE', system_generated: true },
    ],
    next_page_token: 'n2',
  });
  assert.equal(parse('ga_annotations_list', { property_id: '1', page_size: 201 }).success, false);
});

test('annotationRequest: one date or a range, the default color, and dates checked before anything is sent', () => {
  assert.deepEqual(ga.annotationRequest({ property_id: 123, title: ' Launch ', start_date: '2026-10-01' }), {
    parent: 'properties/123',
    annotation: { title: 'Launch', color: 'PURPLE', annotationDate: { year: 2026, month: 10, day: 1 } },
  });
  assert.deepEqual(ga.annotationRequest({ property_id: '123', title: 'Sale', start_date: '2026-10-05', end_date: '2026-10-09', description: 'Autumn', color: 'GREEN' }).annotation, {
    title: 'Sale',
    description: 'Autumn',
    color: 'GREEN',
    annotationDateRange: { startDate: { year: 2026, month: 10, day: 5 }, endDate: { year: 2026, month: 10, day: 9 } },
  });
  // The same start and end date is one day.
  assert.deepEqual(ga.annotationRequest({ property_id: '1', title: 'x', start_date: '2026-10-05', end_date: '2026-10-05' }).annotation.annotationDate, { year: 2026, month: 10, day: 5 });
  assert.throws(() => ga.annotationRequest({ property_id: '1', title: 'x', start_date: '2026-10-09', end_date: '2026-10-05' }), /is before start_date/);
  assert.throws(() => ga.annotationRequest({ property_id: '1', title: 'x', start_date: 'today' }), /not a date/);
  assert.equal(parse('ga_annotation_create', { property_id: '1', title: 'x', start_date: '2026-10-01', color: 'ORANGE' }).success, false, 'ORANGE is for Google only');
});

test('ga_annotation_create: prepare builds the exact annotation and sends nothing; the handler posts what was prepared', async () => {
  reset(() => ({ name: 'properties/123/reportingDataAnnotations/9', title: 'Launch', color: 'RED', annotationDate: { year: 2026, month: 10, day: 1 } }));
  const tool = tools.get('ga_annotation_create');
  const prepared = await tool.prepare({ property_id: '123', title: 'Launch', start_date: '2026-10-01', color: 'RED' }, ctx);
  assert.equal(calls.length, 0, 'prepare sends nothing');
  assert.deepEqual(prepared.preview, { property: 'properties/123', annotation: { title: 'Launch', color: 'RED', annotationDate: { year: 2026, month: 10, day: 1 } } });
  const out = await tool.handler({ property_id: '123', title: 'Launch', start_date: '2026-10-01', color: 'RED' }, ctx, prepared);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://analyticsadmin.googleapis.com/v1alpha/properties/123/reportingDataAnnotations');
  assert.deepEqual(calls[0].body, prepared.preview.annotation);
  assert.deepEqual(out, { created: { name: 'properties/123/reportingDataAnnotations/9', title: 'Launch', date: '2026-10-01', color: 'RED' } });
  await assert.rejects(tool.prepare({ property_id: '123', title: 'x', start_date: '2026-02-30' }, ctx), /not a date/);
  assert.equal(calls.length, 1);
});

test("the ganalytics google list covers the 10 tools of Google's Google Analytics MCP server", () => {
  const google = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.ganalytics.toolsets.google;
  const official = new Set(Object.values(google.matches).flat());
  for (const name of [
    'get_account_summaries',
    'list_google_ads_links',
    'get_property_details',
    'list_property_annotations',
    'get_custom_dimensions_and_metrics',
    'run_report',
    'run_realtime_report',
    'run_funnel_report',
    'run_conversions_report',
    'create_property_annotation',
  ]) {
    assert.ok(official.has(name), `no tool of ours matches ${name}`);
  }
  assert.equal(official.size, 10);
  assert.deepEqual(google.matches.ga_run_report, ['run_report', 'run_conversions_report']);
  assert.equal(google.tools.includes('api_call'), false, 'no gateway method counts toward its scopes');
  const map = JSON.parse(readFileSync(join(REPO, 'plugins', 'ganalytics', 'tool-map.json'), 'utf8'));
  const kind = (name) => map.find((t) => t.name === `mcp__plugin_ganalytics_ganalytics__${name}`)?.kind;
  for (const name of google.tools) assert.equal(kind(name), name === 'ga_annotation_create' ? 'write' : 'read', name);
});
