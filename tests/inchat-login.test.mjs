// Sign-in from the chat: the tools a server offers before a sign-in, the steps in one session (the client file, the
// sign-in URL with PKCE and the loopback redirect, the status while it waits), and that a waiting sign-in is stopped
// with its server. No browser opens (GSM_NO_BROWSER=1), and nothing calls Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = (id) => join(REPO, 'plugins', id, 'servers', `${id}.mjs`);

/** Starts a plugin server with a temporary token folder and no browser. Calls fn with a request function. */
async function withServer(serverFile, tokenDir, fn) {
  const env = { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_NO_BROWSER: '1' };
  delete env.GSM_API_KEY;
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  });
  let nextId = 1;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 60000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const call = async (name, args = {}) => {
    const res = await request('tools/call', { name, arguments: args });
    return res.result.content[0].text;
  };
  const names = async () => (await request('tools/list', {})).result.tools.map((tool) => tool.name);
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ request, call, names });
  } finally {
    // Closing stdin is what a client does at the end. The server then stops any sign-in still waiting.
    child.stdin.end();
    child.kill();
  }
}

test('a Google server offers the sign-in tools before any sign-in; a key server does not; the admin server has its setup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-inchat-names-'));
  try {
    await withServer(plugin('gmail'), dir, async ({ names }) => {
      const gmail = await names();
      for (const name of ['auth_setup_client', 'auth_login', 'auth_status', 'health']) assert.ok(gmail.includes(name), name);
      assert.ok(!gmail.includes('gmail_search'), 'scoped tools wait for the sign-in');
    });
    await withServer(plugin('gcloud'), dir, async ({ names }) => {
      const gcloud = await names();
      assert.ok(gcloud.includes('auth_login') && gcloud.includes('auth_setup_client'));
    });
    await withServer(plugin('gadmin'), dir, async ({ names }) => {
      assert.ok((await names()).includes('auth_setup_admin'));
    });
    await withServer(plugin('gsearch'), dir, async ({ names }) => {
      assert.ok(!(await names()).includes('auth_login'), 'an API key is never sent through the chat');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the steps in one session: no client yet, save the client, sign-in URL with PKCE and loopback, status while waiting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-inchat-flow-'));
  const desktop = join(dir, 'client.json');
  writeFileSync(desktop, JSON.stringify({ installed: { client_id: 'test-client-id.apps.googleusercontent.com', client_secret: 'test-secret-value' } }));
  try {
    await withServer(plugin('gmail'), dir, async ({ call }) => {
      const early = await call('auth_login', {});
      assert.match(early, /auth_setup_client/, 'without a client, the sign-in asks for the client first');

      const saved = await call('auth_setup_client', { path: desktop });
      assert.match(saved, /OAuth client saved/);
      assert.match(saved, /Next: call auth_login/);
      assert.ok(!saved.includes('test-secret-value'), 'the secret is never shown');

      const started = await call('auth_login', { profile: 'readonly' });
      const url = new URL(started.match(/https:\/\/accounts\.google\.com\S+/)[0]);
      assert.equal(url.searchParams.get('client_id'), 'test-client-id.apps.googleusercontent.com');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(url.searchParams.get('code_challenge'), 'a PKCE challenge is sent');
      assert.equal(url.searchParams.get('access_type'), 'offline');
      assert.match(url.searchParams.get('scope'), /userinfo\.email/);
      assert.match(url.searchParams.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);

      const status = await call('auth_status', {});
      assert.match(status, /Not signed in/);
      assert.match(status, /waiting for approval in the browser/);

      const again = await call('auth_login', {});
      assert.match(again, /already waiting for approval/);

      const health = JSON.parse(await call('health', {}));
      assert.equal(health.login.loggedIn, false);
      assert.equal(health.login.next, 'auth_login', 'with the client saved, the next step is the sign-in');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing or wrong client file is refused with the reason', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-inchat-bad-'));
  const wrong = join(dir, 'wrong.json');
  writeFileSync(wrong, '{"web":{"client_id":"x"}}');
  try {
    await withServer(plugin('gmail'), dir, async ({ call }) => {
      const refused = await call('auth_setup_client', { path: wrong });
      assert.match(refused, /Could not save the OAuth client/);
      assert.match(refused, /Desktop app/);
      const missing = await call('auth_setup_client', { path: join(dir, 'nothing-here.json') });
      assert.match(missing, /Could not save the OAuth client/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the health report of a server with no client file says to save the client first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-inchat-health-'));
  try {
    await withServer(plugin('gmail'), dir, async ({ call }) => {
      const health = JSON.parse(await call('health', {}));
      assert.equal(health.login.next, 'auth_setup_client');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
