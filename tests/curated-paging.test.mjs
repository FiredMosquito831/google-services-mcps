// Paging and size of the hand-written tools (1.29.0): default page sizes, page tokens where they were dropped, and
// answers that fit the result limit (GSM_MAX_RESULT_CHARS) at whole rows, with an offset that continues after the last
// row shown. The HTTP layer is stubbed (OAuth2Client.prototype.request); nothing leaves the machine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-paging-'));
after(() => rmSync(tokenDir, { recursive: true, force: true }));
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
const token = { access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' };
for (const group of ['cloud', 'workspace-user', 'searchconsole', 'business', 'developer']) writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify(token));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });

let calls = [];
let respond = () => ({});
let statusOf = () => 200;
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = String(value);
  const range = opts.headers instanceof Headers ? (opts.headers.get('range') ?? undefined) : opts.headers?.Range;
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, path: url.pathname, query, body: opts.data, range };
  calls.push(call);
  return { data: await respond(call), status: statusOf(call), headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
  statusOf = () => 200;
};
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

/** The tools of a curated module, with the default result limit or a given one. */
async function toolsOf(module, maxResultChars) {
  const mod = await import(DIST(`servers/${module}.js`));
  return new Map((await mod.buildTools(maxResultChars ? { ...cfg, maxResultChars } : cfg)).map((t) => [t.name, t]));
}
const sizeOf = (value) => JSON.stringify(value).length;

// ---------------------------------------------------------------------------
// Gmail

const header = (name, value) => ({ name, value });
const gmailMessage = (i, body) => ({
  id: `m${i}`,
  threadId: 't1',
  labelIds: ['INBOX'],
  snippet: `snippet ${i}`,
  payload: {
    mimeType: 'text/plain',
    headers: [header('From', `Person ${i} <p${i}@example.com>`), header('To', 'me@example.com'), header('Subject', 'Plans'), header('Date', `Mon, ${i} Oct 2026 10:00:00 +0000`)],
    body: { data: Buffer.from(body).toString('base64url') },
  },
});

test('gmail_search and gmail_search_threads ask for 10 by default; a page size given is sent as it is', async () => {
  const gmail = await toolsOf('gmail');
  const { GMAIL_PAGE_DEFAULT } = await import(DIST('servers/gmail.js'));
  assert.equal(GMAIL_PAGE_DEFAULT, 10);
  reset((call) => (call.path.endsWith('/messages') ? { messages: [], resultSizeEstimate: 0 } : { threads: [] }));
  await gmail.get('gmail_search').handler({ q: 'x' }, ctx);
  assert.equal(calls[0].query.maxResults, '10');
  reset((call) => (call.path.endsWith('/threads') ? { threads: [] } : {}));
  await gmail.get('gmail_search_threads').handler({ query: 'x' }, ctx);
  assert.equal(calls[0].query.maxResults, '10');
  reset(() => ({ messages: [] }));
  await gmail.get('gmail_search').handler({ q: 'x', max_results: 100 }, ctx);
  assert.equal(calls[0].query.maxResults, '100');
});

test('gmail_get_thread keeps the newest messages whole; older ones lose their bodies, then the oldest are left out', async () => {
  const budget = 6000;
  const gmail = await toolsOf('gmail', budget);
  const messages = Array.from({ length: 12 }, (_, i) => gmailMessage(i + 1, `Body of message ${i + 1}. `.repeat(40)));
  reset(() => ({ id: 't1', messages }));
  const out = await gmail.get('gmail_get_thread').handler({ thread_id: 't1' }, ctx);
  assert.ok(sizeOf(out) <= budget, `${sizeOf(out)} characters`);
  assert.equal(out.message_count, 12);
  assert.deepEqual(Object.keys(out), ['id', 'message_count', 'truncated', 'messages']);
  const last = out.messages[out.messages.length - 1];
  assert.equal(last.id, 'm12', 'the newest message is last, as the thread order is kept');
  assert.match(last.body, /^Body of message 12\./);
  assert.equal(last.body_omitted, undefined);
  const shortened = out.messages.filter((m) => m.body_omitted === true);
  assert.ok(shortened.length > 0);
  for (const m of shortened) {
    assert.equal(m.body, undefined, 'no body');
    assert.match(m.snippet, /^snippet /, 'the header line and snippet stay');
  }
  const ids = out.messages.map((m) => Number(m.id.slice(1)));
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'oldest first');
  assert.equal(ids[ids.length - 1], 12);
  const t = out.truncated;
  assert.equal(t.shown, out.messages.length);
  assert.equal(t.omitted, 12 - out.messages.length);
  assert.match(t.how_to_continue, /This thread of 12 messages is longer than the result limit \(6000 characters\)\. The newest/);
  assert.match(t.how_to_continue, /gmail_get_message/);

  // The concise view has no bodies: only the oldest are left out.
  const lines = Array.from({ length: 200 }, (_, i) => gmailMessage(i + 1, 'x'));
  reset(() => ({ id: 't1', messages: lines }));
  const concise = await gmail.get('gmail_get_thread').handler({ thread_id: 't1', view: 'concise' }, ctx);
  assert.ok(sizeOf(concise) <= budget);
  assert.ok(concise.truncated.omitted > 0);
  assert.equal(concise.messages[concise.messages.length - 1].id, 'm200');
  assert.equal(concise.messages[0].id, `m${concise.truncated.omitted + 1}`);

  // A thread that fits is the same as before.
  reset(() => ({ id: 't1', messages: messages.slice(0, 2) }));
  const small = await gmail.get('gmail_get_thread').handler({ thread_id: 't1' }, ctx);
  assert.equal('truncated' in small, false);
  assert.equal(small.messages.length, 2);
});

// ---------------------------------------------------------------------------
// Search Console

const scRows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ keys: [`query ${from + i}`, `https://example.com/page/${from + i}/`], clicks: i, impressions: i * 10, ctr: 0.1234567891234, position: 4.56789123 }));

test('sc_search_analytics_query: 100 rows by default, row_count and next_start_row first; a page that does not fit continues after the last row shown', async () => {
  const sc = await toolsOf('searchconsole');
  const { SC_ROWS_DEFAULT } = await import(DIST('servers/searchconsole.js'));
  assert.equal(SC_ROWS_DEFAULT, 100);
  const args = { site_url: 'sc-domain:example.com', start_date: '2026-10-01', end_date: '2026-10-28', dimensions: ['query', 'page'] };
  reset(() => ({ rows: scRows(100), responseAggregationType: 'byPage' }));
  const full = await sc.get('sc_search_analytics_query').handler(args, ctx);
  assert.equal(calls[0].body.rowLimit, 100);
  assert.equal(calls[0].body.startRow, 0);
  assert.deepEqual(Object.keys(full), ['row_count', 'next_start_row', 'rows', 'responseAggregationType']);
  assert.equal(full.row_count, 100);
  assert.equal(full.next_start_row, 100, 'a full page: Google may have more');

  reset(() => ({ rows: scRows(7), responseAggregationType: 'byPage' }));
  const last = await sc.get('sc_search_analytics_query').handler({ ...args, start_row: 100 }, ctx);
  assert.deepEqual(Object.keys(last), ['row_count', 'rows', 'responseAggregationType'], 'a short page is the last');

  // 1000 rows asked: as many as fit are shown, and next_start_row starts at the first row not shown.
  const budget = 8000;
  const tight = await toolsOf('searchconsole', budget);
  reset(() => ({ rows: scRows(1000, 200), responseAggregationType: 'byPage' }));
  const cut = await tight.get('sc_search_analytics_query').handler({ ...args, row_limit: 1000, start_row: 200 }, ctx);
  assert.equal(calls[0].body.rowLimit, 1000, 'the row_limit given is sent');
  assert.ok(sizeOf(cut) <= budget);
  const shown = cut.rows.length;
  assert.ok(shown > 10 && shown < 1000);
  assert.deepEqual(cut.rows, scRows(1000, 200).slice(0, shown));
  assert.equal(cut.row_count, 1000);
  assert.equal(cut.next_start_row, 200 + shown);
  assert.equal(cut.truncated.shown, shown);
  assert.match(cut.truncated.how_to_continue, new RegExp(`start_row=${200 + shown}`));
  // No row is skipped and none is shown twice: the next call starts right after the last row shown.
  assert.deepEqual(cut.rows[shown - 1].keys[0], `query ${200 + shown - 1}`);
});

// ---------------------------------------------------------------------------
// Google Analytics

const gaReport = (n, total) => ({
  dimensionHeaders: [{ name: 'pagePath' }],
  metricHeaders: [{ name: 'activeUsers', type: 'TYPE_INTEGER' }],
  rows: Array.from({ length: n }, (_, i) => ({ dimensionValues: [{ value: `/page/${i}/with/a/longer/path` }], metricValues: [{ value: String(i) }] })),
  rowCount: total,
});

test('ga_run_report: 100 rows by default; a report that does not fit keeps the rows that fit, and next_offset follows the last one', async () => {
  const ga = await toolsOf('ganalytics');
  const args = { property_id: '123', date_ranges: [{ start_date: '7daysAgo', end_date: 'yesterday' }], dimensions: ['pagePath'], metrics: ['activeUsers'] };
  reset(() => gaReport(100, 5000));
  const out = await ga.get('ga_run_report').handler(args, ctx);
  assert.equal(calls[0].body.limit, '100', 'the default limit is sent (before 1.29.0: none, Google returned 10,000)');
  assert.deepEqual(Object.keys(out).slice(0, 2), ['row_count', 'next_offset'], 'the paging fields first');
  assert.equal(out.next_offset, 100);

  const budget = 5000;
  const tight = await toolsOf('ganalytics', budget);
  reset(() => gaReport(1000, 5000));
  const cut = await tight.get('ga_run_report').handler({ ...args, limit: 1000, offset: 2000 }, ctx);
  assert.equal(calls[0].body.limit, '1000');
  assert.ok(sizeOf(cut) <= budget);
  const shown = cut.rows.length;
  assert.ok(shown > 0 && shown < 1000);
  assert.equal(cut.row_count, 5000);
  assert.equal(cut.next_offset, 2000 + shown, 'continues after the last row shown, not after the 1000 Google sent');
  assert.equal(cut.truncated.omitted, 1000 - shown);
  assert.match(cut.truncated.how_to_continue, new RegExp(`offset=${2000 + shown}`));
});

// ---------------------------------------------------------------------------
// Google Cloud

test('cloud_services_list: the plain list as before when there is no other page; with one, next_page_token and page_token', async () => {
  const cloud = await toolsOf('cloud');
  const svc = (name) => ({ name: `projects/1/services/${name}`, config: { name }, state: 'ENABLED' });
  reset(() => ({ services: [svc('a.googleapis.com')] }));
  const plain = await cloud.get('cloud_services_list').handler({ project_id: 'my-project-123' }, ctx);
  assert.ok(Array.isArray(plain), 'the list itself, as before');
  assert.equal(calls[0].query.pageSize, '200');
  reset(() => ({ services: [svc('a.googleapis.com')], nextPageToken: 'n2' }));
  const first = await cloud.get('cloud_services_list').handler({ project_id: 'my-project-123', enabled_only: false }, ctx);
  assert.deepEqual(Object.keys(first), ['next_page_token', 'services']);
  assert.equal(first.next_page_token, 'n2', 'before 1.29.0 the token was dropped and the list ended at 200 without a word');
  reset(() => ({ services: [svc('b.googleapis.com')] }));
  const second = await cloud.get('cloud_services_list').handler({ project_id: 'my-project-123', enabled_only: false, page_token: 'n2' }, ctx);
  assert.equal(calls[0].query.pageToken, 'n2');
  assert.deepEqual(second, { services: [svc('b.googleapis.com')] }, 'a paging call answers as an object; no token on the last page');

  reset(() => ({ projects: [], nextPageToken: 'p2' }));
  const projects = await cloud.get('cloud_projects_search').handler({ query: 'name:x', page_size: 5, page_token: 'p1' }, ctx);
  assert.equal(calls[0].query.pageSize, '5');
  assert.equal(calls[0].query.pageToken, 'p1');
  assert.equal(projects.nextPageToken, 'p2');
});

test('bq_query_read and bq_job_get: next_page_token from Google; rows that do not fit continue with start_index after the last row shown', async () => {
  const budget = 4000;
  const cloud = await toolsOf('cloud', budget);
  const schema = { fields: [{ name: 'id', type: 'INTEGER' }, { name: 'label', type: 'STRING' }] };
  const bqRows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ f: [{ v: String(from + i) }, { v: `label number ${from + i}` }] }));
  reset((call) =>
    call.path.endsWith('/jobs')
      ? { statistics: { totalBytesProcessed: '10', query: { statementType: 'SELECT' } } }
      : { jobComplete: true, jobReference: { jobId: 'job-1' }, totalRows: '5000', pageToken: 'pt-2', schema, rows: bqRows(300) },
  );
  const out = await cloud.get('bq_query_read').handler({ project_id: 'my-project-123', query: 'SELECT 1', max_rows: 300 }, ctx);
  assert.ok(sizeOf(out) <= budget);
  const shown = out.rows.length;
  assert.ok(shown > 0 && shown < 300);
  assert.equal(out.next_page_token, 'pt-2');
  assert.equal(out.next_start_index, shown);
  assert.match(out.truncated.how_to_continue, new RegExp(`bq_job_get with job_id job-1 and start_index=${shown}`));

  reset(() => ({ jobComplete: true, totalRows: '5000', schema, rows: bqRows(10, shown) }));
  const next = await cloud.get('bq_job_get').handler({ project_id: 'my-project-123', job_id: 'job-1', start_index: shown, max_rows: 10 }, ctx);
  assert.equal(calls[0].query.startIndex, String(shown));
  assert.equal(next.rows[0].id, String(shown), 'the next call starts at the first row not shown');

  // A page read by token alone has no row number: it says to read it again with fewer rows.
  reset(() => ({ jobComplete: true, totalRows: '5000', pageToken: 'pt-3', schema, rows: bqRows(300) }));
  const byToken = await cloud.get('bq_job_get').handler({ project_id: 'my-project-123', job_id: 'job-1', page_token: 'pt-2', max_rows: 300 }, ctx);
  assert.equal(calls[0].query.pageToken, 'pt-2');
  assert.equal(byToken.next_start_index, undefined);
  assert.match(byToken.truncated.how_to_continue, new RegExp(`same page_token and max_rows=${byToken.rows.length}`));
});

test('gcs_read_text: a part full of quotes and newlines is shortened so its JSON fits; next_offset counts only the bytes shown', async () => {
  const budget = 1400; // room for 400 characters of text
  const cloud = await toolsOf('cloud', budget);
  const text = 'a "quoted" line\n'.repeat(60); // 960 bytes; each line is 16 bytes and 20 characters as JSON
  const bytes = Buffer.from(text);
  const read = async (offset) => {
    reset((call) => {
      if (call.query.alt !== 'media') return { size: String(bytes.length), contentType: 'text/plain', generation: '1' };
      const m = /^bytes=(\d+)-(\d+)$/.exec(call.range ?? '');
      return m ? bytes.subarray(Number(m[1]), Number(m[2]) + 1) : bytes;
    });
    statusOf = (call) => (call.range ? 206 : 200);
    return cloud.get('gcs_read_text').handler({ bucket: 'b', object: 'o.txt', read_offset: offset }, ctx);
  };
  let offset = 0;
  let joined = '';
  for (let i = 0; i < 20 && offset !== undefined; i++) {
    const part = await read(offset);
    assert.ok(JSON.stringify(part.text).length - 2 <= 400, `part ${i}: the escaped text fits the room`);
    assert.equal(part.bytes_read, Buffer.byteLength(part.text));
    joined += part.text;
    offset = part.next_offset;
  }
  assert.equal(joined, text, 'no byte skipped or repeated');
});

// ---------------------------------------------------------------------------
// Chat, Google Ads, Drive

test('chat_list_members reads at most 50 a call, as Google\'s Chat MCP server; a larger page_size is still accepted', async () => {
  const chat = await toolsOf('gchat');
  reset(() => ({ memberships: [], nextPageToken: 'n' }));
  const out = await chat.get('chat_list_members').handler({ conversation_id: 'spaces/AAA', page_size: 1000 }, ctx);
  assert.equal(calls[0].query.pageSize, '50');
  assert.equal(out.next_page_token, 'n');
  reset(() => ({ memberships: [] }));
  await chat.get('chat_list_members').handler({ conversation_id: 'spaces/AAA' }, ctx);
  assert.equal(calls[0].query.pageSize, '20', 'the default is unchanged');
});

test('ads_search: page_token reads the next page; next_page_token first; rows that do not fit are left out with the way to narrow the query', async () => {
  const budget = 3000;
  const ads = await toolsOf('gads', budget);
  const rows = Array.from({ length: 200 }, (_, i) => ({ campaign: { resourceName: `customers/1234567890/campaigns/${i}`, id: String(i), name: `Campaign ${i}` } }));
  reset(() => ({ results: rows, nextPageToken: 'next-page' }));
  const out = await ads.get('ads_search').handler({ customer_id: '1234567890', query: 'SELECT campaign.id, campaign.name FROM campaign', page_token: 'this-page' }, ctx);
  assert.equal(calls[0].body.pageToken, 'this-page');
  assert.equal(Object.keys(calls[0].body).includes('pageSize'), false, 'never a page size');
  assert.ok(sizeOf(out) <= budget);
  assert.equal(Object.keys(out)[0], 'next_page_token');
  assert.equal(out.next_page_token, 'next-page');
  assert.equal(out.rowCount, out.results.length, 'rowCount counts the rows shown');
  assert.deepEqual(out.results, rows.slice(0, out.results.length));
  assert.match(out.truncated.how_to_continue, /Google Ads has no row offset: to see the others, narrow the query/);
  assert.match(out.truncated.how_to_continue, /next_page_token continues after this whole page/);
});

test('drive_read_text: offset and next_offset read a long text in parts that join; the parts fit the result limit with their escapes; comments do not crowd out the text', async () => {
  const budget = 3000;
  const drive = await toolsOf('gdrive', budget);
  const text = 'line "one" \\ two\n'.repeat(400);
  const respondText = (call) => (call.path.endsWith('/export') ? text : { id: 'd1', name: 'Doc', mimeType: 'application/vnd.google-apps.document' });
  let offset;
  let joined = '';
  for (let i = 0; i < 50; i++) {
    reset(respondText);
    const part = await drive.get('drive_read_text').handler({ file_id: 'd1', ...(offset !== undefined ? { offset } : {}) }, ctx);
    assert.ok(sizeOf(part) <= budget, `part ${i}: ${sizeOf(part)}`);
    joined += part.text;
    assert.equal(part.truncated, part.next_offset !== undefined);
    offset = part.next_offset;
    if (offset === undefined) break;
    assert.equal(offset, joined.length);
  }
  assert.equal(joined, text);

  // max_chars still caps the text, and next_offset continues after it.
  const wide = await toolsOf('gdrive');
  reset(respondText);
  const capped = await wide.get('drive_read_text').handler({ file_id: 'd1', max_chars: 100 }, ctx);
  assert.equal(capped.text, text.slice(0, 100));
  assert.equal(capped.next_offset, 100);
  // A short text is answered as before: no offset fields.
  reset((call) => (call.path.endsWith('/export') ? 'short' : { id: 'd1', name: 'Doc', mimeType: 'application/vnd.google-apps.document' }));
  assert.deepEqual(await wide.get('drive_read_text').handler({ file_id: 'd1' }, ctx), { id: 'd1', name: 'Doc', mime_type: 'application/vnd.google-apps.document', text: 'short', text_total_chars: 5, truncated: false });

  // Many comments: the text keeps at least half of the limit.
  reset((call) => {
    if (call.path.endsWith('/export')) return text;
    if (call.path.endsWith('/comments')) return { comments: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, content: `comment ${i} `.repeat(10), author: { displayName: 'Ana' } })) };
    return { id: 'd1', name: 'Doc', mimeType: 'application/vnd.google-apps.document' };
  });
  const withComments = await drive.get('drive_read_text').handler({ file_id: 'd1', include_comments: true }, ctx);
  assert.ok(withComments.text.length > budget / 4, `${withComments.text.length} characters of text`);
});
