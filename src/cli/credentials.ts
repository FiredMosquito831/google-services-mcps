import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureTokenDir } from '../core/acl.js';
import {
  accountNames,
  accountTokenFile,
  defaultAccount,
  listAccounts,
  removeAccount,
  setDefaultAccount,
} from '../core/accounts.js';
import { ADMIN_SCOPES, adminScopeFileFor, readAdminScopeFile, type AuthKind } from '../core/auth.js';
import { checkGrant, checkKeyRestrictions, revokeGrant, type GrantState } from '../core/grant-check.js';
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

/** Days since the API key was saved (the savedAt field), or undefined for a file saved before the field existed. */
export function apiKeyAgeDays(file: string, now: number = Date.now()): number | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { savedAt?: unknown };
    if (typeof parsed.savedAt !== 'string') return undefined;
    const saved = Date.parse(parsed.savedAt);
    return Number.isFinite(saved) ? Math.floor((now - saved) / 86_400_000) : undefined;
  } catch {
    return undefined;
  }
}

export interface StoredToken {
  /** The account the login belongs to, recorded at login from Google's token info. */
  account?: string;
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
    `OAuth client file: ${existsSync(cfg.clientSecretFile) ? cfg.clientSecretFile : 'missing (run: node gsm.mjs setup-client <client_secret.json>)'}`,
  );

  for (const group of ALL_GROUPS) {
    if (group === 'apikey') {
      const file = apiKeyFileFor(cfg);
      const state = apiKeyState(file);
      if (state === 'saved') {
        const age = apiKeyAgeDays(file);
        out.log(`apikey: API key saved in ${file} (the value is not shown)${age === undefined ? '' : `, saved ${age} day(s) ago`}`);
        if (age !== undefined && age > 90) out.log('  The key is over 90 days old. Replace it (node gsm.mjs setup-apikey --force) and keep it restricted.');
      }
      else if (state === 'missing') out.log('apikey: not set (run: node gsm.mjs setup-apikey)');
      else out.log(`apikey: ${file} is unreadable or holds no key (run: node gsm.mjs setup-apikey --force)`);
      continue;
    }

    if (group === 'workspace-admin') {
      const stored = readAdminScopeFile(cfg);
      if (stored) {
        const keyFound = existsSync(stored.keyFile);
        out.log(`${group}: set up with node gsm.mjs setup-admin (service account, domain-wide delegation)`);
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
      out.log(`${group}: ${configured ? 'configured by environment variables (service account, domain-wide delegation)' : 'not configured (run: node gsm.mjs setup-admin)'}`);
      out.log(`  GSM_SERVICE_ACCOUNT_KEY_FILE: ${cfg.serviceAccountKeyFile ? (keyFound ? 'set, file found' : 'set, file NOT found') : 'not set'}`);
      out.log(`  GSM_ADMIN_SUBJECT: ${cfg.adminSubject ? 'set' : 'not set'}`);
      out.log(`  scopes: ${ADMIN_SCOPES.length} default (node gsm.mjs setup-admin stores a longer list)`);
      continue;
    }

    const accounts = listAccounts(group, cfg);
    if (accounts.length === 0) {
      out.log(`${group}: not logged in (run: node gsm.mjs login ${group})`);
      continue;
    }
    out.log(`${group}: ${accounts.length} account(s) signed in`);
    for (const account of accounts) {
      const file = join(cfg.tokenDir, account.file);
      const { token, error } = readStoredToken(file);
      if (error || !token) {
        out.log(`  ${account.email}: token file unreadable${error ? ` (${error})` : ''}. Log it out and sign in again.`);
        continue;
      }
      const scopes = (token.scope ?? '').split(' ').filter(Boolean);
      out.log(`  ${account.email}${account.default ? ' (default)' : ''}: logged in`);
      out.log(`    token file: ${file}`);
      out.log(`    expires: ${formatExpiry(token.expiry_date)}`);
      out.log(`    refresh token: ${token.refresh_token ? 'yes' : 'no'}`);
      out.log(`    scopes (${scopes.length}):`);
      for (const scope of scopes) out.log(`      ${scope}`);
      out.log(`    ${postureLine(scopes, env)}`);
    }
  }
  return 0;
}

const CHECK_LABEL: Record<GrantState, string> = {
  'not-logged-in': 'not logged in',
  valid: 'valid',
  expired: 'EXPIRED',
  revoked: 'REVOKED',
  unreachable: 'could not be checked',
};

/**
 * `gsm status --check`: asks Google whether each stored login still works, what it grants, and whether the saved API
 * key is restricted. It is the only status that makes network calls. Never prints a token or the key. Exits 1 when a
 * check needs attention.
 */
export async function runStatusCheck(out: Output, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const cfg = loadConfig(env);
  let problems = 0;
  for (const group of OAUTH_GROUPS) {
    const accounts = listAccounts(group, cfg);
    if (accounts.length === 0) {
      const result = await checkGrant(group as AuthKind, cfg);
      problems += 1;
      out.log(`${group}: ${CHECK_LABEL[result.state]}. ${result.detail}`);
      continue;
    }
    // Every signed-in account is checked, so each one's grant and scopes are seen.
    for (const account of accounts) {
      const result = await checkGrant(group as AuthKind, cfg, {}, account.email);
      if (result.state !== 'valid') problems += 1;
      out.log(`${group} ${account.email}${account.default ? ' (default)' : ''}: ${CHECK_LABEL[result.state]}. ${result.detail}`);
      if (result.state === 'valid') {
        const minutes = result.expiresInSeconds === undefined ? 'unknown' : `${Math.round(result.expiresInSeconds / 60)} min`;
        out.log(`  access token expires in: ${minutes}`);
        out.log(`  granted scopes (${result.scopes.length}):`);
        for (const scope of result.scopes) out.log(`    ${scope}`);
      }
    }
  }

  if (cfg.apiKey) {
    const age = apiKeyAgeDays(apiKeyFileFor(cfg));
    try {
      const key = await checkKeyRestrictions(cfg.apiKey, cfg);
      if (!key.restricted) problems += 1;
      out.log(`apikey: ${key.restricted ? 'ok' : 'WARNING'}. ${key.detail}`);
    } catch (err) {
      out.log(`apikey: the restrictions could not be read (${(err as Error).message.split(cfg.apiKey).join('[redacted]').split('\n')[0]})`);
    }
    if (age !== undefined && age > 90) {
      problems += 1;
      out.log(`apikey: the key is ${age} days old. Replace it with setup-apikey --force.`);
    }
  } else {
    out.log('apikey: not set, nothing to check');
  }

  out.log(problems === 0 ? 'All stored logins and keys check out.' : `${problems} check(s) need attention. See the lines above.`);
  return problems === 0 ? 0 : 1;
}

/**
 * Removes one account of a group: the named one, else the default. Unless localOnly is set, that account's grant is
 * revoked at Google first, so its refresh token stops working everywhere, not just on this machine.
 */
export async function runLogout(
  group: CliGroup,
  out: Output,
  options: { localOnly?: boolean; account?: string } = {},
): Promise<number> {
  if (group === 'workspace-admin') {
    out.log('workspace-admin has no stored login (it uses GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT). Nothing to remove.');
    return 0;
  }
  const cfg = loadConfig();
  if (group === 'apikey') {
    out.log(`apikey has no login. The saved key is ${apiKeyFileFor(cfg)}: delete that file to remove it.`);
    return 0;
  }
  const email = options.account ?? defaultAccount(group, cfg);
  if (email === undefined) {
    out.log(`${group}: not logged in${accountNames(group, cfg) === 'none' ? '' : `; ${accountNames(group, cfg)} are signed in, so name one with --account`}`);
    return 0;
  }
  const file = accountTokenFile(group, email, cfg);
  if (!file) {
    out.log(`${group}: no signed-in account "${email}". Signed in: ${accountNames(group, cfg)}`);
    return 0;
  }
  if (!options.localOnly) {
    const revoke = await revokeGrant(group as AuthKind, cfg, {}, email);
    if (revoke) out.log(`${group} ${email}: ${revoke.detail}`);
  }
  removeAccount(group, email, cfg);
  out.log(`${group} ${email}: removed from this machine (${file})`);
  out.log(`Signed in for ${group}: ${accountNames(group, cfg)}`);
  if (options.localOnly) {
    out.log('--local-only: the grant was not revoked at Google. To revoke it, use https://myaccount.google.com/permissions');
  }
  return 0;
}

/** Lists the signed-in accounts of every Google group, the default one marked. */
export function runAccounts(out: Output, group: string | undefined, env: NodeJS.ProcessEnv = process.env): number {
  const cfg = loadConfig(env);
  const groups = group === undefined ? (OAUTH_GROUPS as readonly string[]) : [group];
  for (const name of groups) {
    const accounts = listAccounts(name, cfg);
    if (accounts.length === 0) {
      out.log(`${name}: no account signed in (run: node gsm.mjs login ${name})`);
      continue;
    }
    out.log(`${name}:`);
    for (const account of accounts) {
      out.log(`  ${account.email}${account.default ? '  (default)' : ''}  ${account.scopes.length} scope(s)${account.addedAt ? `  signed in ${account.addedAt.slice(0, 10)}` : ''}`);
    }
  }
  return 0;
}

/** Makes one signed-in account the default of its group. Tools use the default when a call names no account. */
export function runSetDefaultAccount(group: string, email: string, out: Output, env: NodeJS.ProcessEnv = process.env): number {
  setDefaultAccount(group, email, loadConfig(env));
  out.log(`The default account for ${group} is now ${email}.`);
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

  ensureTokenDir(cfg.tokenDir);
  const backup = existsSync(dest) ? backupFile(dest) : undefined;
  writeAtomic(dest, text, 0o600);
  out.log(`OAuth client saved: ${dest} (mode 0600). The client secret was not printed.`);
  if (backup) out.log(`backup: ${backup}`);
  out.log(`Next: node gsm.mjs login ${OAUTH_GROUPS.join(' | ')}`);
  return 0;
}
