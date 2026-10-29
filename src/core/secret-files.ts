import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ensureTokenDir } from './acl.js';
import type { RuntimeConfig } from './config.js';
import {
  deleteSecretSync,
  getSecretSync,
  putSecretSync,
  resolveBackend,
  writeStoreChoice,
  type SecretBackend,
} from './secret-store.js';

/**
 * The secret files of a token folder (the OAuth tokens, the client secret, the API key and the Ads developer token), read
 * and written through the store in use. With the file backend (the default) these are the plain files they always were.
 * With an OS backend (dpapi, keychain, secret-service) the content is held by the store, and the plain file is removed.
 *
 * Every secret name is recorded in <tokenDir>/secrets.json, a list of names without any content. A keychain cannot list
 * its entries, so this list is what `gsm protect --off` uses to find them.
 */

const MANIFEST = 'secrets.json';
const cache = new Map<string, string | undefined>();

/** The store in use for a token folder: GSM_TOKEN_STORE, then <tokenDir>/store.json, else the plain files. */
export function storeFor(tokenDir: string, env: NodeJS.ProcessEnv = process.env): SecretBackend {
  return resolveBackend(tokenDir, env);
}

/** The secret name of a file: its base name without ".json". The store checks the name is safe. */
export function secretNameOf(file: string): string {
  const base = basename(file);
  return base.endsWith('.json') ? base.slice(0, -5) : base;
}

function cacheKey(tokenDir: string, name: string): string {
  return `${tokenDir}\u0000${name}`;
}

function manifestPath(tokenDir: string): string {
  return join(tokenDir, MANIFEST);
}

/** The names the store holds for this folder, from the manifest. Empty when there is none. */
export function storedSecretNames(tokenDir: string): string[] {
  const file = manifestPath(tokenDir);
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { names?: unknown };
    return Array.isArray(raw.names) ? raw.names.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function writeManifest(tokenDir: string, names: string[]): void {
  ensureTokenDir(tokenDir);
  const unique = [...new Set(names)].sort();
  if (unique.length === 0) {
    if (existsSync(manifestPath(tokenDir))) rmSync(manifestPath(tokenDir));
    return;
  }
  writeFileSync(manifestPath(tokenDir), JSON.stringify({ names: unique }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(manifestPath(tokenDir), 0o600);
  } catch {
    // Windows ignores POSIX modes; the folder's access list is the protection there.
  }
}

function addName(tokenDir: string, name: string): void {
  writeManifest(tokenDir, [...storedSecretNames(tokenDir), name]);
}

function dropName(tokenDir: string, name: string): void {
  writeManifest(tokenDir, storedSecretNames(tokenDir).filter((n) => n !== name));
}

/**
 * The text of a secret file, or undefined when there is none. With an OS backend the store is asked first, then the
 * plain file (a file that has not been moved yet still works).
 */
export function readSecretText(cfg: Pick<RuntimeConfig, 'tokenDir'>, file: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const backend = storeFor(cfg.tokenDir, env);
  if (backend !== 'file') {
    const name = secretNameOf(file);
    const key = cacheKey(cfg.tokenDir, name);
    if (!cache.has(key)) {
      const found = getSecretSync(backend, cfg.tokenDir, name);
      // A token that is not there yet is not remembered as missing: a sign-in in another process may store it next.
      if (found !== undefined || !isTokenName(name)) cache.set(key, found);
      if (found !== undefined) return found;
    } else {
      const value = cache.get(key);
      if (value !== undefined) return value;
    }
  }
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** A token file's secret name (<group>.token or <group>.<account>.token). */
function isTokenName(name: string): boolean {
  return name.endsWith('.token');
}

/**
 * Forgets what this process read from the OS store, so the next read asks the store again. A sign-in runs in another
 * process and writes there; call this after it (forgetUserClients in auth.ts does).
 */
export function forgetCachedSecrets(): void {
  cache.clear();
}

/**
 * Writes a plain file in one step for its readers: the text goes to a temporary file in the same folder, which then
 * replaces the file. A reader sees the old text or the new one, never half of it. If the replace fails (on Windows a
 * scanner can hold the file for a moment), the file is written directly, as before, and the temporary file is removed.
 */
function writeFileAtomic(file: string, text: string): void {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 });
    try {
      chmodSync(temp, 0o600);
    } catch {
      // Windows ignores POSIX modes; the folder's access list is the protection there.
    }
    renameSync(temp, file);
  } catch {
    if (existsSync(temp)) rmSync(temp, { force: true });
    writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  }
}

/** True when the secret file exists, in the store or as a plain file. */
export function secretFileExists(cfg: Pick<RuntimeConfig, 'tokenDir'>, file: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return readSecretText(cfg, file, env) !== undefined;
}

/**
 * Writes a secret file with mode 0600. With an OS backend the text goes to the store, the name is recorded in the manifest,
 * and any plain copy of the file is removed.
 */
export function writeSecretText(cfg: Pick<RuntimeConfig, 'tokenDir'>, file: string, text: string, env: NodeJS.ProcessEnv = process.env): void {
  const backend = storeFor(cfg.tokenDir, env);
  if (backend === 'file') {
    ensureTokenDir(dirname(file));
    writeFileAtomic(file, text);
    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows ignores POSIX modes; the folder's access list is the protection there.
    }
    return;
  }
  const name = secretNameOf(file);
  putSecretSync(backend, cfg.tokenDir, name, text);
  addName(cfg.tokenDir, name);
  cache.set(cacheKey(cfg.tokenDir, name), text);
  if (existsSync(file)) rmSync(file);
}

/** Removes a secret file from the store and from the folder. Returns false when neither had it. */
export function removeSecretFile(cfg: Pick<RuntimeConfig, 'tokenDir'>, file: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let removed = false;
  const backend = storeFor(cfg.tokenDir, env);
  if (backend !== 'file') {
    const name = secretNameOf(file);
    if (storedSecretNames(cfg.tokenDir).includes(name) || getSecretSync(backend, cfg.tokenDir, name) !== undefined) {
      deleteSecretSync(backend, cfg.tokenDir, name);
      dropName(cfg.tokenDir, name);
      removed = true;
    }
    cache.delete(cacheKey(cfg.tokenDir, name));
  }
  if (existsSync(file)) {
    rmSync(file);
    removed = true;
  }
  return removed;
}

/**
 * The plain secret files a protect run moves: the token files, the client secret and its backups, the API key and the
 * Ads developer token. Other files of the folder (the registry, the scope records, the ADC record) hold no secret.
 */
export function secretFilesIn(tokenDir: string): string[] {
  if (!existsSync(tokenDir)) return [];
  return readdirSync(tokenDir)
    .filter((name) => name.endsWith('.token.json') || /^(client_secret|apikey|ads)(\.bak-[\w.-]+)?\.json$/.test(name))
    .sort()
    .map((name) => join(tokenDir, name));
}

export interface MoveFailure {
  file: string;
  reason: string;
}

export interface MoveResult {
  moved: string[];
  failed: MoveFailure[];
}

/**
 * Moves every plain secret file of the folder into the store. Each value is read back from the store and compared before
 * the plain file is removed. A file that fails keeps its plain copy. If anything failed, every value this run stored is
 * removed again and the store choice is not changed, so the folder stays as it was.
 */
export function protectTokenFolder(tokenDir: string, backend: Exclude<SecretBackend, 'file'>): MoveResult {
  const moved: string[] = [];
  const written: string[] = [];
  const failed: MoveFailure[] = [];
  for (const file of secretFilesIn(tokenDir)) {
    const name = secretNameOf(file);
    try {
      const text = readFileSync(file, 'utf8');
      putSecretSync(backend, tokenDir, name, text);
      written.push(name);
      addName(tokenDir, name);
      if (getSecretSync(backend, tokenDir, name) !== text) throw new Error('the value read back from the store is different');
      rmSync(file);
      moved.push(name);
    } catch (err) {
      failed.push({ file: basename(file), reason: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length > 0) {
    // Roll back every value this run wrote. A file that was moved gets its plain copy back first, from the store.
    for (const name of written) {
      const file = join(tokenDir, `${name}.json`);
      try {
        const text = getSecretSync(backend, tokenDir, name);
        if (text !== undefined && !existsSync(file) && moved.includes(name)) {
          writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
        }
        deleteSecretSync(backend, tokenDir, name);
        dropName(tokenDir, name);
      } catch {
        // A value that cannot be removed stays listed in the manifest, so `gsm protect --off` can still find it.
      }
    }
    cache.clear();
    return { moved: [], failed };
  }
  writeStoreChoice(tokenDir, backend);
  cache.clear();
  return { moved, failed };
}

/**
 * Moves every secret the store holds back to plain files with mode 0600, and records the file backend. Each file is read
 * back from the store first. A name that cannot be read is reported and left in the store.
 */
export function unprotectTokenFolder(tokenDir: string, backend: Exclude<SecretBackend, 'file'>): MoveResult {
  const moved: string[] = [];
  const failed: MoveFailure[] = [];
  for (const name of storedSecretNames(tokenDir)) {
    try {
      const text = getSecretSync(backend, tokenDir, name);
      if (text === undefined) throw new Error('the store has no value for this name');
      const file = join(tokenDir, `${name}.json`);
      writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
      try {
        chmodSync(file, 0o600);
      } catch {
        // Windows ignores POSIX modes.
      }
      deleteSecretSync(backend, tokenDir, name);
      dropName(tokenDir, name);
      moved.push(name);
    } catch (err) {
      failed.push({ file: name, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  if (failed.length === 0) writeStoreChoice(tokenDir, 'file');
  cache.clear();
  return { moved, failed };
}
