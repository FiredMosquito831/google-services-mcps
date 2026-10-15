// Tests for the product gateway (api_search, api_describe, api_call). Run after compiling:
//   npx tsc -p tsconfig.json && node --test tests/gateway.test.mjs
// Each test uses a fake catalog in a temp folder (GSM_DATA_DIR) and a temp token folder.
// Network is never used: the Discovery fetch and the authorized request are injected.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const gw = await import(new URL('../dist/core/gateway.js', import.meta.url).href);
const { loadConfig } = await import(new URL('../dist/core/config.js', import.meta.url).href);

const PRODUCT = 'demo';
const GROUP = 'workspace-user';
const ITEMS_SCOPE = 'https://www.googleapis.com/auth/demo.readonly';

// Fake catalog: one product API (demoapi) and one API outside the product (otherapi).
const catalog = {
  generatedAt: 'test',
  apiCount: 2,
  methodCount: 7,
  apis: [
    {
      name: 'demoapi',
      version: 'v1',
      title: 'Demo Items API',
      description: 'Manages demo items.',
      documentationLink: '',
      labels: [],
      deprecated: false,
      rootUrl: 'https://demo.example.googleapis.com/',
      servicePath: '',
      methods: [
        ['demoapi.items.list', 'GET', 'v1/projects/{projectId}/items', [ITEMS_SCOPE], ''],
        ['demoapi.items.get', 'GET', 'v1/{+name}', [ITEMS_SCOPE], ''],
        ['demoapi.items.batchGet', 'POST', 'v1/items:batchGet', [ITEMS_SCOPE], ''],
        ['demoapi.items.create', 'POST', 'v1/projects/{projectId}/items', [], ''],
        ['demoapi.items.delete', 'DELETE', 'v1/projects/{projectId}/items/{itemId}', [], ''],
        ['demoapi.files.upload', 'POST', 'upload/v1/files', [], 'u'],
      ],
    },
    {
      name: 'otherapi',
      version: 'v1',
      title: 'Other API',
      description: 'Not in the product.',
      documentationLink: '',
      labels: [],
      deprecated: false,
      rootUrl: 'https://other.example.googleapis.com/',
      servicePath: '',
      methods: [['otherapi.things.list', 'GET', 'v1/things', [], '']],
    },
  ],
};

// Full Discovery document for demoapi.v1, in the shape Google serves (parameters as maps).
const discovery = {
  name: 'demoapi',
  version: 'v1',
  rootUrl: 'https://demo.example.googleapis.com/',
  servicePath: '',
  parameters: {
    fields: { type: 'string', location: 'query', description: 'Partial response.' },
    key: { type: 'string', location: 'query' },
  },
  schemas: {
    Item: {
      id: 'Item',
      type: 'object',
      properties: {
        displayName: { type: 'string', description: 'Human name' },
        labels: { type: 'array', items: { type: 'string' } },
        owner: { $ref: 'Owner' },
        password: { type: 'string' },
      },
    },
    Owner: { id: 'Owner', type: 'object', properties: { email: { type: 'string' } } },
    ItemList: {
      id: 'ItemList',
      type: 'object',
      properties: { items: { type: 'array', items: { $ref: 'Item' } }, nextPageToken: { type: 'string' } },
    },
    BatchGetRequest: { id: 'BatchGetRequest', type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } } },
  },
  resources: {
    items: {
      methods: {
        list: {
          id: 'demoapi.items.list',
          path: 'v1/projects/{projectId}/items',
          httpMethod: 'GET',
          description: 'Lists items.',
          parameters: {
            projectId: { type: 'string', location: 'path', required: true },
            pageSize: { type: 'integer', location: 'query' },
            pageToken: { type: 'string', location: 'query' },
          },
          response: { $ref: 'ItemList' },
        },
        get: {
          id: 'demoapi.items.get',
          path: 'v1/{+name}',
          httpMethod: 'GET',
          parameters: { name: { type: 'string', location: 'path', required: true } },
          response: { $ref: 'Item' },
        },
        batchGet: {
          id: 'demoapi.items.batchGet',
          path: 'v1/items:batchGet',
          httpMethod: 'POST',
          parameters: {},
          request: { $ref: 'BatchGetRequest' },
          response: { $ref: 'ItemList' },
        },
        create: {
          id: 'demoapi.items.create',
          path: 'v1/projects/{projectId}/items',
          httpMethod: 'POST',
          parameters: {
            projectId: { type: 'string', location: 'path', required: true },
            requestId: { type: 'string', location: 'query' },
          },
          request: { $ref: 'Item' },
          response: { $ref: 'Item' },
        },
        delete: {
          id: 'demoapi.items.delete',
          path: 'v1/projects/{projectId}/items/{itemId}',
          httpMethod: 'DELETE',
          parameters: {
            projectId: { type: 'string', location: 'path', required: true },
            itemId: { type: 'string', location: 'path', required: true },
          },
        },
      },
    },
  },
};

/** Fresh data and token folders. The discovery document is pre-cached unless cache is false. */
function setup({ cache = true } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'gsm-gw-data-'));
  const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-gw-token-'));
  writeFileSync(join(dataDir, 'catalog.json'), JSON.stringify(catalog));
  if (cache) {
    mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
    writeFileSync(join(tokenDir, 'discovery-cache', 'demoapi.v1.json'), JSON.stringify(discovery));
  }
  process.env.GSM_DATA_DIR = dataDir;
  return { cfg: loadConfig({ GSM_TOKEN_DIR: tokenDir }), tokenDir };
}

function gateway(cfg) {
  const tools = gw.gatewayTools({ product: PRODUCT, group: GROUP, apis: [{ api: 'demoapi', version: 'v1' }], cfg });
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

/** A gate that records each call and allows it. */
function allowGate(events = []) {
  const calls = [];
  const gate = async (input) => {
    calls.push(input);
    events.push('gate');
  };
  return { gate, calls };
}

/** A gate that records each call and denies it, as the user would. */
function denyGate() {
  const calls = [];
  const gate = async (input) => {
    calls.push(input);
    throw new Error('denied by user');
  };
  return { gate, calls };
}

/** Replaces the authorized request. Records each call and returns the given response. */
function fakeRequest(response = { status: 200, data: { ok: true } }, events = []) {
  const calls = [];
  gw.setRequestForTests(async (req) => {
    calls.push(req);
    events.push('request');
    return response;
  });
  return calls;
}

afterEach(() => {
  gw.setRequestForTests(undefined);
  gw.setFetchForTests(undefined);
});

// ---------------------------------------------------------------------------
// api_search

test('api_search matches id and path, lists in id order, and never shows upload methods', async () => {
  const tools = gateway(setup().cfg);
  const out = await tools.api_search.handler({ query: 'ITEMS' });
  assert.equal(out.total, 5);
  assert.deepEqual(out.results.map((r) => r.method), [
    'demoapi.items.batchGet',
    'demoapi.items.create',
    'demoapi.items.delete',
    'demoapi.items.get',
    'demoapi.items.list',
  ]);

  const byPath = await tools.api_search.handler({ query: 'items:batch' });
  assert.deepEqual(byPath.results.map((r) => r.method), ['demoapi.items.batchGet']);

  const upload = await tools.api_search.handler({ query: 'upload' });
  assert.equal(upload.total, 0, 'upload methods are not offered');
});

test('api_search never searches APIs outside the product', async () => {
  const tools = gateway(setup().cfg);
  const out = await tools.api_search.handler({ query: 'things' });
  assert.equal(out.total, 0);
  await assert.rejects(tools.api_search.handler({ query: 'things', api: 'otherapi' }), /not one of product "demo"/);
});

test('api_search kind filter keeps only the requested safety kind', async () => {
  const tools = gateway(setup().cfg);
  const ids = async (kind) => (await tools.api_search.handler({ query: 'demoapi', kind })).results.map((r) => r.method);
  assert.deepEqual(await ids('destructive'), ['demoapi.items.delete']);
  assert.deepEqual(await ids('read'), ['demoapi.items.batchGet', 'demoapi.items.get', 'demoapi.items.list']);
  assert.deepEqual(await ids('write'), ['demoapi.items.create']);
});

// ---------------------------------------------------------------------------
// api_describe

test('api_describe refuses a method id outside the product, and reads nothing', async () => {
  const { cfg } = setup({ cache: false });
  const fetched = [];
  gw.setFetchForTests(async (url) => {
    fetched.push(String(url));
    return new Response('{}', { status: 500 });
  });
  const tools = gateway(cfg);
  await assert.rejects(tools.api_describe.handler({ method: 'otherapi.things.list' }), (err) => {
    assert.match(err.message, /is not in product "demo"/);
    assert.match(err.message, /demoapi\.v1/);
    return true;
  });
  assert.equal(fetched.length, 0);
});

test('api_describe returns parameters, request body fields and the response schema name', async () => {
  const tools = gateway(setup().cfg);
  const d = await tools.api_describe.handler({ method: 'demoapi.items.create' });
  assert.equal(d.kind, 'write');
  assert.equal(d.httpMethod, 'POST');
  assert.equal(d.path, 'v1/projects/{projectId}/items');
  assert.equal(d.response, 'Item');
  assert.equal(d.requestBody.schema, 'Item');
  const display = d.requestBody.properties.find((p) => p.name === 'displayName');
  assert.deepEqual(display, { name: 'displayName', type: 'string', description: 'Human name' });
  assert.equal(d.requestBody.properties.find((p) => p.name === 'owner').type, 'Owner', 'a $ref is named, not expanded');
  const projectId = d.parameters.find((p) => p.name === 'projectId');
  assert.deepEqual([projectId.location, projectId.required], ['path', true]);
});

test('api_describe fetches the Discovery document once and then reuses the cache', async () => {
  const { cfg, tokenDir } = setup({ cache: false });
  const fetched = [];
  gw.setFetchForTests(async (url) => {
    fetched.push(String(url));
    return new Response(JSON.stringify(discovery), { status: 200 });
  });
  const tools = gateway(cfg);
  const first = await tools.api_describe.handler({ method: 'demoapi.items.get' });
  const second = await tools.api_describe.handler({ method: 'demoapi.items.get' });
  assert.deepEqual(fetched, ['https://www.googleapis.com/discovery/v1/apis/demoapi/v1/rest']);
  assert.ok(existsSync(join(tokenDir, 'discovery-cache', 'demoapi.v1.json')));
  assert.deepEqual(first, second);
  assert.equal(first.parameters[0].location, 'path');
});

// ---------------------------------------------------------------------------
// api_call

test('api_call refuses an upload method before any gate or request', async () => {
  const tools = gateway(setup().cfg);
  const { gate, calls: gateCalls } = allowGate();
  const requests = fakeRequest();
  await assert.rejects(tools.api_call.handler({ method: 'demoapi.files.upload' }, { gate }), {
    message: 'upload methods are not supported by the gateway',
  });
  assert.equal(gateCalls.length, 0);
  assert.equal(requests.length, 0);
});

test('api_call refuses a method outside the product', async () => {
  const tools = gateway(setup().cfg);
  const requests = fakeRequest();
  await assert.rejects(tools.api_call.handler({ method: 'otherapi.things.list' }, { gate: allowGate().gate }), /is not in product "demo"/);
  assert.equal(requests.length, 0);
});

test('api_call asks the gate before a write, and sends nothing when the gate throws', async () => {
  const tools = gateway(setup().cfg);
  const { gate, calls: gateCalls } = denyGate();
  const requests = fakeRequest();
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.create', pathParams: { projectId: 'p1' }, body: { displayName: 'Box' } }, { gate }),
    /denied by user/,
  );
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].kind, 'write');
  assert.equal(gateCalls[0].target, 'demoapi.items.create');
  assert.equal(requests.length, 0, 'no request is sent when the gate denies');
});

test('api_call sends an approved write after the gate, with encoded path and separate query and body', async () => {
  const tools = gateway(setup().cfg);
  const events = [];
  const { gate, calls: gateCalls } = allowGate(events);
  const requests = fakeRequest({ status: 201, data: { name: 'items/1' } }, events);
  const out = await tools.api_call.handler(
    { method: 'demoapi.items.create', pathParams: { projectId: 'p/1' }, query: { requestId: 'r1' }, body: { displayName: 'Box' } },
    { gate },
  );
  assert.deepEqual(events, ['gate', 'request'], 'the gate runs before the request');
  assert.equal(gateCalls.length, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, 'https://demo.example.googleapis.com/v1/projects/p%2F1/items');
  assert.deepEqual(requests[0].params, { requestId: 'r1' });
  assert.deepEqual(requests[0].data, { displayName: 'Box' });
  assert.deepEqual(out, { status: 201, data: { name: 'items/1' } });
});

test('api_call runs a delete through the gate with kind destructive', async () => {
  const tools = gateway(setup().cfg);
  const { gate, calls: gateCalls } = allowGate();
  const requests = fakeRequest({ status: 204, data: '' });
  await tools.api_call.handler({ method: 'demoapi.items.delete', pathParams: { projectId: 'p1', itemId: 'i1' } }, { gate });
  assert.equal(gateCalls[0].kind, 'destructive');
  assert.equal(gateCalls[0].methodId, 'demoapi.items.delete');
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(requests[0].data, undefined);
});

test('api_call runs a read method with no gate, and a read POST may carry a body', async () => {
  const tools = gateway(setup().cfg);
  const { gate, calls: gateCalls } = allowGate();
  const requests = fakeRequest({ status: 200, data: { items: [] } });
  const list = await tools.api_call.handler(
    { method: 'demoapi.items.list', pathParams: { projectId: 'p1' }, query: { pageSize: 10 } },
    { gate },
  );
  assert.equal(gateCalls.length, 0, 'a read calls no gate');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].data, undefined, 'a GET sends no body');
  assert.deepEqual(requests[0].params, { pageSize: 10 });
  assert.deepEqual(list, { status: 200, data: { items: [] } });

  await tools.api_call.handler({ method: 'demoapi.items.batchGet', body: { names: ['a'] } }, { gate });
  assert.equal(gateCalls.length, 0, 'a read POST calls no gate either');
  assert.deepEqual(requests[1].data, { names: ['a'] });
});

test('api_call refuses a body on a GET, and sends nothing', async () => {
  const tools = gateway(setup().cfg);
  const requests = fakeRequest();
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' }, body: { x: 1 } }, { gate: allowGate().gate }),
    /is a GET method, so it takes no body/,
  );
  assert.equal(requests.length, 0);
});

test('api_call keeps slashes for {+name} and encodes other path values, refusing dot segments', async () => {
  const tools = gateway(setup().cfg);
  const requests = fakeRequest();
  await tools.api_call.handler({ method: 'demoapi.items.get', pathParams: { name: 'projects/p1/items/i 1' } }, { gate: allowGate().gate });
  assert.equal(requests[0].url, 'https://demo.example.googleapis.com/v1/projects/p1/items/i%201');

  const { gate, calls: gateCalls } = denyGate();
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.delete', pathParams: { projectId: 'p1', itemId: 'x/../../y' } }, { gate }),
    /must not contain "\." or "\.\." segments/,
  );
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.create', pathParams: { projectId: '..' }, body: {} }, { gate }),
    /must not contain/,
  );
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.create', pathParams: { projectId: 'p1', extra: 'x' }, body: {} }, { gate }),
    /"extra" is not a path parameter/,
  );
  assert.equal(gateCalls.length, 0, 'a refused URL never reaches the gate');
  assert.equal(requests.length, 1, 'only the valid GET was sent');
});

test('api_call validates query names against the Discovery document and refuses credentials', async () => {
  const tools = gateway(setup().cfg);
  const requests = fakeRequest();
  const call = (query) =>
    tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' }, query }, { gate: allowGate().gate });
  await assert.rejects(call({ key: 'AIzaSECRET' }), /set by the gateway/);
  await assert.rejects(call({ access_token: 'x' }), /set by the gateway/);
  await assert.rejects(call({ bogus: 1 }), /"bogus" is not a query parameter/);
  await call({ fields: 'items' }); // a global parameter of the Discovery document
  assert.equal(requests.length, 1);
});

test('the gate receives redacted arguments, and the request keeps the real body', async () => {
  const tools = gateway(setup().cfg);
  const { gate, calls: gateCalls } = allowGate();
  const requests = fakeRequest();
  await tools.api_call.handler(
    {
      method: 'demoapi.items.create',
      pathParams: { projectId: 'p1' },
      body: {
        displayName: 'Box',
        password: 'hunter2',
        nested: { clientSecret: 'abc123' },
        note: 'Bearer ya29.SECRETTOKEN999',
      },
    },
    { gate },
  );
  const shown = JSON.stringify(gateCalls[0].args);
  assert.match(shown, /Box/);
  assert.match(shown, /\[redacted\]/);
  assert.doesNotMatch(shown, /hunter2|abc123|SECRETTOKEN|ya29/);
  assert.equal(requests[0].data.password, 'hunter2', 'the request itself carries the real value');
});

test('api_call errors never carry the request config (and so never the token)', async () => {
  const tools = gateway(setup().cfg);
  gw.setRequestForTests(async () => {
    throw Object.assign(new Error('Request had insufficient authentication scopes.'), {
      code: 403,
      errors: [{ reason: 'insufficientPermissions' }],
      config: { headers: { Authorization: 'Bearer ya29.LEAKED' } },
    });
  });
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, { gate: allowGate().gate }),
    (err) => {
      assert.match(err.message, /Log in again with a broader profile: gsm login workspace-user --profile readwrite/);
      assert.doesNotMatch(err.message, /LEAKED|ya29/);
      return true;
    },
  );
});

test('api_call maps a 401 to a log-in-again message', async () => {
  const tools = gateway(setup().cfg);
  gw.setRequestForTests(async () => {
    throw Object.assign(new Error('Invalid Credentials'), { code: 401 });
  });
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } }, { gate: allowGate().gate }),
    /Log in again: gsm login workspace-user/,
  );
});

// ---------------------------------------------------------------------------
// gatewayTools (no approval context)

test('gatewayTools returns the three tools, and its api_call refuses writes before any request', async () => {
  const { cfg } = setup();
  const tools = Object.fromEntries(
    gw.gatewayTools({ product: PRODUCT, group: GROUP, apis: [{ api: 'demoapi', version: 'v1' }], cfg }).map((t) => [t.name, t]),
  );
  assert.deepEqual(Object.keys(tools).sort(), ['api_call', 'api_describe', 'api_search']);
  assert.equal(tools.api_call.kind, 'dynamic', 'the handler gates each write itself');

  const requests = fakeRequest();
  await assert.rejects(
    tools.api_call.handler({ method: 'demoapi.items.create', pathParams: { projectId: 'p1' }, body: { displayName: 'x' } }),
    /approval gate/,
  );
  assert.equal(requests.length, 0);

  await tools.api_call.handler({ method: 'demoapi.items.list', pathParams: { projectId: 'p1' } });
  assert.equal(requests.length, 1, 'reads still run');
});
