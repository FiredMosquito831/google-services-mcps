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

test('gapps (2.5.0): the scripts.run note reaches that one tool, after the API note, and the plugin carries it', async () => {
  const notes = readJson('config', 'products.json').products.gapps.methodNotes;
  assert.deepEqual(Object.keys(notes), ['script']);
  assert.deepEqual(Object.keys(notes.script.methods), ['script.scripts.run']);
  const note = notes.script.methods['script.scripts.run'];
  // The facts Google's guide states and Discovery does not, each of them in the note the model reads.
  for (const fact of [/DEPLOYMENT id/, /standard Google Cloud project/, /every scope the script uses/, /six minutes/, /does not work with service accounts/]) {
    assert.match(note, fact);
  }
  const tools = await discoveryToolsFor('gapps', cfg);
  const run = tools.find((t) => t.methodId === 'script.scripts.run');
  // Discovery's description is empty, so the tool falls back to the method line; the API note (tool-kinds.json) comes
  // first, then this method's note.
  assert.match(run.description, /Note: scripts\.run executes Apps Script code with the project's authority/);
  assert.ok(run.description.includes(note), 'the method note is in the tool description');
  assert.ok(run.description.length <= 2048, `${run.description.length} characters`);
  for (const tool of tools.filter((t) => t.methodId !== 'script.scripts.run')) assert.doesNotMatch(tool.description, /DEPLOYMENT id/, `${tool.methodId} carries no note`);
  // The plugin's servers.json, which the bundled server reads, carries exactly the same note.
  assert.deepEqual(readJson('plugins', 'gapps', 'servers.json').servers[0].methodNotes, notes);
});

test('gtasks (2.7.0): the update and patch tools say what `completed` and `due` are, and only they carry it', async () => {
  const notes = readJson('config', 'products.json').products.gtasks.methodNotes;
  assert.deepEqual(Object.keys(notes), ['tasks']);
  assert.deepEqual(Object.keys(notes.tasks.methods).sort(), ['tasks.tasks.patch', 'tasks.tasks.update']);
  for (const [id, note] of Object.entries(notes.tasks.methods)) {
    // Google's reference states each fact the schema alone does not: `completed` is a timestamp, and `due` keeps the date.
    for (const fact of [/`completed` is a timestamp string/, /no null/, /`status`/, /`due` keeps the date only/]) assert.match(note, fact, id);
  }
  assert.match(notes.tasks.methods['tasks.tasks.update'], /PUT and sends the whole task/);
  const tools = await discoveryToolsFor('gtasks', cfg);
  for (const [id, note] of Object.entries(notes.tasks.methods)) {
    const tool = tools.find((t) => t.methodId === id);
    assert.ok(tool, `${id} is a tool`);
    assert.ok(tool.description.includes(note), `${id}: the note is in the tool description`);
    assert.ok(tool.description.length <= 2048, `${id}: ${tool.description.length} characters`);
  }
  for (const tool of tools.filter((t) => !(t.methodId in notes.tasks.methods))) assert.doesNotMatch(tool.description, /no null/, `${tool.methodId} carries no note`);
  assert.deepEqual(readJson('plugins', 'gtasks', 'servers.json').servers[0].methodNotes, notes);
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

test('gmail (1.39.0): each generated tool a hand-written tool covers names it; every named tool exists in the server', async () => {
  const notes = readJson('config', 'products.json').products.gmail.methodNotes.gmail.methods;
  const generated = await discoveryToolsFor('gmail', cfg);
  const { buildTools } = await import(DIST('servers/gmail.js'));
  const curated = new Set((await buildTools(cfg)).map((t) => t.name));
  const twins = {
    'gmail.users.messages.get': 'gmail_get_message',
    'gmail.users.messages.list': 'gmail_search',
    'gmail.users.threads.get': 'gmail_get_thread',
    'gmail.users.threads.list': 'gmail_search_threads',
    'gmail.users.labels.list': 'gmail_list_labels',
    'gmail.users.labels.create': 'gmail_create_label',
    'gmail.users.drafts.list': 'gmail_list_drafts',
    'gmail.users.messages.attachments.get': 'gmail_get_attachment',
    'gmail.users.messages.trash': 'gmail_trash',
    'gmail.users.threads.trash': 'gmail_trash',
    'gmail.users.messages.untrash': 'gmail_untrash',
    'gmail.users.threads.untrash': 'gmail_untrash',
    'gmail.users.messages.modify': 'gmail_label',
    'gmail.users.threads.modify': 'gmail_unlabel',
  };
  for (const [id, name] of Object.entries(twins)) {
    assert.ok(curated.has(name), `${name} is a hand-written gmail tool`);
    assert.ok(notes[id]?.startsWith(name) || notes[id]?.includes(` ${name} `), `${id}'s note names ${name}`);
    const tool = generated.find((t) => t.methodId === id);
    assert.ok(tool.description.includes(` Note: ${notes[id]} Method ${id}: `), `${id}: ${tool.description}`);
  }
  // Every gmail_* name a note mentions is a tool of the server.
  for (const note of Object.values(notes)) for (const name of note.match(/\bgmail_[a-z_]+/g) ?? []) assert.ok(curated.has(name), `${name} in "${note}"`);
});
