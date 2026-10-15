import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OAuth2Client, GoogleAuth, JWT, type Credentials } from 'google-auth-library';
import type { RuntimeConfig } from './config.js';

/**
 * One auth group per token file. Each group maps to one or more MCP servers
 * (see config/servers.json). Tokens are stored per group, so a user can log in
 * to Search Console without granting Cloud access, and a logout removes only
 * one group's credentials. Scopes are not defined here: they come from the
 * server map, through the registry.
 */
export type AuthKind = 'cloud' | 'workspace-user' | 'workspace-admin' | 'searchconsole' | 'business';

/** Scope for Application Default Credentials, used by cloud servers when no OAuth token is stored. */
export const CLOUD_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/** Domain-wide delegation scopes for the Admin SDK Directory API. The admin login uses a service account and needs no login. */
export const ADMIN_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.orgunit',
];

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
 * Builds an authenticated client for a server group. OAuth user tokens refresh
 * automatically; the admin group uses domain-wide delegation with a service
 * account. Throws AuthRequiredError rather than prompting, because MCP servers
 * run without a terminal. Logging in happens in the CLI (gsm login).
 */
export async function getAuthClient(kind: AuthKind, cfg: RuntimeConfig): Promise<OAuth2Client | JWT> {
  if (kind === 'workspace-admin') {
    if (!cfg.serviceAccountKeyFile || !cfg.adminSubject) {
      throw new Error(
        'Admin tools need GSM_SERVICE_ACCOUNT_KEY_FILE and GSM_ADMIN_SUBJECT (a super admin email for domain-wide delegation).',
      );
    }
    return new JWT({
      keyFile: cfg.serviceAccountKeyFile,
      scopes: ADMIN_SCOPES,
      subject: cfg.adminSubject,
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

export interface TokenStatus {
  kind: AuthKind;
  loggedIn: boolean;
  tokenFile: string;
  scopes?: string[];
  expiresAt?: string;
}

export function tokenStatus(kind: AuthKind, cfg: RuntimeConfig): TokenStatus {
  const tokens = kind === 'workspace-admin' ? null : loadUserTokens(kind, cfg);
  return {
    kind,
    loggedIn: kind === 'workspace-admin' ? Boolean(cfg.serviceAccountKeyFile && cfg.adminSubject) : Boolean(tokens),
    tokenFile: tokenPath(kind, cfg),
    scopes: kind === 'workspace-admin' ? ADMIN_SCOPES : tokens?.scope?.split(' '),
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
