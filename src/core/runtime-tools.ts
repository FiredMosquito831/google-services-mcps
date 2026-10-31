/**
 * The runtime tools: the tools runServer adds to every server after its toolset (src/core/tools.ts). Every tool map lists
 * all of them (dumpTools), so the hook classifies each, but a server registers only those of its sign-in kind: health
 * everywhere; the OAuth sign-in and account tools for the groups whose accounts sign in here; the service-account setup
 * and status for the service-account group; the admin setup for workspace-admin. Docs and skills count only these.
 * tests/skills.test.mjs checks this list against the tools/list of every bundled server.
 *
 * No imports, so the generators and the bundle can read it from dist without the server modules.
 */

/** Every runtime tool name, in the order the tool map lists them. */
export const RUNTIME_TOOL_NAMES: readonly string[] = [
  'health',
  'auth_status',
  'auth_setup_client',
  'auth_login',
  'auth_setup_admin',
  'auth_setup_service_account',
  'accounts_list',
  'account_set_default',
  'account_remove',
];

/** The groups whose Google accounts sign in here (ACCOUNT_GROUPS in tools.ts). */
const ACCOUNT_SIGN_IN_GROUPS: ReadonlySet<string> = new Set(['workspace-user', 'searchconsole', 'business', 'developer', 'cloud']);

/**
 * Whether a server of this sign-in group registers one entry of its tool map (tool-map.json, by its short tool name): a
 * runtime tool only when it is one of its group's (runtimeToolsFor); for the service-account group, any other tool only
 * when it needs no scope or the key's fixed scopes (keyScopes, SERVICE_ACCOUNT_SCOPES_BY_SERVER) hold one of its scopes.
 * Every other entry can register: when the sign-in covers it and, for a change, when writes are allowed. The skills and
 * the generated docs count tools with this rule (scripts/bundle.mjs, scripts/gen-*.mjs).
 */
export function registersEntry(name: string, scopes: readonly string[] | undefined, group: string | undefined, keyScopes?: readonly string[]): boolean {
  if (RUNTIME_TOOL_NAMES.includes(name)) return runtimeToolsFor(group).includes(name);
  if (keyScopes === undefined || scopes === undefined || scopes.length === 0) return true;
  return scopes.some((scope) => keyScopes.includes(scope));
}

/** The runtime tools a server of this sign-in group registers, sorted. */
export function runtimeToolsFor(group: string | undefined): string[] {
  const names = ['health'];
  if (group !== undefined && ACCOUNT_SIGN_IN_GROUPS.has(group)) {
    names.push('auth_setup_client', 'auth_login', 'auth_status', 'accounts_list', 'account_set_default', 'account_remove');
  }
  if (group === 'service-account') names.push('auth_setup_service_account', 'auth_status');
  if (group === 'workspace-admin') names.push('auth_setup_admin');
  return names.sort();
}
