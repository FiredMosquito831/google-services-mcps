// ND03 test-only ESM customization hook. It redirects the compiled auth module's import of
// ./secret-files.js to this module's wrapper, which pauses the access-token-only child after the
// production fingerprint guard has passed and immediately before writeSecretText acquires its lock/writes.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const WRAPPER_QUERY = 'nd03-wrapper=1';
const REAL_QUERY = 'nd03-real-secret-files=1';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === './secret-files.js' && context.parentURL && context.parentURL.endsWith('/dist/core/auth.js')) {
    const url = new URL(import.meta.url);
    url.search = WRAPPER_QUERY;
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.includes(REAL_QUERY)) {
    const url = new URL(specifier, context.parentURL);
    url.search = '';
    return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
}

export * from '../../dist/core/secret-files.js?nd03-real-secret-files=1';
import { writeSecretText as realWriteSecretText } from '../../dist/core/secret-files.js?nd03-real-secret-files=1';

const pauseArray = new Int32Array(new SharedArrayBuffer(4));

function report(env, event, extra) {
  process.stdout.write(JSON.stringify({
    event,
    child: env.GSM_TEST_HOOK_CHILD ?? 'A',
    pid: process.pid,
    at: Date.now(),
    ...extra,
  }) + '\n');
}

export function writeSecretText(cfg, file, text, env = process.env, ...rest) {
  const armed = env.GSM_TEST_HOOK_ENABLED === '1' && env.GSM_TEST_HOOK_CHILD === 'A';
  const pauseFile = env.GSM_TEST_PAUSE_FILE;
  const releaseFile = env.GSM_TEST_RELEASE_FILE;
  if (!armed || !pauseFile || !releaseFile) return realWriteSecretText(cfg, file, text, env, ...rest);

  let preWriteRefreshToken = null;
  try {
    preWriteRefreshToken = JSON.parse(readFileSync(file, 'utf8')).refresh_token ?? null;
  } catch {
    preWriteRefreshToken = 'unreadable';
  }
  report(env, 'hook-before-write', {
    phase: 'after-fingerprint-guard-before-writeSecretText',
    preWriteRefreshToken,
    note: 'the listener has already read and passed its guard; the merged object has not been written',
  });
  writeFileSync(pauseFile, JSON.stringify({ phase: 'after-fingerprint-guard-before-write', pid: process.pid, preWriteRefreshToken }));
  const timeoutMs = Number(env.GSM_TEST_HOOK_TIMEOUT_MS ?? 20000);
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(releaseFile)) {
    if (Date.now() > deadline) {
      report(env, 'hook-error', { message: 'timed out waiting for the parent release marker' });
      throw new Error('ND03 hook release marker timed out');
    }
    Atomics.wait(pauseArray, 0, 0, 20);
  }
  rmSync(pauseFile, { force: true });
  report(env, 'hook-released', { phase: 'before-real-writeSecretText', preWriteRefreshToken });
  return realWriteSecretText(cfg, file, text, env, ...rest);
}
