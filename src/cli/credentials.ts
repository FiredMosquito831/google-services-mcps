import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ADMIN_SCOPES, adminScopeFileFor, readAdminScopeFile } from '../core/auth.js';
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import { ALL_GROUPS, OAUTH_GROUPS, type CliGroup } from './args.js';
import { backupFile, writeAtomic } from './fsutil.js';
import { postureLine } from './posture.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

/** The per-group token file. The name matches what core/auth.ts reads: <group>.token.json. */
export function tokenFileFor(group: string, cfg: RuntimeConfig): string {
  return join(cfg.tokenDir, `${group}.token.json`);
}

/** The saved API key for the apikey group: {"apiKey": "<key>"}, mode 0600, in the token directory. */
export function apiKeyFileFor(cfg: Pick<RuntimeConfig, 'tokenDir'>): string {
  return join(cfg.tokenDir, 'apikey.json');
}

export type ApiKeyState = 'missing' | 'saved' | 'unreadable';

/** Whether a key is saved. The key value is read only to check it is a non-empty string, and is never returned. */
export function apiKeyState(file: string): ApiKeyState {
  if (!existsSync(file)) return 'missing';
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const saved = typeof parsed === 'object' && parsed !== null ? (parsed as { apiKey?: unknown }).apiKey : undefined;
    return typeof saved === 'string' && saved.trim() !== '' ? 'saved' : 'unreadable';
  } catch {
    return 'unreadable';
  }
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

/**
 * Prints per-group login state, the token file, scopes, expiry and the security posture.
 * Never prints token values or the API key.
 */
export function runStatus(out: Output, env: NodeJS.ProcessEnv = process.env): number {
  const cfg = loadConfig(env);
  out.log(`token directory: ${cfg.tokenDir}`);
  out.log(
    `OAuth client file: ${existsSync(cfg.clientSecretFile) ? cfg.clientSecretFile : 'missing (run: gsm setup-client <client_secret.json>)'}`,
  );

  for (const group of ALL_GROUPS) {
    if (group === 'apikey') {
      const file = apiKeyFileFor(cfg);
      const state = apiKeyState(file);
      if (state === 'saved') out.log(`apikey: API key saved in ${file} (the value is not shown)`);
      else if (state === 'missing') out.log('apikey: not set (run: gsm setup-apikey)');
      else out.log(`apikey: ${file} is unreadable or holds no key (run: gsm setup-apikey --force)`);
      continue;
    }

    if (group === 'workspace-admin') {
      const stored = readAdminScopeFile(cfg);
      if (stored) {
        const keyFound = existsSync(stored.keyFile);
        out.log(`${group}: set up with gsm setup-admin (service account, domain-wide delegation)`);
        out.log(`  setup file: ${adminScopeFileFor(cfg)}`);
        out.log(`  subject: ${stored.subject}`);
        out.log(`  key file: ${stored.keyFile}${keyFound ? '' : ' (NOT found)'}`);
        out.log(`  profile: ${stored.profile}`);
        out.log(`  scopes (${stored.scopes.length}):`);
        for (const scope of stored.scopes) out.log(`    ${scope}`);
        continue;
      }
      const keyFound = cfg.serviceAccountKeyFile !== undefined && existsSync(cfg.serviceAccountKeyFile);
      const configured = keyFound && cfg.adminSubject !== undefined;
      out.log(`${group}: ${configured ? 'configured by environment variables (service account, domain-wide delegation)' : 'not configured (run: gsm setup-admin)'}`);
      out.log(`  GSM_SERVICE_ACCOUNT_KEY_FILE: ${cfg.serviceAccountKeyFile ? (keyFound ? 'set, file found' : 'set, file NOT found') : 'not set'}`);
      out.log(`  GSM_ADMIN_SUBJECT: ${cfg.adminSubject ? 'set' : 'not set'}`);
      out.log(`  scopes: ${ADMIN_SCOPES.length} default (gsm setup-admin stores a longer list)`);
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
    out.log(`  ${postureLine(scopes, env)}`);
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
  if (group === 'apikey') {
    out.log(`apikey has no login. The saved key is ${apiKeyFileFor(cfg)}: delete that file to remove it.`);
    return 0;
  }
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
  out.log(`Next: gsm login ${OAUTH_GROUPS.join(' | ')}`);
  return 0;
}
