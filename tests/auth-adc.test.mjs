// A logged-out cloud read gets gsm's "Not logged in" message, not Google's Application Default Credentials text.
// Google's text is kept as the cause, and describeError shows it only with GSM_VERBOSE=1. The ADC lookup runs in a
// child process whose ADC locations and metadata host point at nothing, so a developer's own gcloud login cannot
// leak into the result. The token directory is a fresh temp folder with no token.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AUTH = new URL('../dist/core/auth.js', import.meta.url).href;
const TOOLS = new URL('../dist/core/tools.js', import.meta.url).href;
const DISCOVERY = new URL('../dist/core/discovery/tools.js', import.meta.url).href;
const work = [];
after(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

/** A child-process environment with no ADC file, no gcloud config and an unreachable metadata server. */
function isolatedEnv() {
  const root = mkdtempSync(join(tmpdir(), 'gsm-adc-'));
  work.push(root);
  const env = { ...process.env };
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'GCE_METADATA_IP', 'GOOGLE_CLOUD_PROJECT', 'CLOUDSDK_CONFIG', 'GSM_VERBOSE']) {
    delete env[key];
  }
  return {
    ...env,
    APPDATA: join(root, 'appdata'),
    HOME: root,
    USERPROFILE: root,
    GOOGLE_APPLICATION_CREDENTIALS: join(root, 'no-such-adc.json'),
    CLOUDSDK_CONFIG: join(root, 'gcloud'),
    GCE_METADATA_HOST: '127.0.0.1:9',
    tokenDir: join(root, 'tokens'),
  };
}

/** Runs a module snippet in a child process and returns the JSON line it prints last. */
function childJson(body, env) {
  const script = `
    const print = (value) => console.log(JSON.stringify(value));
    const describe = (err) => ({ name: err?.name, message: err?.message, cause: err?.cause instanceof Error ? err.cause.message : err?.cause ?? null });
    ${body}
  `;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8', timeout: 90_000 });
  const lines = (res.stdout ?? '').trim().split('\n');
  assert.ok(lines.length > 0 && lines[lines.length - 1].startsWith('{'), `child printed no JSON (stderr: ${res.stderr})`);
  return JSON.parse(lines[lines.length - 1]);
}

test('getCloudAdcClient with no ADC throws gsm\'s "Not logged in" message, with Google\'s text kept as the cause', () => {
  const env = isolatedEnv();
  const out = childJson(
    `const auth = await import(${JSON.stringify(AUTH)});
     try { await auth.getCloudAdcClient(); print({ ok: true }); } catch (err) { print(describe(err)); }`,
    env,
  );
  assert.equal(out.name, 'AuthRequiredError');
  assert.match(out.message, /^Not logged in for "cloud"\. Run: node <plugin>\/bin\/gsm\.mjs login cloud/);
  assert.doesNotMatch(out.message, /Application Default Credentials|Could not load the default credentials/i);
  assert.match(out.cause ?? '', /GOOGLE_APPLICATION_CREDENTIALS|credential/i, 'the ADC failure is kept as the cause');
});

test('the cloud discovery path (the gai server too) gets the same message when logged out', () => {
  const env = isolatedEnv();
  const out = childJson(
    `const tools = await import(${JSON.stringify(DISCOVERY)});
     try { await tools.authFor('cloud', { tokenDir: ${JSON.stringify(env.tokenDir)} }); print({ ok: true }); }
     catch (err) { print(describe(err)); }`,
    env,
  );
  assert.equal(out.name, 'AuthRequiredError');
  assert.match(out.message, /^Not logged in for "cloud"\. Run: node <plugin>\/bin\/gsm\.mjs login cloud/);
});

test('the cause is shown only with GSM_VERBOSE=1', async () => {
  const auth = await import(AUTH);
  const tools = await import(TOOLS);
  const err = new auth.AuthRequiredError('cloud', { cause: new Error('Could not load the default credentials.') });
  assert.equal(err.message.startsWith('Not logged in for "cloud"'), true);
  assert.equal(err.cause.message, 'Could not load the default credentials.');

  const saved = process.env.GSM_VERBOSE;
  try {
    delete process.env.GSM_VERBOSE;
    assert.equal(tools.describeError(err).includes('cause'), false, 'quiet by default');
    process.env.GSM_VERBOSE = '1';
    assert.match(tools.describeError(err), /\| cause: Could not load the default credentials\.$/);
  } finally {
    if (saved === undefined) delete process.env.GSM_VERBOSE;
    else process.env.GSM_VERBOSE = saved;
  }
});

test('an OAuth client makes at most three attempts in all, and gaxios\'s own retry is switched off for each', async () => {
  const { OAuth2Client } = await import('google-auth-library');
  const auth = await import(AUTH);
  const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-auth-retry-'));
  work.push(tokenDir);
  writeFileSync(join(tokenDir, 'client.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(
    join(tokenDir, 'business.token.json'),
    JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }),
  );
  const cfg = { tokenDir, clientSecretFile: join(tokenDir, 'client.json'), maxResultChars: 500000, allowWrites: false };

  const original = OAuth2Client.prototype.request;
  const seen = [];
  OAuth2Client.prototype.request = async function rateLimited(opts) {
    seen.push(opts);
    throw Object.assign(new Error('Rate limit exceeded'), { response: { status: 429, data: {}, headers: {} } });
  };
  try {
    const client = await auth.getAuthClient('business', cfg);
    await assert.rejects(client.request({ url: 'https://example.test/items', method: 'GET' }), /Rate limit exceeded/);
    assert.equal(seen.length, 3, 'three attempts in all');
    assert.ok(seen.every((opts) => opts.retry === false), 'gaxios does not retry on top of the helper');
  } finally {
    OAuth2Client.prototype.request = original;
  }
});
