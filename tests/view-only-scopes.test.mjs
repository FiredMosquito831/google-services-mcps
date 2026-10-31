// View-only scopes (1.32.1): scopes Google documents as view-only whose names the read-only name rule misses
// (monitoring.read, logging.read, devstorage.read_only, script.processes, script.metrics) are data in VIEW_ONLY_SCOPES, and
// the readonly profile may request them. isReadonlyScope keeps its name rule (tests/gate.test.mjs pins it). No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { VIEW_ONLY_SCOPES, isViewOnlyScope, isReadonlyScope, resolveScopes, heldBackBy, requirementsFor } = await import(DIST('core/scopes.js'));
const { postureLine } = await import(DIST('cli/posture.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const FIVE = ['devstorage.read_only', 'logging.read', 'monitoring.read', 'script.metrics', 'script.processes'].map(G);
// 1.35.1: userinfo.profile ("See your personal info"), the name profile_me returns. 1.40.1: the Calendar free/busy
// scopes ("See the availability on Google calendars you have access to", "View your availability in your calendars").
const LISTED = [...FIVE, G('userinfo.profile'), G('calendar.events.freebusy'), G('calendar.freebusy')].sort();

const dir = mkdtempSync(join(tmpdir(), 'gsm-view-only-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
const quiet = { warn: () => undefined };

test('VIEW_ONLY_SCOPES holds the listed scopes, each with a Google description that only views or sees', () => {
  assert.deepEqual(Object.keys(VIEW_ONLY_SCOPES).sort(), LISTED);
  for (const [scope, description] of Object.entries(VIEW_ONLY_SCOPES)) assert.match(description, /^(View|See) /, scope);
});

test('isViewOnlyScope: the name rule or the list; isReadonlyScope keeps its name rule', () => {
  for (const scope of [...FIVE, G('gmail.readonly'), G('cloud-platform.read-only'), G('readonly')]) assert.equal(isViewOnlyScope(scope), true, scope);
  for (const scope of FIVE) assert.equal(isReadonlyScope(scope), false, `${scope}: the name rule is unchanged`);
  for (const scope of [G('monitoring'), G('monitoring.write'), G('logging.write'), G('logging.admin'), G('devstorage.read_write'), G('devstorage.full_control'), G('script.projects'), G('cloud-platform.read'), G('drive'), 'https://mail.google.com/']) {
    assert.equal(isViewOnlyScope(scope), false, scope);
  }
});

test('gen-servers checks preferScopes against the same list', () => {
  const source = readFileSync(join(REPO, 'scripts', 'gen-servers.mjs'), 'utf8');
  const block = source.match(/const VIEW_ONLY_SCOPES = \[([^\]]*)\]/);
  assert.ok(block, 'scripts/gen-servers.mjs has its VIEW_ONLY_SCOPES list');
  assert.deepEqual([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), LISTED);
});

test('resolveScopes: readonly may take a view-only scope; readwrite still prefers the write scope on a tie', () => {
  const reqs = [
    { tool: 'p/read-metrics', kind: 'read', scopes: [G('monitoring.read'), G('monitoring')] },
    { tool: 'p/write-metrics', kind: 'write', scopes: [G('monitoring')] },
  ];
  const readonly = resolveScopes(reqs, 'readonly');
  assert.deepEqual(readonly.scopes, [G('monitoring.read')]);
  assert.deepEqual(readonly.covered, ['p/read-metrics']);
  // readwrite: monitoring covers both tools, so it is the one scope.
  assert.deepEqual(resolveScopes(reqs, 'readwrite').scopes, [G('monitoring')]);
  // A tie between a view-only and a write scope: readwrite takes the write scope, as for a .readonly scope.
  const tie = [{ tool: 'p/read', kind: 'read', scopes: [G('monitoring.read'), G('monitoring.write')] }];
  assert.deepEqual(resolveScopes(tie, 'readwrite').scopes, [G('monitoring.write')]);
  // A read tool that lists only write scopes stays out of readonly, as before.
  assert.deepEqual(resolveScopes([{ tool: 'p/r', kind: 'read', scopes: [G('monitoring')] }], 'readonly').scopes, []);
});

test('heldBackBy counts a view-only scope as one the readonly profile may use', () => {
  const reqs = [{ tool: 'p/r', kind: 'read', scopes: [G('script.processes')], optional: 'part' }];
  const held = heldBackBy(reqs, 'readonly', [], []);
  assert.deepEqual(held.optional, { part: { tools: ['p/r'], scopes: [G('script.processes')] } });
});

test('the posture line counts view-only scopes as read-only', () => {
  assert.match(postureLine([G('monitoring.read'), G('cloud-platform.read-only')], {}), /read-only only: yes/);
  assert.match(postureLine([G('monitoring')], {}), /read-only only: no/);
});

test('real data: readonly takes monitoring.read for gcloud and script.processes and script.metrics for gapps', async () => {
  const gcloud = await requirementsFor(['gcloud'], cfg, { ...quiet, toolset: 'google' });
  const g = resolveScopes(gcloud, 'readonly');
  assert.ok(g.scopes.includes(G('monitoring.read')));
  for (const tool of ['monitoring_query_promql', 'monitoring_dashboards_list', 'monitoring_dashboard_get', 'monitor_projects_time_series_list', 'monitor_projects_alert_policies_list']) {
    assert.ok(g.covered.includes(`gcloud/${tool}`), tool);
  }
  const gapps = await requirementsFor(['gapps'], cfg, quiet);
  const a = resolveScopes(gapps, 'readonly');
  assert.deepEqual(a.scopes, [G('script.deployments.readonly'), G('script.metrics'), G('script.processes'), G('script.projects.readonly')]);
  for (const tool of ['appsscript_processes_list', 'appsscript_processes_list_script_proces', 'appsscript_projects_get_metrics']) assert.ok(a.covered.includes(`gapps/${tool}`), tool);
});

test('every readonly resolution, for every server and toolset, asks only for view-only scopes', async () => {
  for (const spec of loadRegistry(DIST('core/registry.js')).servers) {
    if (spec.group === 'apikey') continue;
    for (const toolset of ['all', 'google', 'curated']) {
      const reqs = await requirementsFor([spec.name], cfg, { ...quiet, ...(toolset !== 'all' ? { toolset } : {}) });
      for (const scope of resolveScopes(reqs, 'readonly').scopes) assert.ok(isViewOnlyScope(scope), `${spec.name} ${toolset}: ${scope}`);
    }
  }
});
