// Q1 of 2026-10-31 (owner decision, spec 2026-10-30-adversarial-review.md): credential words are whole words of a
// method name. The old rule was one regex over the whole name, /token|credential|secret|password|authoriz|key/i, so
// "Keyword" counted as "key" and LLM token counting counted as a credential. The rule now splits the name at camelCase
// boundaries, digits and separators and tests whole words, with "authoriz" kept as a prefix (authorization, authorize).
//
// This file pins three things: the split and the words; that every method whose name holds a credential word as a
// whole word still asks (a non-GET method with one is a write); and that the change moves no catalog method's kind,
// every version included, because the methods it stops matching are writes for another reason (the POST/PATCH
// default) or were already reads. Both classifiers are checked, as the built plugin bundles use the copy.
// Run `npx tsc -p tsconfig.json` first (tests import dist/). No network call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const {
  classifyMethod,
  methodWords,
  hasCredentialWord,
  overrideKind,
  READ_POST_EXACT,
  READ_POST_PREFIXES,
  DESTRUCTIVE_NAMES,
} = await import(pathToFileURL(join(ROOT, 'dist', 'core', 'discovery', 'methods.js')).href);
const { fallbackClassify } = await import(pathToFileURL(join(ROOT, 'dist', 'cli', 'method-kinds.js')).href);
const { loadKindOverrides } = await import(pathToFileURL(join(ROOT, 'dist', 'cli', 'catalog.js')).href);

const catalog = readJson('data', 'catalog.json');
const overrides = loadKindOverrides(join(ROOT, 'data', 'catalog.json'));
const nameOf = (id) => id.slice(id.lastIndexOf('.') + 1);

/** The rule as it was before 1.41.3, to prove the change moved nothing. */
const OLD_CREDENTIAL_NAME = /token|credential|secret|password|authoriz|key/i;
const normalizeName = (s) => s.replace(/[-_]/g, '').toLowerCase();
const DESTRUCTIVE_SET = new Set(DESTRUCTIVE_NAMES.map(normalizeName));

/** classifyMethod before 1.41.3: the same rules, with the credential test replaced by the old regex. */
function classifyBefore(httpMethod, methodName, fullId) {
  const override = overrideKind(overrides, fullId);
  if (override) return override;
  const http = httpMethod.toUpperCase();
  if (http === 'DELETE') return 'destructive';
  if (DESTRUCTIVE_SET.has(normalizeName(methodName))) return 'destructive';
  if (http !== 'GET' && OLD_CREDENTIAL_NAME.test(methodName)) return 'write';
  if (http === 'GET') return 'read';
  if (http === 'POST') {
    if (READ_POST_EXACT.includes(methodName)) return 'read';
    if (READ_POST_PREFIXES.some((prefix) => methodName.startsWith(prefix))) return 'read';
  }
  return 'write';
}

test('methodWords splits a method name at camelCase boundaries, digits and separators', () => {
  assert.deepEqual(methodWords('generateKeywordIdeas'), ['generate', 'keyword', 'ideas']);
  assert.deepEqual(methodWords('countTokens'), ['count', 'tokens']);
  assert.deepEqual(methodWords('countMessageTokens'), ['count', 'message', 'tokens']);
  assert.deepEqual(methodWords('getKeyString'), ['get', 'key', 'string']);
  assert.deepEqual(methodWords('fetchAccessToken'), ['fetch', 'access', 'token']);
  assert.deepEqual(methodWords('getSyncAuthorization'), ['get', 'sync', 'authorization']);
  assert.deepEqual(methodWords('move-to-trash'), ['move', 'to', 'trash']);
  assert.deepEqual(methodWords('updateAutokeyConfig'), ['update', 'autokey', 'config']);
  assert.deepEqual(methodWords('insert_v2'), ['insert', 'v2']);
  assert.deepEqual(methodWords('URLKey'), ['url', 'key']);
  assert.deepEqual(methodWords(''), []);
});

test('a credential word is a whole word: Keyword is not a key and Tokens is not a token', () => {
  for (const name of ['fetchAccessToken', 'getKeyString', 'getSyncAuthorization', 'createKey', 'deleteSecret', 'insertCredential']) {
    assert.equal(hasCredentialWord(name), true, name);
  }
  for (const name of [
    'generateKeywordIdeas',
    'generateKeywordHistoricalMetrics',
    'suggestKeywordThemes',
    'generateKeywordForecastMetrics',
    'countTokens',
    'computeTokens',
    'countMessageTokens',
    'countTextTokens',
    'updateAutokeyConfig',
    'injectCredentials',
    'resetVcenterCredentials',
    'pushCredentials',
    'reauthorize',
    'tokeninfo',
    // Plurals are not the singular word: a list of secrets or of keys returns no credential value. The catalog has
    // no plural-named method whose kind this would change; the rule stops at the singular on purpose.
    'listPasswords',
    'listSecrets',
    'getPublicKeys',
  ]) {
    assert.equal(hasCredentialWord(name), false, name);
  }
  // The two rules differ only there: a word that merely contains a credential word is not one.
  assert.equal(OLD_CREDENTIAL_NAME.test('generateKeywordIdeas'), true);
  assert.equal(OLD_CREDENTIAL_NAME.test('countTokens'), true);
});

test('every method whose name holds a credential word as a whole word still asks, in both classifiers', () => {
  let checked = 0;
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      const name = nameOf(id);
      if (verb.toUpperCase() === 'GET' || !hasCredentialWord(name)) continue;
      checked += 1;
      // A write, or a per-call dynamic rule (which asks unless it can decide the call is a read), never a read.
      assert.notEqual(classifyMethod(verb, name, id, overrides), 'read', `${id} ${api.version}: classifyMethod`);
      assert.notEqual(fallbackClassify(verb, name, id, overrides), 'read', `${id} ${api.version}: the plugin copy`);
    }
  }
  assert.ok(checked > 0, 'the catalog has credential-word methods to check');
});

test('the whole-word rule moves no catalog method kind, every API version included', () => {
  let checked = 0;
  let seenByOldOnly = 0;
  for (const api of catalog.apis) {
    for (const [id, verb] of api.methods) {
      const name = nameOf(id);
      const after = classifyMethod(verb, name, id, overrides);
      assert.equal(after, classifyBefore(verb, name, id), `${id} ${api.version}: the kind`);
      assert.equal(fallbackClassify(verb, name, id, overrides), after, `${id} ${api.version}: the two classifiers agree`);
      checked += 1;
      if (verb.toUpperCase() !== 'GET' && OLD_CREDENTIAL_NAME.test(name) && !hasCredentialWord(name)) seenByOldOnly += 1;
    }
  }
  assert.equal(checked, catalog.apis.reduce((n, a) => n + a.methods.length, 0));
  // The methods the old regex caught and the words rule does not: 16 Vertex AI countTokens/computeTokens bindings,
  // the Ads and Search Ads 360 keyword methods, Identity Toolkit getPublicKeys, and a few others. Each keeps its kind.
  assert.ok(seenByOldOnly > 0, 'the old regex matched names the words rule does not');
});

test('the four methods the owner named are no longer forced by the credential rule', () => {
  // They stay writes today because a POST is a write unless a read rule names it; this pins the rule change only.
  const named = [
    'googleads.customers.generateKeywordIdeas',
    'googleads.customers.generateKeywordHistoricalMetrics',
    'googleads.customers.suggestKeywordThemes',
    'aiplatform.projects.locations.publishers.models.countTokens',
  ];
  const found = new Set();
  for (const api of catalog.apis) {
    for (const [id] of api.methods) {
      if (!named.includes(id)) continue;
      found.add(id);
      assert.equal(hasCredentialWord(nameOf(id)), false, `${id}: not a credential word`);
    }
  }
  assert.deepEqual([...found].sort(), [...named].sort());
});
