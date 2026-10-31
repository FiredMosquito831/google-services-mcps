// Requests of the generated per-method tools (src/core/discovery/tools.ts), built from the real snapshots and the real
// server map, with the HTTP layer stubbed: OAuth2Client.prototype.request for the OAuth groups and the API key client's
// fetch seam for gmaps. Every recorded request is matched to its Discovery method (verb and URL template) and its query
// is checked against the method's parameters and the document's system parameters. Nothing leaves the machine.
//   1.30.0: fields on reads, the fields Google requires (Drive), the Places response field mask.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JWT, OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { discoveryToolsFor, buildRequest, FIELD_MASK_HEADER } = await import(DIST('core/discovery/tools.js'));
const { setFetchForTests } = await import(DIST('core/discovery/apikey-client.js'));
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));

// ---------------------------------------------------------------------------
// Logins in a temp folder (fake values, never sent) and the stubbed HTTP layer.

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-genreq-'));
const temps = [tokenDir];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  setFetchForTests(undefined);
});
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
const token = { access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' };
for (const group of ['cloud', 'workspace-user', 'searchconsole', 'business', 'developer']) writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify(token));
// A throwaway service account key for the admin group (domain-wide delegation) and the service-account group (gmerchant).
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyFile = join(tokenDir, 'sa-key.json');
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
writeFileSync(join(tokenDir, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-31T00:00:00Z' }));
const cfg = loadConfig({
  GSM_TOKEN_DIR: tokenDir,
  GSM_ALLOW_WRITES: 'true',
  GSM_API_KEY: 'test-api-key',
  GSM_SERVICE_ACCOUNT_KEY_FILE: keyFile,
  GSM_ADMIN_SUBJECT: 'admin@example.com',
});

let calls = [];
let respond = () => ({});

async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = Array.isArray(value) ? value.map(String) : String(value);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query, headers: { ...(opts.headers ?? {}) }, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
}
OAuth2Client.prototype.request = fakeRequest;
if (Object.prototype.hasOwnProperty.call(JWT.prototype, 'request')) JWT.prototype.request = fakeRequest;
setFetchForTests(async (input, init = {}) => {
  const url = new URL(String(input));
  const call = {
    method: String(init.method ?? 'GET').toUpperCase(),
    url: `${url.origin}${url.pathname}`,
    query: Object.fromEntries(url.searchParams),
    headers: { ...(init.headers ?? {}) },
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
  calls.push(call);
  return new Response(JSON.stringify(await respond(call)), { status: 200, headers: { 'content-type': 'application/json' } });
});

/** Runs one tool's handler and returns the requests it sent. */
async function requestsOf(tool, args) {
  calls = [];
  await tool.handler(args, { gate: async () => undefined, hasScope: () => true, grantedScopes: null });
  return calls;
}

// ---------------------------------------------------------------------------
// Discovery: every method of the snapshots by verb and URL template, with the document's system parameters.

const snapshots = {};
for (const file of readdirSync(join(REPO, 'data', 'discovery')).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  snapshots[file.slice(0, -5)] = readJson('data', 'discovery', file);
}

function templateRegex(template) {
  const body = template
    .split(/(\{\+?[^}]+\})/)
    .map((part) => (/^\{\+/.test(part) ? '(.+)' : /^\{/.test(part) ? '([^/]+)' : part.replace(/[.*+?^$()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`);
}

const index = [];
for (const [key, doc] of Object.entries(snapshots)) {
  const bases = [doc.rootUrl, ...(doc.endpoints ?? []).map((e) => e.endpointUrl)].map((root) => `${root}${doc.servicePath ?? ''}`);
  const walk = (resources) => {
    for (const r of Object.values(resources ?? {})) {
      for (const m of Object.values(r.methods ?? {})) {
        for (const base of bases) {
          for (const p of [m.path, m.flatPath].filter(Boolean)) {
            const template = `${base}${p}`;
            index.push({ key, doc, method: m, regex: templateRegex(template), literal: template.replace(/\{[^}]+\}/g, '').length });
          }
        }
      }
      walk(r.resources);
    }
  };
  walk(doc.resources);
}

/** The Discovery method of one recorded request, and the problems of its query. */
function contract(call, expectId) {
  const found = index.filter((e) => e.method.httpMethod === call.method && e.regex.test(call.url)).sort((a, b) => b.literal - a.literal);
  const hit = found.find((e) => e.method.id === expectId) ?? found[0];
  if (!hit) return { id: undefined, problems: [`no Discovery method for ${call.method} ${call.url}`] };
  const params = new Map((hit.method.parameters ?? []).map((p) => [p.name, p]));
  const system = new Set(hit.doc.systemParameters ?? []);
  const problems = [];
  for (const name of Object.keys(call.query)) {
    const p = params.get(name);
    if (p && p.location !== 'query') problems.push(`${name} belongs in the ${p.location}`);
    else if (!p && !system.has(name) && name !== 'key') problems.push(`query parameter ${name} is not a parameter of ${hit.method.id} or a system parameter`);
  }
  return { id: hit.method.id, problems };
}

/** One sample value for a zod type: what a caller would give for a required argument. */
function sample(schema, name) {
  let s = schema;
  while (['ZodOptional', 'ZodDefault', 'ZodNullable'].includes(s._def.typeName)) s = s._def.innerType;
  switch (s._def.typeName) {
    case 'ZodString':
      return `${name}-1`;
    case 'ZodNumber':
      return 1;
    case 'ZodBoolean':
      return true;
    case 'ZodEnum':
      return s._def.values[0];
    case 'ZodArray':
      return [sample(s._def.type, name)];
    default:
      return {};
  }
}

/** The required arguments of a tool, with sample values. */
const requiredArgs = (tool) => Object.fromEntries(Object.entries(tool.inputSchema).filter(([, s]) => !s.isOptional()).map(([k, s]) => [k, sample(s, k)]));

const serverTools = new Map();
async function toolsOf(server) {
  if (!serverTools.has(server)) serverTools.set(server, await discoveryToolsFor(server, cfg));
  return serverTools.get(server);
}
const byMethod = async (server, id) => (await toolsOf(server)).find((t) => t.methodId === id);

// ---------------------------------------------------------------------------
// 1.30.0: fields

test('fields: every generated read takes fields, no write does, and a method with a field mask takes field_mask instead', async () => {
  const servers = readJson('config', 'servers.json').servers.filter((s) => (s.apis ?? []).length > 0);
  let reads = 0;
  let masks = 0;
  for (const server of servers) {
    for (const tool of await toolsOf(server.name)) {
      if (!tool.methodId) continue;
      const masked = Object.values(server.fieldMaskDefaults ?? {}).some((e) => tool.methodId in e.methods);
      const at = `${server.name}/${tool.name}`;
      if (masked) {
        masks += 1;
        assert.ok(tool.inputSchema.field_mask, `${at} takes field_mask`);
        assert.equal(tool.inputSchema.fields, undefined, `${at} takes no fields`);
      } else if (tool.kind === 'read') {
        reads += 1;
        assert.ok(tool.inputSchema.fields?.isOptional(), `${at} takes an optional fields`);
        assert.equal(tool.inputSchema.field_mask, undefined, at);
      } else {
        assert.equal(tool.inputSchema.fields, undefined, `${at} (${tool.kind}) takes no fields`);
      }
    }
  }
  assert.equal(masks, 3, 'Places searchText, searchNearby and get');
  assert.ok(reads > 1400, `${reads} generated reads take fields`);
});

test('fields: a read sends the fields it is given and none when it is given none, and the request matches Discovery', async () => {
  const tool = await byMethod('gdrive', 'drive.files.list');
  respond = () => ({ files: [] });
  const [given] = await requestsOf(tool, { fields: 'files(id,name),nextPageToken' });
  assert.equal(given.query.fields, 'files(id,name),nextPageToken');
  assert.deepEqual(contract(given, 'drive.files.list'), { id: 'drive.files.list', problems: [] });
  const [none] = await requestsOf(tool, {});
  assert.equal('fields' in none.query, false);
  assert.equal(tool.inputSchema.fields.safeParse('').success, false, 'an empty fields value is refused');
});

test('fields defaults: the 17 Drive methods Google says need fields send "*" when the call gives none', async () => {
  const entry = readJson('config', 'products.json').products.gdrive.fieldsDefaults.drive;
  assert.equal(entry.value, '*');
  assert.equal(entry.methods.length, 17);
  respond = () => ({ id: 'x', kind: 'drive#comment' });
  for (const id of entry.methods) {
    const tool = await byMethod('gdrive', id);
    assert.ok(tool, `${id} is a gdrive tool`);
    const [call] = await requestsOf(tool, requiredArgs(tool));
    assert.equal(call.query.fields, '*', `${id} sends fields=*`);
    assert.deepEqual(contract(call, id), { id, problems: [] }, id);
    if (tool.kind === 'read') {
      assert.match(tool.inputSchema.fields.description, /returns no default fields, so "\*" is sent/);
      const [given] = await requestsOf(tool, { ...requiredArgs(tool), fields: 'id' });
      assert.equal(given.query.fields, 'id', `${id}: the given value wins`);
    }
  }
  // A Drive method Google does not list sends no default.
  const [files] = await requestsOf(await byMethod('gdrive', 'drive.files.get'), { fileId: 'f1' });
  assert.equal('fields' in files.query, false);
  // The target read of an approval asks for the fields too (comments.get needs them as the update does).
  const update = await byMethod('gdrive', 'drive.comments.update');
  calls = [];
  await update.describeTarget({ fileId: 'f1', commentId: 'c1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.fields, '*');
  assert.equal(contract(calls[0], 'drive.comments.get').id, 'drive.comments.get');
});

test('fields defaults: every method whose Discovery description says fields must be set is listed (a refresh that adds one fails here)', () => {
  const listed = new Set();
  for (const p of Object.values(readJson('config', 'products.json').products)) for (const e of Object.values(p.fieldsDefaults ?? {})) for (const id of e.methods) listed.add(id);
  const evidence = /`fields` parameter must be set|must explicitly specify the fields/;
  const said = [];
  for (const doc of Object.values(snapshots)) {
    const walk = (resources) => {
      for (const r of Object.values(resources ?? {})) {
        for (const m of Object.values(r.methods ?? {})) if (evidence.test(m.description ?? '')) said.push(m.id);
        walk(r.resources);
      }
    };
    walk(doc.resources);
  }
  assert.deepEqual(said.sort(), ['drive.about.get', 'drive.approvals.list', 'drive.comments.create', 'drive.comments.get', 'drive.comments.list', 'drive.comments.update']);
  for (const id of said) assert.ok(listed.has(id), `${id} says fields must be set but has no default`);
});

// ---------------------------------------------------------------------------
// 1.30.0: the Places response field mask

test('field mask: Places search and details send X-Goog-FieldMask, the default or the given one; the key stays in the query', async () => {
  const masks = readJson('config', 'products.json').products.gmaps.fieldMaskDefaults.places.methods;
  assert.deepEqual(Object.keys(masks).sort(), ['places.places.get', 'places.places.searchNearby', 'places.places.searchText']);
  respond = () => ({ places: [] });
  for (const [id, mask] of Object.entries(masks)) {
    const tool = await byMethod('gmaps', id);
    assert.ok(tool.inputSchema.field_mask.description.endsWith(`Default: ${mask}`), id);
    const [call] = await requestsOf(tool, requiredArgs(tool));
    assert.equal(call.headers[FIELD_MASK_HEADER], mask, `${id} sends the default mask`);
    assert.equal(call.query.key, 'test-api-key', 'the generated apikey tools keep the key in the query');
    assert.equal('fields' in call.query, false);
    assert.deepEqual(contract(call, id), { id, problems: [] }, id);
    const [given] = await requestsOf(tool, { ...requiredArgs(tool), field_mask: 'places.id' });
    assert.equal(given.headers[FIELD_MASK_HEADER], 'places.id');
  }
  assert.ok(!masks['places.places.searchNearby'].includes('nextPageToken'), 'Nearby Search has no paging, so no nextPageToken in its mask');
  assert.ok(masks['places.places.searchText'].includes('nextPageToken'), 'Text Search pages with nextPageToken, which the mask must name');
  // Another gmaps read sends no mask.
  const [auto] = await requestsOf(await byMethod('gmaps', 'places.places.autocomplete'), {});
  assert.equal(FIELD_MASK_HEADER in auto.headers, false);
});

test('sendAuthorized: an OAuth request carries its own headers; one without sends none', async () => {
  const { sendAuthorized } = await import(DIST('core/discovery/tools.js'));
  respond = () => ({ ok: true });
  calls = [];
  await sendAuthorized('workspace-user', cfg, { url: 'https://www.googleapis.com/drive/v3/about', method: 'GET', headers: { [FIELD_MASK_HEADER]: 'user' } });
  await sendAuthorized('workspace-user', cfg, { url: 'https://www.googleapis.com/drive/v3/about', method: 'GET' });
  assert.equal(calls[0].headers[FIELD_MASK_HEADER], 'user');
  assert.deepEqual(calls[1].headers, {});
});

test('buildRequest: a plan without defaults builds the same request as before, with no headers', () => {
  const plan = { fullId: 'x.things.list', httpMethod: 'GET', rootUrl: 'https://x.googleapis.com/', servicePath: '', path: 'v1/things', fields: [{ arg: 'pageSize', api: 'pageSize', location: 'query' }] };
  assert.deepEqual(buildRequest(plan, { pageSize: 5 }), { method: 'GET', url: 'https://x.googleapis.com/v1/things', params: { pageSize: 5 }, data: undefined });
  const withDefaults = { ...plan, queryDefaults: { fields: '*' }, headerDefaults: { 'X-Goog-FieldMask': 'id' } };
  assert.deepEqual(buildRequest(withDefaults, { pageSize: 5 }).params, { pageSize: 5, fields: '*' });
  assert.deepEqual(buildRequest(withDefaults, {}).headers, { 'X-Goog-FieldMask': 'id' });
});

test('the data reaches every copy: config/servers.json, the plugin servers.json and the CLI conversion', async () => {
  const { registryFromProducts } = await import(DIST('cli/products.js'));
  const products = readJson('config', 'products.json').products;
  const converted = registryFromProducts(readJson('config', 'products.json'), REPO).servers;
  const owners = { fieldsDefaults: ['gdrive'], fieldMaskDefaults: ['gmaps'], pageSizeDefaults: ['gadmin', 'gads', 'gcalendar', 'gcloud', 'gmerchant', 'gyoutube'] };
  for (const [key, ids] of Object.entries(owners)) {
    for (const id of ids) {
      assert.ok(products[id][key], `${id} declares ${key}`);
      assert.deepEqual(readJson('config', 'servers.json').servers.find((s) => s.name === id)[key], products[id][key], `${id} config/servers.json`);
      assert.deepEqual(readJson('plugins', id, 'servers.json').servers[0][key], products[id][key], `${id} plugin servers.json`);
      assert.deepEqual(converted.find((s) => s.name === id)[key], products[id][key], `${id} CLI conversion`);
    }
    for (const [id, p] of Object.entries(products)) if (!ids.includes(id)) assert.equal(p[key], undefined, `${id} ${key}`);
  }
});

// ---------------------------------------------------------------------------
// 1.30.1: required parameters, default page sizes

const methodsById = new Map();
for (const doc of Object.values(snapshots)) {
  const walk = (resources) => {
    for (const r of Object.values(resources ?? {})) {
      for (const m of Object.values(r.methods ?? {})) methodsById.set(m.id, m);
      walk(r.resources);
    }
  };
  walk(doc.resources);
}

test('requiredByText: "Required." at the start or "required: true", unless the text says what happens without it', async () => {
  const { requiredByText } = await import(DIST('core/discovery/tools.js'));
  assert.equal(requiredByText('Required. The parent.'), true);
  assert.equal(requiredByText('The ids. required: true, pattern: x'), true);
  assert.equal(requiredByText('Optional. Required. later'), false, 'only at the start');
  assert.equal(requiredByText('Required. A field mask. Defaults to all fields if not set.'), false);
  assert.equal(requiredByText('Required. Mask. If not present, the old metadata is replaced.'), false);
  assert.equal(requiredByText('Required field indicating the granularity.'), false, 'not the "Required." convention');
  assert.equal(requiredByText(undefined), false);
});

test('required: every query parameter Google says is required is required in its tool; the two that say otherwise stay optional', async () => {
  const { requiredByText } = await import(DIST('core/discovery/tools.js'));
  const servers = readJson('config', 'servers.json').servers.filter((s) => (s.apis ?? []).length > 0);
  let byText = 0;
  for (const server of servers) {
    for (const tool of await toolsOf(server.name)) {
      if (!tool.methodId) continue;
      for (const p of methodsById.get(tool.methodId)?.parameters ?? []) {
        if (p.location === 'path') continue;
        const arg = p.name === 'confirm' ? 'confirmParam' : p.name;
        const required = p.required === true || requiredByText(p.description);
        assert.equal(!tool.inputSchema[arg].isOptional(), required, `${server.name}/${tool.name} ${p.name}`);
        if (required && !p.required) byText += 1;
      }
    }
  }
  assert.ok(byText > 250, `${byText} parameters required by Google's text`);
  const optional = async (server, id, name) => (await byMethod(server, id)).inputSchema[name].isOptional();
  assert.equal(await optional('gcontacts', 'people.people.createContact', 'personFields'), true, '"Defaults to all fields if not set"');
  assert.equal(await optional('gmaps', 'streetviewpublish.photo.update', 'updateMask'), true, '"If not present, the old Photo metadata is entirely replaced"');
  for (const name of ['ids', 'metrics', 'startDate', 'endDate']) assert.equal(await optional('gyoutube', 'youtubeAnalytics.reports.query', name), false, `YouTube Analytics ${name}`);
  for (const name of ['readMask']) assert.equal(await optional('gbusiness', 'mybusinessbusinessinformation.accounts.locations.list', name), false, `Business Profile ${name}`);
  // A call without a required parameter is refused before any request.
  const query = await byMethod('gyoutube', 'youtubeAnalytics.reports.query');
  const { z } = await import('zod');
  assert.equal(z.object(query.inputSchema).safeParse({ ids: 'channel==MINE', metrics: 'views', startDate: '2026-10-01' }).success, false, 'endDate is missing');
});

test('page sizes: each listed method sends its page size when the call gives none, and the given one otherwise', async () => {
  const products = readJson('config', 'products.json').products;
  let checked = 0;
  respond = () => ({ items: [] });
  for (const [id, p] of Object.entries(products)) {
    for (const entry of Object.values(p.pageSizeDefaults ?? {})) {
      for (const [method, size] of Object.entries(entry.methods)) {
        const tool = await byMethod(p.server.name, method);
        assert.ok(tool, `${id} has a tool for ${method}`);
        assert.ok(size.value < size.googleDefault, method);
        assert.match(tool.inputSchema[size.parameter].description, new RegExp(`Default: ${size.value} \\(sent when the call gives none; Google's default is ${size.googleDefault}\\)\\.$`), method);
        const [call] = await requestsOf(tool, requiredArgs(tool));
        assert.equal(call.query[size.parameter], String(size.value), `${method} sends ${size.parameter}=${size.value}`);
        assert.deepEqual(contract(call, method), { id: method, problems: [] }, method);
        const [given] = await requestsOf(tool, { ...requiredArgs(tool), [size.parameter]: 3 });
        assert.equal(given.query[size.parameter], '3', `${method}: the given size wins`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 12);
  const activities = readJson('config', 'products.json').products.gadmin.pageSizeDefaults.admin.methods['reports.activities.list'];
  assert.deepEqual({ value: activities.value, googleDefault: activities.googleDefault }, { value: 25, googleDefault: 1000 });
  // A list method with no entry sends no page size of its own.
  const [plain] = await requestsOf(await byMethod('gdrive', 'drive.files.list'), {});
  assert.equal('pageSize' in plain.query, false);
});

test('gen-servers: pageSizeDefaults name an integer query parameter of a snapshot method, below Google default, with a reason', () => {
  const run = (pageSizeDefaults) => {
    const root = mkdtempSync(join(tmpdir(), 'gsm-gen-size-'));
    temps.push(root);
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    mkdirSync(join(root, 'data', 'discovery'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    cpSync(join(REPO, 'data', 'discovery', 'drive.v3.json'), join(root, 'data', 'discovery', 'drive.v3.json'));
    const product = { title: 'X', description: 'X.', group: 'workspace-user', server: { name: 'gx', curated: null }, generated: [{ api: 'drive', version: 'v3' }], pageSizeDefaults };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: product } }));
    return spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
  };
  const entry = (over) => ({ drive: { source: 'Discovery', reason: 'Too large.', methods: { 'drive.revisions.list': { parameter: 'pageSize', value: 30, googleDefault: 200, reason: 'Big.', ...over } } } });
  assert.equal(run(entry()).status, 0);
  for (const [value, message] of [
    [entry({ parameter: 'fileId' }), /is not an integer query parameter of the method/],
    [entry({ parameter: 'pageToken' }), /is not an integer query parameter of the method/],
    [entry({ value: 200 }), /value must be a whole number from 1 up to below googleDefault/],
    [entry({ value: 0 }), /value must be a whole number/],
    [entry({ reason: '' }), /needs a parameter and a reason/],
    [{ drive: { source: 'Discovery', reason: 'x', methods: { 'drive.nothing.list': { parameter: 'pageSize', value: 1, googleDefault: 2, reason: 'x' } } } }, /is not a method of the drive snapshot/],
  ]) {
    const res = run(value);
    assert.notEqual(res.status, 0, JSON.stringify(value));
    assert.match(res.stderr, message);
  }
});

test('gen-servers: fieldsDefaults and fieldMaskDefaults are checked against the product and its snapshots', () => {
  const run = (extra) => {
    const root = mkdtempSync(join(tmpdir(), 'gsm-gen-req-'));
    temps.push(root);
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'config'));
    mkdirSync(join(root, 'data', 'discovery'), { recursive: true });
    cpSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(root, 'scripts', 'gen-servers.mjs'));
    cpSync(join(REPO, 'data', 'discovery', 'drive.v3.json'), join(root, 'data', 'discovery', 'drive.v3.json'));
    const product = { title: 'X', description: 'X.', group: 'workspace-user', server: { name: 'gx', curated: null }, generated: [{ api: 'drive', version: 'v3' }], ...extra };
    writeFileSync(join(root, 'config', 'products.json'), JSON.stringify({ products: { gx: product } }));
    return spawnSync(process.execPath, [join(root, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8' });
  };
  const fields = (over) => ({ fieldsDefaults: { drive: { value: '*', methods: ['drive.about.get'], source: 'https://example.com', reason: 'Google says so.', ...over } } });
  const masks = (over) => ({ fieldMaskDefaults: { drive: { methods: { 'drive.files.get': 'id' }, source: 'https://example.com', reason: 'Google says so.', ...over } } });
  assert.equal(run(fields()).status, 0);
  assert.equal(run(masks()).status, 0);
  for (const [extra, message] of [
    [{ fieldsDefaults: { gmail: fields().fieldsDefaults.drive } }, /"gmail" is not a generated API of the product/],
    [fields({ methods: ['drive.nothing.get'] }), /"drive\.nothing\.get" is not a method of the drive snapshot/],
    [fields({ value: 'a b' }), /must be a fields value without spaces/],
    [fields({ methods: ['drive.about.get', 'drive.about.get'] }), /lists a method twice/],
    [fields({ reason: '' }), /needs a source and a reason/],
    [masks({ methods: { 'drive.files.get': 'id, name' } }), /comma-separated field list without spaces/],
    [masks({ methods: { 'drive.gone': 'id' } }), /is not a method of the drive snapshot/],
    [{ fieldMaskDefaults: {} }, /must be a non-empty object/],
  ]) {
    const res = run(extra);
    assert.notEqual(res.status, 0, JSON.stringify(extra));
    assert.match(res.stderr, message);
  }
});
