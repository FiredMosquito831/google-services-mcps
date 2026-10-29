import { apikeys } from '@googleapis/apikeys';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import { GoogleAuth } from 'google-auth-library';
import { existsSync } from 'node:fs';
import { JWT } from 'google-auth-library';
import {
  adcSourceFor,
  grantRefusalOf,
  isInvalidGrant,
  refusalMessage,
  loadUserTokens,
  readClientSecret,
  readServiceAccountFile,
  SERVICE_ACCOUNT_SCOPES,
  serviceAccountSource,
  type AuthKind,
} from './auth.js';
import type { RuntimeConfig } from './config.js';
import { invocation } from './invocation.js';

/**
 * The live checks of a stored login: whether Google still accepts it, what it grants, and whether it can be revoked.
 * These are the only functions that call Google about a login. Nothing else in the suite does, so a read never waits
 * on the network to check a login.
 */

export type GrantState = 'not-logged-in' | 'valid' | 'expired' | 'revoked' | 'unreachable';

export interface GrantCheck {
  group: AuthKind;
  state: GrantState;
  detail: string;
  /** The account the login belongs to, from Google's token info. Undefined when the token has no email scope. */
  account?: string;
  /** The scopes Google reports for the access token. Empty unless the check reached Google. */
  scopes: string[];
  /** Scopes stored at login that Google no longer reports. */
  missingScopes: string[];
  expiresInSeconds?: number;
}

/**
 * Google's token info, in either shape. google-auth-library returns the scopes as `scopes` (an array) and the expiry as
 * `expiry_date` (milliseconds). The raw tokeninfo endpoint returns `scope` (a space-separated string) and `expires_in`
 * (seconds). A check that reads only one of them sees no granted scopes, so both are read.
 */
export interface TokenInfoLike {
  scope?: string | null;
  scopes?: string[] | null;
  expires_in?: number | null;
  expiry_date?: number | null;
  email?: string | null;
}

/** The scopes and the time left, from either shape of token info. */
export function readTokenInfo(info: TokenInfoLike, now: number = Date.now()): { scopes: string[]; expiresInSeconds?: number } {
  const scopes = Array.isArray(info.scopes) ? info.scopes.filter(Boolean) : (info.scope ?? '').split(' ').filter(Boolean);
  let expiresInSeconds: number | undefined;
  if (typeof info.expires_in === 'number') expiresInSeconds = info.expires_in;
  else if (typeof info.expiry_date === 'number') expiresInSeconds = Math.max(0, Math.round((info.expiry_date - now) / 1000));
  return { scopes, expiresInSeconds };
}

/** The part of OAuth2Client these checks use. Tests pass a fake. */
export interface OAuthClientLike {
  setCredentials(tokens: Credentials): void;
  getAccessToken(): Promise<{ token?: string | null }>;
  getTokenInfo(accessToken: string): Promise<TokenInfoLike>;
  revokeToken(token: string): Promise<unknown>;
}

export interface GrantDeps {
  /** Builds the OAuth client. The default is google-auth-library's OAuth2Client. */
  makeClient?: (clientId: string, clientSecret: string) => OAuthClientLike;
  /** Builds the client of the ADC login with the scopes it holds. The default reads the ADC file. */
  makeAdcClient?: (scopes: string[]) => Promise<OAuthClientLike>;
  /** Builds the service-account client for a key file. The default is a JWT with the key. */
  makeServiceClient?: (keyFile: string, scopes: string[]) => Promise<OAuthClientLike>;
}

const defaultServiceClient = async (keyFile: string, scopes: string[]): Promise<OAuthClientLike> =>
  new JWT({ keyFile, scopes }) as unknown as OAuthClientLike;

const defaultClient = (clientId: string, clientSecret: string): OAuthClientLike =>
  new OAuth2Client(clientId, clientSecret) as unknown as OAuthClientLike;

const defaultAdcClient = async (scopes: string[]): Promise<OAuthClientLike> =>
  (await new GoogleAuth({ scopes }).getClient()) as unknown as OAuthClientLike;

/**
 * A refused ADC login, with Google's reason when the error carries one (reauthentication, or its error and subtype).
 * Without an error the text is the one it always was.
 */
function adcExpiredDetail(group: AuthKind, err?: unknown): string {
  if (err === undefined) {
    return `The Application Default Credentials login has expired or was revoked. Log in again with: gcloud auth application-default login, or call auth_login with method "adc" (${group}).`;
  }
  return refusalMessage(group, grantRefusalOf(err), true);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Removes every secret from a text before it is shown. */
function redact(text: string, secrets: ReadonlyArray<string | null | undefined>): string {
  let out = text;
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]');
  return out;
}

/**
 * A refused login. With the error Google answered, the text says what Google said (a reauthentication request is told
 * apart). Without one (Google gave no access token), the text is the one it always was.
 */
function expiredDetail(group: AuthKind, err?: unknown): string {
  if (err === undefined) {
    return `The login for "${group}" has expired or was revoked. An app left in Testing loses its refresh tokens after 7 days. Log in again: ${invocation()} login ${group}`;
  }
  return refusalMessage(group, grantRefusalOf(err));
}

function revokedDetail(group: AuthKind): string {
  return `Google no longer accepts this login. Log in again: ${invocation()} login ${group}`;
}

/** Asks Google whether the stored login still works, and what it grants. Refreshes the access token when it has expired. */
export async function checkGrant(group: AuthKind, cfg: RuntimeConfig, deps: GrantDeps = {}, account?: string): Promise<GrantCheck> {
  const none = (state: GrantState, detail: string): GrantCheck => ({ group, state, detail, scopes: [], missingScopes: [] });

  let tokens: Credentials | null;
  try {
    tokens = loadUserTokens(group, cfg, account);
  } catch {
    return none('not-logged-in', `the token file is unreadable. Log in again: ${invocation()} login ${group}`);
  }
  if (!tokens || !(tokens.refresh_token || tokens.access_token)) {
    const adc = adcSourceFor(group, cfg);
    if (adc) return checkAdcGrant(group, adc.scopes, deps);
    return none('not-logged-in', `Run: ${invocation()} login ${group}`);
  }

  const stored = (tokens.scope ?? '').split(' ').filter(Boolean);
  let secret: { clientId: string; clientSecret: string };
  try {
    secret = readClientSecret(cfg);
  } catch (err) {
    return none('unreachable', messageOf(err));
  }

  const client = (deps.makeClient ?? defaultClient)(secret.clientId, secret.clientSecret);
  client.setCredentials(tokens);
  const secrets = [tokens.refresh_token, tokens.access_token, secret.clientSecret];

  let access: string | null | undefined;
  try {
    access = (await client.getAccessToken()).token;
  } catch (err) {
    if (isInvalidGrant(err)) return none('expired', expiredDetail(group, err));
    return none('unreachable', `could not refresh the access token: ${redact(messageOf(err), secrets)}`);
  }
  if (!access) return none('expired', expiredDetail(group));

  let info: TokenInfoLike;
  try {
    info = await client.getTokenInfo(access);
  } catch (err) {
    const text = redact(messageOf(err), [...secrets, access]);
    if (/invalid_token|\b400\b|\b401\b/.test(text)) return none('revoked', revokedDetail(group));
    return none('unreachable', `could not check the token with Google: ${text}`);
  }

  const { scopes: granted, expiresInSeconds } = readTokenInfo(info);
  const missingScopes = stored.filter((scope) => !granted.includes(scope));
  return {
    group,
    state: 'valid',
    detail: missingScopes.length > 0 ? `valid, but ${missingScopes.length} stored scope(s) are no longer granted` : 'valid',
    scopes: granted,
    missingScopes,
    expiresInSeconds,
    account: info.email ?? undefined,
  };
}

/**
 * The live check of the ADC login for a group, with the same steps as the OAuth check: refresh, then ask Google what the
 * token grants. The scopes compared are the ones the login was made with.
 */
async function checkAdcGrant(group: AuthKind, stored: string[], deps: GrantDeps): Promise<GrantCheck> {
  const none = (state: GrantState, detail: string): GrantCheck => ({ group, state, detail, scopes: [], missingScopes: [] });

  let client: OAuthClientLike;
  try {
    client = await (deps.makeAdcClient ?? defaultAdcClient)(stored);
  } catch (err) {
    if (isInvalidGrant(err)) return none('expired', adcExpiredDetail(group, err));
    return none('unreachable', `could not read the ADC file: ${messageOf(err)}`);
  }

  let access: string | null | undefined;
  try {
    access = (await client.getAccessToken()).token;
  } catch (err) {
    if (isInvalidGrant(err)) return none('expired', adcExpiredDetail(group, err));
    return none('unreachable', `could not refresh the ADC access token: ${messageOf(err)}`);
  }
  if (!access) return none('expired', adcExpiredDetail(group));

  let info: TokenInfoLike;
  try {
    info = await client.getTokenInfo(access);
  } catch (err) {
    const text = redact(messageOf(err), [access]);
    if (/invalid_token|\b400\b|\b401\b/.test(text)) return none('revoked', adcExpiredDetail(group));
    return none('unreachable', `could not check the ADC token with Google: ${text}`);
  }

  const { scopes: granted, expiresInSeconds } = readTokenInfo(info);
  const missingScopes = stored.filter((scope) => !granted.includes(scope));
  return {
    group,
    state: 'valid',
    detail: missingScopes.length > 0 ? `valid (ADC), but ${missingScopes.length} stored scope(s) are no longer granted` : 'valid (ADC)',
    scopes: granted,
    missingScopes,
    expiresInSeconds,
    account: info.email ?? undefined,
  };
}

/** The service-account group's live check: the key has to be accepted by Google's token endpoint. */
export async function checkServiceAccountGrant(cfg: RuntimeConfig, deps: GrantDeps = {}): Promise<GrantCheck> {
  const group = 'service-account' as const;
  const none = (state: GrantState, detail: string): GrantCheck => ({ group, state, detail, scopes: [], missingScopes: [] });
  const source = serviceAccountSource(cfg);
  if (!source) return none('not-logged-in', `not set up: run ${invocation()} setup-service-account --key-file <file>`);
  if (!existsSync(source.keyFile)) return none('not-logged-in', `the key file is missing: ${source.keyFile}. Set it up again with ${invocation()} setup-service-account --key-file <file>.`);

  let token: string | null | undefined;
  try {
    const client = await (deps.makeServiceClient ?? defaultServiceClient)(source.keyFile, [...SERVICE_ACCOUNT_SCOPES]);
    token = (await client.getAccessToken()).token;
  } catch (err) {
    const text = redact(messageOf(err), [source.keyFile]);
    if (isInvalidGrant(err) || /invalid_grant|unauthorized_client|invalid_client|\b401\b/.test(text)) {
      return none('expired', `Google refused the service account key. Check it in Google Cloud console, or set it up again: ${invocation()} setup-service-account --key-file <file>.`);
    }
    return none('unreachable', `could not get a token from Google: ${text}`);
  }
  if (!token) return none('expired', `Google gave no token for the service account key. Set it up again: ${invocation()} setup-service-account --key-file <file>.`);
  const stored = readServiceAccountFile(cfg);
  return {
    group,
    state: 'valid',
    detail: `the key works (${source.via === 'setup' ? 'set up with setup-service-account' : 'from GOOGLE_APPLICATION_CREDENTIALS'}). Play Console or Merchant Center must also list the account for calls to succeed.`,
    scopes: [...SERVICE_ACCOUNT_SCOPES],
    missingScopes: [],
    account: stored?.clientEmail,
  };
}

/** The email scope. With it, Google's token info names the account the login belongs to. */
export const IDENTITY_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

/** The scopes with the identity scope added, once. Logins request it so `status` and `health` can name the account. */
export function withIdentityScope(scopes: readonly string[]): string[] {
  return [...new Set([...scopes, IDENTITY_SCOPE])];
}

/**
 * The account an access token belongs to, from Google's token info. Undefined when the token has no email scope, or
 * when Google cannot be reached. A login records it once, so later offline views can show it.
 */
export async function accountOfToken(
  accessToken: string,
  clientId: string,
  clientSecret: string,
  deps: GrantDeps = {},
): Promise<string | undefined> {
  try {
    const info = await (deps.makeClient ?? defaultClient)(clientId, clientSecret).getTokenInfo(accessToken);
    return info.email ?? undefined;
  } catch {
    return undefined;
  }
}

export interface RevokeResult {
  revoked: boolean;
  detail: string;
}

/**
 * Revokes the stored login at Google, so its refresh token stops working everywhere. Returns undefined when there is
 * no stored login. A failure is returned, not thrown: the caller still removes the local file, and says what is left.
 */
export async function revokeGrant(group: AuthKind, cfg: RuntimeConfig, deps: GrantDeps = {}, account?: string): Promise<RevokeResult | undefined> {
  let tokens: Credentials | null;
  try {
    tokens = loadUserTokens(group, cfg, account);
  } catch {
    return { revoked: false, detail: 'the token file is unreadable, so nothing could be revoked' };
  }
  const token = tokens?.refresh_token || tokens?.access_token;
  if (!token) return undefined;

  // Revoking needs only the token. The client secret is passed when it is available, and left empty otherwise.
  let secret = { clientId: '', clientSecret: '' };
  try {
    secret = readClientSecret(cfg);
  } catch {
    // no client file: revoke with the token alone
  }
  const client = (deps.makeClient ?? defaultClient)(secret.clientId, secret.clientSecret);
  try {
    await client.revokeToken(token);
    return { revoked: true, detail: 'revoked at Google' };
  } catch (err) {
    const text = redact(messageOf(err), [token, secret.clientSecret]);
    return {
      revoked: false,
      detail: `not revoked at Google (${text}). Revoke it at https://myaccount.google.com/permissions`,
    };
  }
}

/** An API key's restrictions, as described for people. */
export interface KeyRestrictions {
  restricted: boolean;
  detail: string;
}

const HOST_RESTRICTIONS = ['browserKeyRestrictions', 'serverKeyRestrictions', 'androidKeyRestrictions', 'iosKeyRestrictions'];

/**
 * Summarises the restrictions of an API key. A key with no restrictions can call every enabled API from any caller,
 * so that is reported as unrestricted.
 */
export function describeKeyRestrictions(restrictions: Record<string, unknown> | null | undefined): KeyRestrictions {
  const r = restrictions ?? {};
  const apis = Array.isArray(r.apiTargets) ? r.apiTargets.length : 0;
  const callers = HOST_RESTRICTIONS.filter((name) => r[name] !== undefined && r[name] !== null).map((name) => name.replace('KeyRestrictions', ''));
  if (apis === 0 && callers.length === 0) {
    return {
      restricted: false,
      detail:
        'UNRESTRICTED: the key can call every enabled API from any caller. Limit it to the APIs it needs, and to your servers or addresses, in Google Cloud console (APIs & Services > Credentials).',
    };
  }
  const apiPart = apis > 0 ? `${apis} API(s)` : 'all APIs';
  const callerPart = callers.length > 0 ? `callers limited by ${callers.join(', ')}` : 'any caller';
  return { restricted: true, detail: `restricted to ${apiPart}; ${callerPart}` };
}

/**
 * Reads an API key's restrictions with the cloud login, which needs permission to read API keys. It throws when there
 * is no cloud login or Google refuses the read, and the caller reports that.
 */
export async function checkKeyRestrictions(keyString: string, cfg: RuntimeConfig): Promise<KeyRestrictions & { name?: string }> {
  const tokens = loadUserTokens('cloud', cfg);
  const adc = tokens ? null : adcSourceFor('cloud', cfg);
  if ((!tokens || !(tokens.refresh_token || tokens.access_token)) && !adc) {
    throw new Error(`needs a cloud login to read the key's restrictions. Run: ${invocation()} login cloud, or sign in with ADC`);
  }
  let auth: OAuth2Client;
  if (adc) {
    auth = (await new GoogleAuth({ scopes: adc.scopes }).getClient()) as OAuth2Client;
  } else {
    const { clientId, clientSecret } = readClientSecret(cfg);
    auth = new OAuth2Client(clientId, clientSecret);
    auth.setCredentials(tokens as Credentials);
  }
  const api = apikeys({ version: 'v2', auth });
  const lookup = await api.keys.lookupKey({ keyString });
  const name = lookup.data.name ?? undefined;
  if (!name) throw new Error('Google did not name the key');
  const key = await api.projects.locations.keys.get({ name });
  const restrictions = (key.data.restrictions ?? null) as Record<string, unknown> | null;
  return { name, ...describeKeyRestrictions(restrictions) };
}
