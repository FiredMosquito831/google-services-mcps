// Google Ads: the dynamic risk rule, the developer-token header, the generated and gateway mutate gates, the tool
// map and the PreToolUse hook. No network: the OAuth request is stubbed on OAuth2Client, and the hook runs as a child
// process from a temporary plugin folder, the way Claude Code runs it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const distPath = (p) => fileURLToPath(new URL(`../dist/${p}`, import.meta.url));
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const dynamic = await import(dist('core/dynamic.js'));
const methods = await import(dist('core/discovery/methods.js'));
const discovery = await import(dist('core/discovery/tools.js'));
const dump = await import(dist('core/dump.js'));
const tools = await import(dist('core/tools.js'));
const gateway = await import(dist('core/gateway.js'));
const ads = await import(dist('servers/gads.js'));
const { resolveDynamicKind } = dynamic;

const TOKEN = 'DEV-TOKEN-b41e07-secret';
const ADWORDS = 'https://www.googleapis.com/auth/adwords';
const CUSTOMER = '1234567890';
const ADS_BASE = 'https://googleads.googleapis.com/v26';
const MUTATE_CAMPAIGNS = 'googleads.customers.campaigns.mutate';

const work = [];
after(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

function setEnv(vars) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN, GSM_ADS_LOGIN_CUSTOMER_ID: undefined });

/** A token directory with a client file and a business OAuth token, and no ads.json. */
function makeTokenDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-googleads-'));
  work.push(dir);
  writeFileSync(join(dir, 'client.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(
    join(dir, 'business.token.json'),
    JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer', scope: ADWORDS }),
  );
  return dir;
}

const tokenDir = makeTokenDir();
const cfg = { allowWrites: true, tokenDir, clientSecretFile: join(tokenDir, 'client.json'), maxResultChars: 500000 };

// ---- the HTTP layer, stubbed ----

let calls = [];
let log = [];
let respond = () => {
  throw new Error('no canned response for this test');
};
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  calls.push({ method: opts.method, url: `${url.origin}${url.pathname}${url.search}`, headers: opts.headers ?? {}, body: opts.data });
  log.push('request');
  return { status: 200, data: await respond(opts, url) };
};
function reset(fn = () => ({})) {
  calls = [];
  log = [];
  respond = fn;
}

/** A context whose gate records each call in the shared log. `refuse` makes it throw, as a denied action does. */
function gateContext({ refuse } = {}) {
  const gateCalls = [];
  const ctx = {
    gate: async (input) => {
      gateCalls.push(input);
      log.push('gate');
      if (refuse) throw new Error(refuse);
    },
    grantedScopes: null,
    hasScope: () => true,
  };
  return { ctx, gateCalls };
}

// ---- the Discovery documents and the generated tools ----

const products = JSON.parse(readFileSync(join(ROOT, 'config', 'products.json'), 'utf8')).products;
const gadsGenerated = products.gads.generated.find((g) => g.api === 'googleads');
const googleadsDoc = JSON.parse(readFileSync(join(ROOT, 'data', 'discovery', 'googleads.v26.json'), 'utf8'));

/** The generated tools for the googleads subset of gads, built as the bundle builds them (no network). */
function googleadsTools(conf = cfg) {
  const kinds = discovery.loadToolKinds(ROOT);
  const generated = discovery.generateDiscoveryTools(
    'gads',
    'business',
    [{ apiName: 'googleads', apiVersion: 'v26', doc: googleadsDoc, include: gadsGenerated.include }],
    kinds,
    conf,
    methods.nameBudget('gads', 'gads'),
    ['ads_list_customers', 'ads_search', 'ads_mutate'],
  );
  return generated.tools;
}

const generated = googleadsTools();
const byMethod = (id) => {
  const tool = generated.find((t) => t.methodId === id);
  assert.ok(tool, `generated tool for ${id}`);
  return tool;
};

// ---- (a) the dynamic risk rule ----

test('(a) resolveDynamicKind: validateOnly true is a read, even with a remove', () => {
  const body = { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }], validateOnly: true };
  assert.equal(resolveDynamicKind(MUTATE_CAMPAIGNS, body), 'read');
});

test('(a) resolveDynamicKind: a remove operation is destructive, and a create is a write', () => {
  assert.equal(
    resolveDynamicKind(MUTATE_CAMPAIGNS, { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }] }),
    'destructive',
  );
  assert.equal(
    resolveDynamicKind(MUTATE_CAMPAIGNS, { operations: [{ campaignBudgetOperation: { create: { name: 'Budget' } } }], validateOnly: false }),
    'write',
  );
});

test('(a) resolveDynamicKind: one remove in a mixed batch makes it destructive', () => {
  const body = {
    operations: [{ adGroupOperation: { create: { name: 'a' } } }, { adGroupOperation: { remove: 'customers/1/adGroups/2' } }],
  };
  assert.equal(resolveDynamicKind('googleads.customers.adGroups.mutate', body), 'destructive');
});

test('(a) resolveDynamicKind: googleAds.mutate bodies (mutateOperations) use the same rule', () => {
  const id = 'googleads.customers.googleAds.mutate';
  assert.equal(resolveDynamicKind(id, { mutateOperations: [{ campaignOperation: { remove: 'x' } }] }), 'destructive');
  assert.equal(resolveDynamicKind(id, { mutateOperations: [{ campaignOperation: { create: {} } }] }), 'write');
  assert.equal(resolveDynamicKind(id, { mutateOperations: [{ campaignOperation: { remove: 'x' } }], validateOnly: true }), 'read');
});

test('(a) resolveDynamicKind: a method of another API returns null, so the caller asks', () => {
  assert.equal(resolveDynamicKind('compute.instances.update', { validateOnly: true }), null);
  assert.equal(resolveDynamicKind('sheets.spreadsheets.values.append', { operations: [] }), null);
});

test('(a) resolveDynamicKind: validateOnly must be the boolean true, and a body without operations is a write', () => {
  assert.equal(resolveDynamicKind(MUTATE_CAMPAIGNS, { validateOnly: 'true', operations: [{ campaignOperation: { create: {} } }] }), 'write');
  assert.equal(resolveDynamicKind(MUTATE_CAMPAIGNS, undefined), 'write');
  assert.equal(dynamic.operationsRisk([{ remove: 'x' }]), 'destructive', 'a remove on the operation itself counts');
});

test('(a) the curated ads module uses the same operations rule', () => {
  assert.equal(ads.riskOfOperations([{ campaignOperation: { remove: 'x' } }]), 'destructive');
  assert.equal(ads.riskOfOperations([{ campaignOperation: { create: {} } }]), 'write');
});

// ---- (b) the developer-token header, and no token in an error ----

test('(b) the developer-token header is sent to the Google Ads host and to no other host', async () => {
  reset(() => ({ resourceNames: [] }));
  const list = byMethod('googleads.customers.listAccessibleCustomers');
  await list.handler({}, gateContext().ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ADS_BASE}/customers:listAccessibleCustomers`);
  assert.equal(calls[0].headers['developer-token'], TOKEN);

  // A non-Ads API in the same process never gets the header, even with the token set.
  const demoDoc = {
    name: 'demo',
    version: 'v1',
    rootUrl: 'https://demo.googleapis.com/',
    servicePath: '',
    schemas: {},
    resources: { items: { methods: { list: { id: 'demo.items.list', path: 'v1/items', httpMethod: 'GET', parameters: [], scopes: [ADWORDS] } } } },
  };
  const demo = discovery.generateDiscoveryTools('demo', 'business', [{ apiName: 'demo', apiVersion: 'v1', doc: demoDoc }], { overrides: {}, notes: {} }, cfg)
    .tools.find((t) => t.methodId === 'demo.items.list');
  reset(() => ({ items: [] }));
  await demo.handler({}, gateContext().ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['developer-token'], undefined, 'no developer token for a non-Ads API');
  assert.equal(calls[0].headers['login-customer-id'], undefined);
});

test('(b) the login-customer-id header is sent when GSM_ADS_LOGIN_CUSTOMER_ID is set, with dashes removed', async () => {
  setEnv({ GSM_ADS_LOGIN_CUSTOMER_ID: '555-666-7777' });
  try {
    reset(() => ({ resourceNames: [] }));
    await byMethod('googleads.customers.listAccessibleCustomers').handler({}, gateContext().ctx);
    assert.equal(calls[0].headers['login-customer-id'], '5556667777');
    assert.equal(calls[0].headers['developer-token'], TOKEN);
  } finally {
    setEnv({ GSM_ADS_LOGIN_CUSTOMER_ID: undefined });
  }
});

test('(b) a Google Ads error never carries the developer token, in the message, the description or the error object', async () => {
  const echo = Object.assign(new Error(`Request failed with status code 403 for token ${TOKEN}`), {
    response: { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: `developer token ${TOKEN} is not approved` } } },
    config: { headers: { 'developer-token': TOKEN } },
  });
  reset(() => {
    throw echo;
  });
  const err = await byMethod('googleads.customers.listAccessibleCustomers')
    .handler({}, gateContext().ctx)
    .catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message.includes(TOKEN), false, 'message');
  assert.equal(tools.describeError(err, 'business').includes(TOKEN), false, 'describeError');
  assert.equal(JSON.stringify(err).includes(TOKEN), false, 'the error object');
  assert.match(tools.describeError(err, 'business'), /HTTP 403/);
});

test('(b) the gateway api_call sends the developer-token header for googleads, and redacts a token echoed in an error', async () => {
  // The gateway reads the Discovery document from its cache (the compact snapshot has the same parameters).
  mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
  writeFileSync(join(tokenDir, 'discovery-cache', 'googleads.v26.json'), readFileSync(join(ROOT, 'data', 'discovery', 'googleads.v26.json')));
  const gw = gateway.gatewayTools({ product: 'gads', group: 'business', apis: [{ api: 'googleads', version: 'v26' }], cfg });
  const apiCall = gw.find((t) => t.name === 'api_call');

  reset(() => ({ resourceNames: [] }));
  await apiCall.handler({ method: 'googleads.customers.listAccessibleCustomers' }, gateContext().ctx);
  assert.equal(calls[0].headers['developer-token'], TOKEN);

  reset(() => {
    throw Object.assign(new Error(`boom ${TOKEN}`), {});
  });
  const err = await apiCall.handler({ method: 'googleads.customers.listAccessibleCustomers' }, gateContext().ctx).catch((e) => e);
  assert.equal(String(err.message).includes(TOKEN), false);
});

// ---- (c) no developer token is not an error: the call is sent without the header ----

test('(c) without a developer token, a read is sent with no developer-token header, and nothing blocks it', async () => {
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    reset(() => ({ resourceNames: ['customers/1234567890'] }));
    const { ctx, gateCalls } = gateContext();
    const list = byMethod('googleads.customers.listAccessibleCustomers');
    await list.handler({}, ctx);
    assert.equal(calls.length, 1, 'the request is sent');
    assert.equal(calls[0].url, `${ADS_BASE}/customers:listAccessibleCustomers`);
    assert.equal('developer-token' in calls[0].headers, false, 'no developer-token header without a configured token');
    assert.equal(gateCalls.length, 0, 'a read asks for no approval');
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

test('(c) without a developer token, a write still asks for approval, and then is sent with no developer-token header', async () => {
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    reset(() => ({}));
    const { ctx, gateCalls } = gateContext();
    const mutate = byMethod(MUTATE_CAMPAIGNS);
    await mutate.handler({ customerId: CUSTOMER, body: { operations: [{ campaignOperation: { create: {} } }] } }, ctx);
    assert.equal(gateCalls.length, 1, 'the write asks for approval, as it does with a token');
    assert.equal(calls.length, 1, 'the request is sent after approval');
    assert.equal('developer-token' in calls[0].headers, false);
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

test('(c) the developer-token header is absent when no token is configured, and present when one is', async () => {
  const ads = await import(dist('core/ads.js'));
  const noTokenDir = makeTokenDir();
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    assert.equal(ads.developerTokenOf({ tokenDir: noTokenDir }), undefined);
    assert.deepEqual(ads.adsHeaders({ tokenDir: noTokenDir }), {}, 'no headers at all without a token');

    reset(() => ({ resourceNames: [] }));
    await byMethod('googleads.customers.listAccessibleCustomers').handler({}, gateContext().ctx);
    assert.equal('developer-token' in calls[0].headers, false, 'absent in the request');

    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
    assert.deepEqual(ads.adsHeaders({ tokenDir: noTokenDir }), { 'developer-token': TOKEN });
    reset(() => ({ resourceNames: [] }));
    await byMethod('googleads.customers.listAccessibleCustomers').handler({}, gateContext().ctx);
    assert.equal(calls[0].headers['developer-token'], TOKEN, 'present in the request once a token is configured');
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

test('(c) the developer token can come from <tokenDir>/ads.json, and the token file is never printed', async () => {
  const dirB = makeTokenDir();
  writeFileSync(join(dirB, 'ads.json'), JSON.stringify({ developerToken: 'FILE-TOKEN-42' }), { mode: 0o600 });
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    const confB = { ...cfg, tokenDir: dirB, clientSecretFile: join(dirB, 'client.json') };
    reset(() => ({ resourceNames: [] }));
    await googleadsTools(confB)
      .find((t) => t.methodId === 'googleads.customers.listAccessibleCustomers')
      .handler({}, gateContext().ctx);
    assert.equal(calls[0].headers['developer-token'], 'FILE-TOKEN-42');
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

// ---- (d) the generated mutate tools and the tool map ----

test('(d) every googleads mutate method in the generated subset is a dynamic tool in the tool map', () => {
  const map = dump.toolMapFromDefs(generated.map((t) => ({ name: t.name, kind: t.kind, scopes: t.scopes, title: t.title, methodId: t.methodId })));
  const mutates = map.filter((e) => e.methodId?.endsWith('.mutate'));
  assert.ok(mutates.length >= 20, `the generated subset has ${mutates.length} mutate tools`);
  for (const entry of mutates) {
    assert.equal(entry.kind, 'dynamic', `${entry.methodId} is dynamic`);
    assert.match(entry.name, /^googleads_/, `${entry.name} is named after the API`);
    assert.ok(entry.name.length <= 41, `${entry.name} fits the name budget`);
  }
  const campaigns = map.find((e) => e.methodId === MUTATE_CAMPAIGNS);
  assert.ok(campaigns, 'campaigns.mutate is in the tool map');
  assert.equal(campaigns.kind, 'dynamic');
});

test('(d) the generated subset is the included resources only, and includes no media upload or operations resource', () => {
  const ids = generated.map((t) => t.methodId).filter(Boolean);
  assert.ok(ids.includes('googleads.customers.googleAds.search'), 'GAQL search is generated');
  assert.equal(ids.some((id) => id.startsWith('googleads.customers.operations.')), false);
  assert.equal(ids.some((id) => id.startsWith('googleads.media.')), false);
  assert.equal(ids.length, 33, 'the core resources are 33 per-method tools');
});

// ---- (f) the gate on a generated dynamic tool ----

test('(f) a validate-only generated mutate makes no gate call and sends validateOnly', async () => {
  reset(() => ({ mutateOperationResponses: [] }));
  const { ctx, gateCalls } = gateContext();
  const body = { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }], validateOnly: true };
  await byMethod(MUTATE_CAMPAIGNS).handler({ customerId: CUSTOMER, body }, ctx);
  assert.equal(gateCalls.length, 0, 'a validate-only call is not gated');
  assert.equal(calls.length, 1, 'the request is sent');
  assert.equal(calls[0].url, `${ADS_BASE}/customers/${CUSTOMER}/campaigns:mutate`);
  assert.equal(calls[0].body.validateOnly, true);
});

test('(f) a remove through the generated mutate asks the gate as destructive, with the method id and the body, before the request', async () => {
  reset(() => ({ results: [] }));
  const { ctx, gateCalls } = gateContext();
  const body = { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }] };
  await byMethod(MUTATE_CAMPAIGNS).handler({ customerId: CUSTOMER, body }, ctx);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].kind, 'destructive');
  assert.equal(gateCalls[0].methodId, MUTATE_CAMPAIGNS);
  assert.deepEqual(gateCalls[0].args, body, 'the gate receives the body');
  assert.deepEqual(log, ['gate', 'request'], 'the gate ran before the request');
});

test('(f) a create through the generated mutate is a write, and a refused gate sends nothing', async () => {
  reset(() => ({}));
  const { ctx, gateCalls } = gateContext();
  await byMethod(MUTATE_CAMPAIGNS).handler({ customerId: CUSTOMER, body: { operations: [{ campaignOperation: { create: { name: 'x' } } }] } }, ctx);
  assert.equal(gateCalls[0].kind, 'write');

  reset(() => ({}));
  const refused = gateContext({ refuse: 'Denied by the policy file' });
  await assert.rejects(
    byMethod(MUTATE_CAMPAIGNS).handler({ customerId: CUSTOMER, body: { operations: [{ campaignOperation: { remove: 'x' } }] } }, refused.ctx),
    /Denied by the policy file/,
  );
  assert.equal(calls.length, 0);
});

// ---- (g) the gateway's api_call gates the same way ----

test('(g) the gateway api_call: validate-only is not gated, a remove is destructive and is gated before the request', async () => {
  mkdirSync(join(tokenDir, 'discovery-cache'), { recursive: true });
  const gw = gateway.gatewayTools({ product: 'gads', group: 'business', apis: [{ api: 'googleads', version: 'v26' }], cfg });
  const apiCall = gw.find((t) => t.name === 'api_call');

  const validate = gateContext();
  reset(() => ({ mutateOperationResponses: [] }));
  await apiCall.handler({ method: MUTATE_CAMPAIGNS, pathParams: { customerId: CUSTOMER }, body: { operations: [{ campaignOperation: { remove: 'x' } }], validateOnly: true } }, validate.ctx);
  assert.equal(validate.gateCalls.length, 0, 'a validate-only call is not gated');
  assert.equal(calls.length, 1, 'the validate-only call is sent');

  const { ctx, gateCalls } = gateContext();
  reset(() => ({}));
  await apiCall.handler({ method: MUTATE_CAMPAIGNS, pathParams: { customerId: CUSTOMER }, body: { operations: [{ campaignOperation: { remove: 'x' } }] } }, ctx);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].kind, 'destructive');
  assert.equal(gateCalls[0].methodId, MUTATE_CAMPAIGNS);
  assert.deepEqual(log, ['gate', 'request']);

  const refused = gateContext({ refuse: 'no' });
  reset(() => ({}));
  await assert.rejects(apiCall.handler({ method: MUTATE_CAMPAIGNS, pathParams: { customerId: CUSTOMER }, body: { operations: [{ campaignOperation: { create: {} } }] } }, refused.ctx));
  assert.equal(calls.length, 0, 'a refused call sends nothing');
});

test('(g) the gateway sends a Google Ads call with no developer token, with no header, after the usual approval', async () => {
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    const gw = gateway.gatewayTools({ product: 'gads', group: 'business', apis: [{ api: 'googleads', version: 'v26' }], cfg });
    const apiCall = gw.find((t) => t.name === 'api_call');
    const { ctx, gateCalls } = gateContext();
    reset(() => ({}));
    await apiCall.handler({ method: MUTATE_CAMPAIGNS, pathParams: { customerId: CUSTOMER }, body: { operations: [{ campaignOperation: { create: {} } }] } }, ctx);
    assert.equal(gateCalls.length, 1, 'the create asks for approval');
    assert.equal(calls.length, 1, 'the request is sent');
    assert.equal('developer-token' in calls[0].headers, false, 'no developer-token header without a token');
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

// ---- (e) the PreToolUse hook, run as a child process in a temporary plugin folder ----

const HOOK_DIR_NAME = 'gads';
const ADS_OK = `mcp__plugin_${HOOK_DIR_NAME}_gads__googleads_customers_campaigns_mutate`;
const API_CALL = `mcp__plugin_${HOOK_DIR_NAME}_gads__api_call`;
const OTHER_DYNAMIC = `mcp__plugin_${HOOK_DIR_NAME}_gads__other_dynamic`;
/** The curated mutate tool: dynamic, no methodId, and its arguments are validate_only plus operations. */
const CURATED_MUTATE = `mcp__plugin_${HOOK_DIR_NAME}_gads__ads_mutate`;

/** A fake plugin folder with the compiled hook, the policy and dynamic-rule modules, and a tool map and method-kinds table. */
function fakeHookPlugin() {
  const root = mkdtempSync(join(tmpdir(), 'gsm-googleads-hook-'));
  work.push(root);
  const plugin = join(root, HOOK_DIR_NAME);
  mkdirSync(join(plugin, 'bin'), { recursive: true });
  mkdirSync(join(plugin, 'core'), { recursive: true });
  const tokens = join(root, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(plugin, 'package.json'), '{"type":"module"}\n');
  copyFileSync(distPath('hook/pretooluse.js'), join(plugin, 'bin', 'gsm-hook.mjs'));
  copyFileSync(distPath('core/policy.js'), join(plugin, 'core', 'policy.js'));
  copyFileSync(distPath('core/dynamic.js'), join(plugin, 'core', 'dynamic.js'));
  copyFileSync(distPath('core/plugin-option.js'), join(plugin, 'core', 'plugin-option.js'));
  writeFileSync(
    join(plugin, 'tool-map.json'),
    JSON.stringify([
      { name: ADS_OK, kind: 'dynamic', scopes: [ADWORDS], methodId: MUTATE_CAMPAIGNS },
      { name: API_CALL, kind: 'dynamic', scopes: [] },
      { name: OTHER_DYNAMIC, kind: 'dynamic', scopes: [], methodId: 'compute.instances.update' },
      { name: CURATED_MUTATE, kind: 'dynamic', scopes: [ADWORDS] },
    ]),
  );
  writeFileSync(
    join(plugin, 'method-kinds.json'),
    JSON.stringify({ [MUTATE_CAMPAIGNS]: 'dynamic', 'compute.instances.delete': 'destructive', 'googleads.customers.listAccessibleCustomers': 'read' }),
  );
  return { hook: join(plugin, 'bin', 'gsm-hook.mjs'), tokenDir: tokens };
}

function hookEvent(toolName, toolInput) {
  return {
    session_id: 'test-session',
    transcript_path: 'transcript.jsonl',
    cwd: process.cwd(),
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'toolu_test',
  };
}

/** Runs the hook with the event on stdin. Returns the parsed decision, or null when it printed nothing. */
function runHook(hook, tokenDir, event) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete env.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  const result = spawnSync(process.execPath, [hook], { input: JSON.stringify(event), env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, `hook exit code (stderr: ${result.stderr})`);
  const out = result.stdout.trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput;
}

test('(e) the hook asks for a remove through a per-method mutate, and prints nothing for a validate-only mutate', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const remove = { customerId: CUSTOMER, body: { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }] } };
  const decision = runHook(hook, tokens, hookEvent(ADS_OK, remove));
  assert.equal(decision?.permissionDecision, 'ask');

  const validate = { customerId: CUSTOMER, body: { operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }], validateOnly: true } };
  assert.equal(runHook(hook, tokens, hookEvent(ADS_OK, validate)), null, 'a validate-only mutate is not asked');
});

test('(e) the hook asks for a create or update through a per-method mutate (a write), under the default confirmation', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const create = { customerId: CUSTOMER, body: { operations: [{ campaignOperation: { create: { name: 'x' } } }] } };
  assert.equal(runHook(hook, tokens, hookEvent(ADS_OK, create))?.permissionDecision, 'ask');
});

test('(e) the hook classifies the gateway api_call from its body, and asks when the method has no rule', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const readValidate = { method: MUTATE_CAMPAIGNS, body: { operations: [{ campaignOperation: { remove: 'x' } }], validateOnly: true } };
  assert.equal(runHook(hook, tokens, hookEvent(API_CALL, readValidate)), null, 'api_call validate-only is not asked');

  const remove = { method: MUTATE_CAMPAIGNS, body: { operations: [{ campaignOperation: { remove: 'x' } }] } };
  assert.equal(runHook(hook, tokens, hookEvent(API_CALL, remove))?.permissionDecision, 'ask', 'api_call remove is asked');

  const unknown = { method: 'googleads.customers.nope.mutate', body: { validateOnly: true } };
  assert.equal(runHook(hook, tokens, hookEvent(API_CALL, unknown))?.permissionDecision, 'ask', 'a method not in the table is asked');
});

test('(e) the hook asks for a dynamic per-method tool whose method has no dynamic rule, even with a validate-only body', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  assert.equal(runHook(hook, tokens, hookEvent(OTHER_DYNAMIC, { body: { validateOnly: true } }))?.permissionDecision, 'ask');
});

// ---- (h) the curated ads_mutate: the hook and the tool classify the same arguments the same way ----

const CAMPAIGN_REMOVE = { campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } };
const CAMPAIGN_CREATE = { campaignOperation: { create: { name: 'Summer' } } };

test('(h) the hook: a validate-only curated mutate prints nothing', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const validate = { customer_id: CUSTOMER, operations: [CAMPAIGN_REMOVE], validate_only: true };
  assert.equal(runHook(hook, tokens, hookEvent(CURATED_MUTATE, validate)), null, 'validate_only true is a read, not asked');
});

test('(h) the hook: validate_only defaults to true, as the curated tool does, so an omitted flag is not asked', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  assert.equal(runHook(hook, tokens, hookEvent(CURATED_MUTATE, { customer_id: CUSTOMER, operations: [CAMPAIGN_CREATE] })), null);
});

test('(h) the hook: operations with remove ask, as destructive, with a preview of the operations', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const decision = runHook(
    hook,
    tokens,
    hookEvent(CURATED_MUTATE, { customer_id: CUSTOMER, operations: [CAMPAIGN_REMOVE], validate_only: false }),
  );
  assert.equal(decision?.permissionDecision, 'ask');
  assert.match(decision.permissionDecisionReason, /permanently change or delete Google data/);
  assert.match(decision.permissionDecisionReason, /may be irreversible/);
  assert.match(decision.permissionDecisionReason, /"remove": "customers\/1234567890\/campaigns\/9"/, 'the operations are shown');
  assert.match(decision.permissionDecisionReason, /Method: googleads\.customers\.googleAds\.mutate/, 'the Google method is named');
});

test('(h) the hook: operations with create ask as a write, under the default confirmation', () => {
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const decision = runHook(hook, tokens, hookEvent(CURATED_MUTATE, { customer_id: CUSTOMER, operations: [CAMPAIGN_CREATE], validate_only: false }));
  assert.equal(decision?.permissionDecision, 'ask');
  assert.match(decision.permissionDecisionReason, /About to change Google data/);
  assert.doesNotMatch(decision.permissionDecisionReason, /permanently/);
});

test('(h) a method key in the curated arguments is ignored, so a removal cannot borrow the kind of a read method', () => {
  // The table says this method is a read. The curated server ignores the key and applies the removal, so the hook must ask.
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const borrowed = {
    customer_id: CUSTOMER,
    operations: [CAMPAIGN_REMOVE],
    validate_only: false,
    method: 'googleads.customers.listAccessibleCustomers',
  };
  assert.equal(runHook(hook, tokens, hookEvent(CURATED_MUTATE, borrowed))?.permissionDecision, 'ask');
});

test('(h) a validateOnly key in the curated arguments cannot turn a real change into a read', () => {
  // The curated schema strips validateOnly, so the server applies this change. The hook must ask for it.
  const { hook, tokenDir: tokens } = fakeHookPlugin();
  const sneaky = { customer_id: CUSTOMER, operations: [CAMPAIGN_CREATE], validate_only: false, validateOnly: true };
  assert.equal(runHook(hook, tokens, hookEvent(CURATED_MUTATE, sneaky))?.permissionDecision, 'ask');
});

test('(h) the server gate agrees with the hook: a validate-only call is not gated, a remove is gated as destructive', async () => {
  reset(() => ({}));
  const tool = (await ads.buildTools(cfg)).find((t) => t.name === 'ads_mutate');
  assert.ok(tool, 'the curated ads_mutate tool');

  const validate = gateContext();
  await tool.handler({ customer_id: CUSTOMER, operations: [CAMPAIGN_REMOVE], validate_only: true }, validate.ctx);
  assert.equal(validate.gateCalls.length, 0, 'validate-only: no gate call');
  assert.equal(calls.length, 1, 'validate-only: still sent to Google, which changes nothing');
  assert.equal(calls[0].body.validateOnly, true);

  const remove = gateContext();
  await tool.handler({ customer_id: CUSTOMER, operations: [CAMPAIGN_REMOVE], validate_only: false }, remove.ctx);
  assert.equal(remove.gateCalls.length, 1);
  assert.equal(remove.gateCalls[0].kind, 'destructive');
  assert.equal(remove.gateCalls[0].methodId, 'googleads.customers.googleAds.mutate');
});

// ---- the rule's home: the pattern in config/tool-kinds.json ----

test('the googleads.*.mutate rule classifies every Google Ads mutate method as dynamic, and nothing else', () => {
  const kinds = discovery.loadToolKinds(ROOT);
  assert.equal(kinds.overrides['googleads.*.mutate'], 'dynamic');
  assert.equal(methods.classifyMethod('POST', 'mutate', MUTATE_CAMPAIGNS, kinds.overrides), 'dynamic');
  assert.equal(methods.classifyMethod('POST', 'mutate', 'googleads.customers.googleAds.mutate', kinds.overrides), 'dynamic');
  assert.equal(methods.classifyMethod('POST', 'mutate', 'compute.instances.mutate', kinds.overrides), 'write', 'other APIs are not covered');
  assert.equal(methods.classifyMethod('POST', 'search', 'googleads.customers.googleAds.search', kinds.overrides), 'read');
  assert.equal(methods.classifyMethod('DELETE', 'delete', 'googleads.customers.operations.delete', kinds.overrides), 'destructive');
  assert.equal(methods.overrideKind({ 'a.*.b': 'read' }, 'a.x.y.b'), 'read');
  assert.equal(methods.overrideKind({ 'a.b': 'read' }, 'a.b.c'), undefined, 'a pattern with no star is exact only');
});

test('the gads product lists googleads as generated (core resources) and in the gateway (every method)', () => {
  const gads = products.gads;
  assert.ok(gadsGenerated, 'googleads is generated by gads');
  assert.ok(gadsGenerated.include.includes('customers.googleAds'));
  assert.ok(gads.gateway.some((g) => g.api === 'googleads' && g.version === 'v26' && !g.include));
  assert.ok(gads.generatedToolCount <= 350, `gads has ${gads.generatedToolCount} generated tools`);
  assert.equal(existsSync(join(ROOT, 'docs', 'ads-version.txt')), true, 'the version is recorded');
  assert.match(readFileSync(join(ROOT, 'docs', 'ads-version.txt'), 'utf8'), /^v26\b/);
});
