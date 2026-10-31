import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const cloud = await import(dist('servers/cloud.js'));
const { describeError } = await import(dist('core/tools.js'));
const { assertReadOnlyStatement, rowsFromQueryResponse } = cloud;

// ---- fixtures: a BigQuery jobs.query response in its typed cell format ----

const schema = {
  fields: [
    { name: 'id', type: 'INTEGER', mode: 'REQUIRED' },
    { name: 'name', type: 'STRING', mode: 'NULLABLE' },
    { name: 'active', type: 'BOOLEAN', mode: 'NULLABLE' },
    { name: 'score', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'tags', type: 'STRING', mode: 'REPEATED' },
    {
      name: 'address',
      type: 'RECORD',
      mode: 'NULLABLE',
      fields: [
        { name: 'city', type: 'STRING', mode: 'NULLABLE' },
        { name: 'zip', type: 'STRING', mode: 'NULLABLE' },
      ],
    },
  ],
};

const rows = [
  { f: [{ v: '1' }, { v: 'Ann' }, { v: 'true' }, { v: '0.5' }, { v: [{ v: 'a' }, { v: 'b' }] }, { v: { f: [{ v: 'Paris' }, { v: null }] } }] },
  { f: [{ v: '2' }, { v: null }, { v: null }, { v: null }, { v: [] }, { v: null }] },
];

// ---- pure functions ----

test('assertReadOnlyStatement allows only SELECT', () => {
  assert.doesNotThrow(() => assertReadOnlyStatement('SELECT'));
  for (const type of ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE_TABLE', 'DROP_TABLE', 'SCRIPT', 'select', undefined]) {
    assert.throws(
      () => assertReadOnlyStatement(type),
      { message: `Only read-only SELECT statements are allowed by bq_query_read. This statement is ${type ?? 'unknown'}. Changes to data or schema need a write tool and approval.` },
      `type ${type}`,
    );
  }
});

test('rowsFromQueryResponse maps the typed cells to objects, keeping strings and turning NULL into null', () => {
  const out = rowsFromQueryResponse({ schema, rows });
  assert.deepEqual(out.columns, ['id', 'name', 'active', 'score', 'tags', 'address']);
  assert.deepEqual(out.rows, [
    { id: '1', name: 'Ann', active: 'true', score: '0.5', tags: ['a', 'b'], address: { city: 'Paris', zip: null } },
    { id: '2', name: null, active: null, score: null, tags: [], address: null },
  ]);
});

test('rowsFromQueryResponse returns no columns and no rows for an empty response', () => {
  assert.deepEqual(rowsFromQueryResponse({}), { columns: [], rows: [] });
  assert.deepEqual(rowsFromQueryResponse({ schema: { fields: [{ name: 'n', type: 'INTEGER' }] } }), { columns: ['n'], rows: [] });
});

// ---- tool metadata ----

const cfgDir = mkdtempSync(join(tmpdir(), 'gsm-bq-'));
after(() => rmSync(cfgDir, { recursive: true, force: true }));
writeFileSync(join(cfgDir, 'client.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(
  join(cfgDir, 'cloud.token.json'),
  JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }),
);
const cfg = { allowWrites: false, tokenDir: cfgDir, clientSecretFile: join(cfgDir, 'client.json'), maxResultChars: 500000 };

const tools = await cloud.buildTools(cfg);
const tool = (name) => {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
};
const BQ = ['bq_query_read', 'bq_job_get', 'bq_dataset_list', 'bq_table_list', 'bq_table_get', 'bq_table_preview'];

test('every bq tool is read-only, has the BigQuery read scope, and no DDL or DML tool is registered', () => {
  for (const name of BQ) {
    const t = tool(name);
    assert.equal(t.kind, 'read', name);
    assert.ok(t.scopes?.includes('https://www.googleapis.com/auth/bigquery.readonly'), `${name} scopes`);
    assert.doesNotMatch(name, /insert|update|delete|create|merge|write|drop/, name);
  }
  assert.deepEqual(
    tools.filter((t) => t.name.startsWith('bq_')).map((t) => t.name).sort(),
    [...BQ].sort(),
  );
});

// ---- handlers, with the REST layer stubbed (no network) ----
// The cloud auth client is an OAuth2Client; its request method is replaced for these tests,
// so the handlers run their real code (dry run, job call, row conversion) against canned responses.

let calls = [];
let respond = () => {
  throw new Error('no canned response for this test');
};
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  calls.push({ method: opts.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: opts.data });
  return { data: await respond(opts, url) };
};
const reset = (fn) => {
  calls = [];
  respond = fn;
};
const apiError = (code, message, reason) =>
  Object.assign(new Error(`Request failed with status code ${code}`), {
    response: { status: code, data: { error: { code, message, errors: [{ reason }] } } },
  });
const queryArgs = { project_id: 'my-project-123', query: 'SELECT 1', max_bytes_billed: undefined, max_rows: undefined, location: undefined };

test('bq_query_read refuses a DELETE after the dry run and never sends the real query', async () => {
  reset((opts) => {
    assert.equal(opts.method, 'POST');
    return { statistics: { totalBytesProcessed: '0', query: { statementType: 'DELETE' } } };
  });
  await assert.rejects(
    tool('bq_query_read').handler({ ...queryArgs, query: 'DELETE FROM ds.t WHERE TRUE' }),
    /This statement is DELETE\. Changes to data or schema need a write tool and approval\./,
  );
  assert.equal(calls.length, 1, 'only the dry run was sent');
  assert.equal(calls[0].path, '/bigquery/v2/projects/my-project-123/jobs');
  assert.deepEqual(calls[0].body.configuration, { dryRun: true, query: { query: 'DELETE FROM ds.t WHERE TRUE', useLegacySql: false } });
});

test('bq_query_read runs a SELECT after a clean dry run and returns objects keyed by column', async () => {
  reset((_opts, url) => {
    if (url.pathname.endsWith('/jobs')) return { statistics: { totalBytesProcessed: '2048', query: { statementType: 'SELECT' } } };
    return { jobComplete: true, jobReference: { jobId: 'job_1', location: 'US' }, schema, rows, totalRows: '2', totalBytesProcessed: '2048', cacheHit: false };
  });
  const out = await tool('bq_query_read').handler({ ...queryArgs, query: 'SELECT id, name FROM ds.t' });
  assert.equal(out.status, 'done');
  assert.equal(out.job_id, 'job_1');
  assert.equal(out.total_rows, '2');
  assert.equal(out.bytes_processed, '2048');
  assert.equal(out.cache_hit, false);
  assert.deepEqual(out.columns, ['id', 'name', 'active', 'score', 'tags', 'address']);
  assert.equal(out.rows[0].name, 'Ann');
  const job = calls[1];
  assert.equal(job.path, '/bigquery/v2/projects/my-project-123/queries');
  // Compared as the JSON that goes on the wire, so an unset location is absent.
  assert.deepEqual(JSON.parse(JSON.stringify(job.body)), {
    query: 'SELECT id, name FROM ds.t',
    useLegacySql: false,
    maxResults: 100,
    maximumBytesBilled: '1000000000',
  });
});

test('bq_query_read refuses a scan above max_bytes_billed before running the query', async () => {
  reset(() => ({ statistics: { totalBytesProcessed: '5000', query: { statementType: 'SELECT' } } }));
  await assert.rejects(tool('bq_query_read').handler({ ...queryArgs, max_bytes_billed: 1000 }), /would scan 5000 bytes, more than max_bytes_billed \(1000\)/);
  assert.equal(calls.length, 1);
});

test('bq_query_read returns the job id when the query is still running, and bq_job_get fetches the rows', async () => {
  reset((_opts, url) => {
    if (url.pathname.endsWith('/jobs')) return { statistics: { totalBytesProcessed: '10', query: { statementType: 'SELECT' } } };
    if (url.pathname.endsWith('/queries')) return { jobComplete: false, jobReference: { jobId: 'job_9', location: 'EU' } };
    return { jobComplete: true, schema, rows, totalRows: '2', totalBytesProcessed: '10' };
  });
  const started = await tool('bq_query_read').handler({ ...queryArgs, location: 'EU' });
  assert.equal(started.status, 'running');
  assert.equal(started.job_id, 'job_9');
  assert.equal(started.location, 'EU');

  const polled = await tool('bq_job_get').handler({ project_id: 'my-project-123', job_id: 'job_9', location: 'EU', max_rows: 10 });
  assert.equal(polled.status, 'done');
  assert.equal(polled.rows.length, 2);
  const get = calls[calls.length - 1];
  assert.equal(get.method, 'GET');
  assert.equal(get.path, '/bigquery/v2/projects/my-project-123/queries/job_9');
  assert.deepEqual(get.query, { location: 'EU', maxResults: '10' });
});

test('a BigQuery error reaches describeError with its HTTP status, reason and message', async () => {
  reset(() => {
    throw apiError(403, 'Access Denied: Table my-project.ds.secret: User does not have permission', 'accessDenied');
  });
  await assert.rejects(tool('bq_query_read').handler(queryArgs), (err) => {
    const text = describeError(err, 'cloud');
    assert.match(text, /^HTTP 403 \| reason=accessDenied \| Access Denied: Table my-project\.ds\.secret/);
    return true;
  });
});

test('bq_dataset_list and bq_table_list pass the paging limit and map the list items', async () => {
  reset((_opts, url) => {
    if (url.pathname.endsWith('/datasets')) {
      return { datasets: [{ datasetReference: { datasetId: 'analytics' }, location: 'EU', friendlyName: 'Analytics' }], nextPageToken: 'more' };
    }
    return { tables: [{ tableReference: { tableId: 'events' }, type: 'TABLE' }, { tableReference: { tableId: 'v_daily' }, type: 'VIEW' }] };
  });
  const datasets = await tool('bq_dataset_list').handler({ project_id: 'my-project-123', max_results: 5 });
  assert.deepEqual(datasets, { datasets: [{ dataset_id: 'analytics', location: 'EU', friendly_name: 'Analytics' }], has_more: true, next_page_token: 'more' });
  assert.equal(calls[0].query.maxResults, '5');

  const tables = await tool('bq_table_list').handler({ project_id: 'my-project-123', dataset_id: 'analytics' });
  assert.deepEqual(tables.tables, [
    { table_id: 'events', type: 'TABLE', friendly_name: undefined },
    { table_id: 'v_daily', type: 'VIEW', friendly_name: undefined },
  ]);
  assert.equal(calls[1].path, '/bigquery/v2/projects/my-project-123/datasets/analytics/tables');
});

test('bq_table_preview reads the schema from the table and the rows from tabledata.list', async () => {
  reset((_opts, url) => {
    if (url.pathname.endsWith('/data')) return { totalRows: '2', rows };
    return { type: 'TABLE', numRows: '2', schema };
  });
  const out = await tool('bq_table_preview').handler({ project_id: 'my-project-123', dataset_id: 'analytics', table_id: 'events', max_rows: 5 });
  assert.equal(out.total_rows, '2');
  assert.deepEqual(out.columns, ['id', 'name', 'active', 'score', 'tags', 'address']);
  assert.equal(out.rows[1].name, null);
  const data = calls.find((c) => c.path.endsWith('/data'));
  assert.equal(data.method, 'GET');
  assert.equal(data.query.maxResults, '5');
});

test('bq_table_get returns the schema and row count', async () => {
  reset(() => ({ type: 'TABLE', description: 'Events', location: 'EU', numRows: '2', numBytes: '64', schema }));
  const out = await tool('bq_table_get').handler({ project_id: 'my-project-123', dataset_id: 'analytics', table_id: 'events' });
  assert.equal(out.num_rows, '2');
  assert.equal(out.location, 'EU');
  assert.equal(out.schema.length, 6);
});
