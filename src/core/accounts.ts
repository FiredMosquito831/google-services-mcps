import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { readSecretText, removeSecretFile, writeSecretText } from './secret-files.js';
import { join } from 'node:path';
import type { Credentials } from 'google-auth-library';
import { ensureTokenDir } from './acl.js';
import type { RuntimeConfig } from './config.js';

/**
 * The Google accounts signed in for each group, in one registry file: accounts.json in the token folder. A group has
 * several accounts, one of them the default. Each account has its own token file, named after its email. A single
 * token file from before accounts existed (<group>.token.json) is read as that group's default account.
 */

/** The key of a login whose Google account could not be named (no email scope was granted). */
export const UNKNOWN_ACCOUNT = 'unknown';

export interface AccountEntry {
  email: string;
  file: string;
  scopes: string[];
  addedAt: string;
  default: boolean;
}

interface AccountRecord {
  file: string;
  scopes: string[];
  addedAt: string;
}

interface GroupRecord {
  default?: string;
  accounts: Record<string, AccountRecord>;
}

interface Registry {
  groups: Record<string, GroupRecord>;
}

const REGISTRY_FILE = 'accounts.json';

/** A file-name part for an email address: lower case, and only characters that are safe in every file system. */
export function slugOf(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 120);
}

function registryPath(cfg: RuntimeConfig): string {
  return join(cfg.tokenDir, REGISTRY_FILE);
}

function readRegistry(cfg: RuntimeConfig): Registry {
  try {
    const raw = JSON.parse(readFileSync(registryPath(cfg), 'utf8')) as Partial<Registry> | null;
    if (raw && typeof raw === 'object' && raw.groups && typeof raw.groups === 'object') return { groups: raw.groups };
  } catch {
    // no registry yet, or it is unreadable: start from what the token files say
  }
  return { groups: {} };
}

function writeRegistry(cfg: RuntimeConfig, registry: Registry): void {
  ensureTokenDir(cfg.tokenDir);
  writeFileSync(registryPath(cfg), JSON.stringify(registry, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(registryPath(cfg), 0o600);
  } catch {
    // Windows ignores POSIX modes; the folder's access list is the protection there.
  }
}

function readTokenFile(cfg: RuntimeConfig, path: string): Credentials | null {
  const text = readSecretText(cfg, path);
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as Credentials;
  } catch {
    return null;
  }
}

/** The record of a group. A group with no registry entry but a token file from before accounts is read as that file. */
function recordOf(registry: Registry, group: string, cfg: RuntimeConfig): GroupRecord {
  const known = registry.groups[group];
  if (known) return known;
  const legacyFile = `${group}.token.json`;
  const legacy = readTokenFile(cfg, join(cfg.tokenDir, legacyFile));
  if (!legacy?.refresh_token && !legacy?.access_token) return { accounts: {} };
  const email = (legacy as { account?: string }).account ?? UNKNOWN_ACCOUNT;
  return {
    default: email,
    accounts: {
      [email]: {
        file: legacyFile,
        scopes: (legacy.scope ?? '').split(' ').filter(Boolean),
        addedAt: '',
      },
    },
  };
}

/** The accounts of a group, the default one marked. Sorted by email. */
export function listAccounts(group: string, cfg: RuntimeConfig): AccountEntry[] {
  const record = recordOf(readRegistry(cfg), group, cfg);
  return Object.entries(record.accounts)
    .map(([email, entry]) => ({
      email,
      file: entry.file,
      scopes: entry.scopes,
      addedAt: entry.addedAt,
      default: defaultOf(record) === email,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** The default account's email. With exactly one account, that account is the default. Undefined otherwise. */
function defaultOf(record: GroupRecord): string | undefined {
  if (record.default && record.accounts[record.default]) return record.default;
  const emails = Object.keys(record.accounts);
  return emails.length === 1 ? emails[0] : undefined;
}

export function defaultAccount(group: string, cfg: RuntimeConfig): string | undefined {
  return defaultOf(recordOf(readRegistry(cfg), group, cfg));
}

/** The token file of one account of a group, or undefined when that account is not signed in. */
export function accountTokenFile(group: string, email: string, cfg: RuntimeConfig): string | undefined {
  const entry = recordOf(readRegistry(cfg), group, cfg).accounts[email];
  return entry ? join(cfg.tokenDir, entry.file) : undefined;
}

/** Stores one account's tokens, and makes it the default when the group has none. Returns the token file's path. */
export function saveAccount(group: string, email: string, tokens: Credentials & { account?: string }, cfg: RuntimeConfig): string {
  const registry = readRegistry(cfg);
  const record = recordOf(registry, group, cfg);
  const existing = record.accounts[email];
  const previous = Object.keys(record.accounts);
  const file = existing?.file ?? `${group}.${slugOf(email)}.token.json`;
  ensureTokenDir(cfg.tokenDir);
  writeSecretText(cfg, join(cfg.tokenDir, file), JSON.stringify(tokens, null, 2) + '\n');
  record.accounts[email] = {
    file,
    scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
    addedAt: existing?.addedAt || new Date().toISOString(),
  };
  // A group keeps its default. The first account of a group becomes the default; a single account from before the
  // default was stored keeps being the default when a second one is added.
  if (record.default === undefined || !record.accounts[record.default]) {
    record.default = previous.length === 0 ? email : previous.length === 1 ? previous[0] : (record.default ?? email);
  }
  registry.groups[group] = record;
  writeRegistry(cfg, registry);
  return join(cfg.tokenDir, file);
}

/** Makes one signed-in account the default of its group. Throws when the account is not signed in. */
export function setDefaultAccount(group: string, email: string, cfg: RuntimeConfig): void {
  const registry = readRegistry(cfg);
  const record = recordOf(registry, group, cfg);
  if (!record.accounts[email]) throw new Error(`no signed-in account "${email}" for ${group}`);
  record.default = email;
  registry.groups[group] = record;
  writeRegistry(cfg, registry);
}

/** Removes one account: its token file, and its entry. When it was the default, another account becomes the default. */
export function removeAccount(group: string, email: string, cfg: RuntimeConfig): boolean {
  const registry = readRegistry(cfg);
  const record = recordOf(registry, group, cfg);
  const entry = record.accounts[email];
  if (!entry) return false;
  removeSecretFile(cfg, join(cfg.tokenDir, entry.file));
  delete record.accounts[email];
  if (record.default === email) {
    const remaining = Object.keys(record.accounts);
    record.default = remaining.length === 1 ? remaining[0] : undefined;
  }
  registry.groups[group] = record;
  writeRegistry(cfg, registry);
  return true;
}

/** The token file of a group's default account. Undefined when there is no default. */
export function defaultAccountTokenFile(group: string, cfg: RuntimeConfig): string | undefined {
  const email = defaultAccount(group, cfg);
  return email === undefined ? undefined : accountTokenFile(group, email, cfg);
}

/** The emails of the accounts signed in for a group, for messages. */
export function accountNames(group: string, cfg: RuntimeConfig): string {
  const names = listAccounts(group, cfg).map((account) => account.email);
  return names.length > 0 ? names.join(', ') : 'none';
}
