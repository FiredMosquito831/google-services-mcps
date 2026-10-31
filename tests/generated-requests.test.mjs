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

/** An HTTP answer with its own status, headers and raw body (bytes or text), instead of a JSON value. */
const http = (body, headers = {}, status = 200) => ({ __http: true, body, headers, status });

async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = Array.isArray(value) ? value.map(String) : String(value);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query, headers: { ...(opts.headers ?? {}) }, body: opts.data, responseType: opts.responseType };
  calls.push(call);
  const answer = await respond(call);
  if (answer?.__http) {
    // As gaxios answers: bytes for responseType arraybuffer; otherwise parsed by content type.
    const raw = typeof answer.body === 'string' ? Buffer.from(answer.body, 'utf8') : answer.body;
    const json = /json/.test(answer.headers['content-type'] ?? '');
    const data = opts.responseType === 'arraybuffer' ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : json ? JSON.parse(raw.toString('utf8')) : raw.toString('utf8');
    return { data, status: answer.status, headers: new Headers(answer.headers), config: opts };
  }
  return { data: answer, status: 200, headers: new Headers(), config: opts };
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
  const answer = await respond(call);
  if (answer?.__http) return new Response(answer.body, { status: answer.status, headers: answer.headers });
  return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
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

// ---------------------------------------------------------------------------
// 1.31.0: media downloads and answers that are files

const PART = 18000; // base64PartBytes(25,000): the default result limit
const bytesOf = (n, seed = 7) => Buffer.from(Array.from({ length: n }, (_, i) => (i * seed + 3) % 256));

test('media: every method Discovery marks supportsMediaDownload takes alt and offset; a GET answering an HttpBody takes offset', async () => {
  const servers = readJson('config', 'servers.json').servers.filter((s) => (s.apis ?? []).length > 0);
  const downloads = [];
  const files = [];
  for (const server of servers) {
    for (const tool of await toolsOf(server.name)) {
      if (!tool.methodId) continue;
      const m = methodsById.get(tool.methodId);
      if (m.supportsMediaDownload) {
        downloads.push(tool.methodId);
        assert.deepEqual(tool.inputSchema.alt._def.innerType._def.values, ['json', 'media'], tool.name);
        assert.ok(tool.inputSchema.offset.isOptional(), tool.name);
      } else if (m.httpMethod === 'GET' && /HttpBody$/.test(m.response ?? '')) {
        files.push(tool.methodId);
        assert.equal(tool.inputSchema.alt, undefined, tool.name);
        assert.ok(tool.inputSchema.offset.isOptional(), tool.name);
      } else {
        assert.equal(tool.inputSchema.alt, undefined, `${tool.name} takes no alt`);
        // Three Fact Check methods declare a parameter named offset of their own (a result offset): it stays theirs.
        if (!(m.parameters ?? []).some((p) => p.name === 'offset')) assert.equal(tool.inputSchema.offset, undefined, `${tool.name} takes no offset`);
      }
    }
  }
  assert.ok(downloads.includes('keep.media.download') && downloads.includes('storage.objects.get') && downloads.includes('drive.files.export'), downloads.join(', '));
  assert.ok(files.includes('solar.geoTiff.get') && files.includes('airquality.mapTypes.heatmapTiles.lookupHeatmapTile'), files.join(', '));
});

test('media: a Keep attachment with alt=media asks for one part with a Range and returns it as base64; offset reads on and the parts join', async () => {
  const tool = await byMethod('gtasks', 'keep.media.download');
  const file = bytesOf(40000);
  respond = (call) => {
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(call.headers.Range);
    const end = Math.min(Number(to), file.length - 1);
    return http(file.subarray(Number(from), end + 1), { 'content-type': 'image/png', 'content-range': `bytes ${from}-${end}/${file.length}` }, 206);
  };
  const parts = [];
  let offset = 0;
  for (let i = 0; i < 5 && offset !== undefined; i++) {
    calls = [];
    const out = await tool.handler({ name: 'notes/n1/attachments/a1', mimeType: 'image/png', alt: 'media', ...(offset ? { offset } : {}) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].query.alt, 'media');
    assert.equal(calls[0].headers.Range, `bytes=${offset}-${offset + PART - 1}`);
    assert.equal(calls[0].responseType, 'arraybuffer');
    assert.equal('offset' in calls[0].query, false, 'offset is not sent to Google');
    assert.deepEqual(contract(calls[0], 'keep.media.download'), { id: 'keep.media.download', problems: [] });
    assert.equal(out.mime_type, 'image/png');
    assert.equal(out.size_bytes, 40000);
    assert.equal(out.offset, offset);
    parts.push(out.data_base64);
    offset = out.next_offset;
    if (offset !== undefined) assert.match(out.note, new RegExp(`Call again with offset ${offset}`));
  }
  assert.equal(parts.length, 3);
  assert.ok(Buffer.from(parts.join(''), 'base64').equals(file), 'the base64 parts join into the file');
  // A server that ignores the range answers the whole file: the part is cut from it.
  respond = () => http(file, { 'content-type': 'image/png' });
  const whole = await tool.handler({ name: 'notes/n1/attachments/a1', mimeType: 'image/png', alt: 'media', offset: 36000 });
  assert.deepEqual({ size: whole.size_bytes, read: whole.bytes_read, next: whole.next_offset }, { size: 40000, read: 4000, next: undefined });
  assert.ok(Buffer.from(whole.data_base64, 'base64').equals(file.subarray(36000)));
  await assert.rejects(tool.handler({ name: 'notes/n1/attachments/a1', mimeType: 'image/png', alt: 'media', offset: 50000 }), /past the end/);
});

test('media: a text file comes back as text, cut at a character; without alt=media the metadata is the JSON it was', async () => {
  const tool = await byMethod('gcloud', 'storage.objects.get');
  // Quotes take two characters in JSON, and "é" two bytes: a part is cut where the escaped text fits, and on a character.
  const text = `${'"'.repeat(15000)}${'é'.repeat(10000)}`;
  const file = Buffer.from(text, 'utf8');
  respond = (call) => {
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(call.headers.Range);
    const end = Math.min(Number(to), file.length - 1);
    return http(file.subarray(Number(from), end + 1), { 'content-type': 'text/plain; charset=utf-8', 'content-range': `bytes ${from}-${end}/${file.length}` }, 206);
  };
  const texts = [];
  let offset = 0;
  for (let i = 0; i < 6 && offset !== undefined; i++) {
    const out = await tool.handler({ bucket: 'b1', object: 'notes.txt', alt: 'media', offset });
    assert.equal(out.mime_type, 'text/plain; charset=utf-8');
    assert.equal('data_base64' in out, false);
    assert.equal(out.bytes_read, Buffer.byteLength(out.text, 'utf8'));
    assert.ok(JSON.stringify(out).length <= 25000, `part ${i} fits the result limit, escapes counted`);
    texts.push(out.text);
    offset = out.next_offset;
  }
  assert.equal(texts.length, 3);
  assert.ok(texts[0].length < 15000, 'the first part stopped where its escaped text filled the limit');
  assert.equal(texts.join(''), text, 'the text parts join into the file, no character split');
  // Metadata: read as bytes and parsed as JSON, the same value as before.
  const meta = { kind: 'storage#object', name: 'notes.txt', size: '25001', contentType: 'text/plain' };
  respond = () => http(JSON.stringify(meta), { 'content-type': 'application/json; charset=UTF-8' });
  calls = [];
  assert.deepEqual(await tool.handler({ bucket: 'b1', object: 'notes.txt' }), meta);
  assert.equal(calls[0].responseType, 'arraybuffer');
  assert.equal(calls[0].headers.Range, undefined, 'no range without alt=media');
  // A method that answers no file reads its answer as before.
  respond = () => ({ items: [] });
  calls = [];
  await (await byMethod('gcloud', 'storage.buckets.list')).handler({ project: 'p1' });
  assert.equal(calls[0].responseType, undefined);
});

// ---------------------------------------------------------------------------
// 1.31.1: regional hosts

test('rootForPath: the first endpoint of the location the path names, only https hosts under googleapis.com, never pre-production', async () => {
  const { rootForPath } = await import(DIST('core/discovery/tools.js'));
  const root = 'https://demo.googleapis.com/';
  const endpoints = [
    { location: 'us', endpointUrl: 'https://demo-preprod.us.rep.googleapis.com/' },
    { location: 'us', endpointUrl: 'https://demo.us.rep.googleapis.com/' },
    { location: 'us', endpointUrl: 'https://us-demo.googleapis.com/' },
    { location: 'eu', endpointUrl: 'https://evil.example.com/' },
    { location: 'asia1', endpointUrl: 'http://asia1-demo.googleapis.com/' },
    { location: 'me1', endpointUrl: 'https://me1-demo.googleapis.com/extra/' },
  ];
  assert.equal(rootForPath(root, endpoints, '/v1/projects/p/locations/us/things/t1'), 'https://demo.us.rep.googleapis.com/');
  assert.equal(rootForPath(root, endpoints, '/v1/projects/p/locations/us:search'), 'https://demo.us.rep.googleapis.com/');
  for (const path of ['/v1/projects/p/locations/eu/x', '/v1/projects/p/locations/asia1/x', '/v1/projects/p/locations/me1/x', '/v1/projects/p/locations/global/x', '/v1/projects/p/things', '/v1/projects/p/locationsx/us', '/v1/projects/p/sublocations/us/x']) {
    assert.equal(rootForPath(root, endpoints, path), root, path);
  }
  assert.equal(rootForPath(root, undefined, '/v1/projects/p/locations/us/x'), root);
});

test('regional hosts: a per-method tool whose path names a location its document serves goes to that host; any other, as before', async () => {
  respond = () => ({});
  const list = await byMethod('gai', 'speech.projects.locations.customClasses.list');
  const [regional] = await requestsOf(list, { parent: 'projects/p1/locations/us-central1' });
  assert.equal(regional.url, 'https://speech.us-central1.rep.googleapis.com/v1/projects/p1/locations/us-central1/customClasses');
  assert.deepEqual(contract(regional, 'speech.projects.locations.customClasses.list'), { id: 'speech.projects.locations.customClasses.list', problems: [] });
  const [globalCall] = await requestsOf(list, { parent: 'projects/p1/locations/global' });
  assert.equal(new URL(globalCall.url).host, 'speech.googleapis.com', 'no endpoint for global: the document root');
  // Discovery Engine: the document lists "us" only; "eu" stays on the global host.
  const search = await byMethod('gai', 'discoveryengine.projects.locations.collections.dataStores.servingConfigs.search');
  const config = (loc) => `projects/p1/locations/${loc}/collections/default_collection/dataStores/d1/servingConfigs/default_search`;
  const [us] = await requestsOf(search, { servingConfig: config('us'), body: { query: 'q' } });
  assert.equal(new URL(us.url).host, 'discoveryengine.us.rep.googleapis.com');
  assert.deepEqual(contract(us, 'discoveryengine.projects.locations.collections.dataStores.servingConfigs.search').problems, []);
  const [eu] = await requestsOf(search, { servingConfig: config('eu'), body: { query: 'q' } });
  assert.equal(new URL(eu.url).host, 'discoveryengine.googleapis.com');
  // Cloud Storage lists regional hosts, but its paths name no location: as before.
  const [object] = await requestsOf(await byMethod('gcloud', 'storage.objects.get'), { bucket: 'b1', object: 'o1' });
  assert.equal(object.url, 'https://storage.googleapis.com/storage/v1/b/b1/o/o1');
  // The approval preview of a destructive call and the target read of a write show and use the same host.
  const del = await byMethod('gai', 'speech.projects.locations.customClasses.delete');
  const preview = await del.preview({ name: 'projects/p1/locations/us-west1/customClasses/c1' });
  assert.equal(new URL(preview.url).host, 'speech.us-west1.rep.googleapis.com');
  const patch = await byMethod('gai', 'speech.projects.locations.customClasses.patch');
  assert.equal(typeof patch.describeTarget, 'function');
  calls = [];
  await patch.describeTarget({ name: 'projects/p1/locations/us-west1/customClasses/c1' });
  assert.equal(new URL(calls[0].url).host, 'speech.us-west1.rep.googleapis.com');
});

test('fromBytes reads an answer as the HTTP library would, and a file as a MediaBody; contentRange and isTextual', async () => {
  const { fromBytes, MediaBody, contentRange, isTextual } = await import(DIST('core/media.js'));
  const b = (s) => Buffer.from(s, 'utf8');
  assert.deepEqual(fromBytes(b('{"a":1}'), 'application/json; charset=UTF-8'), { a: 1 });
  assert.equal(fromBytes(b('{bad'), 'application/json'), '{bad');
  assert.equal(fromBytes(b('plain'), 'text/plain'), 'plain');
  assert.equal(fromBytes(b('no type'), null), 'no type');
  assert.deepEqual(fromBytes({ already: 'parsed' }, 'image/png'), { already: 'parsed' }, 'a value that is not bytes is left as it is');
  const png = fromBytes(new Uint8Array([137, 80, 78, 71]).buffer, 'image/png');
  assert.ok(png instanceof MediaBody);
  assert.deepEqual({ type: png.mimeType, start: png.start, total: png.total, n: png.bytes.length }, { type: 'image/png', start: 0, total: 4, n: 4 });
  const asMedia = fromBytes(b('{"a":1}'), 'application/json', { media: true, range: { start: 10, total: 100 } });
  assert.deepEqual({ media: asMedia instanceof MediaBody, start: asMedia.start, total: asMedia.total }, { media: true, start: 10, total: 100 });
  assert.deepEqual(contentRange('bytes 100-199/1000'), { start: 100, total: 1000 });
  assert.deepEqual(contentRange('bytes 0-9/*'), { start: 0 });
  assert.equal(contentRange('nonsense'), undefined);
  for (const t of ['text/csv', 'application/json', 'application/ld+json', 'application/xml', 'image/svg+xml', 'text/vtt; charset=utf-8']) assert.ok(isTextual(t), t);
  for (const t of ['image/png', 'image/tiff', 'application/pdf', 'application/octet-stream']) assert.ok(!isTextual(t), t);
});

test('files over the API key: a GeoTIFF, a heatmap tile and a photo come back as base64 parts, never as text', async () => {
  const tiff = bytesOf(30000, 11);
  respond = () => http(tiff, { 'content-type': 'image/tiff' });
  const geo = await (await byMethod('gmaps', 'solar.geoTiff.get')).handler({ id: 'abc' });
  assert.deepEqual({ type: geo.mime_type, size: geo.size_bytes, read: geo.bytes_read, next: geo.next_offset }, { type: 'image/tiff', size: 30000, read: PART, next: PART });
  assert.ok(Buffer.from(geo.data_base64, 'base64').equals(tiff.subarray(0, PART)));
  const rest = await (await byMethod('gmaps', 'solar.geoTiff.get')).handler({ id: 'abc', offset: PART });
  assert.ok(Buffer.from(rest.data_base64, 'base64').equals(tiff.subarray(PART)));
  const png = bytesOf(900, 5);
  respond = () => http(png, { 'content-type': 'image/png' });
  const tile = await (await byMethod('gmaps', 'pollen.mapTypes.heatmapTiles.lookupHeatmapTile')).handler(requiredArgs(await byMethod('gmaps', 'pollen.mapTypes.heatmapTiles.lookupHeatmapTile')));
  assert.deepEqual({ size: tile.size_bytes, next: tile.next_offset, note: tile.note }, { size: 900, next: undefined, note: undefined });
  assert.ok(Buffer.from(tile.data_base64, 'base64').equals(png));
  // A photo: Google redirects to the image; the tool has no offset, so a part that is not the whole photo says so.
  const photo = bytesOf(25000, 13);
  respond = () => http(photo, { 'content-type': 'image/jpeg' });
  const media = await byMethod('gmaps', 'places.places.photos.getMedia');
  assert.equal(media.inputSchema.offset, undefined);
  const got = await media.handler({ name: 'places/p/photos/x/media', maxWidthPx: 400 });
  assert.equal(got.mime_type, 'image/jpeg');
  assert.equal(got.next_offset, PART);
  assert.match(got.note, /this tool takes no offset/);
  // JSON over the API key is parsed as before.
  respond = () => ({ name: 'places/p/photos/x/media', photoUri: 'https://lh3.example/x' });
  assert.deepEqual(await media.handler({ name: 'places/p/photos/x/media', skipHttpRedirect: true }), { name: 'places/p/photos/x/media', photoUri: 'https://lh3.example/x' });
});

// ---------------------------------------------------------------------------
// 1.35.2: Merchant API Reviews on v1alpha. Google discontinued v1beta in May 2026 and lists Reviews only as v1alpha.

test('Merchant reviews: the 8 review tools keep their names and send to reviews/v1alpha, as the reviews_v1alpha snapshot says', async () => {
  const names = {
    'merchantapi.accounts.productReviews.insert': 'merchantap_acco_prod_inser_0ed9',
    'merchantapi.accounts.productReviews.get': 'merchantap_accounts_product_get',
    'merchantapi.accounts.productReviews.delete': 'merchantap_acco_prod_delet_223a',
    'merchantapi.accounts.productReviews.list': 'merchantap_acco_produ_list_6080',
    'merchantapi.accounts.merchantReviews.delete': 'merchantap_accoun_mercha_delete',
    'merchantapi.accounts.merchantReviews.insert': 'merchantap_accoun_mercha_insert',
    'merchantapi.accounts.merchantReviews.list': 'merchantap_account_merchan_list',
    'merchantapi.accounts.merchantReviews.get': 'merchantap_account_merchant_get',
  };
  assert.equal(snapshots['merchantapi.reviews_v1beta'], undefined, 'no v1beta snapshot');
  respond = () => ({});
  for (const [id, name] of Object.entries(names)) {
    const tool = await byMethod('gmerchant', id);
    assert.equal(tool?.name, name, `${id} keeps its tool name`);
    const resource = id.split('.')[2];
    const args = { ...requiredArgs(tool), ...(tool.inputSchema.parent ? { parent: 'accounts/123' } : {}), ...(tool.inputSchema.name ? { name: `accounts/123/${resource}/r1` } : {}) };
    const [call] = await requestsOf(tool, args);
    assert.match(call.url, /^https:\/\/merchantapi\.googleapis\.com\/reviews\/v1alpha\/accounts\//, `${id}: ${call.url}`);
    const hit = contract(call, id);
    assert.deepEqual(hit, { id, problems: [] }, id);
    assert.equal(index.find((e) => e.method.id === id && e.regex.test(call.url))?.key, 'merchantapi.reviews_v1alpha', `${id} matches the v1alpha document`);
  }
});
