import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ADMIN_SCOPES } from '../core/auth.js';
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import { ALL_GROUPS, LOGIN_GROUPS, type CliGroup } from './args.js';
import { backupFile, writeAtomic } from './fsutil.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

/** The per-group token file. The name matches what core/auth.ts reads: <group>.token.json. */
export function tokenFileFor(group: string, cfg: RuntimeConfig): string {
  return join(cfg.tokenDir, `${group}.token.json`);
}

export interface StoredToken {
  scope?: string;
  expiry_date?: number;
  refresh_token?: string;
  access_token?: string;
}

/**
 * Reads a token file. Errors are reported generically: a JSON.parse message can
 * quote part of the file, and that must never reach the terminal.
 */
export function readStoredToken(file: string): { token?: StoredToken; error?: string } {
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { error: 'token file is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'token file does not hold a JSON object' };
  }
  return { token: parsed as StoredToken };
}

function formatExpiry(expiryMs: number | undefined): string {
  if (expiryMs === undefined || !Number.isFinite(expiryMs)) return 'unknown';
  const iso = new Date(expiryMs).toISOString();
  return expiryMs < Date.now() ? `${iso} (access token expired; it refreshes automatically when a refresh token exists)` : iso;
}

/** Prints per-group login state, the token file, scopes and expiry. Never prints token values. */
export function runStatus(out: Output): number {
  const cfg = loadConfig();
  out.log(`token directory: ${cfg.tokenDir}`);
  out.log(
    `OAuth client file: ${existsSync(cfg.clientSecretFile) ? cfg.clientSecretFile : 'missing (run: gsm setup-client <client_secret.json>)'}`,
  );

  for (const group of ALL_GROUPS) {
    if (group === 'workspace-admin') {
      const keyFound = cfg.serviceAccountKeyFile !== undefined && existsSync(cfg.serviceAccountKeyFile);
      const configured = keyFound && cfg.adminSubject !== undefined;
      out.log(`${group}: ${configured ? 'configured (service account, domain-wide delegation)' : 'not configured (no interactive login)'}`);
      out.log(`  GSM_SERVICE_ACCOUNT_KEY_FILE: ${cfg.serviceAccountKeyFile ? (keyFound ? 'set, file found' : 'set, file NOT found') : 'not set'}`);
      out.log(`  GSM_ADMIN_SUBJECT: ${cfg.adminSubject ? 'set' : 'not set'}`);
      out.log(`  scopes: ${ADMIN_SCOPES.length} (see: gsm login workspace-admin)`);
      continue;
    }

    const file = tokenFileFor(group, cfg);
    const { token, error } = readStoredToken(file);
    if (error) {
      out.log(`${group}: token file unreadable (${error}). Run: gsm logout ${group}, then gsm login ${group}`);
      continue;
    }
    if (!token || !(token.refresh_token || token.access_token)) {
      out.log(`${group}: not logged in (run: gsm login ${group})`);
      continue;
    }
    const scopes = (token.scope ?? '').split(' ').filter(Boolean);
    out.log(`${group}: logged in`);
    out.log(`  token file: ${file}`);
    out.log(`  expires: ${formatExpiry(token.expiry_date)}`);
    out.log(`  refresh token: ${token.refresh_token ? 'yes' : 'no'}`);
    out.log(`  scopes (${scopes.length}):`);
    for (const scope of scopes) out.log(`    ${scope}`);
  }
  return 0;
}

/** Deletes one group's token file. Only that file is removed. */
export function runLogout(group: CliGroup, out: Output): number {
  if (group === 'workspace-admin') {
    out.log('workspace-admin has no stored login (it uses GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT). Nothing to remove.');
    return 0;
  }
  const cfg = loadConfig();
  const file = tokenFileFor(group, cfg);
  if (!existsSync(file)) {
    out.log(`${group}: not logged in (no token file)`);
    return 0;
  }
  unlinkSync(file);
  out.log(`${group}: removed ${file}`);
  out.log('This does not revoke the grant at Google. To revoke it, use https://myaccount.google.com/permissions');
  return 0;
}

/** Copies a Desktop OAuth client JSON into the token directory as client_secret.json (mode 0600). */
export function runSetupClient(sourceArg: string, force: boolean, out: Output): number {
  const source = resolve(sourceArg);
  if (!existsSync(source)) throw new Error(`file not found: ${source}`);
  const text = readFileSync(source, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${source} is not valid JSON`);
  }
  const block =
    typeof parsed === 'object' && parsed !== null ? (parsed as { installed?: { client_id?: unknown; client_secret?: unknown } }).installed : undefined;
  if (!block || typeof block.client_id !== 'string' || typeof block.client_secret !== 'string') {
    throw new UsageError(
      `${source} is not an OAuth "Desktop app" client file (expected an "installed" block with client_id and client_secret). ` +
        'Create one in Google Cloud console: APIs & Services > Credentials > Create credentials > OAuth client ID > Desktop app.',
    );
  }

  const cfg = loadConfig();
  const dest = cfg.clientSecretFile;
  if (resolve(dest) === source) {
    out.log(`OAuth client already in place: ${dest}`);
    return 0;
  }
  if (existsSync(dest) && !force) {
    throw new UsageError(`${dest} already exists. Re-run with --force to replace it (the current file is backed up first).`);
  }

  mkdirSync(cfg.tokenDir, { recursive: true, mode: 0o700 });
  const backup = existsSync(dest) ? backupFile(dest) : undefined;
  writeAtomic(dest, text, 0o600);
  out.log(`OAuth client saved: ${dest} (mode 0600). The client secret was not printed.`);
  if (backup) out.log(`backup: ${backup}`);
  out.log(`Next: gsm login ${LOGIN_GROUPS.join(' | ')}`);
  return 0;
}
