// ND03 test-only child worker. Emits a fake `tokens` event through the production client supplied
// by the compiled getAuthClient; never calls Google, signs in, or reads a real credential file.
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const TOKEN_FILE = 'workspace-user.token.json';
const EXPIRY = 4102444800000;
const INITIAL_REFRESH = 'rt-initial-fake';
const argv = {};
for (const arg of process.argv.slice(2)) {
  const eq = arg.indexOf('=');
  if (!arg.startsWith('--') || eq < 3) throw new Error(`ND03 worker: bad argument ${arg}`);
  argv[arg.slice(2, eq)] = arg.slice(eq + 1);
}

function emit(event, extra = {}) {
  process.stdout.write(JSON.stringify({
    event,
    scenario: argv.scenario,
    child: argv.child,
    pid: process.pid,
    at: Date.now(),
    ...extra,
  }) + '\n');
}

const sleepArray = new Int32Array(new SharedArrayBuffer(4));
function waitForFile(file, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`ND03 worker timed out waiting for ${label}`);
    Atomics.wait(sleepArray, 0, 0, 20);
  }
}

function payloadOf(scenario, child) {
  const base = { access_token: `at-child-${child}`, expiry_date: EXPIRY, scope: `scope-child-${child}` };
  if (scenario === 'S1') return base;
  if (scenario === 'S2') return { ...base, refresh_token: `rt-child-${child}` };
  if (scenario === 'S3') return child === 'B' ? { ...base, refresh_token: 'rt-child-B' } : base;
  throw new Error(`ND03 worker: unknown scenario ${scenario}`);
}

async function main() {
  for (const key of ['scenario', 'child', 'dir', 'start', 'hook']) {
    if (argv[key] === undefined) throw new Error(`ND03 worker: missing --${key}`);
  }
  for (const key of Object.keys(process.env)) {
    if (/^(GOOGLE_APPLICATION_CREDENTIALS|GSM_API_KEY|GSM_SERVICE_ACCOUNT_KEY_FILE|GSM_ADMIN_SUBJECT|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID)/.test(key)) delete process.env[key];
  }
  process.env.GSM_TOKEN_STORE = 'file';
  process.env.GSM_TEST_HOOK_ENABLED = argv.hook === '1' ? '1' : '0';
  process.env.GSM_TEST_HOOK_CHILD = argv.child;
  if (argv.pause) process.env.GSM_TEST_PAUSE_FILE = argv.pause;
  if (argv.release) process.env.GSM_TEST_RELEASE_FILE = argv.release;

  if (argv.hook === '1') {
    register(pathToFileURL(join(HERE, 'refresh-hook.mjs')).href, pathToFileURL(import.meta.url).href);
  }

  const { loadConfig } = await import(pathToFileURL(join(REPO, 'dist/core/config.js')).href);
  const auth = await import(pathToFileURL(join(REPO, 'dist/core/auth.js')).href);
  if (typeof loadConfig !== 'function' || typeof auth.getAuthClient !== 'function') {
    throw new Error('compiled dist/core modules do not expose loadConfig/getAuthClient; compile first');
  }
  const compiled = readFileSync(join(REPO, 'dist/core/auth.js'), 'utf8');
  if (!/client\.on\('tokens'/.test(compiled)
    || !/refreshFingerprint\(current\) !== entry\.fingerprint/.test(compiled)
    || !/ifMatch:/.test(compiled)) {
    throw new Error('compiled dist/core/auth.js does not contain the expected guarded tokens listener; compile first');
  }

  const cfg = loadConfig(process.env);
  const client = await auth.getAuthClient('workspace-user', cfg);
  if (!client || typeof client.emit !== 'function' || client.listenerCount('tokens') < 1) {
    throw new Error('the production client has no tokens listener');
  }
  const file = join(argv.dir, TOKEN_FILE);
  emit('ready', { tokenFile: file, listeners: client.listenerCount('tokens'), hook: argv.hook === '1' });

  waitForFile(argv.start, 'the parent start marker');
  if (argv.scenario === 'S3' && argv.child === 'B' && argv['b-go']) waitForFile(argv['b-go'], 'the parent B-only release marker');

  const payload = payloadOf(argv.scenario, argv.child);
  client.setCredentials({ ...client.credentials, ...payload });
  const emittedAt = Date.now();
  client.emit('tokens', payload);

  const final = JSON.parse(readFileSync(file, 'utf8'));
  emit('result', {
    payloadLabel: `${argv.scenario}/${argv.child}`,
    payload,
    emittedRefreshToken: payload.refresh_token ?? null,
    emittedAt,
    doneAt: Date.now(),
    credentials: {
      refresh_token: client.credentials.refresh_token ?? null,
      access_token: client.credentials.access_token ?? null,
    },
    fileSnapshot: {
      refresh_token: final.refresh_token ?? null,
      access_token: final.access_token ?? null,
      scope: final.scope ?? null,
      expiry_date: final.expiry_date ?? null,
    },
    initialRefreshToken: INITIAL_REFRESH,
  });
}

main().catch((err) => {
  emit('error', { message: String(err && err.message ? err.message : err) });
  process.stderr.write(`ND03 worker diagnostic: ${String(err && err.stack ? err.stack : err)}\n`);
  process.exitCode = 1;
});
