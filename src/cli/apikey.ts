/**
 * `gsm setup-apikey`: saves the API key for the apikey group (gsearch and the other public-API products).
 *
 * The key comes from the environment variable GSM_API_KEY_INPUT, or else from stdin. It is never a command-line
 * argument, so it stays out of shell history and process listings. It is saved as <tokenDir>/apikey.json,
 * {"apiKey": "<key>"}, mode 0600. An existing file is replaced only with --force, and no backup is kept,
 * so no second copy of the key is left behind. The key is never printed, and no error message repeats it.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../core/config.js';
import { apiKeyFileFor } from './credentials.js';
import { writeAtomic } from './fsutil.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export const API_KEY_ENV = 'GSM_API_KEY_INPUT';
export const API_KEY_MAX_LENGTH = 200;

/** Returns the key without surrounding whitespace, or throws a usage error. The messages never include the key. */
export function checkApiKey(raw: string): string {
  const key = raw.trim();
  if (key === '') throw new UsageError('the API key is empty');
  if (/\s/.test(key)) throw new UsageError('the API key must not contain spaces or line breaks');
  if (key.length > API_KEY_MAX_LENGTH) throw new UsageError(`the API key is longer than ${API_KEY_MAX_LENGTH} characters`);
  return key;
}

export interface SetupApiKeyRequest {
  force: boolean;
  /** The environment. GSM_API_KEY_INPUT and GSM_TOKEN_DIR are read from it. */
  env: NodeJS.ProcessEnv;
  /** Reads all of stdin. Returns undefined when stdin is a terminal, so nothing is pasted onto the screen. */
  readStdin: () => Promise<string | undefined>;
}

export async function runSetupApiKey(req: SetupApiKeyRequest, out: Output): Promise<number> {
  const cfg = loadConfig(req.env);
  const file = apiKeyFileFor(cfg);
  if (existsSync(file) && !req.force) {
    throw new UsageError(`${file} already exists. Re-run with --force to replace the saved key.`);
  }

  // The variable wins when it is set (even to an empty value, which then fails the check below).
  const fromEnv = req.env[API_KEY_ENV];
  const raw = fromEnv !== undefined ? fromEnv : await req.readStdin();
  if (raw === undefined || (fromEnv === undefined && raw.trim() === '')) {
    throw new UsageError(
      `no API key given. Set ${API_KEY_ENV}, or pipe the key on stdin, for example: printf '%s' "$KEY" | node gsm.mjs setup-apikey`,
    );
  }
  const key = checkApiKey(raw);

  mkdirSync(cfg.tokenDir, { recursive: true, mode: 0o700 });
  writeAtomic(file, JSON.stringify({ apiKey: key }, null, 2) + '\n', 0o600);
  out.log(`API key saved to ${file}`);
  return 0;
}
