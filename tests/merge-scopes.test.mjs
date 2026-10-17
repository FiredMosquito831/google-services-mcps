// Tests for the scope merge of gsm login and gsm setup-admin: the pure rule (dist/cli/merge.js), the --replace flag in
// the parser and the help, and the lines a login and setup-admin print. Run after compiling (npm test does).
// Every test uses its own temp folders. No Google call is made and no browser is opened: a login is stopped as soon
// as it prints its login URL (--no-browser), and nothing is saved before that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const GSM = fileURLToPath(new URL('../dist/cli/gsm.js', import.meta.url));

const { mergeScopes, describeMerge } = await import(dist('cli/merge.js'));
const { parseCliArgs, parseSetupAdminArgs } = await import(dist('cli/args.js'));
const { UsageError } = await import(dist('cli/types.js'));

const G = (name) => `https://www.googleapis.com/auth/${name}`;
/** A scope no product requests, so it can only come from the stored token. */
const STORED_ONLY = G('gsm-test.never-requested');

// ---------- the pure rule ----------

test('merge: keeps the stored scopes and adds the requested ones', () => {
  const r = mergeScopes({ requested: [G('drive.readonly')], stored: [G('gmail.readonly'), G('calendar.readonly')], replace: false });
  assert.deepEqual(r.scopes, [G('calendar.readonly'), G('drive.readonly'), G('gmail.readonly')]);
  assert.deepEqual(r.kept, [G('calendar.readonly'), G('gmail.readonly')]);
  assert.deepEqual(r.added, [G('drive.readonly')]);
  assert.deepEqual(r.dropped, []);
});

test('replace: only the requested scopes remain, and the stored ones are dropped', () => {
  const r = mergeScopes({ requested: [G('drive.readonly')], stored: [G('gmail.readonly'), G('calendar.readonly')], replace: true });
  assert.deepEqual(r.scopes, [G('drive.readonly')]);
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.added, [G('drive.readonly')]);
  assert.deepEqual(r.dropped, [G('calendar.readonly'), G('gmail.readonly')]);

  // A stored scope that is requested again is kept, not dropped.
  const overlap = mergeScopes({ requested: [G('b'), G('c')], stored: [G('a'), G('b')], replace: true });
  assert.deepEqual(overlap.scopes, [G('b'), G('c')]);
  assert.deepEqual(overlap.kept, [G('b')]);
  assert.deepEqual(overlap.added, [G('c')]);
  assert.deepEqual(overlap.dropped, [G('a')]);
});

test('no stored token: both modes give the requested list', () => {
  for (const replace of [false, true]) {
    const r = mergeScopes({ requested: [G('b'), G('a')], stored: [], replace });
    assert.deepEqual(r.scopes, [G('a'), G('b')], `replace=${replace}`);
    assert.deepEqual(r.kept, []);
    assert.deepEqual(r.added, [G('a'), G('b')]);
    assert.deepEqual(r.dropped, []);
  }
});

test('duplicates are removed from the result and from every list', () => {
  const r = mergeScopes({ requested: [G('a'), G('a'), G('b')], stored: [G('b'), G('b'), G('c')], replace: false });
  assert.deepEqual(r.scopes, [G('a'), G('b'), G('c')]);
  assert.deepEqual(r.kept, [G('b'), G('c')]);
  assert.deepEqual(r.added, [G('a')]);
  assert.deepEqual(r.dropped, []);
});

test('the result is sorted, whatever the order of the input', () => {
  const r = mergeScopes({ requested: [G('zeta'), G('mu')], stored: [G('omega'), G('alpha')], replace: false });
  assert.deepEqual(r.scopes, [G('alpha'), G('mu'), G('omega'), G('zeta')]);
  assert.deepEqual(r.scopes, [...r.scopes].sort());
});

test('kept, added and dropped counts add up to the result and to the stored list', () => {
  const stored = [G('a'), G('b'), G('c')];
  const requested = [G('b'), G('d')];

  const merge = mergeScopes({ requested, stored, replace: false });
  assert.equal(merge.scopes.length, 4);
  assert.equal(merge.kept.length, 3, 'every stored scope is kept by a merge');
  assert.equal(merge.added.length, 1, 'only d is new: b is already stored');
  assert.equal(merge.dropped.length, 0);
  assert.equal(merge.kept.length + merge.added.length, merge.scopes.length);

  const replace = mergeScopes({ requested, stored, replace: true });
  assert.equal(replace.scopes.length, 2);
  assert.equal(replace.kept.length, 1, 'only b survives a replace');
  assert.equal(replace.added.length, 1, 'd is the only scope not stored before');
  assert.equal(replace.dropped.length, 2, 'a and c are dropped');
  assert.equal(replace.kept.length + replace.dropped.length, stored.length);
});

test('describeMerge: the merge and replace lines, and nothing when no scope is stored', () => {
  const merge = mergeScopes({ requested: [G('b'), G('d')], stored: [G('a'), G('b'), G('c')], replace: false });
  assert.equal(describeMerge(merge, false), 'Merging: 3 scopes already stored are kept; 1 new.');

  const one = mergeScopes({ requested: [G('x')], stored: [G('a')], replace: false });
  assert.equal(describeMerge(one, false), 'Merging: 1 scope already stored is kept; 1 new.');

  const drop2 = mergeScopes({ requested: [G('d')], stored: [G('a'), G('c')], replace: true });
  assert.equal(describeMerge(drop2, true), 'Replacing: the 2 stored scopes will be dropped.');

  const drop1 = mergeScopes({ requested: [G('d')], stored: [G('a')], replace: true });
  assert.equal(describeMerge(drop1, true), 'Replacing: the 1 stored scope will be dropped.');

  const none = mergeScopes({ requested: [G('a')], stored: [G('a')], replace: true });
  assert.equal(describeMerge(none, true), 'Replacing: no stored scope is dropped; every stored scope is requested again.');

  assert.equal(describeMerge(mergeScopes({ requested: [G('a')], stored: [], replace: false }), false), undefined);
  assert.equal(describeMerge(mergeScopes({ requested: [G('a')], stored: [], replace: true }), true), undefined);
});

// ---------- the flag, the parser and the help ----------

test('help: login and setup-admin list --replace, and the merge rule is one line', () => {
  for (const args of [['--help'], ['login', '--help']]) {
    const res = spawnSync(process.execPath, [GSM, ...args], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /node gsm\.mjs login <group> .*\[--replace\]/);
    assert.match(res.stdout, /node gsm\.mjs setup-admin .*\[--replace\]/);
    const rule = res.stdout.split(/\r?\n/).filter((line) => line.includes('--replace (login, setup-admin)'));
    assert.equal(rule.length, 1, 'one help line states the merge rule');
    assert.match(rule[0], /merges the requested scopes with the stored ones; --replace drops the stored ones\./);
  }
});

test('parse: --replace is taken by login and setup-admin, and refused by the other commands', () => {
  assert.equal(parseCliArgs(['login', 'business', '--replace']).values.replace, true);
  assert.equal(parseCliArgs(['login', 'business']).values.replace, undefined);
  assert.equal(parseSetupAdminArgs({ subject: 'a@example.com', 'key-file': 'k.json', replace: true }).replace, true);
  assert.equal(parseSetupAdminArgs({ subject: 'a@example.com', 'key-file': 'k.json' }).replace, false);
  for (const argv of [['status', '--replace'], ['scopes', 'cloud', '--replace'], ['logout', 'cloud', '--replace'], ['setup-client', 'k.json', '--replace']]) {
    assert.throws(
      () => parseCliArgs(argv),
      (err) => err instanceof UsageError && /--replace/.test(err.message),
      `${argv.join(' ')} must refuse --replace with a usage error`,
    );
  }
});

// ---------- the lines a login and setup-admin print ----------

/** A temp root with a token directory and a home folder. The real home folder is never touched. */
async function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-merge-test-'));
  const p = { root, home: join(root, 'home'), tokens: join(root, 'tokens') };
  for (const dir of [p.home, p.tokens]) mkdirSync(dir, { recursive: true });
  try {
    return await fn(p);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const envFor = (p) => ({ ...process.env, HOME: p.home, USERPROFILE: p.home, GSM_TOKEN_DIR: p.tokens });

/** A service account key in its own folder. Only the client_email is needed; the key is referenced, not copied. */
function fakeKey(p) {
  const file = join(p.root, 'service-account.json');
  writeFileSync(file, JSON.stringify({ type: 'service_account', client_email: 'gsm-test@example.iam.gserviceaccount.com', private_key: 'x' }));
  return file;
}

/**
 * Runs `gsm <args>` until it prints the login URL, then stops it. Resolves the output so far. A login waits for the
 * browser callback, which never comes here, so the run is stopped at that point.
 */
function loginUntilUrl(args, p) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [GSM, ...args], { env: envFor(p), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`login printed no URL in time:\n${stdout}\n${stderr}`));
    }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.includes('https://accounts.google.com/o/oauth2')) {
        clearTimeout(timer);
        child.kill();
        resolveRun({ stdout, stderr });
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (!stdout.includes('https://accounts.google.com/o/oauth2')) reject(new Error(`login exited (${code}) before the URL:\n${stdout}\n${stderr}`));
    });
  });
}

test('login: the merge line comes before the browser step, and --replace says what is dropped', async () => {
  await withTemp(async (p) => {
    const client = join(p.root, 'client_secret.json');
    writeFileSync(client, JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
    const tokenFile = join(p.tokens, 'business.token.json');
    const stored = JSON.stringify({ access_token: 'not-a-real-token', scope: STORED_ONLY });
    writeFileSync(tokenFile, stored);

    const merged = await loginUntilUrl(['login', 'business', '--no-browser', '--client-secret', client], p);
    const lines = merged.stdout.split(/\r?\n/);
    const mergeAt = lines.findIndex((l) => /^Merging: 1 scope already stored is kept; \d+ new\.$/.test(l));
    const urlAt = lines.findIndex((l) => l.includes('Open this URL in a browser'));
    assert.ok(mergeAt >= 0, merged.stdout);
    assert.ok(mergeAt < urlAt, 'the merge line is printed before the browser step');
    assert.ok(lines.includes(`  ${STORED_ONLY}`), 'the stored scope is in the list the login requests');

    const replaced = await loginUntilUrl(['login', 'business', '--replace', '--no-browser', '--client-secret', client], p);
    const replacedLines = replaced.stdout.split(/\r?\n/);
    assert.ok(replacedLines.includes('Replacing: the 1 stored scope will be dropped.'), replaced.stdout);
    assert.ok(!replacedLines.includes(`  ${STORED_ONLY}`), 'a replace does not request the stored scope');
    assert.equal(readFileSync(tokenFile, 'utf8'), stored, 'the token file is not rewritten before the login completes');

    rmSync(tokenFile);
    const fresh = await loginUntilUrl(['login', 'business', '--no-browser', '--client-secret', client], p);
    assert.doesNotMatch(fresh.stdout, /Merging:|Replacing:/, 'nothing is stored, so nothing is merged or dropped');
  });
});

test('setup-admin: merges by default, and --replace keeps only what the setup requests', async () => {
  await withTemp(async (p) => {
    const key = fakeKey(p);
    const storedFile = join(p.tokens, 'workspace-admin.scopes.json');
    const run = (extra) =>
      spawnSync(process.execPath, [GSM, 'setup-admin', '--subject', 'admin@example.com', '--key-file', key, ...extra], {
        env: envFor(p),
        encoding: 'utf8',
        timeout: 120_000,
      });
    const scopesOnDisk = () => JSON.parse(readFileSync(storedFile, 'utf8')).scopes;

    const first = run(['--profile', 'readonly']);
    assert.equal(first.status, 0, first.stderr);
    assert.doesNotMatch(first.stdout, /Merging:|Replacing:/, 'nothing is stored yet');
    const readonly = scopesOnDisk();
    assert.ok(readonly.length > 0);

    const second = run(['--profile', 'readwrite']);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /^Merging: \d+ scopes? already stored (is|are) kept; \d+ new\.$/m);
    const merged = scopesOnDisk();
    for (const scope of readonly) assert.ok(merged.includes(scope), `kept ${scope}`);
    assert.deepEqual(merged, [...merged].sort(), 'the stored list is sorted');

    // The status shows the merged list count.
    const status = spawnSync(process.execPath, [GSM, 'status'], { env: envFor(p), encoding: 'utf8', timeout: 60_000 });
    assert.equal(status.status, 0, status.stderr);
    assert.ok(status.stdout.includes(`  scopes (${merged.length}):`), status.stdout);

    const third = run(['--profile', 'readonly', '--replace']);
    assert.equal(third.status, 0, third.stderr);
    assert.match(third.stdout, /^Replacing: (the \d+ stored scopes? will be dropped\.|no stored scope is dropped)/m);
    assert.deepEqual(scopesOnDisk(), readonly, 'replace keeps only the readonly list');
    assert.deepEqual(readdirSync(p.tokens), ['workspace-admin.scopes.json'], 'the key file is not copied into the token directory');
  });
});

test('status: a stored login shows its scope count', async () => {
  await withTemp((p) => {
    writeFileSync(join(p.tokens, 'business.token.json'), JSON.stringify({ access_token: 'not-a-real-token', scope: [G('a'), G('b'), G('c')].join(' ') }));
    const res = spawnSync(process.execPath, [GSM, 'status'], { env: envFor(p), encoding: 'utf8', timeout: 60_000 });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /business: 1 account\(s\) signed in[\s\S]*?scopes \(3\):/);
  });
});
