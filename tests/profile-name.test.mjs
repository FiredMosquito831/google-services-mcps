// profile_me's name (1.35.1): userinfo.profile (Google: "See your personal info, including any personal info you've made
// publicly available") is a view-only scope, and gcontacts prefers it for readwrite and full, so every profile of a
// contacts sign-in asks for it, and no other product's login does. No call to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { resolveScopes, requirementsFor, isViewOnlyScope } = await import(DIST('core/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const PROFILE = G('userinfo.profile');
const dir = mkdtempSync(join(tmpdir(), 'gsm-profile-name-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
const quiet = { warn: () => undefined };
const withToolset = (toolset) => ({ ...quiet, ...(toolset !== 'all' ? { toolset } : {}) });

test('userinfo.profile is view-only; userinfo.email and openid are not listed', () => {
  assert.equal(isViewOnlyScope(PROFILE), true);
  assert.equal(isViewOnlyScope(G('userinfo.email')), false);
  assert.equal(isViewOnlyScope('openid'), false);
});

test('gcontacts: every profile and toolset asks for userinfo.profile, and profile_me is covered by it', async () => {
  for (const toolset of ['all', 'google', 'curated']) {
    const reqs = await requirementsFor(['gcontacts'], cfg, withToolset(toolset));
    for (const profile of ['readonly', 'readwrite', 'full']) {
      const r = resolveScopes(reqs, profile);
      assert.ok(r.scopes.includes(PROFILE), `${toolset} ${profile}: ${r.scopes.join(' ')}`);
      assert.ok(r.covered.includes('gcontacts/profile_me'), `${toolset} ${profile}`);
      assert.equal(r.scopes.includes('openid'), false, `${toolset} ${profile}: openid is not needed beside userinfo.profile`);
    }
  }
});

test('no other server asks for userinfo.profile, in any profile or toolset', async () => {
  for (const spec of loadRegistry(DIST('core/registry.js')).servers) {
    if (spec.group === 'apikey' || spec.name === 'gcontacts') continue;
    for (const toolset of ['all', 'google', 'curated']) {
      const reqs = await requirementsFor([spec.name], cfg, withToolset(toolset));
      for (const profile of ['readonly', 'readwrite', 'full']) {
        assert.equal(resolveScopes(reqs, profile).scopes.includes(PROFILE), false, `${spec.name} ${toolset} ${profile}`);
      }
    }
  }
});

test('auth_login on gcontacts (readonly) asks Google for userinfo.profile', async () => {
  const tokens = mkdtempSync(join(tmpdir(), 'gsm-profile-name-chat-'));
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  const env = { ...process.env, GSM_TOKEN_DIR: tokens, GSM_NO_BROWSER: '1' };
  delete env.GSM_TOOLSET;
  const child = spawn(process.execPath, [join(REPO, 'plugins', 'gcontacts', 'servers', 'gcontacts.mjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', (line) => {
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 120000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const answer = (await request('tools/call', { name: 'auth_login', arguments: { method: 'oauth', profile: 'readonly' } })).result.content[0].text;
    const asked = new URL(answer.match(/https:\/\/accounts\.google\.com\S+/)[0]).searchParams.get('scope').split(' ');
    assert.ok(asked.includes(PROFILE), asked.join(' '));
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(tokens, { recursive: true, force: true });
  }
});
