// A login that covers no tool of a product (1.32.0): gsm scopes, gsm login and the chat sign-in say so, name the profile
// that covers the product, and never stop the login. Business Profile under readonly is the case: its only scope,
// business.manage, has no read-only form. Nothing calls Google: the login runs with a fake browser step, the chat sign-in
// against the built gbusiness plugin with no browser, and the ADC route with a gcloud stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { runLogin } = await import(DIST('cli/login.js'));
const { runScopes } = await import(DIST('cli/scopes.js'));
const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { notCoveredBy, notCoveredLine } = await import(DIST('core/scopes.js'));
const { createSignIn, notCoveredOutput } = await import(DIST('core/inchat-login.js'));
const { saveAccount } = await import(DIST('core/accounts.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const BM = G('business.manage');
const registry = () => loadRegistry(DIST('core/registry.js'));

const temps = [];
function tempTokens(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-not-covered-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  return { dir, cfg: loadConfig({ GSM_TOKEN_DIR: dir, ...env }) };
}
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function capture() {
  const lines = [];
  return { lines, out: { log: (t) => lines.push(t), warn: (t) => lines.push(t) }, text: () => lines.join('\n') };
}

// ---------------------------------------------------------------------------
// The rule

test('notCoveredBy: a product none of whose scoped tools is covered; covered, unscoped and gateway-only products are not', () => {
  const reqs = [
    { tool: 'p/read', kind: 'read', scopes: [G('thing')] },
    { tool: 'p/write', kind: 'write', scopes: [G('thing')] },
    { tool: 'p/api_methods', kind: 'read', scopes: [] },
    { tool: 'p/x.items.get', kind: 'read', scopes: [G('thing.readonly')], gateway: true },
  ];
  const n = notCoveredBy(reqs, 'readonly', [], [G('thing.readonly')]);
  assert.deepEqual(n, { tools: 2, gateway: { reached: 1, total: 1 }, noReadOnlyForm: true, next: { profile: 'readwrite', covers: 2 } });
  assert.equal(
    notCoveredLine('p', 'readonly', n),
    'Not covered: the readonly profile covers none of the 2 tool(s) of p that need a Google scope (none of them offers a read-only scope). ' +
      'api_call still reaches 1 of its 1 gateway methods. The readwrite profile covers all 2: --profile readwrite (in the chat: auth_login with profile "readwrite"). ' +
      'Its write tools stay hidden until writes are allowed in the plugin settings.',
  );
  // One covered tool is enough; a product whose tools need no scope, or have none, is never named.
  assert.equal(notCoveredBy(reqs, 'readwrite', [], [G('thing')]), undefined);
  assert.equal(notCoveredBy([{ tool: 'p/api_methods', kind: 'read', scopes: [] }], 'readonly', [], []), undefined);
  assert.equal(notCoveredBy([], 'readonly', [], []), undefined);
  // A read tool that offers a read-only scope: not "no read-only form" (held back for another reason, say).
  const offered = notCoveredBy([{ tool: 'p/r', kind: 'read', scopes: [G('a.readonly')], optional: 'part' }], 'readonly', [], []);
  assert.equal(offered.noReadOnlyForm, false);
  assert.equal(offered.next, undefined, 'an optional part not named stays out of every profile');
  assert.match(notCoveredLine('p', 'readonly', offered), /No broader profile covers them\.$/);
});

// ---------------------------------------------------------------------------
// gsm scopes

const notCoveredOf = async (group, servers, toolset) => {
  // The JSON only: a toolset a product does not have is noted on the warning channel.
  const lines = [];
  await runScopes({ group, servers, json: true, ...(toolset ? { toolset } : {}) }, registry(), { log: (t) => lines.push(t), warn: () => undefined });
  const parsed = JSON.parse(lines.join('\n'));
  return Object.fromEntries(Object.entries(parsed.profiles).map(([profile, p]) => [profile, p.notCovered ?? []]));
};

test('gsm scopes: readonly leaves gbusiness with no tool and says so; readwrite and full cover it', async () => {
  const lines = await notCoveredOf('business', undefined);
  assert.equal(lines.readonly.length, 1, lines.readonly.join('\n'));
  assert.match(lines.readonly[0], /^Not covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness that need a Google scope \(none of them offers a read-only scope\)\. The readwrite profile covers all 51: --profile readwrite/);
  assert.deepEqual(lines.readwrite, []);
  assert.deepEqual(lines.full, []);

  const text = capture();
  await runScopes({ group: 'business', servers: ['gbusiness'], json: false, profile: 'readonly' }, registry(), text.out);
  assert.match(text.text(), /^ {2}Not covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness/m);
});

test('gsm scopes: with the google toolset, readonly leaves gads (adwords has no read-only form) and gbusiness with no tool', async () => {
  const lines = await notCoveredOf('business', undefined, 'google');
  assert.equal(lines.readonly.length, 2, lines.readonly.join('\n'));
  assert.match(lines.readonly.find((l) => / of gads /.test(l)), /covers none of the 3 tool\(s\) of gads .*The readwrite profile covers all 3/);
  assert.match(lines.readonly.find((l) => / of gbusiness /.test(l)), /covers none of the 8 tool\(s\) of gbusiness/);
  assert.deepEqual(lines.readwrite, []);
});

test('gsm scopes: which plugins, toolsets and profiles name a product with no tool (every case of the five login groups)', async () => {
  const found = [];
  for (const spec of registry().servers) {
    if (!['cloud', 'workspace-user', 'searchconsole', 'business', 'developer', 'workspace-admin'].includes(spec.group)) continue;
    for (const toolset of ['all', 'google', 'curated']) {
      const lines = await notCoveredOf(spec.group, [spec.name], toolset);
      for (const [profile, list] of Object.entries(lines)) if (list.length > 0) found.push(`${spec.name} ${profile} ${toolset}`);
    }
  }
  assert.deepEqual(found.sort(), [
    'gads readonly curated',
    'gads readonly google',
    'gbusiness readonly all',
    'gbusiness readonly curated',
    'gbusiness readonly google',
    'gfirebase readonly curated',
  ]);
});

test('gsm scopes: the service-account group takes no profile, so it names no product', async () => {
  const lines = await notCoveredOf('service-account', undefined, 'google');
  assert.deepEqual(lines, { readonly: [], readwrite: [], full: [] });
});

// ---------------------------------------------------------------------------
// gsm login

/** A fake browser step that records the scopes and what the login had printed when the browser would open. */
function fakeGoogle(account, printed) {
  const seen = {};
  return {
    seen,
    deps: (cfg) => ({
      cfg,
      loopback: async (_id, _secret, scopes) => {
        seen.scopes = [...scopes].sort();
        seen.printedBefore = printed();
        return { access_token: 'fake-access', refresh_token: 'fake-refresh', scope: scopes.join(' ') };
      },
      accountOf: async () => account,
    }),
  };
}

test('gsm login business --servers gbusiness (readonly): the line comes before the browser step, and the login goes on', async () => {
  const { cfg } = tempTokens();
  const run = capture();
  const google = fakeGoogle('owner@example.com', () => run.text());
  assert.equal(await runLogin({ group: 'business', servers: ['gbusiness'], profile: 'readonly' }, registry, run.out, google.deps(cfg)), 0, run.text());
  assert.match(google.seen.printedBefore, /^Not covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness/m);
  assert.deepEqual(google.seen.scopes, [G('userinfo.email')], 'the login asks for what readonly resolves to, unchanged');
  assert.match(run.text(), /^Saved token:/m);
});

test('gsm login: readwrite says nothing; a named account whose stored scopes cover the product says nothing', async () => {
  const a = tempTokens();
  const rw = capture();
  await runLogin({ group: 'business', servers: ['gbusiness'], profile: 'readwrite' }, registry, rw.out, fakeGoogle('o@example.com', () => '').deps(a.cfg));
  assert.equal(/Not covered:/.test(rw.text()), false, rw.text());

  const b = tempTokens();
  saveAccount('business', 'o@example.com', { refresh_token: 'r', scope: `${BM} ${G('userinfo.email')}` }, b.cfg);
  const merged = capture();
  const google = fakeGoogle('o@example.com', () => merged.text());
  await runLogin({ group: 'business', servers: ['gbusiness'], profile: 'readonly', account: 'o@example.com' }, registry, merged.out, google.deps(b.cfg));
  assert.ok(google.seen.scopes.includes(BM), 'the stored scope is merged');
  assert.equal(/Not covered:/.test(merged.text()), false, merged.text());
});

// ---------------------------------------------------------------------------
// The chat sign-in

test('notCoveredOutput keeps the Not covered lines of a login output only', () => {
  const output = ['Profile readonly: ...', '  Not covered: the readonly profile covers none of the 1 tool(s) of x.', 'Held back: y', 'https://accounts.google.com/x'].join('\n');
  assert.deepEqual(notCoveredOutput(output), ['Not covered: the readonly profile covers none of the 1 tool(s) of x.']);
  assert.deepEqual(notCoveredOutput('nothing here'), []);
});

test('the chat sign-in passes the Not covered line of the login on with the sign-in address', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-not-covered-argv-'));
  temps.push(dir);
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'x', client_secret: 'y' } }));
  const cli = join(dir, 'fake-gsm.mjs');
  writeFileSync(
    cli,
    [
      "console.log('Not covered: the readonly profile covers none of the 51 tool(s) of gbusiness that need a Google scope.');",
      "console.log('https://accounts.google.com/o/oauth2/v2/auth?scope=x');",
      '',
    ].join('\n'),
  );
  const signIn = createSignIn({ cliFile: cli, group: 'business', server: 'gbusiness', cfg: loadConfig({ GSM_TOKEN_DIR: dir }), adcScopes: () => [], onSignedIn: () => undefined });
  const answer = await signIn.start('readonly', 'oauth');
  assert.match(answer, /https:\/\/accounts\.google\.com\//);
  assert.match(answer, /\nNot covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness/);
});

/** Starts a built plugin server and talks to it over stdio. */
async function withServer(serverFile, env, fn) {
  const child = spawn(process.execPath, [serverFile], { env, stdio: ['pipe', 'pipe', 'pipe'] });
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
  const call = async (name, args = {}) => (await request('tools/call', { name, arguments: args })).result.content[0].text;
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return await fn({ call });
  } finally {
    child.stdin.end();
    child.kill();
  }
}

const GBUSINESS = join(REPO, 'plugins', 'gbusiness', 'servers', 'gbusiness.mjs');

function serverEnv(dir, extra = {}) {
  const appdata = join(dir, 'appdata');
  mkdirSync(appdata, { recursive: true });
  const env = { ...process.env, GSM_TOKEN_DIR: dir, GSM_NO_BROWSER: '1', APPDATA: appdata, GOOGLE_APPLICATION_CREDENTIALS: join(dir, 'missing-adc.json'), ...extra };
  delete env.GSM_TOOLSET;
  return env;
}

test('auth_login on gbusiness (oauth, readonly): the answer names readwrite; readwrite gives no such line', async () => {
  const { dir } = tempTokens();
  await withServer(GBUSINESS, serverEnv(dir), async ({ call }) => {
    const answer = await call('auth_login', { method: 'oauth', profile: 'readonly' });
    assert.match(answer, /https:\/\/accounts\.google\.com\//);
    assert.match(answer, /\nNot covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness .*--profile readwrite \(in the chat: auth_login with profile "readwrite"\)/);
  });
  await withServer(GBUSINESS, serverEnv(dir), async ({ call }) => {
    const answer = await call('auth_login', { method: 'oauth', profile: 'readwrite' });
    assert.match(answer, /https:\/\/accounts\.google\.com\//);
    assert.equal(/Not covered:/.test(answer), false, answer);
  });
});

test('auth_login on gbusiness (adc, readonly): the ADC route says the same, from the scopes it asks gcloud for', async () => {
  const { dir } = tempTokens();
  const adcFile = join(dir, 'adc.json');
  writeFileSync(adcFile, JSON.stringify({ type: 'authorized_user', client_id: 'c', client_secret: 's', refresh_token: 'rt-not-covered' }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'gcloud.cmd'), '@echo off\r\necho Your browser has been opened to visit:\r\necho     https://accounts.google.com/o/oauth2/auth?fake=1\r\nexit /b 0\r\n');
  } else {
    writeFileSync(join(bin, 'gcloud'), '#!/bin/sh\necho "Your browser has been opened to visit:"\necho "    https://accounts.google.com/o/oauth2/auth?fake=1"\nexit 0\n');
    chmodSync(join(bin, 'gcloud'), 0o755);
  }
  const env = serverEnv(dir, { GOOGLE_APPLICATION_CREDENTIALS: adcFile, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` });
  await withServer(GBUSINESS, env, async ({ call }) => {
    const answer = await call('auth_login', { method: 'adc', profile: 'readonly' });
    assert.match(answer, /https:\/\/accounts\.google\.com\//);
    assert.match(answer, /\nNot covered: the readonly profile covers none of the 51 tool\(s\) of gbusiness/);
  });
  assert.equal(readFileSync(adcFile, 'utf8').includes('rt-not-covered'), true, 'the fake ADC file is left as it was');
});

// ---------------------------------------------------------------------------
// The skill

test('the gbusiness skill signs in with readwrite; the gads skill says so for the google and curated toolsets; gmail is unchanged', () => {
  const skill = (id) => readFileSync(join(REPO, 'plugins', id, 'skills', id, 'SKILL.md'), 'utf8');
  assert.match(skill('gbusiness'), /login business --profile readwrite`\. Use `--profile readwrite`: the default readonly profile covers none of this plugin's tools that need a Google scope\./);
  assert.match(skill('gads'), /login business`\. With the `google` or `curated` toolset, the default readonly profile covers none of its tools that need a Google scope: sign in with `--profile readwrite`/);
  assert.equal(/--profile/.test(skill('gmail')), false);
});
