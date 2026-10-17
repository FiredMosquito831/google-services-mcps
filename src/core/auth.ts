import { existsSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OAuth2Client, GoogleAuth, JWT, type Credentials } from 'google-auth-library';
import { ensureTokenDir } from './acl.js';
import { accountNames, accountTokenFile, defaultAccount, removeAccount } from './accounts.js';
import { requestedAccount } from './account-context.js';
import type { RuntimeConfig } from './config.js';
import { invocation } from './invocation.js';
import { isIdempotentMethod, requestWithRetry, type HttpResult } from './http.js';

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
  /** `cause` is the underlying failure, such as google-auth-library's Application Default Credentials error. It is shown only in verbose mode. */
  constructor(kind: AuthKind, options?: { cause?: unknown }) {
    super(
      `Not logged in for "${kind}". Run: ${invocation()} login ${kind} (after setting up the OAuth desktop client with setup-client).`,
      options,
    );
    this.name = 'AuthRequiredError';
  }
}

/**
 * The stored login was refused: Google rejected the refresh token, or the access token it was asked for. The message
 * says how to log in again, so the model can tell the person what to do.
 */
export class GrantExpiredError extends Error {
  constructor(kind: AuthKind, options?: { cause?: unknown }) {
    super(
      `The login for "${kind}" has expired or was revoked. Log in again: ${invocation()} login ${kind}. An app left in Testing loses its refresh tokens after 7 days.`,
      options,
    );
    this.name = 'GrantExpiredError';
  }
}

/** google-auth-library reports a refused refresh token as invalid_grant, in the message or in the response body. */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: unknown; response?: { data?: unknown } } | null;
  const message = typeof e?.message === 'string' ? e.message : '';
  const data = e?.response?.data as { error?: unknown } | undefined;
  return message.includes('invalid_grant') || data?.error === 'invalid_grant';
}

function httpStatus(err: unknown): number {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  return Number(e?.response?.status ?? e?.code ?? e?.status);
}

/**
 * Makes every request of an OAuth, service account or ADC client go through requestWithRetry (core/http.ts). The
 * generated googleapis clients send their requests through the auth client's request method, and so do the curated
 * tools that call it directly, so one wrap here covers them all. A GET, HEAD or OPTIONS request may repeat a 403
 * rate-limit answer; any other method may not. The wrapper calls the class's own request method, so a replaced
 * prototype method is still the one that runs.
 *
 * gaxios, the HTTP layer under these clients, retries 429 and 5xx on its own by default. That would multiply the
 * attempts, so retry is switched off for each request here, and the attempts are counted in one place only.
 */
function withRetry<C extends OAuth2Client | JWT>(client: C, group?: AuthKind): C {
  const target = client as unknown as { request: (opts: { method?: string }) => Promise<HttpResult> };
  target.request = async (opts) => {
    try {
      return await requestWithRetry(
        () => Reflect.apply(Object.getPrototypeOf(client).request, client, [{ ...opts, retry: false }]) as Promise<HttpResult>,
        { idempotent: isIdempotentMethod(String(opts.method ?? 'GET')) },
      );
    } catch (err) {
      // Only a stored login has a grant that can expire. A refused token gets the message that says how to log in again.
      if (group && (isInvalidGrant(err) || httpStatus(err) === 401)) throw new GrantExpiredError(group, { cause: err });
      throw err;
    }
  };
  return client;
}

/** The account named in a call is not signed in for this group. The message lists the accounts that are. */
export class UnknownAccountError extends Error {
  constructor(kind: AuthKind, email: string, signedIn: string) {
    super(`No signed-in account "${email}" for ${kind}. Signed in: ${signedIn}. Use accounts_list to see them, or sign in with auth_login.`);
    this.name = 'UnknownAccountError';
  }
}

/** Several accounts are signed in and none is the default, so a call must name one. */
export class AccountChoiceError extends Error {
  constructor(kind: AuthKind, signedIn: string) {
    super(
      `Several accounts are signed in for ${kind} (${signedIn}), and none is the default. Pass the account argument, or set the default with account_set_default.`,
    );
    this.name = 'AccountChoiceError';
  }
}

/**
 * The token file a call is about: the account the call named, else the default account. Undefined when no account
 * is the default (none is signed in, or several are and none was chosen). Naming an account that is not signed in throws.
 */
function tokenFileOf(kind: AuthKind, cfg: RuntimeConfig, account?: string): string | undefined {
  const wanted = account ?? requestedAccount();
  if (wanted === undefined) {
    const current = defaultAccount(kind, cfg);
    return current === undefined ? undefined : accountTokenFile(kind, current, cfg);
  }
  const file = accountTokenFile(kind, wanted, cfg);
  if (!file) throw new UnknownAccountError(kind, wanted, accountNames(kind, cfg));
  return file;
}

function readTokenFile(path: string): Credentials {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Credentials) : {};
}

function writeSecureJson(path: string, data: unknown): void {
  ensureTokenDir(dirname(path));
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

/**
 * Returns the stored OAuth credentials of one account of a group: the named account, else the requested one (set by
 * the tool call's account argument), else the default. Null when that account is not signed in.
 */
export function loadUserTokens(kind: AuthKind, cfg: RuntimeConfig, account?: string): Credentials | null {
  const path = tokenFileOf(kind, cfg, account);
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Credentials;
}

/**
 * True when a token file holds a refresh or an access token. It does not ask Google whether the login still works:
 * that is checkGrant in grant-check.ts, which only `gsm status --check` and `gsm doctor` run.
 */
export function isLoggedIn(kind: AuthKind, cfg: RuntimeConfig, account?: string): boolean {
  try {
    const tokens = loadUserTokens(kind, cfg, account);
    return Boolean(tokens && (tokens.refresh_token || tokens.access_token));
  } catch {
    return false;
  }
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

export function adminScopeFileFor(cfg: Pick<RuntimeConfig, 'tokenDir'>): string {
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
    return withRetry(
      new JWT({
        keyFile,
        scopes: stored?.scopes ?? ADMIN_SCOPES,
        subject,
      }),
    );
  }

  const path = tokenFileOf(kind, cfg);
  if (!path || !existsSync(path)) {
    const signedIn = accountNames(kind, cfg);
    if (signedIn !== 'none' && !path) throw new AccountChoiceError(kind, signedIn);
    throw new AuthRequiredError(kind);
  }
  // One client per account file, so each account keeps its own refreshed tokens for the life of the process.
  const cached = userClients.get(path);
  if (cached) return cached;

  const { clientId, clientSecret } = readClientSecret(cfg);
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials(readTokenFile(path));
  // Persist refreshed access tokens so a restart does not force a new login.
  client.on('tokens', (fresh) => {
    writeSecureJson(path, { ...readTokenFile(path), ...fresh });
  });
  const wrapped = withRetry(client, kind);
  userClients.set(path, wrapped);
  return wrapped;
}

/** The OAuth clients of the user accounts, by token file. */
const userClients = new Map<string, OAuth2Client | JWT>();

/**
 * Cloud servers fall back to Application Default Credentials when no OAuth token is stored. When there are none
 * either, the failure is reported as gsm's "not logged in" message, with Google's own text kept as the cause.
 */
export async function getCloudAdcClient(): Promise<OAuth2Client | JWT> {
  const auth = new GoogleAuth({ scopes: CLOUD_SCOPES });
  let client: OAuth2Client | JWT;
  try {
    client = (await auth.getClient()) as OAuth2Client | JWT;
  } catch (err) {
    throw new AuthRequiredError('cloud', { cause: err });
  }
  return withRetry(client);
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
    tokenFile: tokenFileOf(kind, cfg) ?? '',
    scopes: tokens?.scope?.split(' '),
    expiresAt: tokens?.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
  };
}

/** Removes one account of a group (the default when none is named). Returns false when no such account is signed in. */
export function removeUserTokens(kind: AuthKind, cfg: RuntimeConfig, account?: string): boolean {
  if (kind === 'workspace-admin') return false;
  const email = account ?? defaultAccount(kind, cfg);
  if (email === undefined) return false;
  userClients.delete(accountTokenFile(kind, email, cfg) ?? '');
  return removeAccount(kind, email, cfg);
}
