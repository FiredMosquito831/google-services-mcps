/**
 * Google Ads request credentials, shared by the curated ads server (src/servers/gads.ts) and the generic
 * request path (discovery tools and the gateway's api_call).
 *
 * Every call to the Google Ads API carries a developer-token header, and a login-customer-id header when the
 * calls go through a manager account. The developer token is read from GSM_ADS_DEVELOPER_TOKEN, else from the
 * developerToken field of <tokenDir>/ads.json. It is never printed, logged or returned: errors are redacted.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RuntimeConfig } from './config.js';

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
 * The developer token: GSM_ADS_DEVELOPER_TOKEN, else the developerToken field of <tokenDir>/ads.json.
 * Read on each call. The file is never printed: a warning names only its path and mode.
 */
export function developerTokenOf(cfg: Pick<RuntimeConfig, 'tokenDir'>): string {
  const fromEnv = process.env[DEVELOPER_TOKEN_ENV]?.trim();
  if (fromEnv) return fromEnv;
  const file = join(cfg.tokenDir, 'ads.json');
  if (existsSync(file)) {
    if (process.platform !== 'win32') {
      const mode = statSync(file).mode & 0o777;
      if (mode !== 0o600) {
        process.stderr.write(`[gads] ${file} is mode ${mode.toString(8)}; it holds a developer token and should be 0600.\n`);
      }
    }
    let raw: { developerToken?: unknown } | null;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as { developerToken?: unknown } | null;
    } catch {
      throw new Error(`${file} is not valid JSON, so no developer token was read.`);
    }
    if (typeof raw?.developerToken === 'string' && raw.developerToken.trim() !== '') return raw.developerToken.trim();
  }
  throw new Error(
    `Google Ads needs a developer token. Set ${DEVELOPER_TOKEN_ENV}, or add {"developerToken": "..."} to ${file}. No request was sent.`,
  );
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
 * The headers every Google Ads request carries. Throws, before any request, when the developer token is missing.
 * The returned object holds the token, so it must never be logged or put in an error.
 */
export function adsHeaders(cfg: Pick<RuntimeConfig, 'tokenDir'>): Record<string, string> {
  const headers: Record<string, string> = { 'developer-token': developerTokenOf(cfg) };
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
