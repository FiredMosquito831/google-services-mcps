// The gcloud parity tools (1.10.0): logging_entries_list, monitoring_query_promql, monitoring_dashboards_list,
// monitoring_dashboard_get, iam_roles_list, iam_role_get, billing_price_lookup, gcs_read_text, gcs_read_object and
// gcs_write_text, and their helpers. The HTTP layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the
// machine. Fake tokens in a temp folder only.
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
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools } = await import(DIST('servers/cloud.js'));
const ops = await import(DIST('servers/cloud-ops.js'));
const gcs = await import(DIST('servers/cloud-storage.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-cloud-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'cloud.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
// A server with a small result limit, for the read caps.
const small = new Map((await buildTools({ ...cfg, maxResultChars: 1400 })).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args, set = tools) => set.get(name).handler(args, ctx);

/** The whole body of a request: an object, a string, or a stream read to the end. */
async function bodyOf(data) {
  if (data && typeof data.pipe === 'function') {
    const chunks = [];
    for await (const chunk of data) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return data;
}

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, path: url.pathname, query, headers, body: await bodyOf(opts.data), responseType: opts.responseType };
  calls.push(call);
  const answer = await respond(call);
  if (answer instanceof Error) throw answer;
  return { data: answer?.__status ? answer.data : answer, status: answer?.__status ?? 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
/** A Google error as gaxios reports it. */
const googleError = (status, message) => Object.assign(new Error(message), { response: { status, data: { error: { code: status, message, errors: [{ reason: 'conditionNotMet' }] } } } });

const NEW_TOOLS = [
  'logging_entries_list',
  'monitoring_query_promql',
  'monitoring_dashboards_list',
  'monitoring_dashboard_get',
  'iam_roles_list',
  'iam_role_get',
  'billing_price_lookup',
  'gcs_read_text',
  'gcs_read_object',
  'gcs_write_text',
];

// ---------------------------------------------------------------------------
// Kinds and scopes

/** The scopes Discovery lists for a method, from data/discovery or the trimmed fixtures. */
function discoveryScopes(file, id) {
  const fixture = join(REPO, 'tests', 'fixtures', 'discovery', `${file}.json`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(fixture, 'utf8'));
  } catch {
    doc = JSON.parse(readFileSync(join(REPO, 'data', 'discovery', `${file}.json`), 'utf8'));
  }
  let found;
  const walk = (resources) => {
    for (const r of Object.values(resources ?? {})) {
      for (const m of Object.values(r.methods ?? {})) if (m.id === id) found = m;
      walk(r.resources);
    }
  };
  walk(doc.resources);
  assert.ok(found, `${id} in ${file}`);
  return [...found.scopes].sort();
}

test('the ten tools exist after the 1.9.0 tools, in order, and the old tools keep their order', () => {
  const names = [...tools.keys()];
  assert.deepEqual(names.slice(-10), NEW_TOOLS);
  assert.equal(names.indexOf('cloud_apikey_delete'), names.length - 11, 'the 1.9.0 tools come first, as before');
});

test('kinds follow classifyMethod, except the PromQL query, which only evaluates (Google marks query_range read-only)', () => {
  assert.equal(tools.get('logging_entries_list').kind, classifyMethod('POST', 'list', 'logging.entries.list'));
  assert.equal(tools.get('monitoring_dashboards_list').kind, classifyMethod('GET', 'list', 'monitoring.projects.dashboards.list'));
  assert.equal(tools.get('monitoring_dashboard_get').kind, classifyMethod('GET', 'get', 'monitoring.projects.dashboards.get'));
  assert.equal(tools.get('iam_roles_list').kind, classifyMethod('GET', 'list', 'iam.roles.list'));
  assert.equal(tools.get('iam_role_get').kind, classifyMethod('GET', 'get', 'iam.roles.get'));
  assert.equal(tools.get('billing_price_lookup').kind, classifyMethod('GET', 'get', 'cloudbilling.skus.price.get'));
  assert.equal(tools.get('gcs_read_text').kind, classifyMethod('GET', 'get', 'storage.objects.get'));
  assert.equal(tools.get('gcs_read_object').kind, classifyMethod('GET', 'get', 'storage.objects.get'));
  assert.equal(tools.get('gcs_write_text').kind, classifyMethod('POST', 'insert', 'storage.objects.insert'));
  assert.equal(tools.get('gcs_write_text').kind, 'write');
  // The verb and name rules alone make the Prometheus POST methods writes; since 1.24.5 config/tool-kinds.json makes them
  // reads, as the curated tool is (tests/kinds-postreads.test.mjs pins the override).
  assert.equal(classifyMethod('POST', 'query_range', 'monitoring.projects.location.prometheus.api.v1.query_range'), 'write');
  assert.equal(tools.get('monitoring_query_promql').kind, 'read');
  for (const name of NEW_TOOLS.filter((n) => n !== 'gcs_write_text')) assert.equal(tools.get(name).kind, 'read', name);
  for (const t of tools.values()) assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
  assert.deepEqual([...tools.values()].filter((t) => t.prepare).map((t) => t.name), ['gcs_write_text']);
});

test('each tool takes the scopes Discovery lists for the methods it calls', () => {
  const same = (tool, ...lists) => {
    const want = [...new Set(lists.flat())].sort();
    for (const list of lists) assert.deepEqual([...list].sort(), want, `${tool}: its methods list the same scopes`);
    assert.deepEqual([...tools.get(tool).scopes].sort(), want, tool);
  };
  same('logging_entries_list', discoveryScopes('logging.v2', 'logging.entries.list'));
  same(
    'monitoring_query_promql',
    discoveryScopes('monitoring.v1', 'monitoring.projects.location.prometheus.api.v1.query_range'),
    discoveryScopes('monitoring.v1', 'monitoring.projects.location.prometheus.api.v1.query'),
  );
  same('monitoring_dashboards_list', discoveryScopes('monitoring.v1', 'monitoring.projects.dashboards.list'));
  same('monitoring_dashboard_get', discoveryScopes('monitoring.v1', 'monitoring.projects.dashboards.get'));
  same('iam_roles_list', discoveryScopes('iam.v1', 'iam.roles.list'), discoveryScopes('iam.v1', 'iam.projects.roles.list'), discoveryScopes('iam.v1', 'iam.organizations.roles.list'));
  same('iam_role_get', discoveryScopes('iam.v1', 'iam.roles.get'), discoveryScopes('iam.v1', 'iam.projects.roles.get'));
  same(
    'billing_price_lookup',
    discoveryScopes('cloudbilling.v1beta', 'cloudbilling.skus.price.get'),
    discoveryScopes('cloudbilling.v1beta', 'cloudbilling.billingAccounts.skus.price.get'),
    discoveryScopes('cloudbilling.v1', 'cloudbilling.services.list'),
    discoveryScopes('cloudbilling.v1', 'cloudbilling.services.skus.list'),
  );
  same('gcs_read_text', discoveryScopes('storage.v1', 'storage.objects.get'));
  same('gcs_read_object', discoveryScopes('storage.v1', 'storage.objects.get'));
  same('gcs_write_text', discoveryScopes('storage.v1', 'storage.objects.insert'));
});

// ---------------------------------------------------------------------------
// Logging

test('buildLogFilter: the filter in brackets, severity, resource type and the window, joined with AND', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  assert.deepEqual(ops.buildLogFilter({ filter: 'a=1 OR b=2', severity: 'ERROR', resource_type: 'cloud_run_revision', freshness: '6h' }, now), {
    filter: '(a=1 OR b=2) AND severity>=ERROR AND resource.type="cloud_run_revision" AND timestamp>="2026-10-30T06:00:00.000Z"',
    windowDefaulted: false,
  });
  assert.deepEqual(ops.buildLogFilter({ start_time: '2026-10-29T00:00:00Z', end_time: '2026-10-30T00:00:00Z' }, now), {
    filter: 'timestamp>="2026-10-29T00:00:00Z" AND timestamp<"2026-10-30T00:00:00Z"',
    windowDefaulted: false,
  });
  // Nothing limits the time: the last day, as gcloud logging read.
  assert.deepEqual(ops.buildLogFilter({}, now), { filter: 'timestamp>="2026-10-29T12:00:00.000Z"', windowDefaulted: true });
  // A filter that limits the timestamp itself gets no window added.
  assert.deepEqual(ops.buildLogFilter({ filter: 'timestamp >= "2026-10-01T00:00:00Z"' }, now), { filter: '(timestamp >= "2026-10-01T00:00:00Z")', windowDefaulted: false });
  assert.equal(ops.filterHasTime('receiveTimestamp>="x"'), false);
  assert.equal(ops.filterHasTime('jsonPayload.timestamp>"x"'), false);
  assert.equal(ops.buildLogFilter({ resource_type: 'a"b' }, now).filter.startsWith('resource.type="a\\"b"'), true);
  assert.throws(() => ops.buildLogFilter({ freshness: 'yesterday' }, now), /not a duration/);
  assert.throws(() => ops.buildLogFilter({ start_time: 'monday' }, now), /not an RFC 3339 time/);
  assert.equal(ops.parseDuration('90s'), 90_000);
  assert.equal(ops.parseDuration('2w'), 1_209_600_000);
  assert.equal(ops.parseDuration('1y'), undefined);
});

test('compactEntry: text, JSON message, audit log summary, HTTP request and trace', () => {
  assert.deepEqual(
    ops.compactEntry({
      timestamp: '2026-10-30T10:00:00Z',
      severity: 'ERROR',
      logName: 'projects/p/logs/run.googleapis.com%2Fstderr',
      resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
      textPayload: 'boom',
      httpRequest: { requestMethod: 'GET', status: 500, requestUrl: 'https://x/y', latency: '0.2s' },
      trace: 'projects/p/traces/abc',
      insertId: 'i1',
    }),
    {
      timestamp: '2026-10-30T10:00:00Z',
      severity: 'ERROR',
      log: 'run.googleapis.com/stderr',
      resource: 'cloud_run_revision',
      resource_labels: { service_name: 'api' },
      message: 'boom',
      http: 'GET 500 https://x/y 0.2s',
      trace: 'projects/p/traces/abc',
      insert_id: 'i1',
    },
  );
  assert.equal(ops.entryMessage({ jsonPayload: { message: 'hi', level: 'x' } }), 'hi');
  assert.equal(ops.entryMessage({ jsonPayload: { level: 'x' } }), '{"level":"x"}');
  assert.equal(
    ops.entryMessage({ protoPayload: { methodName: 'SetIamPolicy', resourceName: 'projects/p', authenticationInfo: { principalEmail: 'a@example.com' }, status: { code: 7, message: 'denied' } } }),
    'SetIamPolicy projects/p by a@example.com (status 7: denied)',
  );
  assert.equal(ops.compactEntry({}).severity, 'DEFAULT');
});

test('logging_entries_list: one entries.list POST, newest first, compact rows, the window note; refusals before any request', async () => {
  reset(() => ({ entries: [{ timestamp: 't', textPayload: 'x', logName: 'projects/p/logs/l', insertId: 'i' }], nextPageToken: 'n2' }));
  const out = await run('logging_entries_list', { project_id: 'my-project-123', severity: 'WARNING', page_size: 5 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://logging.googleapis.com/v2/entries:list');
  assert.deepEqual(calls[0].body.resourceNames, ['projects/my-project-123']);
  assert.equal(calls[0].body.orderBy, 'timestamp desc');
  assert.equal(calls[0].body.pageSize, 5);
  assert.match(calls[0].body.filter, /^severity>=WARNING AND timestamp>="/);
  assert.match(out.window_note, /last 1d/);
  assert.deepEqual(out.entries, [{ timestamp: 't', severity: 'DEFAULT', log: 'l', resource: undefined, message: 'x', insert_id: 'i' }]);
  assert.equal(out.next_page_token, 'n2');

  reset(() => ({ entries: [{ textPayload: 'x', labels: { a: '1' } }] }));
  const full = await run('logging_entries_list', { resource_names: ['folders/1'], filter: 'timestamp>="2026-10-01T00:00:00Z"', order: 'oldest', view: 'full' });
  assert.equal(calls[0].body.orderBy, 'timestamp asc');
  assert.equal(calls[0].body.pageSize, undefined, 'Google keeps its default page size');
  assert.equal(full.window_note, undefined);
  assert.deepEqual(full.entries, [{ textPayload: 'x', labels: { a: '1' } }]);

  reset();
  await assert.rejects(run('logging_entries_list', {}), /needs project_id or resource_names/);
  await assert.rejects(run('logging_entries_list', { project_id: 'my-project-123', resource_names: ['folders/1'] }), /not both/);
  await assert.rejects(run('logging_entries_list', { project_id: 'my-project-123', freshness: 'soon' }), /not a duration/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Monitoring

test('monitoring_query_promql: range and instant queries, the HttpBody answer decoded, PromQL errors reported', async () => {
  reset(() => ({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { a: '1' }, values: [[1, '2']] }] } }));
  const range = await run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up', start_time: '2026-10-30T00:00:00Z', step: '60s' });
  assert.equal(calls[0].url, 'https://monitoring.googleapis.com/v1/projects/my-project-123/location/global/prometheus/api/v1/query_range');
  assert.equal(calls[0].body.query, 'up');
  assert.equal(calls[0].body.start, '2026-10-30T00:00:00Z');
  assert.equal(calls[0].body.step, '60s');
  assert.ok(!Number.isNaN(Date.parse(calls[0].body.end)), 'end defaults to now');
  assert.deepEqual({ kind: range.kind, result_type: range.result_type, series: range.series }, { kind: 'range', result_type: 'matrix', series: 1 });

  const httpBody = { contentType: 'application/json', data: Buffer.from(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [] }, warnings: ['w'] })).toString('base64') };
  reset(() => httpBody);
  const instant = await run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up' });
  assert.equal(calls[0].url.endsWith('/prometheus/api/v1/query'), true);
  assert.deepEqual(calls[0].body, { query: 'up' });
  assert.deepEqual({ kind: instant.kind, result_type: instant.result_type, series: instant.series, warnings: instant.warnings }, { kind: 'instant', result_type: 'vector', series: 0, warnings: ['w'] });

  reset(() => ({ status: 'error', errorType: 'bad_data', error: 'parse error' }));
  await assert.rejects(run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up{' }), /PromQL bad_data: parse error/);

  reset();
  await assert.rejects(run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up', start_time: 'x' }), /needs step/);
  await assert.rejects(run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up', step: '60s' }), /needs start_time/);
  await assert.rejects(run('monitoring_query_promql', { project_id: 'my-project-123', query: 'up', start_time: 'x', step: '1m', time: 'y' }), /not both/);
  assert.equal(calls.length, 0);
});

test('monitoring dashboards: the list summarises layouts and widgets; get builds the name and refuses others', async () => {
  reset(() => ({
    dashboards: [
      { name: 'projects/1/dashboards/a', displayName: 'A', mosaicLayout: { tiles: [{}, {}] } },
      { name: 'projects/1/dashboards/b', displayName: 'B', rowLayout: { rows: [{ widgets: [{}] }, { widgets: [{}, {}] }] }, labels: { x: '' } },
    ],
    nextPageToken: 'n',
  }));
  const list = await run('monitoring_dashboards_list', { project_id: 'my-project-123', page_size: 2 });
  assert.equal(calls[0].query.pageSize, '2');
  assert.deepEqual(list, {
    dashboards: [
      { name: 'projects/1/dashboards/a', display_name: 'A', layout: 'mosaic', widgets: 2 },
      { name: 'projects/1/dashboards/b', display_name: 'B', layout: 'row', widgets: 3, labels: { x: '' } },
    ],
    next_page_token: 'n',
  });
  reset(() => ({ name: 'projects/my-project-123/dashboards/d1' }));
  await run('monitoring_dashboard_get', { project_id: 'my-project-123', dashboard_id: 'd1' });
  assert.equal(calls[0].url, 'https://monitoring.googleapis.com/v1/projects/my-project-123/dashboards/d1');
  reset();
  await assert.rejects(run('monitoring_dashboard_get', { project_id: 'my-project-123' }), /needs name/);
  await assert.rejects(run('monitoring_dashboard_get', { name: 'projects/p/alertPolicies/1' }), /not a dashboard name/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// IAM roles

test('iam_roles_list: predefined, project and organization roles, the full view; iam_role_get checks the name', async () => {
  reset(() => ({ roles: [{ name: 'roles/viewer', title: 'Viewer', stage: 'GA', includedPermissions: ['a.b.c'] }], nextPageToken: 'n' }));
  const predefined = await run('iam_roles_list', { view: 'full', page_size: 2 });
  assert.equal(calls[0].url, 'https://iam.googleapis.com/v1/roles');
  assert.deepEqual(calls[0].query, { view: 'FULL', pageSize: '2' });
  assert.deepEqual(predefined, { scope: 'predefined', roles: [{ name: 'roles/viewer', title: 'Viewer', description: undefined, stage: 'GA', permissions: ['a.b.c'] }], next_page_token: 'n' });
  reset(() => ({}));
  await run('iam_roles_list', { project_id: 'my-project-123', show_deleted: true });
  assert.equal(calls[0].url, 'https://iam.googleapis.com/v1/projects/my-project-123/roles');
  assert.deepEqual(calls[0].query, { showDeleted: 'true' });
  await run('iam_roles_list', { organization_id: '42' });
  assert.equal(calls[1].url, 'https://iam.googleapis.com/v1/organizations/42/roles');
  await assert.rejects(run('iam_roles_list', { project_id: 'my-project-123', organization_id: '42' }), /not both/);

  reset(() => ({ name: 'projects/my-project-123/roles/auditor', title: 'Auditor', includedPermissions: ['x'] }));
  const role = await run('iam_role_get', { name: 'projects/my-project-123/roles/auditor' });
  assert.equal(calls[0].url, 'https://iam.googleapis.com/v1/projects/my-project-123/roles/auditor');
  assert.deepEqual(role.permissions, ['x']);
  reset();
  for (const bad of ['viewer', 'roles/', 'projects/p/roles', 'organizations/acme/roles/r', 'folders/1/roles/r']) {
    await assert.rejects(run('iam_role_get', { name: bad }), /not a role name/, bad);
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Billing

test('moneyText, skuMatches, skuPrice and betaPrice', () => {
  assert.equal(ops.moneyText({ units: '0', nanos: 31611000 }), '0.031611');
  assert.equal(ops.moneyText({ units: '12', nanos: 0 }), '12');
  assert.equal(ops.moneyText({ units: '-1', nanos: -500000000 }), '-1.5');
  assert.equal(ops.moneyText({ nanos: -250000000 }), '-0.25');
  assert.equal(ops.moneyText(undefined), undefined);
  const sku = { skuId: 'AAAA-BBBB-CCCC', description: 'N2 Instance Core running in Americas', serviceRegions: ['us-central1', 'us-east1'] };
  assert.equal(ops.skuMatches(sku, 'n2 CORE', 'US-CENTRAL1'), true);
  assert.equal(ops.skuMatches(sku, 'n2 ram', undefined), false);
  assert.equal(ops.skuMatches(sku, undefined, 'europe-west1'), false);
  assert.equal(ops.skuMatches(sku, 'aaaa-bbbb', undefined), true);
  assert.deepEqual(
    ops.skuPrice({
      pricingInfo: [
        { effectiveTime: 'old', pricingExpression: { usageUnit: 'h', tieredRates: [{ startUsageAmount: 0, unitPrice: { units: '9', currencyCode: 'USD' } }] } },
        { effectiveTime: 'new', summary: 's', pricingExpression: { usageUnit: 'h', usageUnitDescription: 'hour', displayQuantity: 1, tieredRates: [{ startUsageAmount: 0, unitPrice: { units: '0', nanos: 31611000, currencyCode: 'EUR' } }] } },
      ],
    }),
    { currency: 'EUR', unit: 'h', unit_description: 'hour', tiers: [{ start_amount: 0, unit_price: '0.031611' }], effective_time: 'new', summary: 's' },
  );
  assert.deepEqual(
    ops.betaPrice({ currencyCode: 'USD', valueType: 'rate', rate: { unitInfo: { unit: 'GiBy.mo', unitDescription: 'gibibyte month', unitQuantity: { value: '1' } }, tiers: [{ startAmount: { value: '0' }, listPrice: { units: '0', nanos: 20000000 } }] }, priceReason: { type: 'default-price' } }),
    { currency: 'USD', value_type: 'rate', unit: 'GiBy.mo', unit_description: 'gibibyte month', unit_quantity: '1', tiers: [{ start_amount: '0', list_price: '0.02' }], price_reason: 'default-price' },
  );
});

test('billing_price_lookup: one SKU, a service found by name with SKUs by words and region, account prices, refusals', async () => {
  reset(() => ({ currencyCode: 'EUR', rate: { tiers: [] } }));
  const one = await run('billing_price_lookup', { sku_id: 'D041-B8A1-6E0B', currency_code: 'eur' });
  assert.deepEqual(calls.map((c) => [c.url, c.query]), [['https://cloudbilling.googleapis.com/v1beta/skus/D041-B8A1-6E0B/price', { currencyCode: 'EUR' }]]);
  assert.equal(one.price.currency, 'EUR');

  const skus = [
    { skuId: 'AAAA-0000-0001', description: 'N2 Instance Core running in Americas', serviceRegions: ['us-central1'], category: { serviceDisplayName: 'Compute Engine' } },
    { skuId: 'AAAA-0000-0002', description: 'N2 Instance Ram running in Americas', serviceRegions: ['us-central1'] },
    { skuId: 'AAAA-0000-0003', description: 'N2 Instance Core running in EMEA', serviceRegions: ['europe-west1'] },
    { skuId: 'AAAA-0000-0004', description: 'N2 Instance Core running in Americas (preemptible)', serviceRegions: ['us-central1'] },
  ];
  reset((call) => {
    if (call.url.endsWith('/v1/services')) {
      return call.query.pageToken ? { services: [{ serviceId: '6F81-5844-456A', displayName: 'Compute Engine' }] } : { services: [{ serviceId: '95FF-2EF5-5EA1', displayName: 'Cloud Storage' }], nextPageToken: 'p2' };
    }
    if (call.url.endsWith('/skus')) return call.query.pageToken ? { skus: skus.slice(2) } : { skus: skus.slice(0, 2), nextPageToken: 's2' };
    if (call.url.endsWith('AAAA-0000-0004/price')) return googleError(403, 'The caller does not have permission');
    return { currencyCode: 'EUR', priceReason: { type: 'fixed-price' }, rate: { tiers: [] } };
  });
  const found = await run('billing_price_lookup', { service: 'compute engine', query: 'core', region: 'us-central1', billing_account: 'billingAccounts/012345-6789AB-CDEF01', max_skus: 5 });
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      '/v1/services',
      '/v1/services',
      '/v1/services/6F81-5844-456A/skus',
      '/v1/services/6F81-5844-456A/skus',
      '/v1beta/billingAccounts/012345-6789AB-CDEF01/skus/AAAA-0000-0001/price',
      '/v1beta/billingAccounts/012345-6789AB-CDEF01/skus/AAAA-0000-0004/price',
    ],
  );
  assert.equal(calls[2].query.pageSize, '5000');
  assert.deepEqual(found.service, { id: '6F81-5844-456A', name: 'Compute Engine' });
  assert.equal(found.matched, 2);
  assert.deepEqual(found.skus.map((s) => s.sku_id), ['AAAA-0000-0001', 'AAAA-0000-0004']);
  assert.equal(found.skus[0].account_price.price_reason, 'fixed-price');
  assert.match(found.skus[1].account_price_error, /does not have permission/);

  // max_skus: the count of matches is kept, the list is cut, and a note says so.
  reset((call) => (call.url.endsWith('/skus') ? { skus } : {}));
  const cut = await run('billing_price_lookup', { service: '6f81-5844-456a', query: 'n2', max_skus: 1 });
  assert.deepEqual(calls.map((c) => c.path), ['/v1/services/6F81-5844-456A/skus'], 'a service ID needs no lookup');
  assert.equal(cut.matched, 4);
  assert.equal(cut.shown, 1);
  assert.match(cut.note, /4 SKUs match; the first 1 are shown/);

  reset(() => ({ services: [{ serviceId: '1', displayName: 'Cloud Run' }, { serviceId: '2', displayName: 'Cloud Run Functions' }] }));
  // A part of one name only: that service.
  assert.equal((await run('billing_price_lookup', { service: 'run functions' })).service.id, '2');
  await assert.rejects(run('billing_price_lookup', { service: 'run' }), /"run" matches 2 services: Cloud Run \(1\); Cloud Run Functions \(2\)/);
  await assert.rejects(run('billing_price_lookup', { service: 'Spanner' }), /No Google Cloud service is called "Spanner"/);
  // An exact name wins over longer names that contain it.
  reset((call) => (call.url.endsWith('/v1/services') ? { services: [{ serviceId: '1', displayName: 'Cloud Run' }, { serviceId: '2', displayName: 'Cloud Run Functions' }] } : { skus: [] }));
  const exact = await run('billing_price_lookup', { service: 'cloud run' });
  assert.equal(exact.service.id, '1');

  reset();
  await assert.rejects(run('billing_price_lookup', {}), /needs sku_id, or service/);
  await assert.rejects(run('billing_price_lookup', { sku_id: 'D041-B8A1-6E0B', service: 'x' }), /sku_id alone/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Cloud Storage

const meta = (size, contentType = 'text/plain', generation = '7') => ({ name: 'o', bucket: 'b', size: String(size), contentType, generation });

test('gcs_read_text: metadata, then the content pinned to its generation; a range only when part is read', async () => {
  reset((call) => (call.query.alt === 'media' ? 'hello world' : meta(11)));
  const whole = await run('gcs_read_text', { bucket: 'my-bucket', object: 'dir/a b.txt' });
  assert.deepEqual(calls.map((c) => [c.url, c.query.alt ?? null, c.query.generation ?? null, c.headers.range ?? null, c.responseType ?? null]), [
    ['https://storage.googleapis.com/storage/v1/b/my-bucket/o/dir%2Fa%20b.txt', null, null, null, null],
    ['https://storage.googleapis.com/storage/v1/b/my-bucket/o/dir%2Fa%20b.txt', 'media', '7', null, 'arraybuffer'],
  ]);
  assert.deepEqual(whole, { bucket: 'my-bucket', object: 'dir/a b.txt', generation: '7', content_type: 'text/plain', size_bytes: 11, offset: 0, bytes_read: 11, text: 'hello world' });

  reset((call) => (call.query.alt === 'media' ? { __status: 206, data: Buffer.from('lo w') } : meta(11)));
  const part = await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt', read_offset: 3, max_bytes: 4 });
  assert.equal(calls[1].headers.range, 'bytes=3-6');
  assert.deepEqual({ text: part.text, bytes_read: part.bytes_read, next_offset: part.next_offset }, { text: 'lo w', bytes_read: 4, next_offset: 7 });

  // A server that ignores Range sends the whole object: the asked part is kept.
  reset((call) => (call.query.alt === 'media' ? Buffer.from('hello world') : meta(11)));
  assert.equal((await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt', read_offset: 6, max_bytes: 3 })).text, 'wor');

  // An empty object, and an offset at its end: no content request.
  reset(() => meta(0));
  assert.equal((await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt' })).text, '');
  assert.equal(calls.length, 1);
  reset(() => meta(5));
  await assert.rejects(run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt', read_offset: 6 }), /past the end of the object \(5 bytes\)/);
});

test('gcs_read_text: the charset of the content type, UTF-8 cut on a character boundary, binary refused, the result limit', async () => {
  reset((call) => (call.query.alt === 'media' ? Buffer.from([0x63, 0x61, 0x66, 0xe9]) : meta(4, 'text/plain; charset=ISO-8859-1')));
  assert.equal((await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt' })).text, 'café');

  // "aé" is 61 C3 A9: cut after 2 bytes, the é is not split; next_offset starts at its first byte.
  const bytes = Buffer.from('aé!', 'utf8');
  reset((call) => (call.query.alt === 'media' ? { __status: 206, data: bytes.subarray(0, 2) } : meta(bytes.length)));
  const cut = await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt', max_bytes: 2 });
  assert.deepEqual({ text: cut.text, bytes_read: cut.bytes_read, next_offset: cut.next_offset }, { text: 'a', bytes_read: 1, next_offset: 1 });
  assert.equal(gcs.utf8Boundary(Buffer.from('a€', 'utf8'), 3), 1);
  assert.equal(gcs.utf8Boundary(Buffer.from('a€', 'utf8'), 4), 4);
  assert.equal(gcs.utf8Boundary(Buffer.from('ab', 'utf8'), 2), 2);

  reset((call) => (call.query.alt === 'media' ? Buffer.from([0x89, 0x50, 0x00, 0x47]) : meta(4, 'application/octet-stream')));
  await assert.rejects(run('gcs_read_text', { bucket: 'my-bucket', object: 'a.bin' }), /looks binary.*Use gcs_read_object/);
  assert.equal(gcs.looksLikeText('application/json', Buffer.from([0])), true);
  assert.equal(gcs.looksLikeText(undefined, Buffer.from('plain')), true);
  assert.equal(gcs.charsetOf('text/plain; charset="utf-16le"'), 'utf-16le');
  assert.equal(gcs.charsetOf('text/plain; charset=nonsense'), 'utf-8');

  // The read is capped by the result limit (maxResultChars 1400 leaves 400), whatever max_bytes says.
  reset((call) => (call.query.alt === 'media' ? { __status: 206, data: Buffer.alloc(400, 0x61) } : meta(5000)));
  const capped = await run('gcs_read_text', { bucket: 'my-bucket', object: 'a.txt', max_bytes: 4000 }, small);
  assert.equal(calls[1].headers.range, 'bytes=0-399');
  assert.equal(capped.next_offset, 400);
});

test('gcs_read_object: base64, capped to fit the result limit as base64, next_offset continues', async () => {
  reset((call) => (call.query.alt === 'media' ? Buffer.from([1, 2, 3]) : meta(3, 'image/png', '9')));
  const out = await run('gcs_read_object', { bucket: 'my-bucket', object: 'logo.png', generation: '9' });
  assert.equal(calls[0].query.generation, '9');
  assert.deepEqual(out, { bucket: 'my-bucket', object: 'logo.png', generation: '9', content_type: 'image/png', size_bytes: 3, offset: 0, bytes_read: 3, data_base64: 'AQID' });
  // 1400 - 1000 = 400 characters of room: 300 bytes, whose base64 is 400 characters.
  reset((call) => (call.query.alt === 'media' ? { __status: 206, data: Buffer.alloc(300, 7) } : meta(1000, 'application/octet-stream')));
  const part = await run('gcs_read_object', { bucket: 'my-bucket', object: 'big.bin', read_offset: 100 }, small);
  assert.equal(calls[1].headers.range, 'bytes=100-399');
  assert.deepEqual({ bytes_read: part.bytes_read, next_offset: part.next_offset, chars: part.data_base64.length }, { bytes_read: 300, next_offset: 400, chars: 400 });
});

test('gcs_write_text: one media upload that never replaces an object unless overwrite is true', async () => {
  reset(() => ({ name: 'notes/a.txt', generation: '11', size: '5', contentType: 'text/plain; charset=utf-8', md5Hash: 'h' }));
  const out = await run('gcs_write_text', { bucket: 'my-bucket', object: 'notes/a.txt', text: 'hello' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o');
  assert.deepEqual(calls[0].query, { uploadType: 'media', name: 'notes/a.txt', ifGenerationMatch: '0' });
  assert.equal(calls[0].headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(calls[0].body, 'hello');
  assert.deepEqual(out, { destination: 'gs://my-bucket/notes/a.txt', generation: '11', size_bytes: 5, content_type: 'text/plain; charset=utf-8', md5_hash: 'h', overwrite: false });

  reset(() => ({ generation: '12' }));
  await run('gcs_write_text', { bucket: 'my-bucket', object: 'notes/a.txt', text: 'x', content_type: 'text/csv', overwrite: true });
  assert.deepEqual(calls[0].query, { uploadType: 'media', name: 'notes/a.txt' }, 'overwrite: no generation precondition');
  assert.equal(calls[0].headers['content-type'], 'text/csv');

  reset(() => googleError(412, 'At least one of the pre-conditions you specified did not hold.'));
  await assert.rejects(run('gcs_write_text', { bucket: 'my-bucket', object: 'notes/a.txt', text: 'x' }), /gs:\/\/my-bucket\/notes\/a\.txt already exists, so nothing was written\. Pass overwrite: true/);
  // With overwrite, a 412 is Google's own answer.
  await assert.rejects(run('gcs_write_text', { bucket: 'my-bucket', object: 'notes/a.txt', text: 'x', overwrite: true }), /pre-conditions/);
});

test('gcs_write_text: a local file streams through the shared path guard; refusals before any request', async () => {
  const dir = mkdtempSync(join(root, 'files-'));
  const file = join(dir, 'report.csv');
  writeFileSync(file, 'a,b\n1,2\n');
  reset(() => ({ generation: '1' }));
  await run('gcs_write_text', { bucket: 'my-bucket', object: 'r/report.csv', local_path: file });
  assert.equal(calls[0].headers['content-type'], 'text/csv');
  assert.equal(Buffer.isBuffer(calls[0].body) ? calls[0].body.toString('utf8') : calls[0].body, 'a,b\n1,2\n');

  reset();
  const refusals = [
    [{ bucket: 'my-bucket', object: 'a', text: 'x', local_path: file }, /not both/],
    [{ bucket: 'my-bucket', object: 'a' }, /needs text or local_path/],
    [{ bucket: 'my-bucket', object: 'a\nb', text: 'x' }, /carriage return or a line feed/],
    [{ bucket: 'my-bucket', object: '..', text: 'x' }, /may not be "\." or "\.\."/],
    [{ bucket: 'my-bucket', object: 'x'.repeat(1025), text: 'x' }, /longer than 1024 bytes/],
    [{ bucket: 'my-bucket', object: 'a', text: 'x', content_type: 'nonsense' }, /not a content type/],
    [{ bucket: 'my-bucket', object: 'a', local_path: 'relative.txt' }, /must be a full path/],
    [{ bucket: 'my-bucket', object: 'a', local_path: join(dir, 'missing.txt') }, /was not found/],
    [{ bucket: 'my-bucket', object: 'a', local_path: join(tokenDir, 'cloud.token.json') }, /refused: it is in the folder that holds Google sign-in data/],
    [{ bucket: 'my-bucket', object: 'a', local_path: join(tokenDir, 'client_secret.json') }, /refused/],
  ];
  for (const [args, message] of refusals) await assert.rejects(run('gcs_write_text', args), message, JSON.stringify(args).slice(0, 80));
  assert.equal(calls.length, 0, 'no request for any refusal');
});

test('gcs_write_text: the prepare step shows the destination, the size and the overwrite choice, and sends nothing', async () => {
  reset();
  const tool = tools.get('gcs_write_text');
  const plan = await tool.prepare({ bucket: 'my-bucket', object: 'notes/a.txt', text: 'héllo' }, ctx);
  assert.equal(calls.length, 0);
  assert.deepEqual(plan.preview, {
    destination: 'gs://my-bucket/notes/a.txt',
    bytes: 6,
    content_type: 'text/plain; charset=utf-8',
    source: 'text',
    text_start: 'héllo',
    overwrite: false,
    effect: 'Writes the object only if no object with this name exists; otherwise nothing is written.',
  });
  const replace = await tool.prepare({ bucket: 'my-bucket', object: 'a', text: 'x'.repeat(500), overwrite: true }, ctx);
  assert.equal(replace.preview.text_start.length, 200);
  assert.match(replace.preview.effect, /An existing object with this name is replaced/);
  // The handler sends what was prepared.
  reset(() => ({}));
  await tool.handler({ bucket: 'other', object: 'z', text: 'ignored' }, ctx, plan);
  assert.equal(calls[0].url, 'https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o');
  assert.equal(calls[0].body, 'héllo');
});

test('bucket names are checked by the schema', async () => {
  const { z } = await import('zod');
  const schema = z.object(tools.get('gcs_read_text').inputSchema);
  assert.equal(schema.safeParse({ bucket: 'gs://my-bucket', object: 'a' }).success, false);
  assert.equal(schema.safeParse({ bucket: 'My-Bucket', object: 'a' }).success, false);
  assert.equal(schema.safeParse({ bucket: 'my.bucket_1', object: 'a' }).success, true);
  assert.equal(schema.safeParse({ bucket: 'my-bucket', object: 'a', max_bytes: gcs.GCS_READ_MAX_BYTES + 1 }).success, false);
});
