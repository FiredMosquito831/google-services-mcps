// The gsearch parity tool (2.13.0): psi_run. The generated pagespeed_pagespeedapi_runpagespeed returned Google's whole
// Lighthouse report, and the category scores sit after the 150 audits in it, so the runtime cut them off (adversarial
// review of gsearch, F1). psi_run leads with the scores, the field data, the six lab metrics and the worst
// opportunities. fetch is stubbed through the API key client's test seam, so nothing leaves the machine, and the key is
// a fake value.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { setFetchForTests } = await import(DIST('core/discovery/apikey-client.js'));
const search = await import(DIST('servers/gsearch.js'));

const KEY = 'AIzaFAKE-test-key-1234567890';
const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-search-parity-'));
after(() => {
  setFetchForTests(undefined);
  rmSync(tokenDir, { recursive: true, force: true });
});
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_API_KEY: KEY });
const tools = new Map(search.buildTools(cfg).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (args) => tools.get('psi_run').handler(args, ctx);

let calls = [];
setFetchForTests(async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ method: init.method, path: `${url.origin}${url.pathname}`, query: url.searchParams, params: Object.fromEntries(url.searchParams) });
  return new Response(JSON.stringify(respond()), { status: 200, headers: { 'content-type': 'application/json' } });
});
let respond = () => ({});
const reset = (body) => {
  calls = [];
  respond = () => body;
};

/** A Lighthouse report in the shape Google returns one: categories after 150 audits, as they cost the result budget. */
const REPORT = {
  id: 'https://example.com/',
  analysisUTCTimestamp: '2026-11-01T10:00:00Z',
  loadingExperience: {
    overall_category: 'FAST',
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1234, category: 'FAST' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 3, category: 'FAST' },
      INTERACTION_TO_NEXT_PAINT: { percentile: 120, category: 'FAST' },
    },
  },
  originLoadingExperience: { overall_category: 'AVERAGE' },
  lighthouseResult: {
    finalDisplayedUrl: 'https://example.com/',
    lighthouseVersion: '12.8.2',
    categories: {
      performance: { id: 'performance', score: 0.86 },
      accessibility: { id: 'accessibility', score: 0.955 },
      seo: { id: 'seo', score: null },
    },
    audits: {
      'first-contentful-paint': { id: 'first-contentful-paint', score: 0.9, displayValue: '1.2 s', numericValue: 1203 },
      'largest-contentful-paint': { id: 'largest-contentful-paint', score: 0.5, displayValue: '3.4 s', numericValue: 3400 },
      'cumulative-layout-shift': { id: 'cumulative-layout-shift', score: 1, displayValue: '0.001', numericValue: 0.001 },
      'uses-responsive-images': { id: 'uses-responsive-images', title: 'Properly size images', score: 0.2, displayValue: 'Potential savings of 250 KiB', details: { type: 'opportunity', overallSavingsMs: 1200, overallSavingsBytes: 256000 } },
      'render-blocking-resources': { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', score: 0.4, displayValue: 'Potential savings of 600 ms', details: { type: 'opportunity', overallSavingsMs: 600 } },
      'total-byte-weight': { id: 'total-byte-weight', title: 'Avoid enormous network payloads', score: 0.9, displayValue: 'Total size was 900 KiB', details: { type: 'opportunity', overallSavingsBytes: 1000 } },
      'unused-css-rules': { id: 'unused-css-rules', title: 'Reduce unused CSS', score: 1, details: { type: 'opportunity', overallSavingsMs: 0 } },
      'network-requests': { id: 'network-requests', title: 'Network Requests', score: null, details: { type: 'table' } },
    },
  },
};

test('psi_run: the scores, the field data, the lab metrics and the worst opportunities, in that order and nothing else', async () => {
  reset(REPORT);
  const answer = await run({ url: 'https://example.com/' });
  // One request, to the method's own path, with the URL and Google's default category, and no strategy (Google's default).
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].path, 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed');
  assert.deepEqual(calls[0].query.getAll('category'), ['performance']);
  assert.equal(calls[0].params.url, 'https://example.com/');
  assert.equal('strategy' in calls[0].params, false);
  assert.equal(calls[0].params.key, KEY, 'the key goes in the query, which is what this API documents');
  // The key never comes back in the answer.
  assert.doesNotMatch(JSON.stringify(answer), /AIzaFAKE/);
  assert.deepEqual(answer.scores, { performance: 86 });
  assert.equal(answer.strategy, 'desktop');
  assert.equal(answer.analysis_utc, '2026-11-01T10:00:00Z');
  assert.equal(answer.lighthouse_version, '12.8.2');
  assert.deepEqual(answer.categories_run, ['performance']);
  assert.deepEqual(answer.field_data, {
    overall: 'FAST',
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { p75: 1234, rating: 'FAST' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { p75: 3, rating: 'FAST' },
      INTERACTION_TO_NEXT_PAINT: { p75: 120, rating: 'FAST' },
    },
  });
  assert.deepEqual(answer.origin_field_rating, 'AVERAGE');
  // The six lab metrics keep Lighthouse's names in snake_case; only the three present are listed.
  assert.deepEqual(answer.lab_metrics, {
    first_contentful_paint: { display: '1.2 s', value: 1203, score: 90 },
    largest_contentful_paint: { display: '3.4 s', value: 3400, score: 50 },
    cumulative_layout_shift: { display: '0.001', value: 0.001, score: 100 },
  });
  // Opportunities: worst score first, a table that is not an opportunity and a passing one left out, at most five.
  assert.deepEqual(answer.opportunities, [
    { id: 'uses-responsive-images', title: 'Properly size images', score: 20, display: 'Potential savings of 250 KiB', savings_ms: 1200, savings_bytes: 256000 },
    { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', score: 40, display: 'Potential savings of 600 ms', savings_ms: 600 },
    { id: 'total-byte-weight', title: 'Avoid enormous network payloads', score: 90, display: 'Total size was 900 KiB', savings_bytes: 1000 },
  ]);
  // No raw report unless it is asked for, and the note explains the one category.
  assert.equal('raw' in answer, false);
  assert.match(answer.note, /Only the performance category ran/);
});

test('psi_run: categories, strategy and locale are sent; include_raw adds Google\'s whole report; the summary is unchanged', async () => {
  reset(REPORT);
  const answer = await run({ url: 'https://example.com/', strategy: 'mobile', categories: ['performance', 'accessibility', 'best-practices', 'seo'], locale: 'fr', top_opportunities: 1 });
  assert.equal(calls[0].params.strategy, 'mobile');
  assert.deepEqual(calls[0].query.getAll('category'), ['performance', 'accessibility', 'best-practices', 'seo']);
  assert.equal(calls[0].params.locale, 'fr');
  assert.deepEqual(answer.scores, { performance: 86, accessibility: 96, best_practices: null, seo: null });
  assert.deepEqual(answer.categories_run, ['performance', 'accessibility', 'best-practices', 'seo']);
  assert.equal(answer.opportunities.length, 1, 'top_opportunities caps the list');
  assert.equal(answer.note, undefined, 'no note when every category was named');
  assert.equal('raw' in answer, false, 'no report unless it is asked for');

  reset(REPORT);
  const plain = await run({ url: 'https://example.com/', strategy: 'mobile', categories: ['performance', 'accessibility', 'best-practices', 'seo'], locale: 'fr', top_opportunities: 1, include_raw: true });
  assert.deepEqual(plain.raw, REPORT);
  const { raw: _raw, ...summary } = plain;
  assert.deepEqual(summary, answer, 'the summary is the same with and without the report');
});

test('psi_run: no field data says so, and a Lighthouse runtime error is an error, not empty scores', async () => {
  reset({ lighthouseResult: { categories: { performance: { score: 0.5 } }, audits: {} } });
  const answer = await run({ url: 'https://example.com/' });
  assert.equal('field_data' in answer, false);
  assert.match(answer.note, /No field data/);
  assert.deepEqual(answer.scores, { performance: 50 });
  assert.deepEqual(answer.opportunities, []);

  reset({ lighthouseResult: { runtimeError: { code: 'PAGE_HUNG', message: 'The page hung after 10 seconds' } } });
  await assert.rejects(() => run({ url: 'https://example.com/' }), /PageSpeed could not analyse the page: The page hung after 10 seconds/);
});

test('psi_run: an argument outside the schema is refused before any request', async () => {
  reset(REPORT);
  await assert.rejects(() => run({ url: '' }));
  await assert.rejects(() => run({ url: 'https://example.com/', strategy: 'tablet' }));
  await assert.rejects(() => run({ url: 'https://example.com/', categories: ['speed'] }));
  assert.equal(calls.length, 0);
});

test('psi_run: the tool is a read with the method\'s scope, listed in all and in the google toolset', async () => {
  const tool = tools.get('psi_run');
  assert.equal(tool.kind, 'read');
  assert.deepEqual(tool.scopes, ['openid']);
  assert.match(tool.description, /PageSpeed Insights/);
  // The pure projections are exported: the scores are percentages, not Lighthouse's 0 to 1.
  assert.equal(search.scorePercent(0.955), 96);
  assert.equal(search.scorePercent(null), null);
  assert.equal(search.scorePercent(undefined), null);
});
