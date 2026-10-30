import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OAuth2Client, GoogleAuth, JWT, type Credentials } from 'google-auth-library';
import { ensureTokenDir } from './acl.js';
import { accountNames, accountTokenFile, defaultAccount, removeAccount } from './accounts.js';
import { requestedAccount } from './account-context.js';
import type { RuntimeConfig } from './config.js';
import { invocation } from './invocation.js';
import { isIdempotentMethod, requestWithRetry, type HttpResult } from './http.js';
import { adcFilePath, adcGrantFor, GCLOUD_DEFAULT_SCOPES, readAdcState, type AdcGrant } from './adc.js';
import { forgetCachedSecrets, readSecretText, secretFileExists, writeSecretText } from './secret-files.js';
import { SERVICE_ACCOUNT_KEY_SCOPES, SERVICE_ACCOUNT_SCOPES_BY_SERVER } from './service-account-scopes.js';

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
export type AuthKind = 'cloud' | 'workspace-user' | 'workspace-admin' | 'searchconsole' | 'business' | 'developer' | 'service-account';

/**
 * Scopes of the service-account group (Google Play and Merchant Center). A service account needs no user consent; the
 * person adds the account's email to Play Console, Merchant Center or the product in question. The list is generated
 * (src/core/service-account-scopes.ts, from config/products.json serviceAccountScopes): every scope the methods of the
 * APIs gplay carries declare, and content for Merchant Center. It held only androidpublisher and content before 1.23.1.
 * Since 1.24.4 a server's token asks only for its own product's part of it (serviceAccountScopesFor below).
 */
export const SERVICE_ACCOUNT_SCOPES: string[] = [...SERVICE_ACCOUNT_KEY_SCOPES];

/**
 * The scopes the key asks for on behalf of one server of the group: that server's own product's list (generated, as
 * SERVICE_ACCOUNT_SCOPES is). Merchant Center asks for content only and Google Play for its own list, so a scope Google
 * refuses for one product does not stop the other. Without a server (a command for the whole group), or for a server
 * the generated table does not list, it is the union, as before 1.24.4.
 */
export function serviceAccountScopesFor(server: string | undefined): string[] {
  const own = server === undefined ? undefined : SERVICE_ACCOUNT_SCOPES_BY_SERVER[server];
  return [...(own ?? SERVICE_ACCOUNT_SCOPES)];
}

/** The servers of the service-account group that have their own scope list, sorted. */
export function serviceAccountServers(): string[] {
  return Object.keys(SERVICE_ACCOUNT_SCOPES_BY_SERVER).sort();
}

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
 * Why Google refused a login, from its error answer: `error` and `error_subtype` (not secret), and whether it asks for
 * reauthentication. Workspace's Google Cloud session control ends a login that holds Cloud scopes after a set time and
 * answers invalid_grant with the subtype invalid_rapt (or rapt_required). google-auth-library then puts the answer, as
 * JSON, in the error message (oauth2client.js, refreshTokenNoCache), so both places are read. The token is never read.
 */
export interface GrantRefusal {
  error?: string;
  subtype?: string;
  /** The HTTP status of a refused call (401), when the answer had no OAuth error code. */
  status?: number;
  reauth: boolean;
}

const REAUTH_SUBTYPES: readonly string[] = ['invalid_rapt', 'rapt_required'];

function answerOf(err: unknown): Record<string, unknown> {
  const e = err as { message?: unknown; response?: { data?: unknown } } | null;
  const data = e?.response?.data;
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  if (message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // not JSON: nothing more to read
    }
  }
  return {};
}

export function grantRefusalOf(err: unknown): GrantRefusal {
  const answer = answerOf(err);
  const text = (key: string): string | undefined => {
    const value = answer[key];
    // Google's codes are short words. Anything else is left out rather than shown.
    return typeof value === 'string' && /^[\w.-]{1,64}$/.test(value) ? value : undefined;
  };
  const error = text('error') ?? (isInvalidGrant(err) ? 'invalid_grant' : undefined);
  const subtype = text('error_subtype');
  const description = typeof answer.error_description === 'string' ? answer.error_description : '';
  const reauth = (subtype !== undefined && REAUTH_SUBTYPES.includes(subtype)) || /ReAuth/i.test(description);
  const status = httpStatus(err);
  return { error, subtype, ...(error === undefined && status === 401 ? { status } : {}), reauth };
}

/** The message for a refused login of an OAuth or ADC group. The sign-in in the chat comes first, the terminal second. */
export function refusalMessage(kind: AuthKind, refusal: GrantRefusal, adc = false): string {
  const again = adc
    ? `Call auth_login with method "adc" to sign in again, or run: gcloud auth application-default login.`
    : `Call auth_login to sign in again, or run: ${invocation()} login ${kind}.`;
  if (refusal.reauth) {
    return `Your Google Workspace requires signing in to Google Cloud again (an admin session policy; Google's default is 16 hours). ${again}`;
  }
  const said = [
    refusal.error ? `error ${refusal.error}` : undefined,
    refusal.subtype ? `subtype ${refusal.subtype}` : undefined,
    refusal.status ? `HTTP ${refusal.status}` : undefined,
  ].filter(Boolean);
  const reason = said.length > 0 ? ` (Google: ${said.join(', ')})` : '';
  return `Google refused the ${adc ? 'Application Default Credentials login' : `login for "${kind}"`}${reason}. It may have expired or been revoked, or the OAuth client may have changed; an app left in Testing loses its refresh tokens after 7 days. ${again}`;
}

/**
 * The stored login was refused: Google rejected the refresh token, or the access token it was asked for. The message
 * says why, as far as Google said, and how to sign in again, so the model can tell the person what to do.
 */
export class GrantExpiredError extends Error {
  constructor(kind: AuthKind, options?: { cause?: unknown }) {
    super(
      kind === 'service-account'
        ? `Google refused the service account key. The key may be deleted, disabled, or not added to Play Console or Merchant Center. Check it in Google Cloud console, then set it up again: ${invocation()} setup-service-account --key-file <file>.`
        : refusalMessage(kind, options?.cause === undefined ? { reauth: false } : grantRefusalOf(options.cause)),
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

/** The tokens in one token file, read through the store in use (see secret-files.ts). Empty when there is no file. */
function readTokenFile(cfg: RuntimeConfig, path: string): Credentials {
  const text = readSecretText(cfg, path);
  return text === undefined ? {} : (JSON.parse(text) as Credentials);
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
  const text = readSecretText(cfg, cfg.clientSecretFile);
  if (text === undefined) {
    throw new Error(
      `OAuth client file not found: ${cfg.clientSecretFile}. Create a "Desktop app" OAuth client in Google Cloud console and run: gsm setup-client <file>.`,
    );
  }
  const raw = JSON.parse(text) as ClientSecretFile;
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
  if (!path) return null;
  const text = readSecretText(cfg, path);
  if (text === undefined) return null;
  return JSON.parse(text) as Credentials;
}

/**
 * The ADC login a group can use. ADC is a fallback: it applies only when no account of the group is signed in here, so
 * a group with its own accounts never silently switches to the ADC login.
 */
export function adcSourceFor(kind: AuthKind, cfg: RuntimeConfig): AdcGrant | null {
  if (accountNames(kind, cfg) !== 'none') return null;
  return adcGrantFor(kind, cfg);
}

/** Where a group's login comes from: the suite's own accounts, the ADC login, or nothing. Never calls Google. */
export function loginSourceOf(kind: AuthKind, cfg: RuntimeConfig, account?: string): 'oauth' | 'adc' | 'service-account' | undefined {
  if (kind === 'service-account') return serviceAccountSource(cfg) ? 'service-account' : undefined;
  try {
    const tokens = loadUserTokens(kind, cfg, account);
    if (tokens && (tokens.refresh_token || tokens.access_token)) return 'oauth';
  } catch {
    return undefined;
  }
  return account === undefined && adcSourceFor(kind, cfg) !== null ? 'adc' : undefined;
}

/**
 * True when a login exists, from the suite's own accounts or from ADC. It does not ask Google whether the login still
 * works: that is checkGrant in grant-check.ts, which only `gsm status --check` and `gsm doctor` run.
 */
export function isLoggedIn(kind: AuthKind, cfg: RuntimeConfig, account?: string): boolean {
  return loginSourceOf(kind, cfg, account) !== undefined;
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
 * What `gsm setup-service-account` stores for the service-account group, in <tokenDir>/service-account.json. The key file
 * is referenced by path and never copied. clientEmail is the account's address, which is not a secret.
 */
export interface ServiceAccountRecord {
  keyFile: string;
  clientEmail?: string;
  savedAt: string;
}

export function serviceAccountFileFor(cfg: Pick<RuntimeConfig, 'tokenDir'>): string {
  return join(cfg.tokenDir, 'service-account.json');
}

/** The stored service-account setup, or null when none is set or the file is not valid. */
export function readServiceAccountFile(cfg: Pick<RuntimeConfig, 'tokenDir'>): ServiceAccountRecord | null {
  const file = serviceAccountFileFor(cfg);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceAccountRecord>;
    if (typeof raw.keyFile !== 'string' || raw.keyFile === '') return null;
    return {
      keyFile: raw.keyFile,
      clientEmail: typeof raw.clientEmail === 'string' ? raw.clientEmail : undefined,
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    };
  } catch {
    return null;
  }
}

/** Writes the service-account setup with mode 0600. Returns the file path. */
export function saveServiceAccountFile(cfg: Pick<RuntimeConfig, 'tokenDir'>, record: Omit<ServiceAccountRecord, 'savedAt'>): string {
  const file = serviceAccountFileFor(cfg);
  writeSecureJson(file, { ...record, savedAt: new Date().toISOString() });
  return file;
}

/** Removes the stored service-account setup. Returns false when there was none. The key file itself is never touched. */
export function removeServiceAccountFile(cfg: Pick<RuntimeConfig, 'tokenDir'>): boolean {
  const file = serviceAccountFileFor(cfg);
  if (!existsSync(file)) return false;
  rmSync(file);
  return true;
}

/**
 * Where the service-account key comes from, in order: the setup from `gsm setup-service-account`, then the
 * GOOGLE_APPLICATION_CREDENTIALS file when it is a service-account key (Application Default Credentials). Null when neither.
 */
export function serviceAccountSource(cfg: Pick<RuntimeConfig, 'tokenDir'>): { keyFile: string; via: 'setup' | 'adc' } | null {
  const stored = readServiceAccountFile(cfg);
  if (stored) return { keyFile: stored.keyFile, via: 'setup' };
  const adcFile = adcFilePath();
  if (existsSync(adcFile)) {
    const state = readAdcState(cfg);
    if (state.type === 'service_account') return { keyFile: adcFile, via: 'adc' };
  }
  return null;
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

  if (kind === 'service-account') return serviceAccountClient(cfg);

  const path = tokenFileOf(kind, cfg);
  if (!path || !secretFileExists(cfg, path)) {
    const signedIn = accountNames(kind, cfg);
    if (signedIn !== 'none' && !path) throw new AccountChoiceError(kind, signedIn);
    const adc = await adcClientFor(kind, cfg);
    if (adc) return adc;
    throw new AuthRequiredError(kind);
  }
  // One client per account file, so each account keeps its own refreshed tokens. A client is rebuilt when the file holds
  // another refresh token than the one it was built with: a new sign-in (in the chat or in a terminal) is then used at
  // once, without a restart. Only a hash of the refresh token is kept, and it is never logged.
  const stored = readTokenFile(cfg, path);
  const fingerprint = refreshFingerprint(stored);
  const cached = userClients.get(path);
  if (cached && cached.fingerprint === fingerprint) return cached.client;

  const { clientId, clientSecret } = readClientSecret(cfg);
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials(stored);
  const entry: { client: OAuth2Client | JWT; fingerprint: string } = { client, fingerprint };
  // Persist refreshed access tokens so a restart does not force a new login. The write goes to the store in use. It is
  // skipped when the file is gone (the account was signed out: it is not created again) or holds another refresh token
  // (a newer sign-in replaced it: its token is not overwritten with this older client's answer).
  client.on('tokens', (fresh) => {
    if (!secretFileExists(cfg, path)) return;
    const current = readTokenFile(cfg, path);
    if (refreshFingerprint(current) !== entry.fingerprint) return;
    writeSecretText(cfg, path, JSON.stringify({ ...current, ...fresh }, null, 2));
    entry.fingerprint = refreshFingerprint({ ...current, ...fresh });
  });
  entry.client = withRetry(client, kind);
  userClients.set(path, entry);
  return entry.client;
}

/** A SHA-256 of a token file's refresh token, to notice a new sign-in. Empty when there is none. Never shown. */
function refreshFingerprint(tokens: Credentials): string {
  return tokens.refresh_token ? createHash('sha256').update(tokens.refresh_token).digest('hex') : '';
}

/** The OAuth clients of the user accounts, by token file, with the hash of the refresh token each was built with. */
const userClients = new Map<string, { client: OAuth2Client | JWT; fingerprint: string }>();

/**
 * Forgets the OAuth clients of the user accounts and the secrets read from the OS store, so the next call reads the
 * token files again. Call it after a sign-in: the sign-in runs in another process, which this one cannot see otherwise.
 */
export function forgetUserClients(): void {
  userClients.clear();
  forgetCachedSecrets();
}

/** The service-account clients, by key file and scope set (one per server of the group that uses the key). */
const serviceClients = new Map<string, JWT>();

/**
 * The client of the service-account group: the key file from `gsm setup-service-account`, else the service-account key
 * in GOOGLE_APPLICATION_CREDENTIALS. A key is used as it is (no user consent), with the scopes of the server it runs in
 * (serviceAccountScopesFor; the union when cfg names no server).
 */
async function serviceAccountClient(cfg: RuntimeConfig): Promise<JWT> {
  const source = serviceAccountSource(cfg);
  if (!source) {
    throw new Error(
      `The service account is not set up. Run: ${invocation()} setup-service-account --key-file <service account JSON>, or set GOOGLE_APPLICATION_CREDENTIALS to a service account key.`,
    );
  }
  if (!existsSync(source.keyFile)) {
    throw new Error(`Service account key file not found: ${source.keyFile}. Run: ${invocation()} setup-service-account --key-file <file>.`);
  }
  const scopes = serviceAccountScopesFor(cfg.server);
  const cacheKey = `${source.keyFile}\n${scopes.join(' ')}`;
  const cached = serviceClients.get(cacheKey);
  if (cached) return cached;
  const client = new JWT({ keyFile: source.keyFile, scopes });
  const wrapped = withRetry(client, 'service-account');
  serviceClients.set(cacheKey, wrapped);
  return wrapped;
}

/** Forgets the service-account clients, so the next call reads the key file again. */
export function forgetServiceAccountClients(): void {
  serviceClients.clear();
}

/** The ADC clients, by group. Forgotten after a new ADC login, so the next call reads the file again. */
const adcClients = new Map<string, OAuth2Client | JWT>();

/**
 * The client of the ADC login for a group, or undefined when no ADC login covers it. Google's own text for a failure
 * is kept as the cause, and the error is gsm's "not logged in" message.
 */
async function adcClientFor(kind: AuthKind, cfg: RuntimeConfig): Promise<OAuth2Client | JWT | undefined> {
  const grant = adcSourceFor(kind, cfg);
  // The cloud group always asks google-auth-library, as it always has: that also finds a key file or the machine's own
  // identity. Without a login, the failure is gsm's "not logged in" message, with Google's own text kept as the cause.
  if (!grant && kind !== 'cloud') return undefined;
  const cached = adcClients.get(kind);
  if (cached) return cached;
  let client: OAuth2Client | JWT;
  try {
    client = (await new GoogleAuth({ scopes: grant?.scopes ?? GCLOUD_DEFAULT_SCOPES }).getClient()) as OAuth2Client | JWT;
  } catch (err) {
    throw new AuthRequiredError(kind, { cause: err });
  }
  const wrapped = withRetry(client, kind);
  adcClients.set(kind, wrapped);
  return wrapped;
}

/** Forgets the ADC clients, so the next call reads the ADC file again. Call it after a new ADC login. */
export function forgetAdcClients(): void {
  adcClients.clear();
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
  if (kind === 'service-account') return serviceAccountSource(cfg) ? serviceAccountScopesFor(cfg.server) : null;
  if (kind === 'workspace-admin') return readAdminScopeFile(cfg)?.scopes ?? [...ADMIN_SCOPES];
  let tokens: Credentials | null;
  try {
    tokens = loadUserTokens(kind, cfg);
  } catch {
    return null;
  }
  if (!tokens) return adcSourceFor(kind, cfg)?.scopes ?? null;
  if (!tokens.scope) return null;
  return tokens.scope.split(' ').filter(Boolean);
}

export interface TokenStatus {
  kind: AuthKind;
  loggedIn: boolean;
  /** Where the login comes from. Undefined when there is no login. */
  source?: 'oauth' | 'adc' | 'service-account';
  tokenFile: string;
  scopes?: string[];
  expiresAt?: string;
}

export function tokenStatus(kind: AuthKind, cfg: RuntimeConfig): TokenStatus {
  if (kind === 'service-account') {
    const source = serviceAccountSource(cfg);
    return {
      kind,
      loggedIn: source !== null,
      source: source ? 'service-account' : undefined,
      tokenFile: serviceAccountFileFor(cfg),
      scopes: source ? serviceAccountScopesFor(cfg.server) : undefined,
    };
  }
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
  const source = loginSourceOf(kind, cfg);
  if (!tokens && source === 'adc') {
    const adc = adcSourceFor(kind, cfg);
    return { kind, loggedIn: true, source, tokenFile: '', scopes: adc?.scopes };
  }
  return {
    kind,
    loggedIn: Boolean(tokens),
    source,
    tokenFile: tokenFileOf(kind, cfg) ?? '',
    scopes: tokens?.scope?.split(' '),
    expiresAt: tokens?.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
  };
}

/** Removes one account of a group (the default when none is named). Returns false when no such account is signed in. */
export function removeUserTokens(kind: AuthKind, cfg: RuntimeConfig, account?: string): boolean {
  if (kind === 'workspace-admin' || kind === 'service-account') return false;
  const email = account ?? defaultAccount(kind, cfg);
  if (email === undefined) return false;
  userClients.delete(accountTokenFile(kind, email, cfg) ?? '');
  return removeAccount(kind, email, cfg);
}
