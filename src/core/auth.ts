import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OAuth2Client, GoogleAuth, JWT, type Credentials } from 'google-auth-library';
import type { RuntimeConfig } from './config.js';

/**
 * One auth group per token file. Each group maps to one or more MCP servers
 * (see config/servers.json). Tokens are stored per group, so a user can log in
 * to Search Console without granting Cloud access, and a logout removes only
 * one group's credentials. Which scopes a group asks for is chosen at login
 * (see core/scopes.ts); the server map does not hold a scope list any more.
 *
 * The apikey group is not an AuthKind: it has no token file. Its client is built
 * by the discovery code (see core/discovery/apikey-client.ts).
 */
export type AuthKind = 'cloud' | 'workspace-user' | 'workspace-admin' | 'searchconsole' | 'business' | 'developer';

/** Scope for Application Default Credentials, used by cloud servers when no OAuth token is stored. */
export const CLOUD_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/** Domain-wide delegation scopes for the Admin SDK Directory API. The admin login uses a service account and needs no login. */
export const ADMIN_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.orgunit',
];

/**
 * Full scope URLs from short names. "gmail.readonly" becomes
 * https://www.googleapis.com/auth/gmail.readonly. A name that already starts
 * with https:// is kept as it is (for example https://mail.google.com/).
 */
export function googleScopes(...names: string[]): string[] {
  return names.map((name) => (name.startsWith('https://') ? name : `https://www.googleapis.com/auth/${name}`));
}

export class AuthRequiredError extends Error {
  constructor(kind: AuthKind) {
    super(
      `Not logged in for "${kind}". Run: node <plugin>/bin/gsm.mjs login ${kind} (after setting up the OAuth desktop client with setup-client).`,
    );
    this.name = 'AuthRequiredError';
  }
}

function tokenPath(kind: AuthKind, cfg: RuntimeConfig): string {
  return join(cfg.tokenDir, `${kind}.token.json`);
}

function writeSecureJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; the directory ACL is the real protection there.
  }
}

interface ClientSecretFile {
  installed?: { client_id: string; client_secret: string; redirect_uris?: string[] };
  web?: { client_id: string; client_secret: string };
}

export function readClientSecret(cfg: RuntimeConfig): { clientId: string; clientSecret: string } {
  if (!existsSync(cfg.clientSecretFile)) {
    throw new Error(
      `OAuth client file not found: ${cfg.clientSecretFile}. Create a "Desktop app" OAuth client in Google Cloud console and run: gsm setup-client <file>.`,
    );
  }
  const raw = JSON.parse(readFileSync(cfg.clientSecretFile, 'utf8')) as ClientSecretFile;
  const block = raw.installed ?? raw.web;
  if (!block) throw new Error(`Unrecognized client secret file: ${cfg.clientSecretFile}`);
  return { clientId: block.client_id, clientSecret: block.client_secret };
}

/** Returns the stored OAuth user credentials for a group, or null when not logged in. */
export function loadUserTokens(kind: AuthKind, cfg: RuntimeConfig): Credentials | null {
  const path = tokenPath(kind, cfg);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Credentials;
}

/**
 * What `gsm setup-admin` stores for the admin group, in <tokenDir>/workspace-admin.scopes.json.
 * The key file is referenced by path and never copied into the token directory.
 */
export interface AdminScopeRecord {
  subject: string;
  scopes: string[];
  profile: string;
  keyFile: string;
}

export function adminScopeFileFor(cfg: RuntimeConfig): string {
  return join(cfg.tokenDir, 'workspace-admin.scopes.json');
}

/** Returns the stored admin setup, or null when setup-admin has not run or the file is not valid. */
export function readAdminScopeFile(cfg: RuntimeConfig): AdminScopeRecord | null {
  const file = adminScopeFileFor(cfg);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AdminScopeRecord>;
    if (typeof raw.subject !== 'string' || typeof raw.keyFile !== 'string' || !Array.isArray(raw.scopes)) return null;
    return {
      subject: raw.subject,
      scopes: raw.scopes.filter((s): s is string => typeof s === 'string'),
      profile: typeof raw.profile === 'string' ? raw.profile : 'custom',
      keyFile: raw.keyFile,
    };
  } catch {
    return null;
  }
}

/** Writes the admin setup with mode 0600. Returns the file path. */
export function saveAdminScopeFile(cfg: RuntimeConfig, record: AdminScopeRecord): string {
  const file = adminScopeFileFor(cfg);
  writeSecureJson(file, record);
  return file;
}

/**
 * Builds an authenticated client for a server group. OAuth user tokens refresh
 * automatically; the admin group uses domain-wide delegation with a service
 * account. Throws AuthRequiredError rather than prompting, because MCP servers
 * run without a terminal. Logging in happens in the CLI (gsm login).
 */
export async function getAuthClient(kind: AuthKind, cfg: RuntimeConfig): Promise<OAuth2Client | JWT> {
  if (kind === 'workspace-admin') {
    // A stored setup (gsm setup-admin) wins; the env vars and ADMIN_SCOPES are the fallback.
    const stored = readAdminScopeFile(cfg);
    const keyFile = stored?.keyFile ?? cfg.serviceAccountKeyFile;
    const subject = stored?.subject ?? cfg.adminSubject;
    if (!keyFile || !subject) {
      throw new Error(
        'Admin tools need GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT (a super admin email for domain-wide delegation), or run: gsm setup-admin --subject <email> --key-file <file>.',
      );
    }
    if (!existsSync(keyFile)) throw new Error(`Service account key file not found: ${keyFile}. Run gsm setup-admin again with the right --key-file.`);
    return new JWT({
      keyFile,
      scopes: stored?.scopes ?? ADMIN_SCOPES,
      subject,
    });
  }

  const tokens = loadUserTokens(kind, cfg);
  if (!tokens) throw new AuthRequiredError(kind);

  const { clientId, clientSecret } = readClientSecret(cfg);
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials(tokens);
  // Persist refreshed access tokens so a restart does not force a new login.
  client.on('tokens', (fresh) => {
    const merged = { ...loadUserTokens(kind, cfg), ...fresh };
    writeSecureJson(tokenPath(kind, cfg), merged);
  });
  return client;
}

/** Cloud servers fall back to Application Default Credentials when no OAuth token is stored. */
export async function getCloudAdcClient(): Promise<OAuth2Client | JWT> {
  const auth = new GoogleAuth({ scopes: CLOUD_SCOPES });
  return (await auth.getClient()) as OAuth2Client | JWT;
}

/**
 * The scopes a group actually holds, for runtime tool gating. OAuth groups read
 * the "scope" field of the stored token. Returns null when the grant is unknown:
 * not logged in, or a token that does not record its scopes. The admin group
 * reports its stored setup, or ADMIN_SCOPES when setup-admin has not run. The apikey
 * group has no OAuth grant, so it is always null (unknown), as a group that is not logged in is.
 */
export function grantedScopes(kind: AuthKind | 'apikey', cfg: RuntimeConfig): string[] | null {
  if (kind === 'apikey') return null;
  if (kind === 'workspace-admin') return readAdminScopeFile(cfg)?.scopes ?? [...ADMIN_SCOPES];
  let tokens: Credentials | null;
  try {
    tokens = loadUserTokens(kind, cfg);
  } catch {
    return null;
  }
  if (!tokens?.scope) return null;
  return tokens.scope.split(' ').filter(Boolean);
}

export interface TokenStatus {
  kind: AuthKind;
  loggedIn: boolean;
  tokenFile: string;
  scopes?: string[];
  expiresAt?: string;
}

export function tokenStatus(kind: AuthKind, cfg: RuntimeConfig): TokenStatus {
  if (kind === 'workspace-admin') {
    const stored = readAdminScopeFile(cfg);
    return {
      kind,
      loggedIn: Boolean((stored?.keyFile ?? cfg.serviceAccountKeyFile) && (stored?.subject ?? cfg.adminSubject)),
      tokenFile: adminScopeFileFor(cfg),
      scopes: stored?.scopes ?? ADMIN_SCOPES,
    };
  }
  const tokens = loadUserTokens(kind, cfg);
  return {
    kind,
    loggedIn: Boolean(tokens),
    tokenFile: tokenPath(kind, cfg),
    scopes: tokens?.scope?.split(' '),
    expiresAt: tokens?.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
  };
}

export function removeUserTokens(kind: AuthKind, cfg: RuntimeConfig): boolean {
  if (kind === 'workspace-admin') return false;
  const path = tokenPath(kind, cfg);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
