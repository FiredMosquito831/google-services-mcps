// Notes for single methods (1.35.5): config/products.json methodNotes, per generated API of a product, a note that only
// that method's tool description carries, after the API's note from config/tool-kinds.json (which every tool of the API
// carries). gsearch uses it for the 10 tools an API key cannot run: Fact Check Tools pages.* ("Requires the following
// OAuth scope: https://www.googleapis.com/auth/factchecktools") and Web Risk submissions ("Only allowlisted projects can
// use this method during Early Access.") with the operations that follow them. Nothing leaves the machine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const { loadConfig } = await import(DIST('core/config.js'));
const { discoveryToolsFor, generateDiscoveryTools, methodNoteText } = await import(DIST('core/discovery/tools.js'));

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-method-notes-'));
temps.push(tokenDir);
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true', GSM_API_KEY: 'fake-key-never-sent' });

test('methodNoteText: the API note alone as before, the method note alone, or both with the API note first', () => {
  assert.equal(methodNoteText(undefined, undefined), undefined);
  assert.equal(methodNoteText('API note.', undefined), 'API note.');
  assert.equal(methodNoteText(undefined, 'Method note.'), 'Method note.');
  assert.equal(methodNoteText('API note.', 'Method note.'), 'API note. Method note.');
});

test('gsearch: the 10 tools an API key cannot run carry their note; the other tools of the same APIs do not', async () => {
  const notes = readJson('config', 'products.json').products.gsearch.methodNotes;
  assert.deepEqual(Object.keys(notes).sort(), ['factchecktools', 'webrisk']);
  const tools = await discoveryToolsFor('gsearch', cfg);
  const noted = new Map(Object.values(notes).flatMap((entry) => Object.entries(entry.methods)));
  assert.equal(noted.size, 10);
  for (const [id, note] of noted) {
    const tool = tools.find((t) => t.methodId === id);
    assert.ok(tool, `${id} is a tool`);
    assert.ok(tool.description.includes(` Note: ${note} Method ${id}: `), `${id}: ${tool.description}`);
  }
  for (const tool of tools.filter((t) => /^(factchecktools|webrisk)\./.test(t.methodId ?? '') && !noted.has(t.methodId))) {
    assert.doesNotMatch(tool.description, /Note: /, `${tool.methodId} carries no note`);
  }
  assert.match(noted.get('factchecktools.pages.list'), /OAuth token with the factchecktools scope/);
  assert.match(noted.get('webrisk.projects.submissions.create'), /Only allowlisted projects can use this method during Early Access/);
  // Every note is in the server map the plugin reads, unchanged.
  const plugin = readJson('plugins', 'gsearch', 'servers.json').servers[0];
  assert.deepEqual(plugin.methodNotes, notes);
});

test('an API note from tool-kinds.json and a method note: the method tool carries both, the other tools the API note only', () => {
  const doc = readJson('data', 'discovery', 'webrisk.v1.json');
  const src = { apiName: 'webrisk', apiVersion: 'v1', doc, methodNotes: { 'webrisk.uris.search': 'Method note.' } };
  const kinds = { overrides: {}, notes: { webrisk: 'API note.' } };
  const { tools } = generateDiscoveryTools('gx', 'apikey', [src], kinds, cfg);
  const search = tools.find((t) => t.methodId === 'webrisk.uris.search');
  assert.match(search.description, /Note: API note\. Method note\. Method webrisk\.uris\.search: GET /);
  const other = tools.find((t) => t.methodId === 'webrisk.hashes.search');
  assert.match(other.description, /Note: API note\. Method webrisk\.hashes\.search: GET /);
  // Without method notes the descriptions are exactly what they were.
  const plain = generateDiscoveryTools('gx', 'apikey', [{ ...src, methodNotes: undefined }], kinds, cfg).tools;
  assert.deepEqual(
    plain.map((t) => t.description),
    tools.map((t) => (t.methodId === 'webrisk.uris.search' ? t.description.replace('API note. Method note.', 'API note.') : t.description)),
  );
});

test('gen-servers: methodNotes name methods of a generated API snapshot, with a source, a reason and a non-empty note', () => {
  const run = (methodNotes) => {
    const root = mkdtempSync(join(tmpdir(), 'gsm-gen-notes-'));
    temps.push(root);
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    mkdirSync(join(root, 'data', 'discovery'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    cpSync(join(REPO, 'data', 'discovery', 'webrisk.v1.json'), join(root, 'data', 'discovery', 'webrisk.v1.json'));
    const product = { title: 'X', description: 'X.', group: 'apikey', server: { name: 'gx', curated: null }, generated: [{ api: 'webrisk', version: 'v1' }], methodNotes };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: product } }));
    const res = spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
    return { ...res, servers: res.status === 0 ? JSON.parse(readFileSync(join(root, 'config', 'servers.json'), 'utf8')).servers : undefined };
  };
  const entry = (over) => ({ webrisk: { source: 'https://example.com', reason: 'Google says so.', methods: { 'webrisk.uris.search': 'A note.' }, ...over } });
  const ok = run(entry());
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.servers[0].methodNotes, entry());
  assert.equal('methodNotes' in run(undefined).servers[0], false, 'a product without notes gets no key');
  for (const [value, message] of [
    [{ gmail: entry().webrisk }, /"gmail" is not a generated API of the product/],
    [entry({ methods: { 'webrisk.nothing.get': 'A note.' } }), /"webrisk\.nothing\.get" is not a method of the webrisk snapshot/],
    [entry({ methods: { 'webrisk.uris.search': ' ' } }), /must be a non-empty note/],
    [entry({ methods: {} }), /methods must be a non-empty object/],
    [entry({ reason: '' }), /needs a source and a reason/],
    [{}, /must be a non-empty object/],
  ]) {
    const res = run(value);
    assert.notEqual(res.status, 0, JSON.stringify(value));
    assert.match(res.stderr, message);
  }
});
