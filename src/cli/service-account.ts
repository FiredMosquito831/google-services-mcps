/**
 * `gsm setup-service-account`: records the service account key for the service-account group (Google Play and Merchant
 * Center). The key is checked and then referenced by path. It is never copied into the token directory, and its content is
 * never printed: only the account's email and project are shown. `--remove` forgets the setup; the key file is not deleted.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { forgetServiceAccountClients, removeServiceAccountFile, saveServiceAccountFile } from '../core/auth.js';
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export interface ServiceAccountKey {
  clientEmail: string;
  projectId?: string;
}

/**
 * Reads a service account key and checks what it is: a JSON file of type service_account with an email and a private key.
 * Errors name the problem, and never include the file's content.
 */
export function readServiceAccountKey(file: string): ServiceAccountKey {
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`key file not found: ${file}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new UsageError(`${file} is not valid JSON. Use the service account JSON key from Google Cloud console.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`${file} is not a service account key.`);
  }
  const key = parsed as { type?: unknown; client_email?: unknown; private_key?: unknown; project_id?: unknown };
  if (key.type !== 'service_account') {
    const kind = typeof key.type === 'string' ? `type is ${key.type}` : 'it has no type';
    throw new UsageError(`${file} is not a service account key (${kind}). An OAuth client or a user login is not a service account key.`);
  }
  if (typeof key.client_email !== 'string' || key.client_email.trim() === '') {
    throw new UsageError(`${file} is not a service account key: it has no client_email.`);
  }
  if (typeof key.private_key !== 'string' || key.private_key.trim() === '') {
    throw new UsageError(`${file} is a service account key without a private key. Create a new JSON key in Google Cloud console.`);
  }
  return {
    clientEmail: key.client_email.trim(),
    projectId: typeof key.project_id === 'string' && key.project_id !== '' ? key.project_id : undefined,
  };
}

export interface SetupServiceAccountRequest {
  keyFile?: string;
  remove?: boolean;
}

export function runSetupServiceAccount(req: SetupServiceAccountRequest, out: Output, cfg: RuntimeConfig = loadConfig()): number {
  if (req.remove) {
    const removed = removeServiceAccountFile(cfg);
    forgetServiceAccountClients();
    out.log(removed ? 'Removed the service account setup. The key file itself was not deleted.' : 'No service account setup to remove.');
    return 0;
  }
  if (!req.keyFile) throw new UsageError('usage: node gsm.mjs setup-service-account --key-file <service account JSON>  (or --remove)');

  const keyFile = resolve(req.keyFile);
  const key = readServiceAccountKey(keyFile);
  if (process.platform !== 'win32') {
    const mode = statSync(keyFile).mode & 0o777;
    if (mode & 0o077) out.warn(`note: ${keyFile} is readable by other users (mode ${mode.toString(8)}). Run: chmod 600 "${keyFile}"`);
  }

  const file = saveServiceAccountFile(cfg, { keyFile, clientEmail: key.clientEmail });
  forgetServiceAccountClients();
  out.log(`Saved service account setup: ${file} (mode 0600).`);
  out.log(`Account: ${key.clientEmail}${key.projectId ? ` (project ${key.projectId})` : ''}`);
  out.log(`Key file: ${keyFile} (referenced, not copied)`);
  out.log('Add this account in Play Console (Users and permissions), and as an Admin user of Merchant Center.');
  out.log('Then restart the gplay and gmerchant servers. Write tools also need GSM_ALLOW_WRITES=true.');
  return 0;
}
