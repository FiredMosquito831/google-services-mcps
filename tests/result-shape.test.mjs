// Result shaping (1.28.0): every tool result is compact JSON within the budget (GSM_MAX_RESULT_CHARS, default 25,000).
// Paging and count fields come first and are never cut; a longer result keeps whole leading items (or the start of a
// long string) and says in a truncated object what was left out and how to read on. The result is always valid JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIST = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const shape = await import(DIST('core/result-shape.js'));
const { shapeResult, fitItems, fitText, pageSizeArgOf, PAGING_KEYS, DEFAULT_MAX_RESULT_CHARS, base64Part, base64PartBytes } = shape;
const { asJson } = await import(DIST('core/tools.js'));
const { loadConfig } = await import(DIST('core/config.js'));

/** A deterministic random source, so a failure can be repeated. */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

const driveList = (n, token = 'TOKEN-abc') => ({
  kind: 'drive#fileList',
  files: Array.from({ length: n }, (_, i) => ({ kind: 'drive#file', id: `file-${i}`.padEnd(33, 'x'), name: `Report number ${i}.pdf`, mimeType: 'application/pdf' })),
  ...(token ? { nextPageToken: token } : {}),
  incompleteSearch: false,
});

test('the default budget is 25,000 characters; GSM_MAX_RESULT_CHARS overrides it; a bad value keeps the default', () => {
  assert.equal(DEFAULT_MAX_RESULT_CHARS, 25_000);
  assert.equal(loadConfig({}).maxResultChars, 25_000);
  assert.equal(loadConfig({ GSM_MAX_RESULT_CHARS: '50000' }).maxResultChars, 50_000);
  assert.equal(loadConfig({ GSM_MAX_RESULT_CHARS: 'lots' }).maxResultChars, 25_000);
  assert.equal(loadConfig({ GSM_MAX_RESULT_CHARS: '-5' }).maxResultChars, 25_000);
});

test('within the budget: compact JSON with the same content; paging and count fields first, at the top and one level down', () => {
  const data = { kind: 'drive#fileList', files: [{ id: 'a', name: 'n' }], nextPageToken: 'T', incompleteSearch: false };
  const text = shapeResult(data, 25_000);
  assert.equal(text, '{"nextPageToken":"T","incompleteSearch":false,"kind":"drive#fileList","files":[{"id":"a","name":"n"}]}');
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(data, null, 2)), 'the same content as the pretty-printed text');
  assert.equal(text.includes('\n'), false, 'no indentation or newlines');

  // The gateway answers { status, data }: the paging fields of data come first inside data.
  const gateway = shapeResult({ status: 200, data: { items: [1, 2], nextPageToken: 'N', totalItems: 2 } }, 25_000);
  assert.equal(gateway, '{"status":200,"data":{"nextPageToken":"N","totalItems":2,"items":[1,2]}}');
  // Deeper objects keep their order (an item's own fields are not moved).
  assert.equal(shapeResult({ a: { b: { x: 1, count: 2 } } }, 25_000), '{"a":{"b":{"x":1,"count":2}}}');
  // Already first, or none: the same text as JSON.stringify.
  for (const value of [{ nextPageToken: 'x', a: 1 }, { a: [1, { b: 2 }] }, [1, 2, 3], 'text', 42, null, true]) {
    assert.equal(shapeResult(value, 25_000), JSON.stringify(value));
  }
  assert.equal(shapeResult(undefined, 25_000), 'null');
  // Undefined fields are dropped as JSON.stringify drops them.
  assert.equal(shapeResult({ a: undefined, b: 1 }, 25_000), '{"b":1}');
});

test('asJson: one text part, the shaped JSON', () => {
  const res = asJson({ a: 1, next_page_token: 'p' }, 25_000);
  assert.deepEqual(res, { content: [{ type: 'text', text: '{"next_page_token":"p","a":1}' }] });
});

test('over the budget: the leading whole items of the largest array, the paging fields kept, and a truncated object', () => {
  const data = driveList(1000);
  const text = shapeResult(data, 25_000, { pageSizeArg: 'pageSize' });
  assert.ok(text.length <= 25_000, `${text.length} characters`);
  const out = JSON.parse(text);
  assert.deepEqual(Object.keys(out), ['nextPageToken', 'incompleteSearch', 'truncated', 'kind', 'files']);
  assert.equal(out.nextPageToken, 'TOKEN-abc');
  assert.equal(out.incompleteSearch, false);
  assert.equal(out.kind, 'drive#fileList');
  // Whole items, in order, from the start.
  assert.ok(out.files.length > 100 && out.files.length < 1000, `${out.files.length} files`);
  assert.deepEqual(out.files, data.files.slice(0, out.files.length));
  const t = out.truncated;
  assert.equal(t.limit_chars, 25_000);
  assert.equal(t.shown, out.files.length);
  assert.equal(t.omitted, 1000 - out.files.length);
  assert.equal(t.items, 'files');
  // The token skips the omitted items, and the call that shows them names the tool's page-size argument.
  assert.match(t.how_to_continue, new RegExp(`nextPageToken continues after all 1000, so it would skip the other ${t.omitted}`));
  assert.match(t.how_to_continue, new RegExp(`repeat this call with pageSize=${t.shown} and the same page token as this call`));
  // Close to the budget: the cut keeps as many items as fit.
  assert.ok(text.length > 25_000 - 600, `${text.length} characters is far under the budget`);
});

test('a cut array without a page token says to narrow the call; a budget from GSM_MAX_RESULT_CHARS applies the same way', () => {
  const data = driveList(400, null);
  const text = shapeResult(data, 8_000, { pageSizeArg: 'max_results' });
  assert.ok(text.length <= 8_000);
  const out = JSON.parse(text);
  assert.equal(out.truncated.limit_chars, 8_000);
  assert.match(out.truncated.how_to_continue, /To see the others, narrow the call: a filter, fewer fields, or a smaller max_results with paging\. GSM_MAX_RESULT_CHARS raises the limit\./);
  assert.deepEqual(out.files, data.files.slice(0, out.truncated.shown));
});

test('the gateway: the array under data is cut, and data keeps its page token first', () => {
  const data = { status: 200, data: driveList(1000, 'NEXT') };
  const text = shapeResult(data, 25_000);
  assert.ok(text.length <= 25_000);
  const out = JSON.parse(text);
  assert.deepEqual(Object.keys(out), ['truncated', 'status', 'data']);
  assert.equal(out.status, 200);
  assert.equal(Object.keys(out.data)[0], 'nextPageToken');
  assert.equal(out.data.nextPageToken, 'NEXT');
  assert.equal(out.truncated.items, 'data.files');
  assert.match(out.truncated.how_to_continue, /repeat this call with a page size of \d+ and the same page token/);
});

test('nested arrays: the largest goes first, at whole items; an array is never cut below one item', () => {
  const thread = { threads: [{ id: 't1', messages: Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, body: `word ${i} `.repeat(80) })) }] };
  const text = shapeResult(thread, 25_000);
  assert.ok(text.length <= 25_000);
  const out = JSON.parse(text);
  assert.equal(out.threads.length, 1, 'the one-item outer array is kept');
  assert.equal(out.truncated.items, 'threads[0].messages');
  assert.deepEqual(out.threads[0].messages, thread.threads[0].messages.slice(0, out.truncated.shown));
});

test('no array to cut: a long string keeps its start and a marker; short strings, ids and tokens stay whole', () => {
  const doc = { id: 'f1', name: 'Notes', text: 'line "quoted" \\ end\n'.repeat(3000), text_total_chars: 60_000, truncated: false };
  const text = shapeResult(doc, 25_000);
  assert.ok(text.length <= 25_000, `${text.length}`);
  const out = JSON.parse(text);
  assert.equal(out.id, 'f1');
  assert.equal(out.name, 'Notes');
  assert.equal(out.text_total_chars, 60_000);
  const t = out.truncated;
  assert.equal(t.field, 'text');
  assert.equal(t.earlier, false, "the tool's own truncated flag is kept inside the note");
  assert.equal(t.shown_chars + t.omitted_chars, doc.text.length);
  assert.ok(out.text.startsWith(doc.text.slice(0, t.shown_chars)));
  assert.equal(out.text, `${doc.text.slice(0, t.shown_chars)} [... ${t.omitted_chars} more characters cut]`);
  assert.match(t.how_to_continue, /The field text was cut after \d+ of its 60000 characters/);
});

test('a long page token is never cut, even when it is the longest string', () => {
  const token = 'T'.repeat(5_000);
  const data = { nextPageToken: token, summary: 'S'.repeat(4_000), notes: 'N'.repeat(3_000) };
  const text = shapeResult(data, 6_000);
  assert.ok(text.length <= 6_000, `${text.length}`);
  const out = JSON.parse(text);
  assert.equal(out.nextPageToken, token);
  assert.equal(Object.keys(out)[0], 'nextPageToken');
  assert.match(out.summary, /\[\.\.\. \d+ more characters cut\]$/);
});

test('a top-level array or string over the budget is wrapped, with the truncated object', () => {
  const list = Array.from({ length: 3000 }, (_, i) => ({ method: `api.method${i}`, tool: `tool_${i}`, description: 'A method description' }));
  const text = shapeResult(list, 25_000);
  assert.ok(text.length <= 25_000);
  const out = JSON.parse(text);
  assert.deepEqual(Object.keys(out), ['truncated', 'items']);
  assert.equal(out.truncated.items, 'items');
  assert.deepEqual(out.items, list.slice(0, out.truncated.shown));

  const str = shapeResult('x'.repeat(40_000), 25_000);
  assert.ok(str.length <= 25_000);
  const s = JSON.parse(str);
  assert.deepEqual(Object.keys(s), ['truncated', 'text']);
  assert.equal(s.truncated.field, 'text');
});

test('no array and no long string: a map-like object keeps its leading fields', () => {
  const audits = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`audit-${i}`, { id: `audit-${i}`, title: 'An audit title', score: 0.5 }]));
  const text = shapeResult({ version: '12', lighthouseResult: { audits } }, 25_000);
  assert.ok(text.length <= 25_000);
  const out = JSON.parse(text);
  assert.equal(out.version, '12');
  assert.equal(out.truncated.object, 'lighthouseResult.audits');
  const kept = Object.keys(out.lighthouseResult.audits);
  assert.deepEqual(kept, Object.keys(audits).slice(0, kept.length));
  assert.equal(out.truncated.shown_keys, kept.length);
  assert.equal(out.truncated.omitted_keys, 400 - kept.length);
});

test('a large document of many small fields (a Discovery document) is cut in a few steps, at its bulk', () => {
  const schemas = Object.fromEntries(
    Array.from({ length: 3000 }, (_, i) => [`Schema${i}`, { id: `Schema${i}`, type: 'object', description: 'A schema description of moderate length. '.repeat(5), properties: { a: { type: 'string', description: 'The a field.' }, b: { type: 'integer' } } }]),
  );
  const doc = { kind: 'discovery#restDescription', name: 'example', version: 'v1', schemas };
  const t0 = performance.now();
  const text = shapeResult(doc, 25_000);
  const ms = performance.now() - t0;
  assert.ok(ms < 3_000, `${ms} ms`);
  assert.ok(text.length <= 25_000);
  const out = JSON.parse(text);
  assert.equal(out.name, 'example');
  assert.equal(out.truncated.object, 'schemas');
  const kept = Object.keys(out.schemas);
  assert.deepEqual(kept, Object.keys(schemas).slice(0, kept.length));
  assert.deepEqual(out.schemas.Schema0, schemas.Schema0, 'kept fields are whole');
});

test('several cuts are listed; the first is the main one', () => {
  const data = { a: Array.from({ length: 500 }, (_, i) => `item ${i} `.repeat(5)), b: Array.from({ length: 500 }, (_, i) => `entry ${i} `.repeat(5)) };
  const out = JSON.parse(shapeResult(data, 10_000));
  assert.ok(out.truncated.items);
  assert.equal(out.truncated.other_cuts.length, 1);
  const cut = new Set([out.truncated.items, out.truncated.other_cuts[0].items]);
  assert.deepEqual(cut, new Set(['a', 'b']));
});

test('a budget too small for the truncated object still gives valid JSON', () => {
  for (const budget of [10, 200, 500, 900]) {
    const text = shapeResult(driveList(50), budget);
    const out = JSON.parse(text);
    assert.ok(out.truncated, `budget ${budget}`);
    assert.equal(out.truncated.limit_chars, budget);
  }
});

test('random results: always valid JSON, within the budget, the paging field unchanged, a truncated object when cut', () => {
  const random = rng(7);
  const word = () => ['alpha', 'beta "q"', 'gamma\n', 'δέλτα', 'emoji 😀', 'back\\slash'][Math.floor(random() * 6)];
  function value(depth) {
    const r = random();
    if (depth > 3 || r < 0.3) return r < 0.1 ? Math.floor(random() * 1e6) : r < 0.15 ? null : word().repeat(1 + Math.floor(random() * (r < 0.2 ? 200 : 5)));
    if (r < 0.65) return Array.from({ length: Math.floor(random() * 40) }, () => value(depth + 1));
    const obj = {};
    for (let i = 0; i < 1 + Math.floor(random() * 8); i++) obj[`k${i}`] = value(depth + 1);
    if (random() < 0.3) obj.nextPageToken = `tok-${Math.floor(random() * 1e9)}`;
    return obj;
  }
  let shaped = 0;
  for (let i = 0; i < 300; i++) {
    const data = { results: value(0), meta: value(1), next_page_token: `p${i}` };
    const budget = 1_500 + Math.floor(random() * 20_000);
    const text = shapeResult(data, budget);
    assert.ok(text.length <= budget, `case ${i}: ${text.length} > ${budget}`);
    const out = JSON.parse(text);
    if (JSON.stringify(data).length <= budget) {
      assert.deepEqual(out, JSON.parse(JSON.stringify(data)), `case ${i}: content kept`);
      continue;
    }
    shaped += 1;
    assert.equal(out.next_page_token, `p${i}`, `case ${i}: the paging field`);
    assert.ok(out.truncated, `case ${i}: a truncated object`);
    assert.equal(typeof out.truncated.how_to_continue, 'string');
  }
  assert.ok(shaped > 50, `${shaped} of 300 random cases were over the budget`);
});

test('fitItems: an answer that fits is returned as it is; a longer one keeps the rows that fit and gets the continuation', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ query: `search query number ${i}`, clicks: i, impressions: i * 10, ctr: 0.1, position: 3.2 }));
  const small = { rows: rows.slice(0, 3), row_count: 3 };
  assert.equal(fitItems(small, 'rows', 25_000, () => ({ how_to_continue: 'x' })), small);

  const answer = { responseAggregationType: 'byProperty', rows, row_count: 1000 };
  const fitted = fitItems(answer, 'rows', 25_000, (shown) => ({ fields: { next_start_row: 500 + shown }, how_to_continue: `Call again with start_row=${500 + shown}.` }));
  const text = JSON.stringify(fitted);
  assert.ok(text.length <= 25_000, `${text.length}`);
  assert.deepEqual(Object.keys(fitted), ['row_count', 'next_start_row', 'truncated', 'responseAggregationType', 'rows']);
  const shown = fitted.rows.length;
  assert.ok(shown > 100 && shown < 1000);
  assert.deepEqual(fitted.rows, rows.slice(0, shown));
  assert.equal(fitted.next_start_row, 500 + shown);
  assert.deepEqual(fitted.truncated, { limit_chars: 25_000, shown, omitted: 1000 - shown, items: 'rows', how_to_continue: `Call again with start_row=${500 + shown}.` });
  // The runtime has nothing more to cut.
  assert.equal(shapeResult(fitted, 25_000), JSON.stringify(fitted));
});

test('fitText: the longest start whose JSON string fits, counting escapes, never half of a surrogate pair', () => {
  assert.equal(fitText('abcdef', 4, 100), 'abcd');
  assert.equal(fitText('abcdef', 100, 100), 'abcdef');
  const quoted = '"\n'.repeat(100); // each pair is 4 characters as JSON
  const fit = fitText(quoted, 1000, 42);
  assert.ok(JSON.stringify(fit).length <= 42);
  assert.equal(fit, quoted.slice(0, 20));
  const emoji = '😀'.repeat(10);
  const half = fitText(emoji, 1000, 7);
  assert.equal(half, '😀', 'whole pairs only');
});

test('base64 parts: a multiple of 3 bytes, so the parts join into the base64 of the whole file', () => {
  assert.equal(base64PartBytes(25_000), 18_000);
  assert.equal(base64PartBytes(2_000), 750);
  for (const limit of [2_001, 2_002, 2_003, 25_555, 31_337]) {
    const part = base64PartBytes(limit);
    assert.equal(part % 3, 0, `${limit}: a multiple of 3`);
    assert.ok((part / 3) * 4 <= limit - 1000, `${limit}: the base64 of a part fits`);
  }
  const bytes = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 256));
  const part = base64PartBytes(2_000);
  let offset = 0;
  let joined = '';
  for (let i = 0; i < 10 && offset !== undefined; i++) {
    const p = base64Part(bytes, offset, part);
    assert.ok(p.data_base64.length + 200 <= 2_000);
    joined += p.data_base64;
    offset = p.next_offset;
  }
  assert.equal(joined, bytes.toString('base64'));
  assert.throws(() => base64Part(bytes, 2001, part), /past the end of the file \(2000 bytes\)/);
});

test('pageSizeArgOf: the page-size argument of a tool, if it has one', () => {
  assert.equal(pageSizeArgOf(['q', 'max_results', 'page_token']), 'max_results');
  assert.equal(pageSizeArgOf(['parent', 'pageSize', 'pageToken']), 'pageSize');
  assert.equal(pageSizeArgOf(['userKey', 'maxResults']), 'maxResults');
  assert.equal(pageSizeArgOf(['id']), undefined);
  for (const key of ['nextPageToken', 'next_page_token', 'next_offset', 'next_start_row', 'row_count', 'rowCount', 'totalSize', 'resultSizeEstimate']) {
    assert.ok(PAGING_KEYS.has(key), key);
  }
});
