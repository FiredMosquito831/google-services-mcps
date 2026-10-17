/**
 * Google Ads request headers, shared by the curated ads server (src/servers/gads.ts) and the generic request path
 * (discovery tools and the gateway's api_call).
 *
 * Google sunset developer tokens on 2026-09-09: access belongs to the Cloud project of the OAuth client, and the
 * developer-token header is optional and ignored by the API. So the header is sent only when a token is configured,
 * from GSM_ADS_DEVELOPER_TOKEN, else from the developerToken field of <tokenDir>/ads.json. A missing token is not an
 * error and blocks nothing. The login-customer-id header is sent when GSM_ADS_LOGIN_CUSTOMER_ID is set (manager accounts).
 * A token is never printed, logged or returned: errors are redacted.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeConfig } from './config.js';
import { readSecretText } from './secret-files.js';

/** The host of the Google Ads REST API. A request to this host is an Ads request. */
export const ADS_HOST = 'googleads.googleapis.com';
export const DEVELOPER_TOKEN_ENV = 'GSM_ADS_DEVELOPER_TOKEN';
export const LOGIN_CUSTOMER_ENV = 'GSM_ADS_LOGIN_CUSTOMER_ID';

/** True when the URL is on the Google Ads host. */
export function isGoogleAdsUrl(url: string): boolean {
  try {
    return new URL(url).hostname === ADS_HOST;
  } catch {
    return false;
  }
}

/**
 * The developer token, when one is configured: GSM_ADS_DEVELOPER_TOKEN, else the developerToken field of
 * <tokenDir>/ads.json. Returns undefined when there is none, which is not an error. Read on each call. The file is
 * never printed: a warning names only its path and mode, or says that the file is not valid JSON.
 */
export function developerTokenOf(cfg: Pick<RuntimeConfig, 'tokenDir'>): string | undefined {
  const fromEnv = process.env[DEVELOPER_TOKEN_ENV]?.trim();
  if (fromEnv) return fromEnv;
  const file = join(cfg.tokenDir, 'ads.json');
  const text = readSecretText(cfg, file);
  if (text === undefined) return undefined;
  if (process.platform !== 'win32' && existsSync(file)) {
    const mode = statSync(file).mode & 0o777;
    if (mode !== 0o600) {
      process.stderr.write(`[gads] ${file} is mode ${mode.toString(8)}; it may hold a developer token and should be 0600.\n`);
    }
  }
  let raw: { developerToken?: unknown } | null;
  try {
    raw = JSON.parse(text.replace(/^﻿/, '')) as { developerToken?: unknown } | null;
  } catch {
    process.stderr.write(`[gads] ${file} is not valid JSON, so no developer token was read. Requests are sent without one.\n`);
    return undefined;
  }
  if (typeof raw?.developerToken === 'string' && raw.developerToken.trim() !== '') return raw.developerToken.trim();
  return undefined;
}

/** The optional manager account ID, digits only (dashes are allowed and removed). */
export function loginCustomerIdOf(): string | undefined {
  const raw = process.env[LOGIN_CUSTOMER_ENV]?.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/-/g, '');
  if (!/^\d+$/.test(digits)) throw new Error(`${LOGIN_CUSTOMER_ENV} must be the manager account ID, digits only.`);
  return digits;
}

/**
 * The headers of one Google Ads request: developer-token only when a token is configured, and login-customer-id
 * when it is set. Never throws for a missing token. The returned object can hold the token, so it must never be
 * logged or put in an error.
 */
export function adsHeaders(cfg: Pick<RuntimeConfig, 'tokenDir'>): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = developerTokenOf(cfg);
  if (token !== undefined) headers['developer-token'] = token;
  const loginCustomerId = loginCustomerIdOf();
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
  return headers;
}

/** Replaces the secret in text with a marker. An empty secret changes nothing. */
export function redactSecret(text: string, secret: string): string {
  return secret ? text.split(secret).join('[developer token removed]') : text;
}

/**
 * A copy of an error with the secret removed from its message and its response data. Only the fields the
 * error formatter reads are kept, so the request config (which holds the headers) is never copied.
 */
export function redactedError(err: unknown, secret: string): Error {
  const e = (err ?? {}) as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    errors?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const message = typeof e.message === 'string' ? e.message : String(err);
  const extra: Record<string, unknown> = {};
  // The HTTP status is kept as code when the error has no code of its own, so the formatter still says "HTTP 403".
  const code = e.code ?? e.response?.status;
  if (code !== undefined) extra.code = code;
  if (e.status !== undefined) extra.status = e.status;
  if (e.errors !== undefined) extra.errors = e.errors;
  if (e.response) {
    const data = e.response.data === undefined ? undefined : JSON.parse(redactSecret(JSON.stringify(e.response.data) ?? 'null', secret));
    extra.response = { status: e.response.status, data };
  }
  return Object.assign(new Error(redactSecret(message, secret)), extra);
}
