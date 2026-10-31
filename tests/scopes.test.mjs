// Tests for scope profiles, runtime tool gating, the missing-scope hint and the admin setup.
// Run after compiling (npm test does). Every test uses its own temp folders; no network call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const repo = new URL('..', import.meta.url);

const { resolveScopes, requirementsFor, isReadonlyScope, isViewOnlyScope, isFullAccessScope, coveredTools, serversOfGroup, PROFILES, heldBackBy } = await import(dist('core/scopes.js'));

/** Every tool key a HeldBack result names. */
const heldKeys = (h) => new Set([...Object.values(h.optional), ...Object.values(h.needsProfile), h.noProfile].flatMap((l) => l.tools));
const { isGranted, describeError, scopeHint } = await import(dist('core/tools.js'));
const { loadConfig } = await import(dist('core/config.js'));
const { loadRegistry } = await import(dist('core/registry.js'));
const { getAuthClient, grantedScopes, readAdminScopeFile, googleScopes, ADMIN_SCOPES } = await import(dist('core/auth.js'));
const { runSetupAdmin, checkServiceAccountKey } = await import(dist('cli/admin.js'));
const { runScopes } = await import(dist('cli/scopes.js'));
const { parseLoginScopes, parseSetupAdminArgs, parseProfile } = await import(dist('cli/args.js'));
const { UsageError } = await import(dist('cli/types.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
const req = (tool, kind, scopes) => ({ tool, kind, scopes });

/** A small fixed requirement set used by the resolver tests. */
const sample = () => [
  req('t1', 'read', [G('gmail.readonly'), G('gmail.modify')]),
  req('t2', 'read', [G('drive.readonly'), G('drive')]),
  req('t3', 'write', [G('gmail.modify')]),
];

// ---------------------------------------------------------------------------
// Scope classification

test('classify: readonly suffixes and full-access scopes', () => {
  assert.equal(isReadonlyScope(G('gmail.readonly')), true);
  assert.equal(isReadonlyScope(G('cloud-platform.read-only')), true);
  assert.equal(isReadonlyScope(G('gmail.modify')), false);
  assert.equal(isFullAccessScope(G('drive')), true);
  assert.equal(isFullAccessScope(G('cloud-platform')), true);
  assert.equal(isFullAccessScope('https://mail.google.com/'), true);
  assert.equal(isFullAccessScope(G('drive.file')), false);
  assert.equal(isFullAccessScope(G('admin.directory.user')), false);
});

// ---------------------------------------------------------------------------
// Resolver, per profile

test('readonly: read tools only, with read-only variants preferred', () => {
  const r = resolveScopes(sample(), 'readonly');
  assert.deepEqual(r.scopes, [G('drive.readonly'), G('gmail.readonly')]);
  assert.deepEqual(r.covered, ['t1', 't2']);
  assert.deepEqual(r.uncovered, ['t3'], 'the write tool is not a target, so it stays uncovered');
});

test('readwrite: covers read and write tools with the widest coverage first, then non-readonly', () => {
  const r = resolveScopes(sample(), 'readwrite');
  // gmail.modify covers two tools, so it is picked first; drive beats drive.readonly on the tie.
  assert.deepEqual(r.scopes, [G('drive'), G('gmail.modify')]);
  assert.deepEqual(r.covered, ['t1', 't2', 't3']);
  assert.deepEqual(r.uncovered, []);
});

test('full: broadest listed scope, so the shorter full-access URL wins a tie', () => {
  const reqs = [
    req('a', 'read', [G('gmail.readonly'), G('gmail.modify'), 'https://mail.google.com/']),
    req('b', 'write', [G('gmail.modify'), 'https://mail.google.com/']),
  ];
  assert.deepEqual(resolveScopes(reqs, 'full').scopes, ['https://mail.google.com/']);
  // The same tie under readwrite goes to the narrower qualified scope, not the full-access one.
  assert.deepEqual(resolveScopes(reqs, 'readwrite').scopes, [G('gmail.modify')]);
});

test('readonly: a read tool with no read-only scope is uncovered, not given a broader scope', () => {
  const reqs = [req('a', 'read', [G('drive'), G('drive.file'), G('spreadsheets')])];
  assert.deepEqual(resolveScopes(reqs, 'readonly'), { scopes: [], covered: [], uncovered: ['a'] });
});

test('empty-scope tools are always covered, in every profile', () => {
  const reqs = [req('open', 'read', []), req('scoped', 'read', [G('gmail.readonly')]), req('write-open', 'write', [])];
  for (const profile of PROFILES) {
    const r = resolveScopes(reqs, profile);
    assert.ok(r.covered.includes('open'), `${profile}: empty read tool covered`);
    if (profile !== 'readonly') assert.ok(r.covered.includes('write-open'), `${profile}: empty write tool covered`);
  }
  assert.deepEqual(resolveScopes([], 'full'), { scopes: [], covered: [], uncovered: [] });
});

test('resolution is deterministic: input order does not change the result', () => {
  const forward = sample();
  const backward = [...sample()].reverse();
  for (const profile of PROFILES) {
    assert.deepEqual(resolveScopes(backward, profile), resolveScopes(forward, profile), profile);
  }
});

test('coveredTools matches the runtime rule (any one scope is enough)', () => {
  const reqs = sample();
  assert.deepEqual(coveredTools(reqs, [G('gmail.modify')]), ['t1', 't3']);
  assert.deepEqual(coveredTools(reqs, []), []);
});

// ---------------------------------------------------------------------------
// Real requirements: every profile covers what it promises, for each group

const groupsToCheck = ['cloud', 'workspace-user', 'searchconsole', 'business', 'workspace-admin'];

test('real servers: readonly covers every read tool and readwrite covers every tool, per group', async (t) => {
  if (!existsSync(new URL('data/discovery/monitoring.v3.json', repo))) {
    t.skip('data/discovery is missing. Run: node scripts/snapshot-discovery.mjs');
    return;
  }
  const reg = loadRegistry(dist('core/registry.js'));
  const cfg = loadConfig({ GSM_TOKEN_DIR: mkdtempSync(join(tmpdir(), 'gsm-scopes-')) });
  for (const group of groupsToCheck) {
    const reqs = await requirementsFor(serversOfGroup(reg, group), cfg);
    assert.ok(reqs.length > 0, `${group} has tools`);
    const readonly = resolveScopes(reqs, 'readonly');
    // A product's scope policy (config/products.json scopePolicy) holds some tools back on purpose; heldBackBy names them.
    // Every other tool must be covered as before.
    const heldRO = heldKeys(heldBackBy(reqs, 'readonly', [], readonly.scopes));
    // A read tool is covered by readonly exactly when its list holds a read-only scope (or none is needed): read-only by
    // name, or view-only by Google's description (isViewOnlyScope, since 1.32.1).
    for (const r of reqs.filter((x) => x.kind === 'read' && !heldRO.has(x.tool) && x.optional === undefined)) {
      const readable = r.scopes.length === 0 || r.scopes.some(isViewOnlyScope);
      const where = readable ? readonly.covered : readonly.uncovered;
      assert.ok(where.includes(r.tool), `${group}: readonly ${readable ? 'covers' : 'leaves uncovered'} ${r.tool}`);
    }
    assert.ok(readonly.scopes.every(isViewOnlyScope), `${group}: readonly requests only read-only scopes`);
    for (const profile of ['readwrite', 'full']) {
      const r = resolveScopes(reqs, profile);
      assert.deepEqual(r.uncovered, [...heldKeys(heldBackBy(reqs, profile, [], r.scopes))].sort(), `${group}: ${profile} covers every tool not held back`);
      // With every optional part named, only the scopes no profile (or only full) may request stay out.
      const parts = [...new Set(reqs.map((x) => x.optional).filter(Boolean))];
      const all = resolveScopes(reqs, profile, parts);
      assert.deepEqual(all.uncovered, [...heldKeys(heldBackBy(reqs, profile, parts, all.scopes))].sort(), `${group}: ${profile} with ${parts} covers the rest`);
    }
    if (group !== 'workspace-user') {
      // No product of the other groups has a scope policy: nothing is held back, and every tool is covered as before.
      assert.equal(reqs.filter((x) => x.optional !== undefined || x.onlyIn !== undefined).length, 0, `${group}: no scope policy`);
      assert.deepEqual(resolveScopes(reqs, 'readwrite').uncovered, [], `${group}: readwrite covers every tool`);
      assert.deepEqual(resolveScopes(reqs, 'full').uncovered, [], `${group}: full covers every tool`);
    }
  }
});

test('real servers: curated tools declare scopes, and write tools without Discovery scopes are a known, fixed set', async (t) => {
  if (!existsSync(new URL('data/discovery/monitoring.v3.json', repo))) {
    t.skip('data/discovery is missing');
    return;
  }
  const reg = loadRegistry(dist('core/registry.js'));
  const cfg = loadConfig({ GSM_TOKEN_DIR: mkdtempSync(join(tmpdir(), 'gsm-scopes-')) });
  const { buildServerTools } = await import(dist('servers/index.js'));
  const curated = [];
  // Without apis, buildServerTools returns the curated tools only.
  for (const spec of reg.servers.filter((s) => s.curated)) {
    for (const tool of await buildServerTools({ ...spec, apis: undefined }, cfg)) curated.push(tool);
  }
  assert.ok(curated.length >= 50, `curated tools found: ${curated.length}`);
  for (const tool of curated) {
    assert.ok(tool.scopes && tool.scopes.length > 0, `${tool.name} declares scopes`);
  }

  // Write and destructive tools with no scopes. Discovery lists no scopes for these methods, and they
  // register regardless of the token. The full list is tests/fixtures/unscoped-writes.json, made from the
  // build output (plugins/*/tool-map.json after npm run build). A new unscoped write fails here until its
  // title is added to that file on purpose, so the change is seen in review.
  const unscopedWrites = [];
  for (const spec of reg.servers) {
    for (const tool of await buildServerTools(spec, cfg)) {
      if (tool.kind !== 'read' && (!tool.scopes || tool.scopes.length === 0)) unscopedWrites.push(tool.title);
    }
  }
  // Two specific methods this test relies on: they must be found as unscoped, so the scan is not silently empty.
  for (const method of ['youtube.thirdPartyLinks.insert', 'cloudidentity.customers.userinvitations.send']) {
    assert.ok(unscopedWrites.includes(method), `${method} is an unscoped write in Discovery`);
  }
  const listed = new Set(JSON.parse(readFileSync(new URL('fixtures/unscoped-writes.json', import.meta.url), 'utf8')).titles);
  const unlisted = unscopedWrites.filter((title) => !listed.has(title));
  assert.deepEqual(unlisted, [], 'every unscoped write or destructive tool is listed in tests/fixtures/unscoped-writes.json');
});

// ---------------------------------------------------------------------------
// Runtime gating

test('gating: a tool is registered when it has no scopes, the grant is unknown, or the grant holds one of its scopes', () => {
  const scoped = { scopes: [G('a'), G('b')] };
  assert.equal(isGranted(scoped, [G('b')]), true);
  assert.equal(isGranted(scoped, [G('c')]), false);
  assert.equal(isGranted(scoped, null), true, 'unknown grant registers everything');
  assert.equal(isGranted({}, []), true, 'a tool with no scopes is always registered');
  assert.equal(isGranted({ scopes: [] }, []), true);
});

test('gating: an empty grant hides every scoped tool', () => {
  assert.equal(isGranted({ scopes: [G('a')] }, []), false);
});

// ---------------------------------------------------------------------------
// Missing-scope hint

test('describeError: a 403 with reason insufficientPermissions gets the broader-profile hint', () => {
  const err = { code: 403, errors: [{ reason: 'insufficientPermissions' }], message: 'Insufficient Permission' };
  const text = describeError(err, 'workspace-user');
  assert.match(text, /HTTP 403 \| reason=insufficientPermissions \| Insufficient Permission/);
  assert.match(text, /The token lacks a scope for this tool\. Log in again with a broader profile: node gsm\.mjs login workspace-user --profile readwrite\./);
});

test('describeError: a 403 whose message says insufficient authentication scopes gets the hint too', () => {
  const text = describeError({ code: 403, message: 'Request had insufficient authentication scopes.' }, 'cloud');
  assert.match(text, /node gsm\.mjs login cloud --profile readwrite/);
});

test('describeError: other errors get no hint, and the admin group is pointed at gsm setup-admin', () => {
  assert.doesNotMatch(describeError({ code: 404, message: 'Not found' }, 'cloud'), /lacks a scope/);
  assert.doesNotMatch(describeError({ code: 403, message: 'Forbidden for another reason' }, 'cloud'), /lacks a scope/);
  const admin = describeError({ code: 403, errors: [{ reason: 'insufficientPermissions' }], message: 'x' }, 'workspace-admin');
  assert.match(admin, /node gsm\.mjs setup-admin/);
  assert.doesNotMatch(admin, /gsm login workspace-admin/);
  assert.match(scopeHint(undefined), /node gsm\.mjs login <group> --profile readwrite/);
});

// ---------------------------------------------------------------------------
// Admin setup and stored grant

function withTokenDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-admin-'));
  const previous = process.env.GSM_TOKEN_DIR;
  process.env.GSM_TOKEN_DIR = dir;
  const outputs = [];
  const out = { log: (l) => outputs.push(l), warn: (l) => outputs.push(l) };
  return Promise.resolve(fn(dir, out, outputs)).finally(() => {
    if (previous === undefined) delete process.env.GSM_TOKEN_DIR;
    else process.env.GSM_TOKEN_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

/** A key file in its own folder, outside the token directory (the key is referenced, never copied). */
function fakeKeyFile(content = { type: 'service_account', client_email: 'gsm-test@example.iam.gserviceaccount.com', private_key: 'x' }) {
  const keyDir = mkdtempSync(join(tmpdir(), 'gsm-key-'));
  const file = join(keyDir, 'service-account.json');
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

test('setup-admin: writes the scope file with mode 0600, references the key, and copies nothing else', async () => {
  await withTokenDir(async (dir, out) => {
    const keyFile = fakeKeyFile();
    const reg = loadRegistry(dist('core/registry.js'));
    const code = await runSetupAdmin({ subject: 'admin@example.com', keyFile, profile: 'readonly' }, reg, out);
    assert.equal(code, 0);

    const file = join(dir, 'workspace-admin.scopes.json');
    assert.ok(existsSync(file), 'scope file exists');
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(stored.subject, 'admin@example.com');
    assert.equal(stored.profile, 'readonly');
    assert.equal(stored.keyFile, keyFile, 'the key is referenced by path');
    assert.ok(Array.isArray(stored.scopes) && stored.scopes.length > 0);
    assert.deepEqual(readdirSync(dir), ['workspace-admin.scopes.json'], 'the key file is not copied into the token directory');
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600, 'mode 0600');
    }

    // The stored setup is what the server reads back.
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    assert.deepEqual(grantedScopes('workspace-admin', cfg), stored.scopes);
    assert.equal(readAdminScopeFile(cfg).subject, 'admin@example.com');
    const client = await getAuthClient('workspace-admin', cfg);
    assert.equal(client.subject, 'admin@example.com', 'the JWT impersonates the stored subject');
  });
});

test('setup-admin: a key file without client_email, a non-JSON file and a missing file are refused', async () => {
  await withTokenDir(async (dir, out) => {
    const reg = loadRegistry(dist('core/registry.js'));
    const noEmail = fakeKeyFile({ type: 'service_account' });
    await assert.rejects(runSetupAdmin({ subject: 'a@example.com', keyFile: noEmail, profile: 'readonly' }, reg, out), (err) => {
      assert.ok(err instanceof UsageError);
      assert.match(err.message, /client_email/);
      return true;
    });
    const notJson = fakeKeyFile('this is not json');
    assert.throws(() => checkServiceAccountKey(notJson), /not valid JSON/);
    assert.throws(() => checkServiceAccountKey(join(dir, 'missing.json')), /key file not found/);
    assert.equal(existsSync(join(dir, 'workspace-admin.scopes.json')), false, 'nothing is written on refusal');
  });
});

test('admin without setup falls back to ADMIN_SCOPES, both for gating and for the grant', async () => {
  await withTokenDir(async (dir) => {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir });
    assert.deepEqual(grantedScopes('workspace-admin', cfg), [...ADMIN_SCOPES]);
    assert.equal(readAdminScopeFile(cfg), null);
  });
});

test('parse: setup-admin needs a subject and a key file, and defaults to readonly', () => {
  assert.throws(() => parseSetupAdminArgs({ 'key-file': 'k.json' }), /--subject/);
  assert.throws(() => parseSetupAdminArgs({ subject: 'not-an-email', 'key-file': 'k.json' }), /--subject/);
  assert.throws(() => parseSetupAdminArgs({ subject: 'a@example.com' }), /--key-file/);
  const parsed = parseSetupAdminArgs({ subject: 'a@example.com', 'key-file': 'k.json' });
  assert.equal(parsed.profile, 'readonly');
});

test('parse: login profile and --scopes are exclusive, and --scopes takes full URLs', () => {
  assert.deepEqual(parseLoginScopes({}), { profile: 'readonly' });
  assert.deepEqual(parseLoginScopes({ profile: 'readwrite' }), { profile: 'readwrite' });
  assert.throws(() => parseLoginScopes({ profile: 'full', scopes: G('drive') }), /not both/);
  assert.throws(() => parseLoginScopes({ scopes: 'gmail.readonly' }), /full scope URLs/);
  assert.deepEqual(parseLoginScopes({ scopes: `${G('drive')},${G('gmail.readonly')}` }), {
    profile: 'custom',
    customScopes: [G('drive'), G('gmail.readonly')],
  });
  assert.throws(() => parseProfile('everything'), /--profile must be one of/);
});

test('googleScopes: short names become full URLs, full URLs pass through', () => {
  assert.deepEqual(googleScopes('gmail.readonly', 'https://mail.google.com/'), [G('gmail.readonly'), 'https://mail.google.com/']);
});

// ---------------------------------------------------------------------------
// gsm scopes output (no login, no network)

test('gsm scopes: prints the three profiles with covered and uncovered counts', async (t) => {
  if (!existsSync(new URL('data/discovery/sheets.v4.json', repo))) {
    t.skip('data/discovery is missing');
    return;
  }
  const lines = [];
  const reg = loadRegistry(dist('core/registry.js'));
  await runScopes({ group: 'workspace-user', json: false }, reg, { log: (l) => lines.push(l), warn: () => {} });
  const text = lines.join('\n');
  for (const profile of ['readonly', 'readwrite', 'full']) assert.match(text, new RegExp(`^${profile}: `, 'm'));
  assert.match(text, /covered \d+, uncovered \d+/);

  const jsonLines = [];
  await runScopes({ group: 'workspace-user', profile: 'readonly', json: true }, reg, { log: (l) => jsonLines.push(l), warn: () => {} });
  const parsed = JSON.parse(jsonLines.join('\n'));
  assert.deepEqual(Object.keys(parsed.profiles), ['readonly']);
  assert.ok(parsed.profiles.readonly.scopes.length > 0);
});

// ---------------------------------------------------------------------------
// The real server: a stored grant filters the tool list

test('runServer: with a stored grant only the tools it can run are registered; without one, only scope-free tools and auth_status', async (t) => {
  if (!existsSync(new URL('data/discovery/gmail.v1.json', repo))) {
    t.skip('data/discovery is missing');
    return;
  }
  const require = createRequire(import.meta.url);
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);

  const dir = mkdtempSync(join(tmpdir(), 'gsm-grant-'));
  try {
    // The entry shape scripts/bundle.mjs generates for the gmail product: its curated Gmail tools, the
    // Drive curated tools from gdrive.js (the assertions below check both), and the Discovery tools.
    const entry = join(dir, 'entry.mjs');
    writeFileSync(
      entry,
      [
        `import { runServer } from '${dist('core/tools.js')}';`,
        `import { discoveryToolsFor } from '${dist('core/discovery/tools.js')}';`,
        `import { buildTools as buildGmail } from '${dist('servers/gmail.js')}';`,
        `import { buildTools as buildDrive } from '${dist('servers/gdrive.js')}';`,
        `await runServer({ name: 'gmail', version: '0.0.0', buildTools: async (cfg) => [...(await buildGmail(cfg)), ...(await buildDrive(cfg)), ...(await discoveryToolsFor('gmail', cfg))] });`,
        '',
      ].join('\n'),
    );

    const list = async (tokenDir) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: { ...process.env, GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' },
        stderr: 'pipe',
      });
      const client = new Client({ name: 'gsm-scope-test', version: '0.0.0' });
      await client.connect(transport);
      try {
        return (await client.listTools()).tools.map((x) => x.name);
      } finally {
        await client.close();
      }
    };

    // No token: an OAuth server registers only the tools that need no scope, plus auth_status. Discovery still works.
    const everything = await list(join(dir, 'empty'));
    assert.ok(everything.includes('auth_status') && everything.includes('api_methods'));
    assert.ok(!everything.includes('gmail_search') && !everything.includes('gmail_create_draft') && !everything.includes('drive_trash_file'));

    // A token that holds only gmail.readonly: read Gmail tools stay, writes and Drive go.
    const tokenDir = join(dir, 'granted');
    mkdirSync(tokenDir, { recursive: true });
    writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'a', refresh_token: 'r', scope: G('gmail.readonly') }));
    const limited = await list(tokenDir);
    assert.ok(limited.includes('gmail_search'), 'gmail.readonly reads Gmail');
    assert.ok(limited.includes('api_methods'), 'the list tool has no scopes and always registers');
    assert.ok(!limited.includes('gmail_create_draft'), 'gmail.compose or gmail.modify is needed to create drafts');
    assert.ok(!limited.includes('drive_trash_file'), 'no Drive scope is held');
    assert.ok(limited.length > everything.length, 'a login lists more tools than no login');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
