// A product's preferred scopes (scopePolicy.prefer, 1.33.0): per profile, scopes a login of the product asks for before
// the greedy rule, each one when a tool the profile targets accepts it, even when an earlier one covers that tool. Meet's
// readwrite and full take meetings.space.readonly (every space the user can see) beside meetings.space.created (the spaces
// the app made); Classroom's readonly takes the coursework scopes of the classes you teach beside your own. Every other
// product resolves exactly as before. No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { resolveScopes, requirementsFor, policyFields } = await import(DIST('core/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const dir = mkdtempSync(join(tmpdir(), 'gsm-policy-prefer-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
const quiet = { warn: () => undefined };
const without = (reqs) => reqs.map(({ policyPrefer: _p, ...rest }) => rest);
const reqsOf = (name, toolset) => requirementsFor([name], cfg, { ...quiet, ...(toolset && toolset !== 'all' ? { toolset } : {}) });

test('policyFields carries the preference only when the product gives one', () => {
  const prefer = { readwrite: [G('a.readonly')] };
  assert.deepEqual(policyFields({ prefer }, 'x'), { policyPrefer: prefer });
  assert.deepEqual(policyFields({ prefer: {} }, 'x'), {});
  assert.deepEqual(policyFields({ onlyIn: { [G('b')]: ['full'] } }, 'x'), { onlyIn: { [G('b')]: ['full'] } });
  assert.deepEqual(policyFields(undefined, 'x'), {});
});

test('resolveScopes: a preferred scope is asked for beside a scope that already covers its tools; the greedy rule does the rest', () => {
  const prefer = { readwrite: [G('space.readonly')], full: [G('space.readonly')], readonly: [G('work.students.readonly'), G('work.me.readonly')] };
  const reqs = [
    { tool: 'p/get', kind: 'read', scopes: [G('space.created'), G('space.readonly')], policyPrefer: prefer },
    { tool: 'p/create', kind: 'write', scopes: [G('space.created')], policyPrefer: prefer },
    { tool: 'p/work', kind: 'read', scopes: [G('work.me.readonly'), G('work.students.readonly')], policyPrefer: prefer },
  ];
  assert.deepEqual(resolveScopes(without(reqs), 'readwrite').scopes, [G('space.created'), G('work.me.readonly')]);
  assert.deepEqual(resolveScopes(reqs, 'readwrite').scopes, [G('space.created'), G('space.readonly'), G('work.me.readonly')]);
  assert.deepEqual(resolveScopes(reqs, 'full').scopes, [G('space.created'), G('space.readonly'), G('work.me.readonly')]);
  // readonly: both coursework scopes, though the first already covers the tool.
  assert.deepEqual(resolveScopes(without(reqs), 'readonly').scopes, [G('space.readonly'), G('work.me.readonly')]);
  assert.deepEqual(resolveScopes(reqs, 'readonly').scopes, [G('space.readonly'), G('work.me.readonly'), G('work.students.readonly')]);
  // A preferred scope no target of the profile accepts is not asked for (here: a write scope under readonly).
  const writeOnly = [{ tool: 'p/create', kind: 'write', scopes: [G('space.created')], policyPrefer: { readonly: [G('space.created')] } }];
  assert.deepEqual(resolveScopes(writeOnly, 'readonly').scopes, []);
  // Nor a scope the readonly profile may not request, even when a read target accepts it.
  const notViewOnly = [{ tool: 'p/get', kind: 'read', scopes: [G('space.created'), G('space.readonly')], policyPrefer: { readonly: [G('space.created')] } }];
  assert.deepEqual(resolveScopes(notViewOnly, 'readonly').scopes, [G('space.readonly')]);
  // Nor one only another product's tools accept: b/y has no preference, so the greedy rule picks its shorter scope.
  const other = [
    { tool: 'a/x', kind: 'read', scopes: [G('a.readonly')], policyPrefer: { readonly: [G('long.preferred.readonly')] } },
    { tool: 'b/y', kind: 'read', scopes: [G('short.readonly'), G('long.preferred.readonly')] },
  ];
  assert.deepEqual(resolveScopes(other, 'readonly').scopes, [G('a.readonly'), G('short.readonly')]);
});

test('gmeet: readwrite and full ask for meetings.space.readonly beside meetings.space.created, in every toolset; readonly is unchanged', async () => {
  for (const toolset of ['all', 'google', 'curated']) {
    const reqs = await reqsOf('gmeet', toolset);
    assert.deepEqual(resolveScopes(reqs, 'readonly').scopes, [G('meetings.space.readonly')], toolset);
    for (const profile of ['readwrite', 'full']) {
      assert.deepEqual(resolveScopes(reqs, profile).scopes, [G('meetings.space.created'), G('meetings.space.readonly')], `${toolset} ${profile}`);
      assert.deepEqual(resolveScopes(without(reqs), profile).scopes, [G('meetings.space.created')], `${toolset} ${profile} as before`);
    }
  }
});

test('gclassroom: readonly asks for the coursework scopes of taught classes beside your own, in every toolset', async () => {
  const C = (s) => G(`classroom.${s}`);
  for (const toolset of ['all', 'google', 'curated']) {
    const reqs = await reqsOf('gclassroom', toolset);
    const scopes = resolveScopes(reqs, 'readonly').scopes;
    assert.ok(scopes.includes(C('coursework.students.readonly')), toolset);
    assert.ok(scopes.includes(C('coursework.me.readonly')), toolset);
    const before = resolveScopes(without(reqs), 'readonly').scopes;
    assert.deepEqual(scopes, [...before, C('coursework.students.readonly')].sort(), `${toolset}: one scope added, none removed`);
    for (const profile of ['readwrite', 'full']) assert.deepEqual(resolveScopes(reqs, profile).scopes, resolveScopes(without(reqs), profile).scopes, `${toolset} ${profile}`);
  }
});

test('no other product has a preference, so every other server resolves exactly as before', async () => {
  const withPrefer = [];
  for (const spec of loadRegistry(DIST('core/registry.js')).servers) {
    if (spec.scopePolicy?.prefer) withPrefer.push(spec.name);
    if (spec.group === 'apikey' || spec.scopePolicy?.prefer) continue;
    for (const toolset of ['all', 'google', 'curated']) {
      const reqs = await reqsOf(spec.name, toolset);
      assert.equal(reqs.some((r) => r.policyPrefer !== undefined), false, `${spec.name} ${toolset}`);
    }
  }
  // gcontacts since 1.35.1 (userinfo.profile for readwrite and full; tests/profile-name.test.mjs).
  assert.deepEqual(withPrefer.sort(), ['gclassroom', 'gcontacts', 'gmeet']);
});
