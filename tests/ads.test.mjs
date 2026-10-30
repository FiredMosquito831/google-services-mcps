import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ads = await import(dist('servers/gads.js'));
const { describeError } = await import(dist('core/tools.js'));
const { buildTools, assertSelectQuery, resourceOperation, riskOfOperations, adsError } = ads;

const BASE = 'https://googleads.googleapis.com/v26';
const ADWORDS = 'https://www.googleapis.com/auth/adwords';
const TOKEN = 'DEV-TOKEN-7f3a9c-secret';
const CUSTOMER = '1234567890';

/** Sets or removes environment variables for one test. An undefined value removes the variable. */
function setEnv(vars) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN, GSM_ADS_LOGIN_CUSTOMER_ID: undefined });

/** A token directory with a client file and a business OAuth token. No network is used: the request method is stubbed. */
function makeTokenDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-ads-'));
  writeFileSync(join(dir, 'client.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(
    join(dir, 'business.token.json'),
    JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer', scope: ADWORDS }),
  );
  return dir;
}

const dir = makeTokenDir();
after(() => rmSync(dir, { recursive: true, force: true }));
const cfg = { allowWrites: true, tokenDir: dir, clientSecretFile: join(dir, 'client.json'), maxResultChars: 500000 };

const tools = await buildTools(cfg);
const tool = (name) => {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
};

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
  return { data: await respond(opts, url) };
};
const reset = (fn = () => ({})) => {
  calls = [];
  log = [];
  respond = fn;
};

/** A gate that records each call (and its input) in the shared log. `refuse` makes it throw, as a denied action does. */
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

const googleError = (status, body) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { error: body } } });

// ---- tool metadata ----

test('the four ads tools: names, kinds, the adwords scope and the name length', () => {
  assert.deepEqual(
    tools.map((t) => [t.name, t.kind]).sort(),
    [
      ['ads_list_customers', 'read'],
      ['ads_mutate', 'dynamic'],
      ['ads_resource_metadata', 'read'],
      ['ads_search', 'read'],
    ],
  );
  for (const t of tools) {
    assert.match(t.name, /^ads_[a-z_]+$/, `${t.name} is snake_case with the ads_ prefix`);
    assert.ok(t.name.length < 30, `${t.name} is under 30 characters`);
    assert.deepEqual(t.scopes, [ADWORDS], `${t.name} scopes`);
  }
});

// ---- GAQL: reads only ----

test('ads_search refuses anything that is not a SELECT before any request is sent', async () => {
  reset();
  for (const query of ['DELETE FROM campaign', 'INSERT INTO campaign', 'UPDATE campaign SET name = "x"', 'SELECTX campaign.id FROM campaign', '', 'campaign.id FROM campaign']) {
    await assert.rejects(tool('ads_search').handler({ customer_id: CUSTOMER, query }), /GAQL SELECT query/, query);
  }
  assert.equal(calls.length, 0, 'no request was sent');
});

test('assertSelectQuery accepts SELECT in any case and after leading spaces', () => {
  assert.doesNotThrow(() => assertSelectQuery('SELECT campaign.id FROM campaign'));
  assert.doesNotThrow(() => assertSelectQuery('  select campaign.id from campaign'));
  assert.throws(() => assertSelectQuery('SELECT'), /GAQL SELECT query/);
});

test('ads_search refuses a query over 10000 characters before any request is sent', async () => {
  reset();
  const query = `SELECT campaign.id FROM campaign WHERE campaign.name = '${'x'.repeat(10_000)}'`;
  await assert.rejects(tool('ads_search').handler({ customer_id: CUSTOMER, query }));
  assert.equal(calls.length, 0);
});

test('ads_search posts the query to customers/{id}/googleAds:search, with the developer token header', async () => {
  reset(() => ({ results: [{ campaign: { id: '1' } }] }));
  const out = await tool('ads_search').handler({ customer_id: CUSTOMER, query: 'select campaign.id from campaign' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/customers/${CUSTOMER}/googleAds:search`);
  assert.deepEqual(calls[0].body, { query: 'select campaign.id from campaign' });
  assert.equal(calls[0].headers['developer-token'], TOKEN);
  assert.equal(calls[0].headers['login-customer-id'], undefined, 'no login header when the manager ID is not set');
  assert.deepEqual(out, { rowCount: 1, results: [{ campaign: { id: '1' } }] });
});

test('ads_search returns at most 500 rows and notes the truncation', async () => {
  reset(() => ({ results: Array.from({ length: 600 }, (_, i) => ({ id: i })) }));
  const out = await tool('ads_search').handler({ customer_id: CUSTOMER, query: 'SELECT campaign.id FROM campaign' });
  assert.equal(out.rowCount, 500);
  assert.equal(out.results.length, 500);
  assert.equal(out.truncated, true);
  assert.match(out.note, /first 500/);
});

test('ads_search never sends pageSize, and takes no page_size input (Google Ads answers PAGE_SIZE_NOT_SUPPORTED)', async () => {
  reset(() => ({ results: [] }));
  await tool('ads_search').handler({ customer_id: CUSTOMER, query: 'SELECT campaign.id FROM campaign' });
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].body, 'pageSize'), false, 'the request body has no pageSize');
  assert.deepEqual(Object.keys(calls[0].body), ['query']);
  assert.equal(Object.hasOwn(tool('ads_search').inputSchema, 'page_size'), false, 'the input has no page_size');
  // An old caller that still passes page_size gets the same request: zod drops unknown keys.
  reset(() => ({ results: [] }));
  await tool('ads_search').handler({ customer_id: CUSTOMER, query: 'SELECT campaign.id FROM campaign', page_size: 600 });
  assert.deepEqual(calls[0].body, { query: 'SELECT campaign.id FROM campaign' });
});

test('ads_list_customers sends a GET to customers:listAccessibleCustomers and returns the resource names', async () => {
  reset(() => ({ resourceNames: ['customers/1234567890', 'customers/9876543210'] }));
  const out = await tool('ads_list_customers').handler({});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, `${BASE}/customers:listAccessibleCustomers`);
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[0].headers['developer-token'], TOKEN);
  assert.deepEqual(out, { resourceNames: ['customers/1234567890', 'customers/9876543210'] });
});

// ---- ads_mutate: the gate and the risk ----

test('ads_mutate with validate_only (the default) makes no gate call and sends validateOnly', async () => {
  reset(() => ({ mutateOperationResponses: [] }));
  const { ctx, gateCalls } = gateContext();
  const operations = [{ campaignOperation: { create: { name: 'Spring' } } }];
  const out = await tool('ads_mutate').handler({ customer_id: CUSTOMER, operations }, ctx);
  assert.equal(gateCalls.length, 0, 'the gate is not called for a validation');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `${BASE}/customers/${CUSTOMER}/googleAds:mutate`);
  assert.deepEqual(calls[0].body, { mutateOperations: operations, validateOnly: true });
  assert.equal(out.validateOnly, true);
});

test('ads_mutate with validate_only true makes no gate call even for a remove operation', async () => {
  reset(() => ({ mutateOperationResponses: [] }));
  const { ctx, gateCalls } = gateContext();
  await tool('ads_mutate').handler(
    { customer_id: CUSTOMER, operations: [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }], validate_only: true },
    ctx,
  );
  assert.equal(gateCalls.length, 0);
  assert.equal(calls[0].body.validateOnly, true);
});

test('ads_mutate with a remove operation calls the gate as destructive, with the operations, before the request', async () => {
  reset(() => ({ mutateOperationResponses: [{ campaignOperation: { resourceName: `customers/${CUSTOMER}/campaigns/9` } }] }));
  const { ctx, gateCalls } = gateContext();
  const operations = [{ campaignOperation: { remove: `customers/${CUSTOMER}/campaigns/9` } }];
  await tool('ads_mutate').handler({ customer_id: CUSTOMER, operations, validate_only: false }, ctx);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].kind, 'destructive');
  assert.equal(gateCalls[0].target, 'ads_mutate');
  // Changed on purpose: the gate names the real Discovery id of googleAds:mutate (it was googleads.customers.mutate),
  // so policy rules and the audit log match the same id as the generated and gateway mutate methods.
  assert.equal(gateCalls[0].methodId, 'googleads.customers.googleAds.mutate');
  assert.deepEqual(gateCalls[0].args.operations, operations, 'the gate sees the exact operations');
  assert.deepEqual(log, ['gate', 'request'], 'the gate ran before the request');
  assert.equal(calls[0].body.validateOnly, false);
});

test('ads_mutate with a create operation calls the gate as write', async () => {
  reset(() => ({ mutateOperationResponses: [{ campaignOperation: { resourceName: `customers/${CUSTOMER}/campaigns/10` } }] }));
  const { ctx, gateCalls } = gateContext();
  await tool('ads_mutate').handler(
    { customer_id: CUSTOMER, operations: [{ campaignBudgetOperation: { create: { name: 'Budget' } } }], validate_only: false },
    ctx,
  );
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].kind, 'write');
});

test('one remove in a mixed batch makes the whole mutate destructive', () => {
  assert.equal(riskOfOperations([{ campaignOperation: { create: {} } }, { adGroupOperation: { remove: 'x' } }]), 'destructive');
  assert.equal(riskOfOperations([{ campaignOperation: { update: {}, updateMask: 'name' } }]), 'write');
});

test('ads_mutate sends nothing when the gate refuses', async () => {
  reset(() => ({}));
  const { ctx } = gateContext({ refuse: 'Denied by the policy file' });
  await assert.rejects(
    tool('ads_mutate').handler({ customer_id: CUSTOMER, operations: [{ campaignOperation: { create: {} } }], validate_only: false }, ctx),
    /Denied by the policy file/,
  );
  assert.equal(calls.length, 0);
});

test('ads_mutate rejects a malformed operation before the gate or any request', async () => {
  reset(() => ({}));
  const { ctx, gateCalls } = gateContext();
  const bad = [
    [{}],
    [{ campaignOperation: { create: {} }, adGroupOperation: { create: {} } }],
    [{ remove: 'customers/1/campaigns/2' }],
    [{ campaignOperation: 'remove' }],
  ];
  for (const operations of bad) {
    await assert.rejects(
      tool('ads_mutate').handler({ customer_id: CUSTOMER, operations, validate_only: false }, ctx),
      /exactly one resource key ending in Operation/,
    );
  }
  assert.equal(gateCalls.length, 0);
  assert.equal(calls.length, 0);
  assert.doesNotThrow(() => resourceOperation({ campaignOperation: { create: {} } }), 'a well-formed operation is accepted');
});

// ---- developer token and login ----

test('without a developer token a call is still sent, with no developer-token header, and nothing asks for it', async () => {
  setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
  try {
    reset(() => ({ resourceNames: ['customers/1234567890'] }));
    const { ctx, gateCalls } = gateContext();
    await tool('ads_list_customers').handler({});
    assert.equal(calls.length, 1, 'the read is sent');
    assert.equal('developer-token' in calls[0].headers, false);
    // A write asks for approval as it does with a token, and is then sent with no developer-token header.
    reset(() => ({}));
    await tool('ads_mutate').handler({ customer_id: CUSTOMER, operations: [{ campaignOperation: { create: {} } }], validate_only: false }, ctx);
    assert.equal(gateCalls.length, 1, 'the write asks for approval');
    assert.equal(calls.length, 1, 'the write is sent after approval');
    assert.equal('developer-token' in calls[0].headers, false);
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
  }
});

test('the developer token can come from <tokenDir>/ads.json when the environment variable is not set', async () => {
  const dirB = makeTokenDir();
  try {
    writeFileSync(join(dirB, 'ads.json'), JSON.stringify({ developerToken: 'FILE-TOKEN-42' }), { mode: 0o600 });
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: undefined });
    const toolsB = await buildTools({ ...cfg, tokenDir: dirB, clientSecretFile: join(dirB, 'client.json') });
    reset(() => ({ resourceNames: [] }));
    await toolsB.find((t) => t.name === 'ads_list_customers').handler({});
    assert.equal(calls[0].headers['developer-token'], 'FILE-TOKEN-42');
  } finally {
    setEnv({ GSM_ADS_DEVELOPER_TOKEN: TOKEN });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('GSM_ADS_LOGIN_CUSTOMER_ID is sent as login-customer-id, with dashes removed', async () => {
  setEnv({ GSM_ADS_LOGIN_CUSTOMER_ID: '555-666-7777' });
  try {
    reset(() => ({ resourceNames: [] }));
    await tool('ads_list_customers').handler({});
    assert.equal(calls[0].headers['login-customer-id'], '5556667777');
    assert.equal(calls[0].headers['developer-token'], TOKEN);
  } finally {
    setEnv({ GSM_ADS_LOGIN_CUSTOMER_ID: undefined });
  }
});

test('a Google error that echoes the developer token reaches the user without it', async () => {
  reset(() => {
    throw googleError(403, {
      code: 403,
      status: 'PERMISSION_DENIED',
      message: `The developer token ${TOKEN} is not approved for this account.`,
      details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }, message: 'Developer token is not approved.' }] }],
    });
  });
  const err = await tool('ads_list_customers').handler({}).catch((e) => e);
  const text = describeError(err, 'business');
  assert.match(text, /^HTTP 403 \| reason=PERMISSION_DENIED \| /);
  assert.match(text, /DEVELOPER_TOKEN_NOT_APPROVED/);
  assert.equal(text.includes(TOKEN), false, 'the token is not in the message');
  assert.equal(err.message.includes(TOKEN), false);
});

test('no error message carries the developer token, including network and validation errors', async () => {
  const messages = [];
  const { ctx } = gateContext();

  reset(() => {
    throw Object.assign(new Error(`socket hang up while sending ${TOKEN}`), {});
  });
  messages.push(await tool('ads_list_customers').handler({}).catch((e) => e.message));

  reset(() => ({}));
  messages.push(await tool('ads_search').handler({ customer_id: CUSTOMER, query: 'DROP TABLE x' }).catch((e) => e.message));
  messages.push(await tool('ads_mutate').handler({ customer_id: 'abc', operations: [{ campaignOperation: { create: {} } }] }, ctx).catch((e) => e.message));

  for (const message of messages) {
    assert.ok(message, 'each call failed with a message');
    assert.equal(message.includes(TOKEN), false, `token absent from: ${message}`);
  }
  assert.equal(adsError(new Error(`boom ${TOKEN}`), TOKEN).message, 'boom [developer token removed]');
});

test('customer IDs must be digits only', async () => {
  reset(() => ({}));
  await assert.rejects(tool('ads_search').handler({ customer_id: '123-456-7890', query: 'SELECT campaign.id FROM campaign' }));
  await assert.rejects(tool('ads_mutate').handler({ customer_id: '12a', operations: [{ campaignOperation: { create: {} } }] }, gateContext().ctx));
  assert.equal(calls.length, 0);
});
