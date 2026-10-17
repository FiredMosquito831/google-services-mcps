// Where secret strings (refresh tokens, the OAuth client secret, API keys) are kept. Where the OS protects them, they go
// there: Windows DPAPI (a ciphertext file in the token folder), the macOS Keychain, or libsecret (GNOME Keyring,
// KWallet). Otherwise they go in a plain file in the token folder, mode 0600, as before. A value reaches a helper program
// on stdin only, never in argv, and no error message contains a value. The backend comes from GSM_TOKEN_STORE, else from
// <tokenDir>/store.json, else the plain file store. Each operation has an async and a sync form; both run the same steps.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { ensureTokenDir } from './acl.js';

export type SecretBackend = 'dpapi' | 'keychain' | 'secret-service' | 'file';
type NativeBackend = Exclude<SecretBackend, 'file'>;
export type SecretOp = 'get' | 'put' | 'delete';

/** The program, its arguments and what it reads on stdin. Built by buildCommand, run by the store. */
export interface CommandPlan {
  file: string;
  args: string[];
  stdin: string;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const SERVICE = 'google-services-mcps';
const BACKENDS: readonly SecretBackend[] = ['dpapi', 'keychain', 'secret-service', 'file'];
const CHOICES: readonly string[] = ['auto', ...BACKENDS];
const STORE_FILE = 'store.json';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
// Windows keeps these device names reserved with any extension, so "CON.secret" would open the console.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const KEYCHAIN_NOT_FOUND = 44; // errSecItemNotFound
const TIMEOUT_MS = 120_000; // a keychain or libsecret prompt can wait for the user

const NATIVE: Record<NativeBackend, { platform: NodeJS.Platform; label: string; program: string }> = {
  dpapi: { platform: 'win32', label: 'Windows (DPAPI, through powershell.exe)', program: 'powershell.exe' },
  keychain: { platform: 'darwin', label: 'macOS (Keychain, through security)', program: 'security' },
  'secret-service': { platform: 'linux', label: 'Linux (libsecret, through secret-tool)', program: 'secret-tool' },
};

// Both scripts read stdin as base64 and print base64. They use no double quotes, so the argument survives the
// command line that Node builds for Windows.
const PS_PREFIX = "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; ";
const PROTECT = `${PS_PREFIX}$plain = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $cipher = [System.Security.Cryptography.ProtectedData]::Protect($plain, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($cipher))`;
const UNPROTECT = `${PS_PREFIX}$cipher = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($plain))`;

/** Throws unless the name is a plain identifier, so it cannot leave the token folder or name a Windows device. */
function checkName(name: string): void {
  if (!NAME.test(name) || WINDOWS_RESERVED.test(name)) {
    throw new Error(
      'invalid secret name: use 1 to 200 letters, digits, dots, underscores or hyphens, starting with a letter or digit, and not a Windows device name (CON, NUL, COM1 ...)',
    );
  }
}

/**
 * Whether a program can be found on PATH. Checks the file names only; it does not start the program. The separator is
 * the one of the host that owns the environment; the platform only decides the file extensions to look for.
 */
function onPath(program: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): boolean {
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  const hasExt = /\.[^./\\]+$/.test(program);
  const exts = platform === 'win32' && !hasExt ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  return dirs.some((dir) => exts.some((ext) => existsSync(join(dir, program + ext))));
}

/** Why a backend cannot be used here, or undefined when it can. The file backend is always usable. */
function unusableReason(backend: SecretBackend, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined {
  if (backend === 'file') return undefined;
  const need = NATIVE[backend];
  if (platform !== need.platform) return `${backend} needs ${need.label}, but this platform is ${platform}.`;
  if (!onPath(need.program, env, platform)) return `${backend} needs ${need.program}, which was not found on PATH.`;
  return undefined;
}

const FALLBACK_HINT = 'Set GSM_TOKEN_STORE=file to keep the plain file store, or GSM_TOKEN_STORE=auto.';

function unusableError(reason: string, hint = FALLBACK_HINT): Error {
  return new Error(`${reason} ${hint}`);
}

function assertUsable(backend: SecretBackend): void {
  const reason = unusableReason(backend, process.env, process.platform);
  if (reason) throw unusableError(reason);
}

/**
 * The backend for GSM_TOKEN_STORE. 'auto' picks DPAPI on Windows, the Keychain on macOS and libsecret on Linux when the
 * helper program is on PATH, and the file store otherwise. An explicit name is never replaced by another backend: if it
 * cannot be used here, this throws. tokenDir is not used by the choice; it is accepted so callers pass the same
 * arguments everywhere. env and platform can be overridden for tests.
 */
export function backendFor(
  _tokenDir: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): SecretBackend {
  const raw = (env.GSM_TOKEN_STORE ?? '').trim().toLowerCase() || 'auto';
  if (!CHOICES.includes(raw)) {
    throw new Error(`GSM_TOKEN_STORE must be one of ${CHOICES.join(', ')} (got "${raw.slice(0, 40)}")`);
  }
  if (raw === 'auto') {
    if (unusableReason('dpapi', env, platform) === undefined) return 'dpapi';
    if (unusableReason('keychain', env, platform) === undefined) return 'keychain';
    if (unusableReason('secret-service', env, platform) === undefined) return 'secret-service';
    return 'file';
  }
  const backend = raw as SecretBackend;
  const reason = unusableReason(backend, env, platform);
  if (reason) throw unusableError(reason);
  return backend;
}

/**
 * The backend for a token folder. GSM_TOKEN_STORE wins when it is set and not empty (it may be 'auto'). Otherwise the
 * choice in <tokenDir>/store.json is used. Otherwise the plain file store, so an install that chose nothing keeps today's
 * behaviour. A store.json that is present but not a valid choice throws, rather than falling back to the file store
 * without a word. A choice this platform cannot use also throws, and nothing else is tried.
 */
export function resolveBackend(tokenDir: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): SecretBackend {
  if ((env.GSM_TOKEN_STORE ?? '').trim() !== '') return backendFor(tokenDir, env, platform);
  const path = join(tokenDir, STORE_FILE);
  if (!existsSync(path)) return 'file';
  const chosen = readStoreChoiceSync(tokenDir);
  if (chosen === undefined) {
    throw new Error(
      `${path} is not a valid store choice (expected {"backend": "file", "dpapi", "keychain" or "secret-service"}). Fix it, delete it, or set GSM_TOKEN_STORE.`,
    );
  }
  const reason = unusableReason(chosen, env, platform);
  if (reason) {
    throw unusableError(`${path} selects ${chosen}, which cannot be used here. ${reason}`, 'Change that file, or set GSM_TOKEN_STORE=file.');
  }
  return chosen;
}

/**
 * The choice in <tokenDir>/store.json. undefined when the file is missing or is not a valid choice: an object with the
 * single key "backend" and one of file, dpapi, keychain, secret-service. It never throws and never says what the file
 * holds.
 */
export function readStoreChoiceSync(tokenDir: string): SecretBackend | undefined {
  try {
    return parseChoice(readFileSync(join(tokenDir, STORE_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

function parseChoice(text: string): SecretBackend | undefined {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (Object.keys(value).join(',') !== 'backend') return undefined;
  const backend: unknown = (value as { backend?: unknown }).backend;
  return typeof backend === 'string' && BACKENDS.includes(backend as SecretBackend) ? (backend as SecretBackend) : undefined;
}

/**
 * Records the backend for a token folder in <tokenDir>/store.json (mode 0600). Refuses a name that is not a backend,
 * and a backend this platform cannot use, so a choice that could not work is never written.
 */
export function writeStoreChoice(tokenDir: string, backend: SecretBackend): void {
  if (!BACKENDS.includes(backend)) throw new Error(`store choice must be one of ${BACKENDS.join(', ')}`);
  assertUsable(backend);
  writeProtected(tokenDir, STORE_FILE, `${JSON.stringify({ backend }, null, 2)}\n`);
}

/**
 * The program call for one operation. For 'put' the input is the value; for dpapi 'get' it is the ciphertext from the
 * file. The value goes in stdin: base64 for DPAPI, as hex for the Keychain (`security -i` reads its commands from
 * stdin, so the hex is never in argv), and raw for libsecret. Exported for the tests.
 */
export function buildCommand(backend: NativeBackend, op: SecretOp, name: string, input = ''): CommandPlan {
  checkName(name);
  if (backend === 'dpapi') {
    if (op === 'delete') throw new Error('DPAPI has no delete command: the ciphertext file is removed instead');
    return {
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', op === 'put' ? PROTECT : UNPROTECT],
      stdin: op === 'put' ? Buffer.from(input, 'utf8').toString('base64') : input,
    };
  }
  if (backend === 'keychain') {
    if (op === 'put') {
      rejectControl(input, backend);
      const hex = Buffer.from(input, 'utf8').toString('hex');
      return { file: 'security', args: ['-i'], stdin: `add-generic-password -U -s ${SERVICE} -a ${name} -X ${hex}\n` };
    }
    if (op === 'get') {
      return { file: 'security', args: ['find-generic-password', '-s', SERVICE, '-a', name, '-w'], stdin: '' };
    }
    return { file: 'security', args: ['delete-generic-password', '-s', SERVICE, '-a', name], stdin: '' };
  }
  if (op === 'put') {
    rejectControl(input, backend);
    return {
      file: 'secret-tool',
      args: ['store', `--label=${SERVICE} ${name}`, 'service', SERVICE, 'account', name],
      stdin: input,
    };
  }
  if (op === 'get') return { file: 'secret-tool', args: ['lookup', 'service', SERVICE, 'account', name], stdin: '' };
  return { file: 'secret-tool', args: ['clear', 'service', SERVICE, 'account', name], stdin: '' };
}

/** The Keychain and libsecret keep one line of text per item here: a line break would be read back altered. */
function rejectControl(value: string, backend: NativeBackend): void {
  if (CONTROL.test(value)) {
    throw new Error(`${backend} stores single-line text only: the value has a line break, tab or other control character`);
  }
}

// ---- the operations, written once ----
//
// Each operation is a generator. It yields the command it needs and receives that command's result; it does its own
// file work in between. driveSync and driveAsync run it, so the sync and async forms share every line of logic.

type Program<T> = Generator<CommandPlan, T, RunResult>;

function* getProgram(backend: SecretBackend, tokenDir: string, name: string): Program<string | undefined> {
  checkName(name);
  if (backend === 'file') {
    const path = secretPath(tokenDir, name);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  }
  assertUsable(backend);
  if (backend === 'dpapi') {
    const path = secretPath(tokenDir, name);
    if (!existsSync(path)) return undefined;
    const res = yield buildCommand('dpapi', 'get', name, readFileSync(path, 'utf8').trim());
    if (res.code !== 0) throw failure(`decrypting ${name}.secret with DPAPI`, res.code, res.stderr, []);
    return Buffer.from(res.stdout.trim(), 'base64').toString('utf8');
  }
  const res = yield buildCommand(backend, 'get', name);
  if (backend === 'keychain' && res.code === KEYCHAIN_NOT_FOUND) return undefined;
  // secret-tool exits 1 with no output when nothing matches.
  if (backend === 'secret-service' && res.code === 1 && res.stdout === '' && res.stderr.trim() === '') return undefined;
  if (res.code !== 0) throw failure(`reading ${name} from ${label(backend)}`, res.code, res.stderr, []);
  return withoutLineBreak(res.stdout);
}

function* putProgram(backend: SecretBackend, tokenDir: string, name: string, value: string): Program<void> {
  checkName(name);
  if (typeof value !== 'string' || value === '') throw new Error(`secret ${name} must be a non-empty string`);
  assertUsable(backend);
  if (backend === 'file') {
    writeProtected(tokenDir, `${name}.secret`, value);
    return;
  }
  if (backend === 'dpapi') {
    const res = yield buildCommand('dpapi', 'put', name, value);
    if (res.code !== 0) throw failure(`encrypting ${name} with DPAPI`, res.code, res.stderr, encodings(value));
    writeProtected(tokenDir, `${name}.secret`, res.stdout.trim());
    return;
  }
  const res = yield buildCommand(backend, 'put', name, value);
  if (res.code !== 0) throw failure(`storing ${name} in ${label(backend)}`, res.code, res.stderr, encodings(value));
}

function* deleteProgram(backend: SecretBackend, tokenDir: string, name: string): Program<void> {
  checkName(name);
  if (backend === 'file' || backend === 'dpapi') {
    rmSync(secretPath(tokenDir, name), { force: true });
    return;
  }
  assertUsable(backend);
  const res = yield buildCommand(backend, 'delete', name);
  if (backend === 'keychain' && res.code === KEYCHAIN_NOT_FOUND) return;
  if (res.code !== 0) throw failure(`deleting ${name} from ${label(backend)}`, res.code, res.stderr, []);
}

/** Runs a program to the end, feeding each command to the runner. The runner is the only part that differs. */
function driveSync<T>(program: Program<T>): T {
  let step = program.next();
  while (!step.done) step = program.next(runSync(step.value));
  return step.value;
}

async function driveAsync<T>(program: Program<T>): Promise<T> {
  let step = program.next();
  while (!step.done) step = program.next(await runAsync(step.value));
  return step.value;
}

// ---- running the helper programs ----

function timeoutFailure(plan: CommandPlan): Error {
  return new Error(`${plan.file} did not finish within ${TIMEOUT_MS / 1000} seconds (it may be waiting for a prompt)`);
}

function startFailure(plan: CommandPlan, err: NodeJS.ErrnoException): Error {
  if (err.code === 'ETIMEDOUT') return timeoutFailure(plan);
  return new Error(`${plan.file} could not be started (${err.code ?? 'error'})`);
}

function runSync(plan: CommandPlan): RunResult {
  const res = spawnSync(plan.file, plan.args, { input: plan.stdin, encoding: 'utf8', timeout: TIMEOUT_MS, windowsHide: true });
  const error = res.error as NodeJS.ErrnoException | undefined;
  // EPIPE: the program exited before it read its input. Its exit code still says what happened.
  if (error && error.code !== 'EPIPE') throw startFailure(plan, error);
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function runAsync(plan: CommandPlan): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    // The program may exit before it reads stdin; that write error is not useful and is not reported.
    child.stdin.on('error', () => {});
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(startFailure(plan, err));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(timeoutFailure(plan));
        return;
      }
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(plan.stdin);
  });
}

/**
 * An error for a failed program: its exit code and the first line of its stderr, with every value redacted. The
 * values are the secret and its encodings, so the message holds no secret even if the program echoes its input.
 */
function failure(what: string, code: number | null, stderr: string, values: string[]): Error {
  // Redact the whole stderr before the first line is cut out and shortened, so no value is split across the cut.
  let text = stderr;
  for (const value of values) {
    if (value) text = text.split(value).join('[redacted]');
  }
  const first = (text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '').slice(0, 160);
  return new Error(`${what} failed (exit code ${code})${first ? `: ${first}` : ''}`);
}

/** Every encoding of a value that a program could echo back. */
function encodings(value: string): string[] {
  const bytes = Buffer.from(value, 'utf8');
  return [value, bytes.toString('base64'), bytes.toString('hex')];
}

/** The file that holds a secret in the file and DPAPI backends. */
function secretPath(tokenDir: string, name: string): string {
  return join(tokenDir, `${name}.secret`);
}

/** Writes a file with mode 0600 in the token folder, the way the token files are written (auth.ts writeSecureJson). */
function writeProtected(dir: string, file: string, text: string): void {
  ensureTokenDir(dir);
  const path = join(dir, file);
  writeFileSync(path, text, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; the folder's access list is the protection there.
  }
}

/** The text a program printed, without the one line break that the Keychain and secret-tool may add. */
function withoutLineBreak(text: string): string {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

function label(backend: NativeBackend): string {
  return NATIVE[backend].label;
}

// ---- the public API ----

/**
 * The secret, or undefined when there is none. Throws when the backend cannot be used on this platform, or when the
 * program fails. A DPAPI file that was written by another backend (plain text) or by another user fails to decrypt and
 * throws.
 */
export function getSecret(backend: SecretBackend, tokenDir: string, name: string): Promise<string | undefined> {
  return driveAsync(getProgram(backend, tokenDir, name));
}

/** The synchronous form of getSecret: same steps, same errors, spawnSync for the helper program. */
export function getSecretSync(backend: SecretBackend, tokenDir: string, name: string): string | undefined {
  return driveSync(getProgram(backend, tokenDir, name));
}

/**
 * Stores the secret, replacing any earlier one. The value must not be empty. The Keychain and libsecret backends take
 * one line of text only. Throws when the backend cannot be used here, and the error holds no value.
 */
export function putSecret(backend: SecretBackend, tokenDir: string, name: string, value: string): Promise<void> {
  return driveAsync(putProgram(backend, tokenDir, name, value));
}

/** The synchronous form of putSecret. */
export function putSecretSync(backend: SecretBackend, tokenDir: string, name: string, value: string): void {
  driveSync(putProgram(backend, tokenDir, name, value));
}

/**
 * Removes the secret. A missing secret is not an error. The file and DPAPI backends only remove a file, so they work on
 * any platform.
 */
export function deleteSecret(backend: SecretBackend, tokenDir: string, name: string): Promise<void> {
  return driveAsync(deleteProgram(backend, tokenDir, name));
}

/** The synchronous form of deleteSecret. */
export function deleteSecretSync(backend: SecretBackend, tokenDir: string, name: string): void {
  driveSync(deleteProgram(backend, tokenDir, name));
}
