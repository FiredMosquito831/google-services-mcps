/**
 * Google Discovery URLs, shared by scripts/snapshot-discovery.mjs and scripts/check-discovery-freshness.mjs, so the
 * freshness check asks for each document in the same URL order the snapshot used.
 *
 * Both scripts take `--origin <url>` for tests: every request then goes to that local server instead of Google, with
 * the Google host as the first path segment (https://gmail.googleapis.com/$discovery/rest?version=v1 becomes
 * <origin>/gmail.googleapis.com/$discovery/rest?version=v1). Only a loopback http origin is accepted.
 */

/** Google's public directory of the preferred version of each API. No key or sign-in needed. */
export const DIRECTORY_PREFERRED_URL = 'https://www.googleapis.com/discovery/v1/apis?preferred=true';

/**
 * servers.json names some APIs the way the user thinks of them. Discovery
 * publishes these under another name, so they are looked up under the alias.
 */
export const DISCOVERY_ALIASES = {
  'reports.v1': 'admin/reports_v1',
  'datatransfer.v1': 'admin/datatransfer_v1',
};

/**
 * Candidate URLs in order: the documented path, the alias path (if any), then the
 * API's own host. The host form serves some APIs that the path form answers with 404.
 */
export function candidateUrls(key, api, version) {
  const urls = [`https://www.googleapis.com/discovery/v1/apis/${api}/${version}/rest`];
  if (DISCOVERY_ALIASES[key]) urls.push(`https://www.googleapis.com/discovery/v1/apis/${DISCOVERY_ALIASES[key]}/rest`);
  urls.push(`https://${api.toLowerCase()}.googleapis.com/$discovery/rest?version=${version}`);
  return urls;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The test origin from `--origin`, or undefined. Throws unless it is http on a loopback host. */
export function parseTestOrigin(value) {
  if (value === undefined) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`--origin must be a URL such as http://127.0.0.1:8080, not "${value}"`);
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`--origin is for tests and accepts only http on 127.0.0.1, localhost or [::1], not "${value}"`);
  }
  return url.origin;
}

/** The URL to fetch: the Google URL itself, or with a test origin, the same request sent to that origin. */
export function routeUrl(url, origin) {
  if (!origin) return url;
  const u = new URL(url);
  return `${origin}/${u.host}${u.pathname}${u.search}`;
}

/** The value after `--name` in argv, or undefined. Throws when the flag has no value. */
export function flagValue(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}
