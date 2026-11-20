// OD13e: the per-call login_customer_id on generated and gateway Google Ads tools. No network: the OAuth client's
// request method is stubbed, and the gateway's catalog/discovery facts are read from the checked-in data files.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const { loadConfig } = await import(dist('core/config.js'));
const { discoveryToolsFor } = await import(dist('core/discovery/tools.js'));
const { gatewayTools } = await import(dist('core/gateway.js'));
const { approvalArgsWithManager } = await import(dist('core/tools.js'));
const { TARGET_PREVIEW_KEY } = await import(dist('core/target-preview.js'));
const { customerIdOf } = await import(dist('core/ads.js'));
const curated = await import(dist('servers/gads.js'));

const MUTATE = 'googleads.customers.campaigns.mutate';
const LIST = 'googleads.customers.listAccessibleCustomers';
const STATIC_WRITES = [
  'googleads.customers.adGroupAds.removeAutomaticallyCreatedAssets',
  'googleads.customers.createCustomerClient',
  'googleads.customers.campaigns.enablePMaxBrandGuidelines',
];
const BAD_ID = 'login_customer_id must be the customer id, digits only (dashes are allowed and removed).';

const work = [];
after(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-ads-login-'));
work.push(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(
  join(tokenDir, 'business.token.json'),
  JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/adwords' }),
);
mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
writeFileSync(join(tokenDir, 'discovery-cache', 'googleads.v26.json'), readFileSync(join(ROOT, 'data', 'discovery', 'googleads.v26.json')));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });

const previous = {};
for (const key of ['GSM_ADS_LOGIN_CUSTOMER_ID', 'GSM_DATA_DIR']) previous[key] = process.env[key];
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
process.env.GSM_ADS_LOGIN_CUSTOMER_ID = '555-666-7777';

let calls = [];
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  calls.push({ url: `${url.origin}${url.pathname}`, headers: opts.headers ?? {}, body: opts.data });
  return { status: 200, data: {} };
};
const reset = () => {
  calls = [];
  gateCalls.length = 0;
};
const gateCalls = [];
const ctx = {
  gate: async (input) => {
    gateCalls.push(input);
  },
  hasScope: () => true,
  grantedScopes: null,
};

const generated = await discoveryToolsFor('gads', cfg);
const byMethod = (id) => generated.find((t) => t.methodId === id);
const gadsApis = JSON.parse(readFileSync(join(ROOT, 'config', 'products.json'), 'utf8')).products.gads.gateway;
const adsApiCall = gatewayTools({ product: 'gads', group: 'business', apis: gadsApis, cfg }).find((t) => t.name === 'api_call');

// ---------------------------------------------------------------------------
// The shared contract

test('the curated helper moved to core without narrowing its behavior', async () => {
  assert.equal(customerIdOf(' 123-4567890 ', 'login_customer_id'), '1234567890', 'trailing whitespace is trimmed');
  assert.equal(curated.customerIdOf, customerIdOf, 'the curated server re-exports the shared helper');
  assert.throws(() => customerIdOf('12 34', 'login_customer_id'), (err) => err instanceof Error && err.message === BAD_ID);
  assert.ok(byMethod(LIST).inputSchema.login_customer_id.isOptional());
  assert.notEqual(byMethod(LIST).inputSchema.login_customer_id.description, undefined);
  assert.equal(byMethod(LIST).inputSchema.confirm, undefined, 'no model-controlled confirm');
});

test('all 33 generated Ads tools take the argument; 161 generated SA360 tools do not', async () => {
  const ads = generated.filter((t) => String(t.methodId).startsWith('googleads.'));
  const sa360 = generated.filter((t) => String(t.methodId).startsWith('searchads360.'));
  assert.equal(ads.length, 33);
  assert.equal(sa360.length, 161);
  for (const tool of ads) assert.ok(tool.inputSchema.login_customer_id?.isOptional(), tool.methodId);
  for (const tool of sa360) assert.equal(tool.inputSchema.login_customer_id, undefined, tool.methodId);
});

// ---------------------------------------------------------------------------
// Generated Ads tools

test('a generated Ads call sends normalized digits, overrides the configured manager for that call only', async () => {
  const list = byMethod(LIST);
  reset();
  await list.handler({}, ctx);
  assert.equal(calls[0].headers['login-customer-id'], '5556667777', 'the configured manager is still the default');
  await list.handler({ login_customer_id: ' 123-456-7890 ' }, ctx);
  assert.equal(calls[1].headers['login-customer-id'], '1234567890');
  await list.handler({ login_customer_id: 9876543210 }, ctx);
  assert.equal(calls[2].headers['login-customer-id'], '9876543210');
  await list.handler({}, ctx);
  assert.equal(calls[3].headers['login-customer-id'], '5556667777', 'the next call reverts');
  assert.equal(new URL(calls[1].url).searchParams.has('login_customer_id'), false, 'it is not a query parameter');
  assert.equal('login_customer_id' in (calls[1].body ?? {}), false, 'it is not sent in the body');
});

test('a malformed generated manager id is refused before any request or approval', async () => {
  const mutate = byMethod(MUTATE);
  reset();
  await assert.rejects(mutate.handler({ customerId: '1234567890', login_customer_id: 'abc', body: { operations: [{ campaignOperation: { create: {} } }] } }, ctx), (err) => err.message === BAD_ID);
  assert.equal(calls.length, 0);
  assert.equal(gateCalls.length, 0);
});

test('a dynamic generated write shows normalized digits in its approval, and is unchanged when omitted', async () => {
  const mutate = byMethod(MUTATE);
  const body = { operations: [{ campaignOperation: { create: { name: 'x' } } }] };
  reset();
  await mutate.handler({ customerId: '1234567890', body, login_customer_id: ' 12-34567890 ' }, ctx);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].args.login_customer_id, '1234567890');
  assert.deepEqual(gateCalls[0].args.operations, body.operations, 'the body is not changed');
  assert.equal('body' in gateCalls[0].args, false, 'the object body is spread, not wrapped');
  reset();
  await mutate.handler({ customerId: '1234567890', body }, ctx);
  assert.deepEqual(gateCalls[0].args, body, 'no new key when the argument is omitted');
});

test('the three static generated Ads writes show normalized digits and keep a target preview', () => {
  for (const id of STATIC_WRITES) {
    const tool = byMethod(id);
    assert.equal(tool.kind, 'write', id);
    assert.equal(tool.loginCustomerArg, 'login_customer_id', id);
    const rawArgs = { login_customer_id: ' 123-4567890 ' };
    const shown = { [TARGET_PREVIEW_KEY]: { name: 'client' }, ...rawArgs };
    assert.deepEqual(approvalArgsWithManager(tool, rawArgs, shown), { ...shown, login_customer_id: '1234567890' }, id);
    assert.equal(approvalArgsWithManager(tool, rawArgs, shown)[TARGET_PREVIEW_KEY].name, 'client', id);
    const plain = { customerId: '1234567890' };
    assert.equal(approvalArgsWithManager(tool, plain, plain), plain, `${id}: identical object when omitted`);
    assert.throws(() => approvalArgsWithManager(tool, { login_customer_id: 'bad' }, { login_customer_id: 'bad' }), (err) => err.message === BAD_ID, id);
  }
  const nonAds = generated.find((t) => String(t.methodId).startsWith('searchads360.') && t.kind === 'write');
  assert.equal(nonAds.loginCustomerArg, undefined, 'non-Ads tools keep their old approvals');
});

// ---------------------------------------------------------------------------
// The shared gAds gateway api_call

test('the gAds api_call schema changes once; other products and generated SA360 schemas do not', () => {
  assert.deepEqual(Object.keys(adsApiCall.inputSchema), ['method', 'pathParams', 'query', 'body', 'offset', 'login_customer_id']);
  assert.ok(adsApiCall.inputSchema.login_customer_id.isOptional());
  const gmail = gatewayTools({ product: 'gmail', group: 'workspace-user', apis: [{ api: 'gmail', version: 'v1' }], cfg }).find((t) => t.name === 'api_call');
  assert.deepEqual(Object.keys(gmail.inputSchema), ['method', 'pathParams', 'query', 'body', 'offset']);
});

test('a gateway Ads call overrides the manager, and a write shows normalized digits in its approval', async () => {
  reset();
  await adsApiCall.handler({ method: LIST }, ctx);
  assert.equal(calls[0].headers['login-customer-id'], '5556667777');
  await adsApiCall.handler({ method: LIST, login_customer_id: ' 123-456-7890 ' }, ctx);
  assert.equal(calls[1].headers['login-customer-id'], '1234567890', 'the per-call value wins');
  await adsApiCall.handler({ method: LIST }, ctx);
  assert.equal(calls[2].headers['login-customer-id'], '5556667777', 'only that one call changed');
  reset();
  await adsApiCall.handler({ method: MUTATE, pathParams: { customerId: '1234567890' }, body: { operations: [{ campaignOperation: { create: {} } }] }, login_customer_id: ' 12-34567890 ' }, ctx);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].args.login_customer_id, '1234567890');
  assert.equal(calls[0].headers['login-customer-id'], '1234567890');
  reset();
  await adsApiCall.handler({ method: MUTATE, pathParams: { customerId: '1234567890' }, body: { operations: [{ campaignOperation: { create: {} } }] } }, ctx);
  assert.equal('login_customer_id' in gateCalls[0].args, false, 'the gate args are unchanged when omitted');
});

test('a malformed gateway manager id and an off-host method are refused before gate or request', async () => {
  reset();
  await assert.rejects(adsApiCall.handler({ method: LIST, login_customer_id: 'not-an-id' }, ctx), (err) => err.message === BAD_ID);
  assert.equal(calls.length, 0);
  assert.equal(gateCalls.length, 0);
  await assert.rejects(
    adsApiCall.handler({ method: 'searchads360.customers.listAccessibleCustomers', login_customer_id: '1234567890' }, ctx),
    /login_customer_id is only accepted for Google Ads calls/,
  );
  assert.equal(calls.length, 0, 'no SA360 request was sent');
  assert.equal(gateCalls.length, 0, 'no approval was asked');
});

test('every product with gateway APIs lists the same tools when the catalog is unavailable', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gsm-no-catalog-'));
  work.push(empty);
  process.env.GSM_DATA_DIR = empty;
  try {
    const servers = JSON.parse(readFileSync(join(ROOT, 'config', 'servers.json'), 'utf8')).servers;
    let checked = 0;
    for (const server of servers) {
      if (!server.gatewayApis || server.gatewayApis.length === 0) continue;
      const tools = gatewayTools({ product: server.name, group: server.group, apis: server.gatewayApis, cfg });
      assert.deepEqual(tools.map((t) => t.name), ['api_search', 'api_describe', 'api_call'], server.name);
      const expected = server.name === 'gads' ? Object.keys(adsApiCall.inputSchema) : Object.keys(adsApiCall.inputSchema).slice(0, 5);
      assert.deepEqual(Object.keys(tools[2].inputSchema), expected, server.name);
      checked += 1;
    }
    assert.equal(checked, 13, 'every product that declares gateway APIs was checked');
  } finally {
    delete process.env.GSM_DATA_DIR;
  }
});
