// The service-account key's scopes (item D1, 1.23.1): SERVICE_ACCOUNT_SCOPES (src/core/auth.ts) is the generated list
// of src/core/service-account-scopes.ts, derived by scripts/gen-service-account-scopes.mjs from config/products.json
// (serviceAccountScopes) and the scopes the products' methods declare. Throwaway keys in temp folders only; nothing is
// sent to Google (tools/list only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { SERVICE_ACCOUNT_SCOPES, grantedScopes } = await import(DIST('core/auth.js'));
const { SERVICE_ACCOUNT_KEY_SCOPES } = await import(DIST('core/service-account-scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { requirementsFor } = await import(DIST('core/scopes.js'));
const { deriveServiceAccountScopes } = await import(pathToFileURL(join(REPO, 'scripts', 'gen-service-account-scopes.mjs')).href);

const G = (s) => `https://www.googleapis.com/auth/${s}`;
const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A token folder with what `gsm setup-service-account` stores: the path of a throwaway key (fake account). */
function serviceAccountSetup() {
  const dir = tempDir('gsm-sa-scopes-');
  const tokenDir = join(dir, 'tokens');
  mkdirSync(tokenDir, { recursive: true });
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const keyFile = join(dir, 'key.json');
  writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
  writeFileSync(join(tokenDir, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-30T00:00:00Z' }));
  return { dir, tokenDir };
}

test('the generated list is up to date, and SERVICE_ACCOUNT_SCOPES is it', () => {
  const res = spawnSync(process.execPath, [join(REPO, 'scripts', 'gen-service-account-scopes.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(SERVICE_ACCOUNT_SCOPES, [...SERVICE_ACCOUNT_KEY_SCOPES]);
  assert.deepEqual([...SERVICE_ACCOUNT_SCOPES].sort(), SERVICE_ACCOUNT_SCOPES, 'sorted');
  assert.equal(new Set(SERVICE_ACCOUNT_SCOPES).size, SERVICE_ACCOUNT_SCOPES.length, 'no duplicate');
  for (const s of SERVICE_ACCOUNT_SCOPES) assert.ok(s.startsWith('https://www.googleapis.com/auth/'), s);
  // Extend, never narrow: the two scopes the key had before 1.23.1 stay.
  for (const s of [G('androidpublisher'), G('content')]) assert.ok(SERVICE_ACCOUNT_SCOPES.includes(s), s);
});

test('the list equals the derived set: every scope gplay\'s methods declare, and content for Merchant Center', async () => {
  const { perProduct, all } = await deriveServiceAccountScopes(REPO);
  assert.deepEqual(SERVICE_ACCOUNT_SCOPES, all);
  assert.deepEqual(Object.keys(perProduct).sort(), ['gmerchant', 'gplay']);
  const cfg = loadConfig({ GSM_TOKEN_DIR: tempDir('gsm-sa-req-') });
  const gplay = await requirementsFor(['gplay'], cfg, { warn: () => undefined });
  assert.deepEqual(perProduct.gplay, [...new Set(gplay.flatMap((r) => r.scopes).filter((s) => s.startsWith('https://')))].sort());
  // Every API gplay carries: Play publishing, reporting, games, enterprise, management, integrity, Chrome Web Store,
  // Wallet, Home Graph, device access.
  for (const s of ['androidenterprise', 'androidmanagement', 'androidpublisher', 'chromewebstore', 'games', 'homegraph', 'playdeveloperreporting', 'playintegrity', 'sdm.service', 'wallet_object.issuer']) {
    assert.ok(perProduct.gplay.includes(G(s)), s);
  }
  // Merchant Center keeps its one scope: Manufacturer Center, which gmerchant also carries, is not added.
  assert.deepEqual(perProduct.gmerchant, [G('content')]);
  assert.equal(SERVICE_ACCOUNT_SCOPES.includes(G('manufacturercenter')), false);
  const products = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products;
  assert.equal(products.gplay.serviceAccountScopes, 'methods');
  for (const [id, p] of Object.entries(products)) assert.equal(p.serviceAccountScopes !== undefined, p.group === 'service-account', id);
});

test('grantedScopes: the list once a key is set up, unknown (null) before', () => {
  const { tokenDir } = serviceAccountSetup();
  assert.deepEqual(grantedScopes('service-account', loadConfig({ GSM_TOKEN_DIR: tokenDir })), SERVICE_ACCOUNT_SCOPES);
  const empty = tempDir('gsm-sa-none-');
  const prev = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    assert.equal(grantedScopes('service-account', loadConfig({ GSM_TOKEN_DIR: empty })), null);
  } finally {
    if (prev !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = prev;
  }
});

/** tools/list of a bundled plugin server, with a service-account setup in a temp token folder. */
async function listWithKey(plugin) {
  const { dir, tokenDir } = serviceAccountSetup();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  Object.assign(env, { GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', APPDATA: join(dir, 'appdata') });
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(REPO, 'plugins', plugin, 'servers', `${plugin}.mjs`)], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-sa-scopes-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    return (await client.listTools()).tools.map((t) => t.name);
  } finally {
    await client.close();
  }
}

const toolMap = (plugin) => JSON.parse(readFileSync(join(REPO, 'plugins', plugin, 'tool-map.json'), 'utf8')).map((t) => ({ ...t, short: t.name.slice(`mcp__plugin_${plugin}_${plugin}__`.length) }));

test('with a key set up, gplay registers every tool whose scopes the key now holds, Android Enterprise, Games and the others included', async () => {
  const listed = new Set(await listWithKey('gplay'));
  const map = toolMap('gplay').filter((t) => t.methodId);
  const covered = map.filter((t) => !t.scopes?.length || t.scopes.some((s) => SERVICE_ACCOUNT_SCOPES.includes(s)));
  assert.ok(covered.length > 300, `${covered.length} gplay tools are covered`);
  for (const t of covered) assert.ok(listed.has(t.short), `${t.short} (${t.methodId}) registers`);
  // One tool per API that registered no tool before 1.23.1.
  for (const prefix of ['androidenterprise.', 'games.', 'gamesManagement.', 'playdeveloperreporting.', 'playintegrity.', 'chromewebstore.', 'smartdevicemanagement.']) {
    assert.ok(map.some((t) => t.methodId.startsWith(prefix) && listed.has(t.short)), `a ${prefix} tool registers`);
  }
});

test('gmerchant is unchanged: with a key set up it registers exactly the tools content covers (no Manufacturer Center)', async () => {
  const listed = new Set(await listWithKey('gmerchant'));
  const map = toolMap('gmerchant').filter((t) => t.methodId);
  for (const t of map) {
    const covered = !t.scopes?.length || t.scopes.includes(G('content'));
    assert.equal(listed.has(t.short), covered, `${t.short}: ${covered ? 'listed' : 'not listed'}`);
  }
  assert.ok(map.some((t) => t.scopes?.includes(G('manufacturercenter')) && !listed.has(t.short)), 'Manufacturer Center tools stay unregistered');
});

test('gen-servers: serviceAccountScopes only for the service-account group, as "methods" or scope URLs', () => {
  const run = (product) => {
    const root = tempDir('gsm-gen-sa-');
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    const base = { title: 'X', description: 'X.', server: { name: 'gx', curated: null }, generated: [{ api: 'gmail', version: 'v1' }] };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: { ...base, ...product } } }));
    return spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
  };
  assert.equal(run({ group: 'service-account', serviceAccountScopes: 'methods' }).status, 0);
  assert.equal(run({ group: 'service-account', serviceAccountScopes: [G('content')] }).status, 0);
  for (const [product, message] of [
    [{ group: 'service-account' }, /serviceAccountScopes must be "methods" or a non-empty list of scope URLs/],
    [{ group: 'service-account', serviceAccountScopes: 'all' }, /serviceAccountScopes must be/],
    [{ group: 'service-account', serviceAccountScopes: ['content'] }, /serviceAccountScopes must be/],
    [{ group: 'workspace-user', serviceAccountScopes: 'methods' }, /only for the service-account group/],
  ]) {
    const res = run(product);
    assert.notEqual(res.status, 0, JSON.stringify(product));
    assert.match(res.stderr, message);
  }
});
