// The exact argv auth_setup_admin sends to the plugin CLI. The helper is pure: no token folder, key file, credential
// content or Google call is involved. The built-server forwarding is covered by tests/admin-setup-reload.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const { setupAdminArgs } = await import(pathToFileURL(join(REPO, 'dist', 'core', 'tools.js')).href);

const SUBJECT = 'admin@example.com';
const KEY_FILE = '/tmp/fake-key.json';
const base = (profile = 'readonly') => [
  'setup-admin',
  '--subject',
  SUBJECT,
  '--key-file',
  KEY_FILE,
  '--profile',
  profile,
  '--servers',
  'gadmin',
];

test('auth_setup_admin argv: the default is byte-identical to the pre-profile array', () => {
  const args = setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE }, 'gadmin', 'all');
  assert.deepEqual(args, base());
  assert.equal(args.filter((part) => part === '--profile').length, 1);
});

test('auth_setup_admin argv: readwrite and full change only the value after --profile', () => {
  for (const profile of ['readwrite', 'full']) {
    const args = setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE, profile }, 'gadmin', 'all');
    assert.deepEqual(args, base(profile));
    assert.equal(args.filter((part) => part === '--profile').length, 1);
  }
});

test('auth_setup_admin argv: --replace and --toolset keep their order after --servers', () => {
  assert.deepEqual(setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE, replace: true }, 'gadmin', 'all'), [...base(), '--replace']);
  assert.deepEqual(setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE }, 'gadmin', 'google'), [...base(), '--toolset=google']);
  assert.deepEqual(
    setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE, profile: 'readwrite', replace: true }, 'gadmin', 'google'),
    [...base('readwrite'), '--replace', '--toolset=google'],
  );
  assert.deepEqual(setupAdminArgs({ subject: SUBJECT, key_file: KEY_FILE, replace: 'true' }, 'gadmin', 'all'), base(), 'only the boolean true replaces');
});

test('auth_setup_admin argv: missing or unknown profiles normalize to readonly', () => {
  for (const profile of [undefined, 'everything', 'READWRITE', null, 5]) {
    const rawArgs = { subject: SUBJECT, key_file: KEY_FILE };
    if (profile !== undefined) rawArgs.profile = profile;
    const args = setupAdminArgs(rawArgs, 'gadmin', 'all');
    assert.deepEqual(args, base());
    assert.equal(args.filter((part) => part === '--profile').length, 1);
  }
});

test('the argv helper is synchronous and pure, and the handler passes its one result to the CLI once', () => {
  const rawArgs = Object.freeze({ subject: SUBJECT, key_file: KEY_FILE, profile: 'full', replace: true });
  const args = setupAdminArgs(rawArgs, 'gadmin', 'all');
  assert.ok(Array.isArray(args) && args.every((part) => typeof part === 'string'));
  assert.deepEqual(rawArgs, { subject: SUBJECT, key_file: KEY_FILE, profile: 'full', replace: true }, 'the raw arguments are not mutated');
  assert.equal(setupAdminArgs(rawArgs, 'gadmin', 'all').length, args.length, 'repeated calls are stable');

  const src = readFileSync(join(REPO, 'src', 'core', 'tools.ts'), 'utf8');
  const start = src.lastIndexOf("if (group === 'workspace-admin') {");
  const end = src.indexOf('// Every server has a health tool.', start);
  assert.ok(start >= 0 && end > start, 'the admin registration is found');
  const handler = src.slice(start, end);
  assert.equal((handler.match(/const args = setupAdminArgs\(rawArgs, opts\.name, cfg\.toolset\);/g) ?? []).length, 1);
  assert.equal((handler.match(/runGsmCommand\(cliFile, args\)/g) ?? []).length, 1, 'the CLI runs once with the helper output');
  assert.match(src, /const cliFile = fileURLToPath\(new URL\('\.\.\/bin\/gsm\.mjs', import\.meta\.url\)\);/, 'the CLI path is still module-derived');
});
