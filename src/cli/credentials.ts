import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureTokenDir } from '../core/acl.js';
import {
  accountNames,
  accountTokenFile,
  defaultAccount,
  listAccounts,
  otherGroupsWithAccount,
  removeAccount,
  setDefaultAccount,
} from '../core/accounts.js';
import {
  ADMIN_SCOPES,
  SERVICE_ACCOUNT_SCOPES,
  adminScopeFileFor,
  adcSourceFor,
  readAdminScopeFile,
  readServiceAccountFile,
  serviceAccountFileFor,
  serviceAccountSource,
  type AuthKind,
} from '../core/auth.js';
import { checkGrant, checkKeyRestrictions, checkServiceAccountGrant, revokeGrant, type GrantDeps, type GrantState } from '../core/grant-check.js';
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import { ALL_GROUPS, OAUTH_GROUPS, type CliGroup } from './args.js';
import { backupFile } from './fsutil.js';
import { readSecretText, secretFileExists, secretNameOf, storeFor, writeSecretText } from '../core/secret-files.js';
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

/** Whether a key is saved, in the store or in the plain file. The key value is read only to check it is a non-empty string, and is never returned. */
export function apiKeyState(cfg: Pick<RuntimeConfig, 'tokenDir'>): ApiKeyState {
  const file = apiKeyFileFor(cfg);
  if (!secretFileExists(cfg, file)) return 'missing';
  try {
    const parsed: unknown = JSON.parse(readSecretText(cfg, file) ?? '');
    const saved = typeof parsed === 'object' && parsed !== null ? (parsed as { apiKey?: unknown }).apiKey : undefined;
    return typeof saved === 'string' && saved.trim() !== '' ? 'saved' : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** Days since the API key was saved (the savedAt field), or undefined for a file saved before the field existed. */
export function apiKeyAgeDays(cfg: Pick<RuntimeConfig, 'tokenDir'>, now: number = Date.now()): number | undefined {
  try {
    const parsed = JSON.parse(readSecretText(cfg, apiKeyFileFor(cfg)) ?? '') as { savedAt?: unknown };
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
export function readStoredToken(file: string, cfg: Pick<RuntimeConfig, 'tokenDir'>): { token?: StoredToken; error?: string } {
  const text = readSecretText(cfg, file);
  if (text === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
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
  const store = storeFor(cfg.tokenDir);
  out.log(
    `secret store: ${store === 'file' ? 'plain files (mode 0600) in the token directory' : `${store} (the OS store; node gsm.mjs protect --off returns to plain files)`}`,
  );
  out.log(
    `OAuth client file: ${secretFileExists(cfg, cfg.clientSecretFile) ? cfg.clientSecretFile : 'missing (run: node gsm.mjs setup-client <client_secret.json>)'}`,
  );

  for (const group of ALL_GROUPS) {
    if (group === 'apikey') {
      const file = apiKeyFileFor(cfg);
      const state = apiKeyState(cfg);
      if (state === 'saved') {
        const age = apiKeyAgeDays(cfg);
        out.log(`apikey: API key saved in ${file} (the value is not shown)${age === undefined ? '' : `, saved ${age} day(s) ago`}`);
        if (age !== undefined && age > 90) out.log('  The key is over 90 days old. Replace it (node gsm.mjs setup-apikey --force) and keep it restricted.');
      }
      else if (state === 'missing') out.log('apikey: not set (run: node gsm.mjs setup-apikey)');
      else out.log(`apikey: ${file} is unreadable or holds no key (run: node gsm.mjs setup-apikey --force)`);
      continue;
    }

    if (group === 'service-account') {
      const stored = readServiceAccountFile(cfg);
      const source = serviceAccountSource(cfg);
      if (!source) {
        out.log(`${group}: not set up (run: node gsm.mjs setup-service-account --key-file <service account JSON>). Used by gplay and gmerchant.`);
        continue;
      }
      out.log(`${group}: set up (${source.via === 'setup' ? 'setup-service-account' : 'GOOGLE_APPLICATION_CREDENTIALS'}). Used by gplay and gmerchant.`);
      if (stored) {
        out.log(`  setup file: ${serviceAccountFileFor(cfg)}`);
        out.log(`  account: ${stored.clientEmail ?? '(not recorded)'}`);
        out.log(`  key file: ${stored.keyFile}${existsSync(stored.keyFile) ? '' : ' (NOT found)'}`);
      } else {
        out.log(`  key file: ${source.keyFile}`);
      }
      out.log(`  scopes: ${SERVICE_ACCOUNT_SCOPES.join(', ')}`);
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
      const adc = adcSourceFor(group, cfg);
      if (adc) {
        out.log(`${group}: signed in with Application Default Credentials (scopes: ${adc.scopes.length}). Check it with: node gsm.mjs status --check`);
        continue;
      }
      out.log(`${group}: not logged in (run: node gsm.mjs login ${group}, or sign in with ADC: gcloud auth application-default login)`);
      continue;
    }
    out.log(`${group}: ${accounts.length} account(s) signed in`);
    for (const account of accounts) {
      const file = join(cfg.tokenDir, account.file);
      const { token, error } = readStoredToken(file, cfg);
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
      // No account of its own: the group may be on the ADC login, which the check reads too.
      const result = await checkGrant(group as AuthKind, cfg);
      if (result.state !== 'valid') problems += 1;
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
        out.log(`  access token expires in: ${minutes} (it is renewed on its own; this is not how long the login lasts)`);
        out.log(`  granted scopes (${result.scopes.length}):`);
        for (const scope of result.scopes) out.log(`    ${scope}`);
      }
    }
  }

  if (cfg.apiKey) {
    const age = apiKeyAgeDays(cfg);
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

  // The service-account group: the key is checked with Google's token endpoint. Play and Merchant access is not checked here.
  if (serviceAccountSource(cfg)) {
    const result = await checkServiceAccountGrant(cfg);
    if (result.state !== 'valid') problems += 1;
    out.log(`service-account: ${CHECK_LABEL[result.state]}. ${result.detail}`);
  } else {
    out.log('service-account: not set up, nothing to check');
  }

  out.log(problems === 0 ? 'All stored logins and keys check out.' : `${problems} check(s) need attention. See the lines above.`);
  return problems === 0 ? 0 : 1;
}

/**
 * Removes one account of a group: the named one, else the default. Unless localOnly is set, that account's grant is
 * revoked at Google first, so its refresh token stops working everywhere, not just on this machine. A revoke ends the
 * account's sign-in for every group of the OAuth client, so when another group here has the same account the revoke is
 * skipped and only the local token is removed, unless revokeAll says to revoke anyway. `deps` is for the tests.
 */
export async function runLogout(
  group: CliGroup,
  out: Output,
  options: { localOnly?: boolean; account?: string; revokeAll?: boolean; deps?: GrantDeps; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  if (group === 'workspace-admin') {
    out.log('workspace-admin has no stored login (it uses GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT). Nothing to remove.');
    return 0;
  }
  if (group === 'service-account') {
    out.log(
      'service-account has no login to revoke. To forget the key setup, run: node gsm.mjs setup-service-account --remove. The key file is not deleted: to stop it working, delete the key in Google Cloud console.',
    );
    return 0;
  }
  const cfg = loadConfig(options.env);
  if (group === 'apikey') {
    out.log(`apikey has no login. The saved key is ${apiKeyFileFor(cfg)}: delete that file to remove it.`);
    return 0;
  }
  const email = options.account ?? defaultAccount(group, cfg);
  if (email === undefined) {
    // The ADC login is kept by gcloud, not by the suite, so it is not removed here. The message says how to remove it.
    if (options.account === undefined && adcSourceFor(group as AuthKind, cfg)) {
      out.log(`${group}: signed in with Application Default Credentials. gsm does not remove that login. Remove it with: gcloud auth application-default revoke`);
      return 0;
    }
    out.log(`${group}: not logged in${accountNames(group, cfg) === 'none' ? '' : `; ${accountNames(group, cfg)} are signed in, so name one with --account`}`);
    return 0;
  }
  const file = accountTokenFile(group, email, cfg);
  if (!file) {
    out.log(`${group}: no signed-in account "${email}". Signed in: ${accountNames(group, cfg)}`);
    return 0;
  }
  if (!options.localOnly) {
    // accounts.json and file names only: no token is read to find the other groups.
    const shared = otherGroupsWithAccount(email, group, cfg);
    if (shared.length > 0 && !options.revokeAll) {
      out.log(
        `${group} ${email}: not revoked at Google. ${email} is also signed in here for ${shared.join(', ')}, and Google's revocation ends every grant the account gave this OAuth client's project, so those logins would stop working too.`,
      );
      out.log(`To revoke it everywhere on purpose: node gsm.mjs logout ${group} --account ${email} --revoke-all, or use https://myaccount.google.com/permissions`);
    } else {
      const revoke = await revokeGrant(group as AuthKind, cfg, options.deps ?? {}, email);
      if (revoke) out.log(`${group} ${email}: ${revoke.detail}`);
      if (shared.length > 0 && revoke?.revoked) {
        out.log(`--revoke-all: the logins of ${email} for ${shared.join(', ')} no longer work. Their local tokens are kept: log out there too, or sign in again.`);
      }
    }
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
/**
 * Keeps the client file that is being replaced. In file mode it is copied next to the old one, as before. With an OS
 * store the old text is stored under a backup name, so the secret never becomes a plain file. Returns where the backup is.
 */
function backupCurrentClient(cfg: RuntimeConfig, dest: string): string {
  if (storeFor(cfg.tokenDir) === 'file') return backupFile(dest);
  const old = readSecretText(cfg, dest);
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15);
  const backupFileName = join(cfg.tokenDir, `client_secret.bak-${stamp}.json`);
  if (old !== undefined) writeSecretText(cfg, backupFileName, old);
  return `the ${storeFor(cfg.tokenDir)} store as ${secretNameOf(backupFileName)}`;
}

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
  const exists = secretFileExists(cfg, dest);
  if (exists && !force) {
    throw new UsageError(`${dest} already exists. Re-run with --force to replace it (the current file is backed up first).`);
  }

  ensureTokenDir(cfg.tokenDir);
  const backup = exists ? backupCurrentClient(cfg, dest) : undefined;
  writeSecretText(cfg, dest, text);
  const where = storeFor(cfg.tokenDir) === 'file' ? dest : `the ${storeFor(cfg.tokenDir)} store`;
  out.log(`OAuth client saved: ${where} (mode 0600 for files). The client secret was not printed.`);
  if (backup) out.log(`backup: ${backup}`);
  out.log(`Next: node gsm.mjs login ${OAUTH_GROUPS.join(' | ')}`);
  return 0;
}
