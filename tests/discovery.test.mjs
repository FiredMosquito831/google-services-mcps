// Tests for the Discovery tool engine. Run after compiling: npx tsc -p tsconfig.json && node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;

const { schemaToZod, paramToZod } = await import(dist('core/discovery/schema.js'));
const { classifyMethod, assignToolNames, toolNameFor, MAX_TOOL_NAME, nameBudget, CLAUDE_TOOL_NAME_MAX, READ_POST_EXACT } = await import(dist('core/discovery/methods.js'));
const { buildUrl, buildRequest, serializeQuery, discoveryToolsFor, generateDiscoveryTools } = await import(dist('core/discovery/tools.js'));
const { loadConfig } = await import(dist('core/config.js'));
const { loadRegistry, scopesForGroup } = await import(dist('core/registry.js'));

const testConfig = () => loadConfig({ GSM_TOKEN_DIR: mkdtempSync(join(tmpdir(), 'gsm-test-')) });

// ---------------------------------------------------------------------------
// Schema conversion

test('schema: $ref, enum and array convert to zod, with descriptions', () => {
  const schemas = {
    Address: {
      id: 'Address',
      type: 'object',
      properties: { city: { type: 'string', description: 'City name' }, zip: { type: 'string' } },
    },
    Person: {
      id: 'Person',
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Full name' },
        status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'], description: 'Account state' },
        home: { $ref: 'Address' },
        tags: { type: 'array', items: { type: 'string' } },
        age: { type: 'integer' },
      },
    },
  };
  const person = schemaToZod({ $ref: 'Person' }, { schemas });

  assert.ok(person.safeParse({ name: 'Ann', status: 'ACTIVE', home: { city: 'Oslo' }, tags: ['a'], age: 30 }).success);
  assert.equal(person.safeParse({ status: 'ACTIVE' }).success, false, 'name is required');
  assert.equal(person.safeParse({ name: 'A', status: 'GONE' }).success, false, 'enum is enforced');
  assert.equal(person.safeParse({ name: 'A', tags: 'x' }).success, false, 'array is enforced');
  assert.equal(person.safeParse({ name: 'A', age: 1.5 }).success, false, 'integer is enforced');
  assert.equal(person.shape.name.description, 'Full name');
});

test('schema: recursive $ref terminates and accepts deep values past the limit', () => {
  const schemas = {
    Node: { id: 'Node', type: 'object', properties: { value: { type: 'string' }, child: { $ref: 'Node' } } },
  };
  const node = schemaToZod({ $ref: 'Node' }, { schemas });
  const deep = { value: 'a', child: { value: 'b', child: { value: 'c', child: { value: 'd', child: { value: 'e', child: { value: 'f' } } } } } };
  assert.ok(node.safeParse(deep).success);
  assert.equal(node.safeParse({ value: 5 }).success, false, 'the top level stays typed');
});

test('schema: parameters map location, type and repeated', () => {
  const required = paramToZod({ name: 'project', location: 'path', type: 'string', required: true });
  assert.equal(required.safeParse(5).success, false);
  assert.equal(required.safeParse('p1').success, true);

  const repeated = paramToZod({ name: 'ids', location: 'query', type: 'string', repeated: true });
  assert.ok(repeated.safeParse(['a', 'b']).success);
  assert.equal(repeated.safeParse('a').success, false);

  const optional = paramToZod({ name: 'pageSize', location: 'query', type: 'integer', default: 50 });
  assert.equal(optional.safeParse(undefined).success, true);
});

// ---------------------------------------------------------------------------
// Tool names

test('names: shortened to 40 characters or fewer, hashed only when shortening cannot fit', () => {
  const long = {
    apiName: 'cloudresourcemanager',
    apiVersion: 'v3',
    fullId: 'cloudresourcemanager.folders.tagBindings.collectionOfThingsWithAVeryLongName.anotherVeryLongMethodName',
    resource: ['folders', 'tagBindings', 'collectionOfThingsWithAVeryLongName'],
    methodName: 'anotherVeryLongMethodName',
  };
  const shortened = toolNameFor(long);
  assert.ok(shortened.length <= MAX_TOOL_NAME, `${shortened} is longer than ${MAX_TOOL_NAME}`);
  assert.match(shortened, /^[a-z0-9_]+$/);

  // Eleven 4-letter segments cannot be shortened below 40 characters, so the name is truncated and hashed.
  const segs = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff', 'gggg', 'hhhh', 'iiii', 'jjjj', 'kkkk'];
  const hashed = toolNameFor({ apiName: 'cloudresourcemanager', fullId: 'crm.deep.chain.mmmm', resource: segs, methodName: 'mmmm' });
  assert.ok(hashed.length <= MAX_TOOL_NAME, `${hashed} is longer than ${MAX_TOOL_NAME}`);
  assert.match(hashed, /_[0-9a-f]{4}$/, 'a truncated name ends with the fullId hash');

  // Two methods that shorten to the same base name must end up different, and both carry the hash.
  const a = { apiName: 'x', apiVersion: 'v1', fullId: 'x.alphaResourceNameForCollisionTestingOne.get', resource: ['alphaResourceNameForCollisionTestingOne'], methodName: 'get' };
  const b = { apiName: 'x', apiVersion: 'v1', fullId: 'x.alphaResourceNameForCollisionTestingTwo.get', resource: ['alphaResourceNameForCollisionTestingTwo'], methodName: 'get' };
  const names = assignToolNames([a, b, long], ['x_api_methods']);
  assert.equal(new Set(names).size, names.length, 'names are unique');
  for (const n of names) assert.ok(n.length <= MAX_TOOL_NAME, `${n} is too long`);
  assert.ok(!names.includes('x_api_methods'), 'reserved names are not reused');
  assert.match(names[0], /_[0-9a-f]{4}$/, 'a colliding name carries the hash');
  assert.match(names[1], /_[0-9a-f]{4}$/, 'a colliding name carries the hash');
  assert.notEqual(names[0], names[1]);
  assert.equal(names[2], shortened, 'a name without a collision keeps its plain shortened form');
  assert.deepEqual(assignToolNames([a, b, long], ['x_api_methods']), names, 'naming is deterministic');
});

test('names: a short method keeps its plain name', () => {
  const name = toolNameFor({
    apiName: 'gmail',
    fullId: 'gmail.users.messages.list',
    resource: ['users', 'messages'],
    methodName: 'list',
  });
  assert.equal(name, 'gmail_users_messages_list');
});

// ---------------------------------------------------------------------------
// Safety classification

test('classify: GET, POST list, POST send, DELETE and PATCH', () => {
  assert.equal(classifyMethod('GET', 'get', 'gmail.users.messages.get'), 'read');
  assert.equal(classifyMethod('POST', 'list', 'example.things.list'), 'read');
  assert.equal(classifyMethod('POST', 'send', 'gmail.users.messages.send'), 'destructive');
  assert.equal(classifyMethod('POST', 'sendDraft', 'gmail.users.drafts.sendDraft'), 'destructive');
  assert.equal(classifyMethod('DELETE', 'delete', 'example.things.delete'), 'destructive');
  assert.equal(classifyMethod('PATCH', 'patch', 'example.things.patch'), 'write');
  assert.equal(classifyMethod('POST', 'create', 'example.things.create'), 'write');
  assert.equal(classifyMethod('POST', 'runReport', 'analyticsdata.properties.runReport'), 'read');
});

test('classify: overrides win over the rules', () => {
  assert.equal(classifyMethod('POST', 'query', 'bigquery.jobs.query', { 'bigquery.jobs.query': 'write' }), 'write');
  assert.equal(classifyMethod('POST', 'emptyTrash', 'drive.files.emptyTrash', { 'drive.files.emptyTrash': 'destructive' }), 'destructive');
});

test('classify: POST verbs that run work, mint credentials, export, query or test are writes, not reads', () => {
  // These used to be read by prefix. Each one can change something or start work, so each asks first.
  assert.equal(classifyMethod('POST', 'run', 'run.projects.locations.jobs.run'), 'write');
  assert.equal(classifyMethod('POST', 'generateAccessToken', 'iamcredentials.projects.serviceAccounts.generateAccessToken'), 'write');
  assert.equal(classifyMethod('POST', 'export', 'sql.instances.export'), 'write');
  assert.equal(classifyMethod('POST', 'query', 'chromeuxreport.records.queryRecord'), 'write');
  assert.equal(classifyMethod('POST', 'test', 'example.things.test'), 'write');
  // The reads that stay read: explicit IAM and reporting names, and list-style verbs.
  assert.equal(classifyMethod('POST', 'testIamPermissions', 'example.things.testIamPermissions'), 'read');
  assert.equal(classifyMethod('POST', 'batchGet', 'example.things.batchGet'), 'read');
  assert.equal(classifyMethod('POST', 'validate', 'example.things.validate'), 'read');
});

test('classify: a POST that mints, reveals or uses a credential is a write, even when its name is read-like', () => {
  // The guard words (token, credential, secret, password, authoriz, key) decide before the read-verb rules.
  assert.equal(classifyMethod('POST', 'fetchAccessToken', 'backupdr.projects.locations.backupVaults.dataSources.fetchAccessToken'), 'write');
  assert.equal(classifyMethod('POST', 'fetchReadToken', 'developerconnect.projects.locations.connections.gitRepositoryLinks.fetchReadToken'), 'write');
  assert.equal(classifyMethod('POST', 'fetchReadWriteToken', 'developerconnect.projects.locations.connections.gitRepositoryLinks.fetchReadWriteToken'), 'write');
  assert.equal(classifyMethod('POST', 'getKeyString', 'apikeys.projects.locations.keys.getKeyString'), 'write');
  assert.equal(classifyMethod('POST', 'getSyncAuthorization', 'apigee.organizations.getSyncAuthorization'), 'write');
  assert.equal(classifyMethod('POST', 'checkAuthorization', 'notebooks.projects.locations.instances.checkAuthorization'), 'write');
  // Any non-GET verb with a guard word is a write too.
  assert.equal(classifyMethod('PUT', 'getToken', 'example.things.getToken'), 'write');
});

test('classify: read-like POST names without a credential word stay read, and every exact read name is still read', () => {
  assert.equal(classifyMethod('POST', 'validateAddress', 'addressvalidation.v1.validateAddress'), 'read');
  assert.equal(classifyMethod('POST', 'testIamPermissions', 'example.things.testIamPermissions'), 'read');
  assert.equal(classifyMethod('POST', 'fetchAddressDetails', 'example.things.fetchAddressDetails'), 'read', 'fetch stays a read verb');
  for (const name of READ_POST_EXACT) {
    assert.equal(classifyMethod('POST', name, `example.things.${name}`), 'read', `${name} must stay read`);
  }
});

test('classify: a GET is not decided by the credential rule; the GET credential reveals are write through config/tool-kinds.json', () => {
  const file = JSON.parse(readFileSync(join(ROOT, 'config', 'tool-kinds.json'), 'utf8'));
  const overrides = Object.fromEntries(Object.entries(file).filter(([, v]) => typeof v === 'string'));
  const lastSegment = (id) => id.slice(id.lastIndexOf('.') + 1);

  // Without an override a GET stays read, whatever its name.
  assert.equal(classifyMethod('GET', 'getKeyString', 'apikeys.projects.locations.keys.getKeyString'), 'read');
  // The override makes the reveal a write. The read-only key lookup has no override and stays read.
  for (const id of [
    'apikeys.projects.locations.keys.getKeyString',
    'cloudshell.users.environments.generateAccessToken',
    'vmwareengine.projects.locations.privateClouds.showVcenterCredentials',
    'discoveryengine.projects.locations.collections.dataConnector.getConnectorSecret',
  ]) {
    assert.equal(overrides[id], 'write', `${id} is listed`);
    assert.equal(classifyMethod('GET', lastSegment(id), id, overrides), 'write', id);
  }
  assert.equal(classifyMethod('GET', 'lookupKey', 'apikeys.keys.lookupKey', overrides), 'read');
  assert.equal(classifyMethod('GET', 'getPublicKey', 'cloudkms.projects.locations.keyRings.cryptoKeys.cryptoKeyVersions.getPublicKey', overrides), 'read');
});

// ---------------------------------------------------------------------------
// URLs and requests

test('url: {param} and {+param} are substituted with the right encoding', () => {
  assert.equal(
    buildUrl('https://www.googleapis.com/', 'gmail/v1/', 'users/{userId}/messages/{id}', { userId: 'me', id: 'a/b' }),
    'https://www.googleapis.com/gmail/v1/users/me/messages/a%2Fb',
  );
  assert.equal(
    buildUrl('https://monitoring.googleapis.com/', '', 'v3/{+name}/timeSeries', { name: 'projects/my proj/x' }),
    'https://monitoring.googleapis.com/v3/projects/my%20proj/x/timeSeries',
  );
  assert.throws(() => buildUrl('https://x.example/', 'v1/', 'a/{id}', {}), /Missing path parameter "id"/);
});

test('request: path, query and body are split correctly', () => {
  const plan = {
    fullId: 'gmail.users.messages.send',
    httpMethod: 'POST',
    rootUrl: 'https://www.googleapis.com/',
    servicePath: 'gmail/v1/',
    path: 'users/{userId}/messages/send',
    fields: [
      { arg: 'userId', api: 'userId', location: 'path' },
      { arg: 'maxResults', api: 'maxResults', location: 'query' },
      { arg: 'requestBody', api: 'body', location: 'body' },
    ],
  };
  const req = buildRequest(plan, { userId: 'me', maxResults: 5, requestBody: { raw: 'x' } });
  assert.equal(req.method, 'POST');
  assert.equal(req.url, 'https://www.googleapis.com/gmail/v1/users/me/messages/send');
  assert.deepEqual(req.params, { maxResults: 5 });
  assert.deepEqual(req.data, { raw: 'x' });
});

test('query: arrays repeat the key and empty values are dropped', () => {
  assert.equal(serializeQuery({ ids: ['a', 'b'], n: 3, flag: true, skip: undefined, none: null }), 'ids=a&ids=b&n=3&flag=true');
  assert.equal(serializeQuery({}), '');
});

// ---------------------------------------------------------------------------
// Generation

test('generate: media upload methods are skipped and reported, destructive tools preview without calling the API', async () => {
  const doc = {
    name: 'demo',
    version: 'v1',
    rootUrl: 'https://demo.googleapis.com/',
    servicePath: '',
    schemas: {
      Thing: { id: 'Thing', type: 'object', properties: { label: { type: 'string', description: 'Label' } } },
    },
    resources: {
      things: {
        methods: {
          get: { id: 'demo.things.get', path: 'v1/{+name}', httpMethod: 'GET', parameters: [{ name: 'name', location: 'path', type: 'string', required: true }] },
          remove: { id: 'demo.things.remove', path: 'v1/{+name}', httpMethod: 'DELETE', parameters: [{ name: 'name', location: 'path', type: 'string', required: true }] },
          upload: { id: 'demo.things.upload', path: 'upload/v1/things', httpMethod: 'POST', supportsMediaUpload: true },
          create: { id: 'demo.things.create', path: 'v1/things', httpMethod: 'POST', request: 'Thing' },
        },
      },
    },
  };
  const { tools, skippedUploads } = generateDiscoveryTools(
    'demo-server',
    'cloud',
    [{ apiName: 'demo', apiVersion: 'v1', doc }],
    { overrides: {}, notes: { demo: 'Demo note.' } },
    testConfig(),
  );

  assert.deepEqual(skippedUploads, ['demo.things.upload']);
  assert.equal(tools.length, 4, 'three methods plus the list tool');
  const names = tools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('api_methods'));

  const remove = tools.find((t) => t.title === 'demo.things.remove');
  assert.equal(remove.kind, 'destructive');
  const preview = await remove.preview({ name: 'things/1' });
  assert.deepEqual(preview, { method: 'demo.things.remove', url: 'https://demo.googleapis.com/v1/things/1', query: {}, body: null });

  const create = tools.find((t) => t.title === 'demo.things.create');
  assert.ok(create.inputSchema.body, 'the request body is a field named body');
  assert.equal(create.inputSchema.body.safeParse({ label: 'x' }).success, true);
  assert.match(create.description, /Demo note\./);

  const list = tools.find((t) => t.name === 'api_methods');
  const rows = await list.handler({ contains: 'remove' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'destructive');
});

test('generate: a body field named body collides with a query parameter, so it becomes requestBody', () => {
  const doc = {
    name: 'demo',
    version: 'v1',
    rootUrl: 'https://demo.googleapis.com/',
    servicePath: '',
    schemas: { Thing: { id: 'Thing', type: 'object', properties: {} } },
    resources: {
      things: {
        methods: {
          create: {
            id: 'demo.things.create',
            path: 'v1/things',
            httpMethod: 'POST',
            request: 'Thing',
            parameters: [{ name: 'body', location: 'query', type: 'string' }],
          },
        },
      },
    },
  };
  const { tools } = generateDiscoveryTools('demo-server', 'cloud', [{ apiName: 'demo', apiVersion: 'v1', doc }], { overrides: {}, notes: {} }, testConfig());
  const create = tools.find((t) => t.title === 'demo.things.create');
  assert.ok(create.inputSchema.body, 'the query parameter keeps body');
  assert.ok(create.inputSchema.requestBody, 'the request body is requestBody');
});

/** A one-API demo document with two methods: demo.things.list (GET) and demo.things.delete (DELETE). */
const demoDoc = () => ({
  name: 'demo',
  version: 'v1',
  rootUrl: 'https://demo.googleapis.com/',
  servicePath: '',
  schemas: {},
  resources: {
    things: {
      methods: {
        list: { id: 'demo.things.list', path: 'v1/things', httpMethod: 'GET' },
        delete: {
          id: 'demo.things.delete',
          path: 'v1/things/{thingId}',
          httpMethod: 'DELETE',
          parameters: [{ name: 'thingId', location: 'path', type: 'string' }],
        },
      },
    },
  },
});

test('generate: every generated tool carries its Discovery method id, which the consent text and hook show', () => {
  const { tools } = generateDiscoveryTools('demo-server', 'cloud', [{ apiName: 'demo', apiVersion: 'v1', doc: demoDoc() }], { overrides: {}, notes: {} }, testConfig());
  const generated = tools.filter((t) => t.name !== 'api_methods');
  assert.equal(generated.length, 2);
  for (const t of generated) assert.equal(t.methodId, t.title, `${t.name} carries its method id`);
  assert.equal(generated.find((t) => t.title === 'demo.things.delete').methodId, 'demo.things.delete');
});

test('generate: a generated tool never takes a reserved (curated) name, and gets the hashed form instead', () => {
  const sources = [{ apiName: 'demo', apiVersion: 'v1', doc: demoDoc() }];
  const kinds = { overrides: {}, notes: {} };
  const plain = generateDiscoveryTools('demo-server', 'cloud', sources, kinds, testConfig()).tools.find((t) => t.title === 'demo.things.list');
  assert.equal(plain.name, 'demo_things_list');

  const { tools } = generateDiscoveryTools('demo-server', 'cloud', sources, kinds, testConfig(), MAX_TOOL_NAME, ['demo_things_list']);
  const list = tools.find((t) => t.title === 'demo.things.list');
  assert.match(list.name, /^demo_things_list_[0-9a-f]{4}$/, 'the reserved name is taken, so the method gets its hash');
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length, 'names stay unique');
  // The delete method does not clash, so it keeps its plain name.
  assert.equal(tools.find((t) => t.title === 'demo.things.delete').name, 'demo_things_delete');
});

test('generate: a long description is kept up to 2,048 characters with its note and method line; api_methods rows stay short', async () => {
  const { TOOL_DESCRIPTION_MAX } = await import(dist('core/discovery/tools.js'));
  const doc = demoDoc();
  doc.resources.things.methods.list.description = `Lists things. ${'x'.repeat(2500)}`;
  doc.resources.things.methods.list.parameters = [{ name: 'filter', location: 'query', type: 'string', description: `Filter syntax: ${'f'.repeat(985)}` }];
  doc.resources.things.methods.delete.description = 'Deletes a thing.';
  const note = 'A note for every demo tool.';
  const { tools } = generateDiscoveryTools('demo-server', 'cloud', [{ apiName: 'demo', apiVersion: 'v1', doc }], { overrides: {}, notes: { demo: note } }, testConfig());
  const list = tools.find((t) => t.title === 'demo.things.list');
  assert.equal(list.description.length, TOOL_DESCRIPTION_MAX);
  assert.ok(list.description.startsWith('Lists things. xxx'));
  assert.ok(list.description.endsWith(`... Note: ${note} Method demo.things.list: GET v1/things.`), 'the note and the method line are kept whole');
  assert.equal(list.inputSchema.filter.description.length, 1000, 'a 1,000-character parameter description is kept whole');
  const del = tools.find((t) => t.title === 'demo.things.delete');
  assert.equal(del.description, `Deletes a thing. Note: ${note} Method demo.things.delete: DELETE v1/things/{thingId}.`, 'a short description is as before');
  const rows = await tools.find((t) => t.name === 'api_methods').handler({});
  assert.equal(rows.find((r) => r.method === 'demo.things.list').description.length, 200, 'api_methods rows keep 200 characters');
});

test('schema: a parameter description over 1,000 characters is cut at 1,000', () => {
  const p = paramToZod({ name: 'q', location: 'query', type: 'string', description: 'q'.repeat(1001), default: 'x' });
  assert.equal(p.description, `${'q'.repeat(997)}... Default: x.`);
});

test('real snapshots keep the texts the 300 and 200 character limits cut (1.29.1)', (t) => {
  const dir = join(ROOT, 'data', 'discovery');
  if (!existsSync(join(dir, 'chat.v1.json'))) {
    t.skip('data/discovery is missing');
    return;
  }
  const methodOf = (file, id) => {
    let found;
    const walk = (resources) => {
      for (const r of Object.values(resources ?? {})) {
        for (const m of Object.values(r.methods ?? {})) if (m.id === id) found = m;
        walk(r.resources);
      }
    };
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')).resources);
    return found;
  };
  const param = (file, id, name) => methodOf(file, id).parameters.find((p) => p.name === name).description;
  // An updateMask's field list, a filter's fields, a parameter's value syntax, the wildcard parent of a list.
  assert.match(param('merchantapi.accounts_v1.json', 'merchantapi.accounts.omnichannelSettings.patch', 'updateMask'), /inventory_verification` Full replacement with wildcard/);
  assert.match(param('chat.v1.json', 'chat.spaces.search', 'query'), /space_history_state/);
  assert.match(param('youtubeAnalytics.v2.json', 'youtubeAnalytics.reports.query', 'ids'), /channel==CHANNEL_ID/);
  assert.match(param('mybusinessbusinessinformation.v1.json', 'mybusinessbusinessinformation.accounts.locations.list', 'parent'), /accounts\/-/);
  let longest = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    const walk = (resources) => {
      for (const r of Object.values(resources ?? {})) {
        for (const m of Object.values(r.methods ?? {})) {
          assert.ok((m.description ?? '').length <= 1500, m.id);
          longest = Math.max(longest, (m.description ?? '').length);
          for (const p of m.parameters ?? []) assert.ok((p.description ?? '').length <= 1000, `${m.id} ${p.name}`);
        }
        walk(r.resources);
      }
    };
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')).resources);
  }
  assert.ok(longest > 300, `method descriptions are longer than the old 300-character limit (${longest})`);
});

test('real snapshot: gcloud tools are unique, short and carry a working preview', async (t) => {
  if (!existsSync(join(ROOT, 'data', 'discovery', 'monitoring.v3.json'))) {
    t.skip('data/discovery is missing. Run: node scripts/snapshot-discovery.mjs');
    return;
  }
  // The gcloud server (config/servers.json) with its generated Discovery APIs.
  const tools = await discoveryToolsFor('gcloud', testConfig());
  assert.ok(tools.length > 300, `expected several hundred tools, got ${tools.length}`);
  const names = tools.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, 'tool names are unique');
  // The full Claude name is mcp__plugin_<plugin>_<server>__<tool>, and it must fit in 64 characters.
  const budget = nameBudget('gcloud', 'gcloud');
  for (const n of names) assert.ok(n.length <= budget, `${n} exceeds the budget of ${budget}`);
  assert.ok(names.includes('api_methods'));

  const del = tools.find((x) => x.title === 'monitoring.projects.alertPolicies.delete');
  assert.ok(del, 'monitoring alertPolicies.delete is generated');
  assert.equal(del.kind, 'destructive');
  const preview = await del.preview({ name: 'projects/p1/alertPolicies/a 1' });
  assert.equal(preview.method, 'monitoring.projects.alertPolicies.delete');
  assert.match(preview.url, /\/v3\/projects\/p1\/alertPolicies\/a%201$/);
});

test('registry: group scopes come from the discovery snapshots', (t) => {
  if (!existsSync(join(ROOT, 'data', 'scopes.json'))) {
    t.skip('data/scopes.json is missing');
    return;
  }
  const reg = loadRegistry(new URL('../dist/core/registry.js', import.meta.url).href);
  assert.equal(reg.dataRoot, ROOT);
  const scopes = scopesForGroup(reg, 'cloud', ['gcloud']);
  assert.ok(scopes.length > 0);
  assert.deepEqual(scopes, [...new Set(scopes)].sort(), 'scopes are sorted and unique');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/cloud-platform'));
});
