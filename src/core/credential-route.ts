/**
 * The Street View Publish credential route (OD13a).
 *
 * The route is data-declared under the gmaps product in config/products.json and copied into the generated
 * server map. It is a request-level rule, not an auth group: gmaps and gsearch stay in the apikey group,
 * and every other request keeps the key-only client. A request carries an explicit method identity and
 * route only when the method is one of the approved streetviewpublish v1 method IDs. sendAuthorized then
 * checks the group and the URL host as well, and fails closed if any check does not hold.
 */
import type { AuthGroup, CredentialOverride } from './registry.js';

/** The one credential route this product declares. */
export const STREETVIEW_ROUTE = 'streetview-key-plus-bearer' as const;

/** The scope the route asks for, taken from the Discovery snapshot's method scopes. */
export const STREETVIEW_SCOPE = 'https://www.googleapis.com/auth/streetviewpublish';

/** The exact host the route may send dual credentials to. */
export const STREETVIEW_HOST = 'streetviewpublish.googleapis.com';

/**
 * The override of an approved method, when the API name and version also match the declaration. The host is not
 * checked here: sendAuthorized checks the request URL, so a forged method identity on another URL cannot pass.
 */
export function overrideForMethod(
  overrides: Record<string, CredentialOverride> | undefined,
  methodId: string | undefined,
  api?: string,
  version?: string,
): CredentialOverride | undefined {
  if (methodId === undefined || overrides === undefined) return undefined;
  for (const override of Object.values(overrides)) {
    if (override.route !== STREETVIEW_ROUTE) continue;
    if (api !== undefined && api !== override.api) continue;
    if (version !== undefined && version !== override.version) continue;
    if (override.methods.includes(methodId)) return override;
  }
  return undefined;
}

/** Whether one declared override approves this method. */
export function methodInOverride(
  override: CredentialOverride | undefined,
  methodId: string | undefined,
  api?: string,
  version?: string,
): boolean {
  return override !== undefined && override.route === STREETVIEW_ROUTE && override.methods.includes(methodId ?? '') &&
    (api === undefined || api === override.api) && (version === undefined || version === override.version);
}

/** The declared Street View override of a product, if it has one. */
export function streetViewOverride(overrides: Record<string, CredentialOverride> | undefined): CredentialOverride | undefined {
  const override = overrides?.streetviewpublish;
  return override?.route === STREETVIEW_ROUTE ? override : undefined;
}

/** Whether a request may carry both the API key and a bearer token. All four checks must hold. */
export function dualCredentialAllowed(
  overrides: Record<string, CredentialOverride> | undefined,
  group: AuthGroup | string,
  url: string,
  route: string | undefined,
  methodId: string | undefined,
): boolean {
  if (route !== STREETVIEW_ROUTE || group !== 'apikey' || methodId === undefined) return false;
  const override = overrideForMethod(overrides, methodId);
  if (!override || override.scope !== STREETVIEW_SCOPE || override.host !== STREETVIEW_HOST) return false;
  try {
    return new URL(url).hostname === override.host;
  } catch {
    return false;
  }
}
