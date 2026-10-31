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
