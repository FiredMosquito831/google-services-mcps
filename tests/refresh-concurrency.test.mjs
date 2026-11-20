import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(REPO, 'tests', 'fixtures', 'refresh-worker.mjs');
const ROUNDS = 20;
const CHILD_TIMEOUT_MS = 30000;
const TOKEN_FILE = 'workspace-user.token.json';
const INITIAL_REFRESH = 'rt-initial-fake';
const A_ACCESS = 'at-child-A';
const B_ACCESS = 'at-child-B';
const A_ROTATED = 'rt-child-A';
const B_ROTATED = 'rt-child-B';
const EXPIRY = 4102444800000;
const INITIAL = {
  refresh_token: INITIAL_REFRESH,
  access_token: 'at-initial-fake',
  expiry_date: 4100000000000,
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  token_type: 'Bearer',
  account: 'fake-nd03@example.invalid',
};

const REAL_TOKEN_DIR = join(homedir(), '.google-services-mcps');
const REAL_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
function listing(dir) {
  if (!existsSync(dir)) return `${dir}: ABSENT`;
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => `${entry.name}|${entry.isDirectory() ? 'dir' : 'file'}`)
    .sort()
    .join(',');
}
const BEFORE = { tokenDir: listing(REAL_TOKEN_DIR), configDir: listing(REAL_CONFIG_DIR) };

function makeContext() {
  const home = mkdtempSync(join(tmpdir(), 'gsm-refresh-concurrency-'));
  const config = join(home, 'claude-config');
  const tokens = join(home, 'tokens');
  mkdirSync(config);
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({
    installed: { client_id: 'nd03-fake-client-id', client_secret: 'nd03-fake-client-secret' },
  }));
  writeFileSync(join(tokens, TOKEN_FILE), JSON.stringify(INITIAL));
  const markers = {
    start: join(home, 'start.marker'),
    bgo: join(home, 'b-go.marker'),
    pause: join(home, 'a-paused.marker'),
    release: join(home, 'a-release.marker'),
  };
  return { home, config, tokens, markers, file: join(tokens, TOKEN_FILE) };
}

function childEnv(ctx) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(GOOGLE_APPLICATION_CREDENTIALS|GSM_API_KEY|GSM_SERVICE_ACCOUNT_KEY_FILE|GSM_ADMIN_SUBJECT|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID)/.test(key)) delete env[key];
  }
  return Object.assign(env, {
    HOME: ctx.home,
    USERPROFILE: ctx.home,
    XDG_CONFIG_HOME: ctx.config,
    CLAUDE_CONFIG_DIR: ctx.config,
    GSM_TOKEN_DIR: ctx.tokens,
    GSM_TOKEN_STORE: 'file',
    TMP: ctx.home,
    TEMP: ctx.home,
  });
}

function spawnChild(ctx, scenario, child, hook) {
  const args = [
    WORKER,
    `--scenario=${scenario}`,
    `--child=${child}`,
    `--dir=${ctx.tokens}`,
    `--start=${ctx.markers.start}`,
    `--hook=${hook ? '1' : '0'}`,
    `--pause=${ctx.markers.pause}`,
    `--release=${ctx.markers.release}`,
  ];
  if (scenario === 'S3') args.push(`--b-go=${ctx.markers.bgo}`);
  const proc = spawn(process.execPath, args, { cwd: ctx.home, env: childEnv(ctx), stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { proc, child, lines: [], stderr: '', exited: false, exitCode: null, signal: null };
  createInterface({ input: proc.stdout }).on('line', (line) => {
    try {
      state.lines.push(JSON.parse(line));
    } catch {
      state.stderr += `stdout (non-JSON): ${line}\n`;
    }
  });
  proc.stderr.on('data', (chunk) => { state.stderr += chunk.toString(); });
  proc.on('error', (err) => { state.stderr += `spawn error: ${String(err)}\n`; state.exited = true; state.exitCode = -1; });
  proc.on('exit', (code, signal) => { state.exited = true; state.exitCode = code; state.signal = signal; });
  return state;
}

async function waitFor(predicate, label, timeoutMs = CHILD_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`ND03 timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function resultOf(state) {
  const result = state.lines.find((line) => line.event === 'result');
  assert.ok(result, `${state.child} did not report a result: ${state.stderr}`);
  return result;
}

function commonAssertions(ctx, final) {
  assert.ok(final && typeof final === 'object' && !Array.isArray(final), 'the final token file is a JSON object');
  assert.equal(final.account, INITIAL.account, 'the fake account field survives');
  assert.equal(final.token_type, INITIAL.token_type, 'the fake token_type survives');
  assert.equal(final.expiry_date, EXPIRY, 'the fake expiry from the refresh payload survives');
  assert.deepEqual(readdirSync(ctx.tokens).filter((name) => name.endsWith('.tmp')), [], 'no temporary token file remains');
  assert.deepEqual(readdirSync(ctx.tokens).filter((name) => name.startsWith('.lock-')), [], 'no lock file remains');
}

async function runRound(scenario, hook = false) {
  const ctx = makeContext();
  const trace = [];
  const mark = (label) => trace.push({ at: Date.now(), label });
  const A = spawnChild(ctx, scenario, 'A', hook);
  const B = spawnChild(ctx, scenario, 'B', false);
  let bReleased = false;
  let aReleased = false;
  try {
    await waitFor(() => A.lines.find((line) => line.event === 'ready') && B.lines.find((line) => line.event === 'ready'), 'both children ready');
    mark('both children ready with the compiled tokens listener');
    writeFileSync(ctx.markers.start, '1');
    mark('start barrier released to both children');

    if (scenario === 'S3') {
      const paused = await waitFor(() => existsSync(ctx.markers.pause)
        ? JSON.parse(readFileSync(ctx.markers.pause, 'utf8')) : null, 'A paused after the fingerprint guard, before writeSecretText');
      assert.equal(paused.phase, 'after-fingerprint-guard-before-write');
      assert.equal(paused.preWriteRefreshToken, INITIAL_REFRESH, 'A paused against the pre-rotation file');
      mark('A paused after guard, immediately before writeSecretText');

      writeFileSync(ctx.markers.bgo, '1');
      bReleased = true;
      mark('B released to emit its rotated refresh token');
      await waitFor(() => B.lines.find((line) => line.event === 'result' && line.fileSnapshot?.refresh_token === B_ROTATED),
        'B persisted its rotated refresh token');
      mark('B persisted its rotated refresh token');

      writeFileSync(ctx.markers.release, '1');
      aReleased = true;
      mark('A released to attempt its stale write');
    }

    await waitFor(() => A.exited && B.exited, 'both children to exit');
    mark('both children exited');
    for (const state of [A, B]) {
      const error = state.lines.find((line) => line.event === 'error');
      assert.equal(state.exitCode, 0, `${state.child} exited with ${state.exitCode} (${error?.message ?? state.stderr})`);
      assert.ok(!error, `${state.child} reported an error: ${error?.message}`);
    }
    const final = JSON.parse(readFileSync(ctx.file, 'utf8'));
    commonAssertions(ctx, final);
    const a = resultOf(A);
    const b = resultOf(B);
    if (scenario === 'S1') {
      assert.equal(final.refresh_token, INITIAL_REFRESH);
      assert.ok([A_ACCESS, B_ACCESS].includes(final.access_token));
    } else if (scenario === 'S2') {
      assert.ok([A_ROTATED, B_ROTATED].includes(final.refresh_token));
      assert.ok([A_ACCESS, B_ACCESS].includes(final.access_token));
    } else {
      assert.equal(final.refresh_token, B_ROTATED, 'S3 final file must retain B rotated refresh token');
    }
    return { final, a, b, trace, ctx };
  } finally {
    if (scenario === 'S3') {
      if (bReleased === false) writeFileSync(ctx.markers.bgo, '1');
      if (aReleased === false) writeFileSync(ctx.markers.release, '1');
    }
    await waitFor(() => A.exited && B.exited, 'children to exit during cleanup', 2000).catch(() => {
      for (const state of [A, B]) {
        if (!state.exited && state.proc.pid) {
          try { process.kill(state.proc.pid); } catch { /* already gone */ }
        }
      }
    });
    rmSync(ctx.home, { recursive: true, force: true });
  }
}

test('S1 access-token-only overlap preserves initial refresh token cleanly', async () => {
  for (let round = 1; round <= ROUNDS; round++) {
    await runRound('S1');
  }
});

test('S2 two rotated refresh tokens leave consistent final JSON without lock files remaining', async () => {
  for (let round = 1; round <= ROUNDS; round++) {
    await runRound('S2');
  }
});

test('S3 mixed payloads: forced stale write never discards B rotated refresh token (20/20)', async () => {
  for (let round = 1; round <= ROUNDS; round++) {
    const { final, a } = await runRound('S3', true);
    assert.equal(final.refresh_token, B_ROTATED);
    assert.equal(a.credentials.refresh_token, B_ROTATED, 'child A adopted B rotated refresh token in memory');
  }
});

test('ND03 temp-home containment: real token folder and Claude config paths unchanged', () => {
  assert.deepEqual({ tokenDir: listing(REAL_TOKEN_DIR), configDir: listing(REAL_CONFIG_DIR) }, BEFORE);
});
