/**
 * `gsm protect`: moves the secrets of the token folder (the OAuth tokens, the client secret and its backups, the API key
 * and the Ads developer token) into the operating system's store: DPAPI on Windows, the Keychain on macOS, libsecret on
 * Linux. `gsm protect --off` moves them back to plain files with mode 0600. Only names are printed, never values.
 *
 * Every value is read back from the store before its plain file is removed. If one value fails, the values this run wrote
 * are removed again and the folder keeps its plain files.
 */
import { backendFor, readStoreChoiceSync, type SecretBackend } from '../core/secret-store.js';
import { protectTokenFolder, secretFilesIn, storedSecretNames, unprotectTokenFolder } from '../core/secret-files.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export interface ProtectRequest {
  tokenDir: string;
  /** --off: move the secrets back to plain files. */
  off?: boolean;
  /** --backend dpapi|keychain|secret-service. Default: the best store this machine has. */
  backend?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

const OS_BACKENDS: ReadonlyArray<Exclude<SecretBackend, 'file'>> = ['dpapi', 'keychain', 'secret-service'];

/** The best OS store on this machine, or undefined when there is none (the plain files stay). */
export function bestOsStore(tokenDir: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Exclude<SecretBackend, 'file'> | undefined {
  const chosen = backendFor(tokenDir, { ...env, GSM_TOKEN_STORE: 'auto' }, platform);
  return chosen === 'file' ? undefined : chosen;
}

export function runProtect(req: ProtectRequest, out: Output): number {
  const env = req.env ?? process.env;
  const platform = req.platform ?? process.platform;
  const current: SecretBackend = readStoreChoiceSync(req.tokenDir) ?? 'file';

  if (req.off || req.backend === 'file') {
    if (current === 'file') {
      out.log('The secrets are already plain files in the token folder. Nothing to move.');
      return 0;
    }
    const result = unprotectTokenFolder(req.tokenDir, current);
    for (const name of result.moved) out.log(`moved back to a plain file: ${name}.json (mode 0600)`);
    for (const failure of result.failed) out.log(`could not read ${failure.file} from the ${current} store: ${failure.reason}. It stays in the store.`);
    if (result.failed.length > 0) {
      out.log(`${result.failed.length} secret(s) stayed in the store, and the folder is still set to ${current}. Fix the cause and run protect --off again.`);
      return 1;
    }
    out.log(`The folder is back to plain files (${result.moved.length} secret(s)).`);
    return 0;
  }

  let target: Exclude<SecretBackend, 'file'>;
  if (req.backend !== undefined) {
    if (!OS_BACKENDS.includes(req.backend as Exclude<SecretBackend, 'file'>)) {
      throw new UsageError('usage: node gsm.mjs protect [--backend dpapi|keychain|secret-service] | protect --off');
    }
    // An explicit backend that this machine lacks throws here, with the reason and the fallback.
    target = backendFor(req.tokenDir, { ...env, GSM_TOKEN_STORE: req.backend }, platform) as Exclude<SecretBackend, 'file'>;
  } else {
    const best = bestOsStore(req.tokenDir, env, platform);
    if (best === undefined) {
      throw new UsageError(
        'No operating system store is available on this machine (Windows needs PowerShell, macOS needs the security command, Linux needs secret-tool). The secrets stay as plain files.',
      );
    }
    target = best;
  }

  if (current !== 'file') {
    if (current === target) {
      out.log(`The secrets are already in the ${target} store (${storedSecretNames(req.tokenDir).length} name(s)).`);
      return 0;
    }
    throw new UsageError(`The secrets are in the ${current} store. Run protect --off first, then protect with --backend ${target}.`);
  }

  const plain = secretFilesIn(req.tokenDir);
  if (plain.length === 0) {
    out.log(`No plain secret files to move. The folder is now set to the ${target} store, and new secrets go there.`);
  }
  const result = protectTokenFolder(req.tokenDir, target);
  for (const name of result.moved) out.log(`moved into the ${target} store: ${name}`);
  for (const failure of result.failed) out.log(`could not move ${failure.file} into the ${target} store: ${failure.reason}. It stays a plain file.`);
  if (result.failed.length > 0) {
    out.log('Nothing was changed: the folder keeps its plain files, and the store choice is unchanged. Fix the cause and run protect again.');
    return 1;
  }
  out.log(`Protected: ${result.moved.length} secret(s) are in the ${target} store, and the folder holds no plain copies.`);
  out.log('Restart the plugin servers so they read the store. To return to plain files, run: node gsm.mjs protect --off');
  return 0;
}
