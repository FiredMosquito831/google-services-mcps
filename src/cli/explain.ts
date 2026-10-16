import type { AgentId, Scope } from './types.js';
import type { ProductRow } from './products.js';
import type { CliGroup } from './args.js';

/**
 * Plain-language text for the guided flows and the install summary. Each function returns lines (no printing), so the
 * guided flows and the tests use the same wording. Nothing here changes what the commands do.
 */

/** What the suite is, in five sentences. Shown at the start of the guided install. */
export const WHAT_GSM_DOES: readonly string[] = [
  'Each product is one MCP server: a small program that your agent starts, and that gives the agent tools, for example "list my Gmail messages".',
  'For Claude Code, gsm asks the claude command to add a plugin marketplace and install the plugin. The plugin then starts its server.',
  'For Codex, OpenCode and Antigravity, gsm writes the server entries into the agent\'s config file, and copies the server files to ~/.google-services-mcps/runtime/<product>/, so the config does not depend on where you ran gsm.',
  'A server calls Google only with a login you set up (the sign-in step). Logins are kept in ~/.google-services-mcps. Install and uninstall never touch them.',
  'Changes such as sending, creating or deleting are off until you allow write tools, and each change still asks you first (unless you turn that off).',
];

const AGENT_TEXT: Record<AgentId, string> = {
  claude:
    'Claude Code: gsm runs "claude plugin marketplace add" once (only if the marketplace is not there yet), then "claude plugin install <product>@google-services-mcps". Claude Code keeps the plugin in its own settings. gsm writes no Claude file itself.',
  codex:
    'Codex: gsm adds one block that it owns to ~/.codex/config.toml (or .codex/config.toml in the folder, which Codex reads only for trusted projects). Text outside that block is never changed. Restart Codex afterwards.',
  opencode:
    'OpenCode: gsm adds its keys under "mcp" in ~/.config/opencode/opencode.json (or opencode.json in the folder). Restart OpenCode afterwards.',
  agy:
    'Antigravity (agy): gsm adds its keys under "mcpServers" in ~/.gemini/config/mcp_config.json. Global only. Antigravity must have been started once, so that its config folder exists.',
};

const SCOPE_TEXT: Record<Scope, string> = {
  global: 'Global: the install is for your user account, so it is available in every project.',
  project: 'This folder, shared: the install is written to the folder (for Claude Code, .claude/settings.json). Commit that file if the team should get the same setup.',
  local: 'This folder only: the install is written to the folder, but not shared (for Claude Code, .claude/settings.local.json).',
};

/** What an agent gets, and where it is written. */
export function describeAgent(agent: AgentId | 'all'): string[] {
  if (agent === 'all') return (Object.keys(AGENT_TEXT) as AgentId[]).map((a) => AGENT_TEXT[a]);
  return [AGENT_TEXT[agent]];
}

/** What the chosen scope means for the files. */
export function describeScope(scope: Scope): string[] {
  return [SCOPE_TEXT[scope]];
}

/** One line per product: what it is, its login group, and how many tools it adds. */
export function describeProduct(row: ProductRow): string {
  const tools = row.tools === undefined ? 'tool count unknown' : `${row.tools} tools`;
  const about = row.description ? ` ${row.description}` : '';
  return `${row.id} (${row.title}):${about} Login group: ${row.group || 'none'}; ${tools}.`;
}

/** What signing in to a group involves. */
export function describeLogin(group: CliGroup): string[] {
  switch (group) {
    case 'apikey':
      return [
        'gsearch uses an API key, and needs no login. Create a key in the Google Cloud console and give it to gsm. It is typed without echo, saved in your token folder, and never printed.',
      ];
    case 'workspace-admin':
      return [
        'gadmin acts as a Google Workspace super admin, through a service account with domain-wide delegation. You need the service account JSON key file and the admin\'s email address.',
      ];
    default:
      return [
        'This group needs a Google login. Once, create an OAuth client of type "Desktop app" in the Google Cloud console (APIs & Services, Credentials), download its JSON file, and give that file to gsm (setup-client).',
        'Then the login opens your browser. You approve the access there. The access profile decides which tools may run: readonly (read tools only, the safest), readwrite (adds write tools), or full (everything).',
      ];
  }
}

/** The write settings: what they allow and what they still ask. */
export function describeWrites(allowWrites: boolean, confirmation: string | undefined): string[] {
  if (!allowWrites) {
    return ['Write tools stay off. The servers can read but not change anything. You can turn them on later with --allow-writes or in the plugin settings.'];
  }
  const mode = confirmation ?? 'every-change';
  const asks =
    mode === 'every-change'
      ? 'gsm asks before every change.'
      : mode === 'destructive-only'
        ? 'gsm asks only before destructive changes (deleting, for example).'
        : 'gsm does not ask. Your policy rules still apply.';
  return ['Write tools are on. ' + asks];
}

/** The steps an install performs, in order, for the summary before the preview. */
export function describeInstallSteps(agents: readonly AgentId[], products: readonly string[], scope: Scope): string[] {
  const where = scope === 'global' ? 'for your user account' : `in this folder (${scope})`;
  const steps = [`Install ${products.length} product${products.length === 1 ? '' : 's'} (${products.join(', ')}) for ${agents.join(', ')} ${where}.`];
  if (agents.includes('claude')) steps.push('Claude Code: add the marketplace if it is missing, then install the plugins.');
  if (agents.some((a) => a !== 'claude')) steps.push('Other agents: write the config entries and copy the server files to ~/.google-services-mcps/runtime/.');
  steps.push('Nothing is written until you confirm after the preview.');
  return steps;
}

/** The sign-in groups a set of products needs, with what each one needs. */
export function describeNeededLogins(groups: readonly CliGroup[]): string[] {
  if (groups.length === 0) return ['None of these products needs a login.'];
  return groups.map((group) => `${group}: ${describeLogin(group)[0]}`);
}

/** The menu's intro for each action, so a person knows what a flow does before it asks. */
export const ACTION_TEXT: Record<string, string> = {
  install:
    'Install adds products to an agent. You choose the agent, where it is installed, and the products. Each product is one server, and the agent starts it. Nothing changes until you confirm after a preview.',
  uninstall:
    'Uninstall removes gsm\'s own entries from an agent, for the install you pick, or for everything gsm installed. It keeps the logins, the OAuth client and the other agents.',
  signin:
    'Sign in gives a Google group its access: the OAuth client once, then the browser login with an access profile. It also saves an API key or sets up the workspace admin.',
  signout: 'Sign out removes the stored login of one group. The OAuth client and the other groups stay.',
  list: 'List shows every install that gsm recorded: the agent, the scope, the folder, the products, and whether each one is still in place.',
  status: 'Status shows, for each group, whether it is signed in, which scopes it holds, and the security settings of the token. It never shows token values.',
  products: 'Products lists each product with its description, its login group and its number of tools.',
  browse: 'Browse shows the Google APIs behind the gateway tools: the APIs of a product, or the methods of one API.',
  scopes: 'Scopes shows the Google scopes a group needs for each access profile, and how many tools each one covers.',
  doctor: 'Doctor checks the plugin folders, the hooks, the tool names, the token folder and the credentials. Each check says PASS or FAIL.',
  version: 'Version shows the suite version and the Node.js version.',
  help: 'Help shows every command and every option.',
};
