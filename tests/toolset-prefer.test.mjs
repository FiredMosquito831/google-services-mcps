// Preferred scopes per toolset (1.25.0; spec 2026-10-29-tool-profiles, decision 2 of 2026-10-30): a listed toolset may
// name, per profile, the scopes its login takes first (config/products.json toolsets.<name>.preferScopes). resolveScopes
// takes them before its greedy rule; all, curated, the full profile and products without a preference resolve as before.
// The reach rule (a preferred scope only where Google's documentation gives the tool the same reach) is the owner's
// condition and is argued per product in the change; these tests pin the result and check that no tool loses coverage.
// Nothing calls Google: logins stop at the sign-in URL, and the gcloud CLI is a fake script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { loadConfig } = await import(DIST('core/config.js'));
const { loadRegistry } = await import(DIST('core/registry.js'));
const { coveredTools, preferFields, resolveScopes, requirementsForSpecs } = await import(DIST('core/scopes.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const EMAIL = G('userinfo.email');
const sorted = (list) => [...list].sort();
const registry = () => loadRegistry(DIST('core/registry.js'));
const quiet = { warn: () => undefined };
const PROFILES = ['readonly', 'readwrite', 'full'];

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});
const cfgOf = (dir = tempDir('gsm-prefer-cfg-')) => loadConfig({ GSM_TOKEN_DIR: dir });

/** What a readwrite login of each product's google toolset asks for since 1.25.0 (the identity scope is added later). */
const READWRITE_GOOGLE = {
  gcalendar: [G('calendar.calendarlist.readonly'), G('calendar.events'), G('calendar.events.freebusy')],
  gchat: [G('chat.memberships.readonly'), G('chat.messages.create'), G('chat.messages.readonly'), G('chat.spaces.readonly'), G('chat.users.readstate'), G('chat.users.spacesettings')],
  // Since 1.35.1 gcontacts also prefers userinfo.profile (scopePolicy.prefer), the name profile_me returns.
  gcontacts: [G('contacts.readonly'), G('directory.readonly'), G('userinfo.profile')],
  gtasks: [G('keep.readonly'), G('tasks')],
  gclassroom: [
    G('classroom.announcements'),
    G('classroom.courses.readonly'),
    G('classroom.coursework.students'),
    G('classroom.courseworkmaterials'),
    G('classroom.guardianlinks.students.readonly'),
    G('classroom.rosters.readonly'),
    G('classroom.topics'),
  ],
  gadmin: [
    G('admin.directory.domain.readonly'),
    G('admin.directory.group.member'),
    G('admin.directory.group.readonly'),
    G('admin.directory.orgunit.readonly'),
    G('admin.directory.user'),
    G('admin.reports.audit.readonly'),
    G('apps.alerts'),
  ],
  gtm: [G('tagmanager.edit.containerversions'), G('tagmanager.publish'), G('tagmanager.readonly')],
};

/**
 * What a readonly login of a google toolset asks for when it prefers scopes (1.40.1): gcalendar takes the three read
 * scopes Google's Calendar MCP server names (developers.google.com/workspace/calendar/api/guides/configure-mcp-server)
 * instead of calendar.readonly, the same reach for its four read tools as the readwrite preference of 1.25.0.
 */
const READONLY_GOOGLE = {
  gcalendar: [G('calendar.calendarlist.readonly'), G('calendar.events.freebusy'), G('calendar.events.readonly')],
};

/** The broader scopes the greedy rule took instead, before 1.25.0. */
const READWRITE_BEFORE_DROPPED = {
  gcalendar: [G('calendar')],
  gchat: [G('chat.memberships'), G('chat.messages'), G('chat.spaces')],
  gcontacts: [G('contacts')],
  gtasks: [G('keep')],
  gclassroom: [G('classroom.courses'), G('classroom.guardianlinks.students'), G('classroom.rosters')],
  gadmin: [G('admin.directory.domain'), G('admin.directory.group'), G('admin.directory.orgunit')],
  gtm: [G('tagmanager.edit.containers')],
};

const strip = (reqs) => reqs.map(({ prefer, ...rest }) => rest);

// ---------------------------------------------------------------------------
// resolveScopes and preferFields

test('resolveScopes takes the preferred scopes first, skips one that covers nothing open, and ignores them for full', () => {
  const prefer = { readwrite: [G('narrow.read'), G('unused'), G('narrow.write')], readonly: [G('narrow.readonly')] };
  const reqs = [
    { tool: 's/read', kind: 'read', scopes: [G('broad'), G('narrow.read'), G('narrow.readonly')], prefer },
    { tool: 's/write', kind: 'write', scopes: [G('broad'), G('narrow.write')], prefer },
  ];
  assert.deepEqual(resolveScopes(strip(reqs), 'readwrite').scopes, [G('broad')], 'the greedy rule alone takes the broad scope');
  assert.deepEqual(resolveScopes(reqs, 'readwrite').scopes, sorted([G('narrow.read'), G('narrow.write')]));
  assert.deepEqual(resolveScopes(reqs, 'readonly').scopes, [G('narrow.readonly')]);
  assert.deepEqual(resolveScopes(reqs, 'full').scopes, resolveScopes(strip(reqs), 'full').scopes, 'full takes no preference');
  // Even a full list in the data (gen-servers refuses one) is not taken.
  const withFull = reqs.map((r) => ({ ...r, prefer: { ...prefer, full: [G('narrow.read'), G('narrow.write')] } }));
  assert.deepEqual(resolveScopes(withFull, 'full').scopes, [G('broad')], 'full never takes a preference');
  // A readonly login never takes a scope that is not read-only, even when it is preferred.
  const bad = reqs.map((r) => ({ ...r, prefer: { readonly: [G('broad')] } }));
  assert.deepEqual(resolveScopes(bad, 'readonly').scopes, resolveScopes(strip(reqs), 'readonly').scopes);
});

test('preferFields gives the preference only for a listed toolset that has one', () => {
  const spec = { toolsetScopes: { google: { readwrite: [G('a')] } } };
  assert.deepEqual(preferFields(spec, 'google'), { prefer: { readwrite: [G('a')] } });
  for (const toolset of [undefined, 'all', 'curated']) assert.deepEqual(preferFields(spec, toolset), {}, String(toolset));
  assert.deepEqual(preferFields({}, 'google'), {});
  assert.deepEqual(preferFields(undefined, 'google'), {});
});

// ---------------------------------------------------------------------------
// The data and the resolved lists

test('the server map carries the preferences of seven products, readwrite (and gcalendar readonly), each scope accepted by a listed tool', () => {
  const reg = registry();
  const withPrefs = reg.servers.filter((s) => s.toolsetScopes).map((s) => s.name).sort();
  assert.deepEqual(withPrefs, Object.keys(READWRITE_GOOGLE).sort());
  for (const spec of reg.servers.filter((s) => s.toolsetScopes)) {
    assert.deepEqual(Object.keys(spec.toolsetScopes), ['google'], spec.name);
    assert.deepEqual(Object.keys(spec.toolsetScopes.google).sort(), READONLY_GOOGLE[spec.name] ? ['readonly', 'readwrite'] : ['readwrite'], spec.name);
    const prefix = `mcp__plugin_${spec.plugin}_${spec.name}__`;
    const map = JSON.parse(readFileSync(join(REPO, 'plugins', spec.plugin, 'tool-map.json'), 'utf8'));
    const listed = new Set(spec.toolsets.google);
    const accepted = new Set(map.filter((t) => listed.has(t.name.slice(prefix.length))).flatMap((t) => t.scopes));
    for (const scope of [...spec.toolsetScopes.google.readwrite, ...(spec.toolsetScopes.google.readonly ?? [])]) {
      assert.ok(accepted.has(scope), `${spec.name}: ${scope} is accepted by a listed tool`);
    }
    // The plugin's own server map carries the same preference.
    const own = JSON.parse(readFileSync(join(REPO, 'plugins', spec.plugin, 'servers.json'), 'utf8')).servers[0];
    assert.deepEqual(own.toolsetScopes, spec.toolsetScopes, `${spec.plugin}/servers.json`);
  }
});

test('google readwrite logins resolve to the preferred scopes; readonly (but gcalendar) and full, and all and curated, are unchanged', async () => {
  const cfg = cfgOf();
  const reg = registry();
  // gtasks' Keep is an optional part since 1.34.0: its preference applies when the part is named.
  const INCLUDE = { gtasks: ['keep'] };
  for (const [name, expected] of Object.entries(READWRITE_GOOGLE)) {
    const spec = reg.servers.find((s) => s.name === name);
    const include = INCLUDE[name] ?? [];
    const reqs = await requirementsForSpecs([spec], cfg, { ...quiet, toolset: 'google' });
    assert.ok(reqs.every((r) => r.prefer), `${name}: every requirement of the google toolset carries the preference`);
    const now = resolveScopes(reqs, 'readwrite', include).scopes;
    assert.deepEqual(now, expected, `${name} readwrite`);
    const before = resolveScopes(strip(reqs), 'readwrite', include).scopes;
    for (const scope of READWRITE_BEFORE_DROPPED[name]) {
      assert.ok(before.includes(scope), `${name}: the greedy rule alone takes ${scope}`);
      assert.ok(!now.includes(scope), `${name}: the preference no longer asks for ${scope}`);
    }
    for (const profile of ['readonly', 'full']) {
      // 1.40.1: gcalendar prefers Google's three read scopes for readonly too.
      if (profile === 'readonly' && READONLY_GOOGLE[name]) {
        assert.deepEqual(resolveScopes(reqs, profile, include).scopes, READONLY_GOOGLE[name], `${name} readonly`);
        assert.deepEqual(resolveScopes(strip(reqs), profile, include).scopes, [G('calendar.readonly')], `${name}: the greedy rule alone takes calendar.readonly`);
        continue;
      }
      assert.deepEqual(resolveScopes(reqs, profile, include).scopes, resolveScopes(strip(reqs), profile, include).scopes, `${name} ${profile}`);
    }
    for (const toolset of ['all', 'curated']) {
      const other = await requirementsForSpecs([spec], cfg, { ...quiet, toolset });
      assert.ok(other.every((r) => r.prefer === undefined), `${name} ${toolset}: no preference`);
    }
  }
});

test('the reach rule as coverage: under every google list and profile, no tool the old scopes covered is left uncovered', async () => {
  const cfg = cfgOf();
  for (const spec of registry().servers.filter((s) => s.toolsets?.google)) {
    const reqs = await requirementsForSpecs([spec], cfg, { ...quiet, toolset: 'google' });
    for (const profile of PROFILES) {
      const now = resolveScopes(reqs, profile);
      const before = resolveScopes(strip(reqs), profile);
      const covered = new Set(coveredTools(reqs, now.scopes));
      const lost = coveredTools(reqs, before.scopes).filter((tool) => !covered.has(tool));
      assert.deepEqual(lost, [], `${spec.name} ${profile}: tools left uncovered by the preferred scopes`);
      assert.deepEqual(now.uncovered, before.uncovered, `${spec.name} ${profile}: the uncovered list`);
      if (!spec.toolsetScopes) assert.deepEqual(now.scopes, before.scopes, `${spec.name} ${profile}: no preference, the same scopes`);
    }
  }
});

test("a plugin's own CLI resolves the preferred scopes: gsm scopes for gcalendar with the google toolset", () => {
  const dir = tempDir('gsm-prefer-cli-');
  const home = join(dir, 'home');
  mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, GSM_TOKEN_DIR: join(dir, 'tokens') };
  for (const key of Object.keys(env)) if (key.startsWith('GSM_') && key !== 'GSM_TOKEN_DIR') delete env[key];
  const run = (toolset) =>
    spawnSync(process.execPath, [join(REPO, 'plugins', 'gcalendar', 'bin', 'gsm.mjs'), 'scopes', 'workspace-user', '--profile', 'readwrite', '--toolset', toolset, '--json'], {
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
  const google = run('google');
  assert.equal(google.status, 0, google.stderr);
  assert.deepEqual(JSON.parse(google.stdout).profiles.readwrite.scopes, READWRITE_GOOGLE.gcalendar);
  const all = run('all');
  assert.equal(all.status, 0, all.stderr);
  assert.ok(JSON.parse(all.stdout).profiles.readwrite.scopes.includes(G('calendar')), 'the all toolset is unchanged');
});

// ---------------------------------------------------------------------------
// Validation (scripts/gen-servers.mjs)

/** A copy of what gen-servers.mjs reads, with one product changed, run in a temp folder. Returns the process result. */
function genServersWith(change) {
  const tree = tempDir('gsm-prefer-gen-');
  mkdirSync(join(tree, 'scripts'));
  mkdirSync(join(tree, 'config'));
  mkdirSync(join(tree, 'src', 'servers'), { recursive: true });
  copyFileSync(join(REPO, 'scripts', 'gen-servers.mjs'), join(tree, 'scripts', 'gen-servers.mjs'));
  for (const name of readdirSync(join(REPO, 'src', 'servers'))) writeFileSync(join(tree, 'src', 'servers', name), '');
  mkdirSync(join(tree, 'plugins', 'gcalendar'), { recursive: true });
  copyFileSync(join(REPO, 'plugins', 'gcalendar', 'tool-map.json'), join(tree, 'plugins', 'gcalendar', 'tool-map.json'));
  const products = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8'));
  change(products.products.gcalendar.toolsets.google);
  writeFileSync(join(tree, 'config', 'products.json'), JSON.stringify(products, null, 2));
  const res = spawnSync(process.execPath, [join(tree, 'scripts', 'gen-servers.mjs')], { encoding: 'utf8', timeout: 120_000 });
  return { ...res, servers: existsSync(join(tree, 'config', 'servers.json')) ? JSON.parse(readFileSync(join(tree, 'config', 'servers.json'), 'utf8')) : undefined };
}

test('gen-servers copies a valid preference and rejects one no listed tool accepts, a readonly one that is not read-only, and full', () => {
  const ok = genServersWith(() => undefined);
  assert.equal(ok.status, 0, ok.stderr);
  // Copied in the data's order, which is the order the login takes them in.
  const data = JSON.parse(readFileSync(join(REPO, 'config', 'products.json'), 'utf8')).products.gcalendar.toolsets.google.preferScopes;
  assert.deepEqual(ok.servers.servers.find((s) => s.name === 'gcalendar').toolsetScopes, { google: data });
  assert.deepEqual(data.readwrite, [G('calendar.events'), G('calendar.calendarlist.readonly'), G('calendar.events.freebusy')]);
  assert.deepEqual(data.readonly, [G('calendar.events.readonly'), G('calendar.calendarlist.readonly'), G('calendar.events.freebusy')]);

  const unused = genServersWith((google) => google.preferScopes.readwrite.push(G('drive')));
  assert.notEqual(unused.status, 0);
  assert.match(unused.stderr, /toolsets\.google\.preferScopes\.readwrite: no tool of the toolset accepts https:\/\/www\.googleapis\.com\/auth\/drive/);

  const notReadonly = genServersWith((google) => (google.preferScopes.readonly = [G('calendar.events')]));
  assert.notEqual(notReadonly.status, 0);
  assert.match(notReadonly.stderr, /preferScopes\.readonly may hold only read-only scopes: https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);

  const full = genServersWith((google) => (google.preferScopes.full = [G('calendar')]));
  assert.notEqual(full.status, 0);
  assert.match(full.stderr, /"full" is not a profile that takes a preference/);

  const twice = genServersWith((google) => google.preferScopes.readwrite.push(G('calendar.events')));
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /lists a scope twice/);
});

// ---------------------------------------------------------------------------
// The sign-ins of a running server: OAuth (the plugin's login child) and ADC (the server's own requirements)

/** Starts a plugin server with the given environment and talks to it over stdio. */
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 120_000);
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

const CALENDAR_SERVER = join(REPO, 'plugins', 'gcalendar', 'servers', 'gcalendar.mjs');

/**
 * A token folder with a client file, and a server environment that cannot reach the real gcloud CLI, the real ADC file
 * or the real home: the fake gcloud is first on PATH, and the other places findGcloud looks are empty temp folders.
 */
function isolatedEnv(toolset) {
  const dir = tempDir('gsm-prefer-signin-');
  writeFileSync(join(dir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client-id.apps.googleusercontent.com', client_secret: 'test-secret' } }));
  const adcFile = join(dir, 'adc.json');
  writeFileSync(adcFile, JSON.stringify({ type: 'authorized_user', client_id: 'adc-client', client_secret: 'adc-secret', refresh_token: 'rt-prefer-test' }));
  const bin = join(dir, 'bin');
  const empty = join(dir, 'empty');
  const home = join(dir, 'home');
  for (const d of [bin, empty, home, join(dir, 'appdata'), join(dir, 'gcloud-config')]) mkdirSync(d, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'gcloud.cmd'), '@echo off\r\necho Your browser has been opened to visit:\r\necho.\r\necho     https://accounts.google.com/o/oauth2/auth?fake=1\r\nexit /b 0\r\n');
  } else {
    writeFileSync(join(bin, 'gcloud'), '#!/bin/sh\necho "Your browser has been opened to visit:"\necho "    https://accounts.google.com/o/oauth2/auth?fake=1"\nexit 0\n');
    chmodSync(join(bin, 'gcloud'), 0o755);
  }
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_')));
  return {
    dir,
    env: {
      ...base,
      GSM_TOKEN_DIR: dir,
      GSM_NO_BROWSER: '1',
      GSM_TOOLSET: toolset,
      GOOGLE_APPLICATION_CREDENTIALS: adcFile,
      APPDATA: join(dir, 'appdata'),
      CLOUDSDK_CONFIG: join(dir, 'gcloud-config'),
      LOCALAPPDATA: empty,
      ProgramFiles: empty,
      'ProgramFiles(x86)': empty,
      HOME: home,
      USERPROFILE: home,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    },
  };
}

async function waitUntil(check, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

test('the ADC sign-in of a server with the google toolset asks gcloud for the preferred scopes; with all, as before', async () => {
  for (const [toolset, check] of [
    ['google', (scopes) => assert.deepEqual(sorted(scopes), sorted([...READWRITE_GOOGLE.gcalendar, EMAIL]))],
    ['all', (scopes) => assert.ok(scopes.includes(G('calendar')) && !scopes.includes(G('calendar.events.freebusy')), scopes.join(' '))],
  ]) {
    const { dir, env } = isolatedEnv(toolset);
    await withServer(CALENDAR_SERVER, env, async ({ call }) => {
      const started = await call('auth_login', { method: 'adc', profile: 'readwrite' });
      assert.match(started, /https:\/\/accounts\.google\.com\//, started);
      assert.ok(await waitUntil(() => existsSync(join(dir, 'adc.scopes.json'))), `${toolset}: the ADC login is recorded after the fake gcloud exits`);
    });
    // The record holds the scopes the server passed to gcloud (--scopes).
    check(JSON.parse(readFileSync(join(dir, 'adc.scopes.json'), 'utf8')).scopes);
  }
});

test('the OAuth sign-in from the chat asks Google for the preferred scopes with the google toolset', async () => {
  const { env } = isolatedEnv('google');
  await withServer(CALENDAR_SERVER, env, async ({ call }) => {
    const answer = await call('auth_login', { method: 'oauth', profile: 'readwrite' });
    const url = answer.match(/https:\/\/accounts\.google\.com\S+/);
    assert.ok(url, answer);
    assert.deepEqual(sorted(new URL(url[0]).searchParams.get('scope').split(' ')), sorted([...READWRITE_GOOGLE.gcalendar, EMAIL]));
  });
});
