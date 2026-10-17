import { apikeys } from '@googleapis/apikeys';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import { isInvalidGrant, loadUserTokens, readClientSecret, type AuthKind } from './auth.js';
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

/** The part of OAuth2Client these checks use. Tests pass a fake. */
export interface OAuthClientLike {
  setCredentials(tokens: Credentials): void;
  getAccessToken(): Promise<{ token?: string | null }>;
  getTokenInfo(accessToken: string): Promise<{ scope?: string | null; expires_in?: number | null; email?: string | null }>;
  revokeToken(token: string): Promise<unknown>;
}

export interface GrantDeps {
  /** Builds the OAuth client. The default is google-auth-library's OAuth2Client. */
  makeClient?: (clientId: string, clientSecret: string) => OAuthClientLike;
}

const defaultClient = (clientId: string, clientSecret: string): OAuthClientLike =>
  new OAuth2Client(clientId, clientSecret) as unknown as OAuthClientLike;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Removes every secret from a text before it is shown. */
function redact(text: string, secrets: ReadonlyArray<string | null | undefined>): string {
  let out = text;
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]');
  return out;
}

function expiredDetail(group: AuthKind): string {
  return `The login for "${group}" has expired or was revoked. An app left in Testing loses its refresh tokens after 7 days. Log in again: ${invocation()} login ${group}`;
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
    if (isInvalidGrant(err)) return none('expired', expiredDetail(group));
    return none('unreachable', `could not refresh the access token: ${redact(messageOf(err), secrets)}`);
  }
  if (!access) return none('expired', expiredDetail(group));

  let info: { scope?: string | null; expires_in?: number | null; email?: string | null };
  try {
    info = await client.getTokenInfo(access);
  } catch (err) {
    const text = redact(messageOf(err), [...secrets, access]);
    if (/invalid_token|\b400\b|\b401\b/.test(text)) return none('revoked', revokedDetail(group));
    return none('unreachable', `could not check the token with Google: ${text}`);
  }

  const granted = (info.scope ?? '').split(' ').filter(Boolean);
  const missingScopes = stored.filter((scope) => !granted.includes(scope));
  return {
    group,
    state: 'valid',
    detail: missingScopes.length > 0 ? `valid, but ${missingScopes.length} stored scope(s) are no longer granted` : 'valid',
    scopes: granted,
    missingScopes,
    expiresInSeconds: info.expires_in ?? undefined,
    account: info.email ?? undefined,
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
  if (!tokens || !(tokens.refresh_token || tokens.access_token)) {
    throw new Error(`needs a cloud login to read the key's restrictions. Run: ${invocation()} login cloud`);
  }
  const { clientId, clientSecret } = readClientSecret(cfg);
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials(tokens);
  const api = apikeys({ version: 'v2', auth: client });
  const lookup = await api.keys.lookupKey({ keyString });
  const name = lookup.data.name ?? undefined;
  if (!name) throw new Error('Google did not name the key');
  const key = await api.projects.locations.keys.get({ name });
  const restrictions = (key.data.restrictions ?? null) as Record<string, unknown> | null;
  return { name, ...describeKeyRestrictions(restrictions) };
}
