import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_GROUPS, type CliGroup } from './args.js';
import { checkoutRootFor } from './paths.js';
import { productRows, type ProductRow } from './products.js';
import { readInstalls, type InstallRecord } from './records.js';
import {
  ACTION_TEXT,
  WHAT_GSM_DOES,
  describeAgent,
  describeInstallSteps,
  describeLogin,
  describeNeededLogins,
  describeProduct,
  describeScope,
  describeWrites,
} from './explain.js';
import type { Choice, Prompter } from './prompt.js';
import type { InstallRoots } from './paths.js';
import { describeMissing, marketplaceNeedsGit, missingOf, type Requirement } from './requirements.js';
import type { Registry } from '../core/registry.js';
import { invocation } from '../core/invocation.js';
import type { Output } from './report.js';
import { AGENTS, UsageError, type AgentId } from './types.js';

/**
 * The guided flows. Each one explains what it does, asks its questions, shows the exact command it is about to run, and
 * then runs that command through `run`, the same dispatcher the typed commands use. So a guided answer and the typed flags
 * do the same thing, and the command shown is the one to type next time.
 */
export interface GuidedEnv {
  prompt: Prompter;
  /** Runs a command line, for example ["install", "--agent", "codex", ...]. Returns the exit code. */
  run: (argv: readonly string[]) => Promise<number>;
  roots: InstallRoots;
  registry: Registry;
  /** The home folder that holds the install record (the default is the user's home). */
  home: string;
  cwd: string;
  out: Output;
  /** The OAuth client file that setup-client writes. */
  clientSecretFile: string;
  /** Saves an API key typed in the terminal. force replaces a key that is already saved. */
  saveApiKey: (key: string, force: boolean) => Promise<number>;
  apiKeySaved: boolean;
  /** The requirements of an install on this machine. The CLI runs the real check; tests give a stub. */
  requirements: (agents: readonly AgentId[], needGit: boolean) => Promise<Requirement[]>;
}

/** Values already given as flags. A guided flow asks only for what is missing. */
export interface InstallPrefill {
  agent?: string;
  plugin?: string;
  scope?: string;
  path?: string;
  allowWrites?: boolean;
  confirmation?: string;
}

const AGENT_CHOICES: Choice<string>[] = [
  { value: 'claude', label: 'Claude Code', hint: 'through the claude command' },
  { value: 'codex', label: 'Codex', hint: '~/.codex/config.toml' },
  { value: 'opencode', label: 'OpenCode', hint: 'opencode.json' },
  { value: 'agy', label: 'Antigravity (agy)', hint: 'global only' },
  { value: 'all', label: 'All four agents', hint: 'each one that is set up on this machine' },
];

const SCOPE_CHOICES: Choice<string>[] = [
  { value: 'global', label: 'Global: for your user account', hint: 'the default, every project' },
  { value: 'project', label: 'This folder, shared', hint: 'Claude Code: .claude/settings.json, which you can commit' },
  { value: 'local', label: 'This folder only', hint: 'not shared: .claude/settings.local.json for Claude Code' },
];

const CONFIRM_CHOICES: Choice<string>[] = [
  { value: 'every-change', label: 'Before every change', hint: 'the default' },
  { value: 'destructive-only', label: 'Only before deleting or other destructive changes' },
  { value: 'off', label: 'Never ask', hint: 'policy rules still apply' },
];

const PROFILE_CHOICES: Choice<string>[] = [
  { value: 'readonly', label: 'Read only', hint: 'the safest, and the default' },
  { value: 'readwrite', label: 'Read and write', hint: 'adds the write tools, with the narrowest scopes' },
  { value: 'full', label: 'Everything', hint: 'every tool and every scope' },
];

const GROUP_HINTS: Record<CliGroup, string> = {
  cloud: 'gcloud, gai: OAuth desktop client',
  'workspace-user': 'Gmail, Drive, Calendar, Chat, Meet, Contacts, Tasks, Classroom, Apps Script: OAuth desktop client',
  searchconsole: 'gsc: OAuth desktop client',
  business: 'Analytics, Tag Manager, YouTube, Business Profile, Ads, Merchant Center: OAuth desktop client',
  developer: 'Play, Firebase, Maps: OAuth desktop client',
  apikey: 'gsearch: an API key, no login',
  'workspace-admin': 'gadmin: a service account with domain-wide delegation',
};

const GROUP_CHOICES: Choice<CliGroup>[] = ALL_GROUPS.map((group) => ({ value: group, label: group, hint: GROUP_HINTS[group] }));

/** The menu of `gsm` with no arguments in a terminal. Each entry is one of the guided flows below. */
const MENU: Choice<MenuAction>[] = [
  { value: 'install', label: 'Install products for an agent', hint: 'the main task' },
  { value: 'uninstall', label: 'Uninstall products, or everything gsm installed' },
  { value: 'signin', label: 'Sign in to a Google group, or save an API key or admin setup' },
  { value: 'signout', label: 'Sign out of a group (remove its stored login)' },
  { value: 'list', label: 'Show what gsm installed, and where' },
  { value: 'status', label: 'Show the sign-in status of each group' },
  { value: 'products', label: 'Show the products and their tool counts' },
  { value: 'browse', label: 'Browse the APIs and methods behind the gateway tools' },
  { value: 'scopes', label: 'Show the scopes of a group for each profile' },
  { value: 'doctor', label: 'Check the installation' },
  { value: 'version', label: 'Show the version' },
  { value: 'help', label: 'Show every command and flag' },
  { value: 'quit', label: 'Quit' },
];

type MenuAction = 'install' | 'uninstall' | 'signin' | 'signout' | 'list' | 'status' | 'products' | 'browse' | 'scopes' | 'doctor' | 'version' | 'help' | 'quit';

/** The command as it would be typed, quoted where a value has a space. */
export function commandLine(args: readonly string[]): string {
  const shown = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  return `${invocation()} ${shown.join(' ')}`;
}

function showCommand(env: GuidedEnv, args: readonly string[]): void {
  env.prompt.say(`The command for this is:\n  ${commandLine(args)}`);
}

function sayAll(env: GuidedEnv, lines: readonly string[], indent = ''): void {
  for (const line of lines) env.prompt.say(indent + line);
}

function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Asks until the answer is an existing folder. The default is the current folder. */
async function askFolder(env: GuidedEnv, question: string): Promise<string> {
  for (;;) {
    const answer = await env.prompt.ask(question, env.cwd);
    const path = resolve(env.cwd, answer);
    if (isExistingDirectory(path)) return path;
    env.prompt.say(`That is not an existing folder: ${path}`);
  }
}

/** Asks until the answer is an existing file. */
async function askFile(env: GuidedEnv, question: string): Promise<string> {
  for (;;) {
    const answer = (await env.prompt.ask(question)).trim();
    const path = resolve(env.cwd, answer.replace(/^"(.*)"$/, '$1'));
    if (answer !== '' && existsSync(path)) return path;
    env.prompt.say(answer === '' ? 'A path is needed.' : `That file does not exist: ${path}`);
  }
}

/** A short description for a picker line: the first part of the product's description. */
function shortDescription(text: string | undefined): string {
  if (!text) return '';
  const cut = text.length > 90 ? `${text.slice(0, 87).trimEnd()}...` : text;
  return cut;
}

function productChoices(env: GuidedEnv): Choice<string>[] {
  return productRows(env.roots, env.registry).map((row) => ({
    value: row.id,
    label: `${row.id}: ${row.title}`,
    hint: `${row.group} login, ${row.tools ?? '?'} tools. ${shortDescription(row.description)}`.trim(),
  }));
}

async function askProducts(env: GuidedEnv): Promise<string> {
  const rows = productRows(env.roots, env.registry);
  const choices = productChoices(env);
  const picked = await env.prompt.pick('Which products? Pick several, or "all" for every product.', choices);
  return picked.length === rows.length ? 'all' : picked.join(',');
}

/** The product rows a plugin value (a list of ids, or "all") stands for. */
function rowsFor(env: GuidedEnv, plugin: string): ProductRow[] {
  const rows = productRows(env.roots, env.registry);
  if (plugin === 'all') return rows;
  const wanted = plugin.split(',').map((p) => p.trim());
  return rows.filter((row) => wanted.includes(row.id));
}

function agentsOf(agent: string): AgentId[] {
  return agent === 'all' ? [...AGENTS] : [agent as AgentId];
}

/** Asks for the missing requirements. Returns the install mode, or null when the flow must stop (nothing installed). */
async function requirementsStep(env: GuidedEnv, agents: readonly AgentId[], needGit: boolean): Promise<{ installMissing: boolean } | null> {
  const { prompt } = env;
  const missing = missingOf(await env.requirements(agents, needGit));
  if (missing.length === 0) {
    prompt.say('Requirements: everything this install needs is already on this machine.');
    return { installMissing: false };
  }
  prompt.say('Requirements that are missing on this machine:');
  sayAll(env, describeMissing(missing), '  ');
  if (missing.some((r) => r.install === null)) {
    prompt.say('Some of them are installed by hand (the commands above). Install them, then run this again. Nothing was installed.');
    return null;
  }
  if (!(await prompt.confirm('Install the missing requirements now, with the commands shown above?', true))) {
    prompt.say('Install them by hand, then run this again. Nothing was installed.');
    return null;
  }
  return { installMissing: true };
}

/**
 * Install: explains what gsm does, asks the agent, scope, products and write settings, checks the requirements, shows the
 * command and a preview, and installs after a yes.
 */
export async function guidedInstall(env: GuidedEnv, prefill: InstallPrefill = {}): Promise<number> {
  const { prompt } = env;
  prompt.say('What gsm installs, and how:');
  sayAll(env, WHAT_GSM_DOES, '  ');
  prompt.say('');
  prompt.say('Install: choose the agent, where it goes, and the products. Nothing is changed until you confirm.');

  const agent = prefill.agent ?? (await prompt.choose('Which agent?', AGENT_CHOICES, 'claude'));
  if (!AGENT_CHOICES.some((c) => c.value === agent)) {
    throw new UsageError(`--agent must be one of: ${AGENT_CHOICES.map((c) => c.value).join(', ')}`);
  }
  sayAll(env, describeAgent(agent as AgentId | 'all'), '  ');

  // agy has only a global config, so its scope is fixed.
  let scope = prefill.scope;
  if (agent === 'agy') {
    scope = 'global';
    prompt.say('  Antigravity has only a global install, so the scope is global.');
  } else if (scope === undefined) {
    scope = await prompt.choose('Where should it be installed?', SCOPE_CHOICES, 'global');
  }
  if (scope !== undefined) sayAll(env, describeScope(scope as 'global' | 'project' | 'local'), '  ');
  const path = scope === 'project' || scope === 'local' ? (prefill.path ?? (await askFolder(env, 'Folder for this install'))) : undefined;

  const plugin = prefill.plugin ?? (await askProducts(env));
  const rows = rowsFor(env, plugin);
  prompt.say('What you chose:');
  sayAll(env, rows.map((row) => describeProduct(row)), '  ');
  const products = rows.map((row) => row.id);

  let allowWrites = prefill.allowWrites === true;
  let confirmation = prefill.confirmation;
  if (prefill.allowWrites === undefined) {
    allowWrites = await prompt.confirm('Allow write tools (changes such as sending, creating or deleting)? Each change still asks you first', false);
    if (allowWrites && confirmation === undefined) {
      confirmation = await prompt.choose('When should gsm ask before a change?', CONFIRM_CHOICES, 'every-change');
    }
  }
  sayAll(env, describeWrites(allowWrites, confirmation), '  ');
  if (agent === 'claude' && allowWrites) {
    prompt.say('  For Claude Code, the write and confirmation settings are passed to the plugin as its options (claude plugin install --config).');
  }

  const agents = agentsOf(agent);
  const needGit = agents.includes('claude') && marketplaceNeedsGit(undefined, checkoutRootFor(env.roots));
  const requirements = await requirementsStep(env, agents, needGit);
  if (requirements === null) return 0;

  prompt.say('What this will do:');
  sayAll(env, describeInstallSteps(agents, products, scope as 'global' | 'project' | 'local'), '  ');

  const args = ['install', '--agent', agent, '--plugin', plugin, '--scope', scope ?? 'global'];
  if (path !== undefined) args.push('--path', path);
  if (allowWrites) args.push('--allow-writes');
  if (confirmation !== undefined) args.push('--confirmation', confirmation);
  if (requirements.installMissing) args.push('--install-missing');

  showCommand(env, args);
  prompt.say('Preview (nothing is written):');
  await env.run([...args, '--dry-run']);
  if (!(await prompt.confirm('Install now?', true))) {
    prompt.say('Nothing was installed.');
    return 0;
  }
  const code = await env.run(args);
  if (code === 0) {
    prompt.say('');
    prompt.say('Next: the servers need a sign-in for their Google groups:');
    sayAll(env, describeNeededLogins([...new Set(rows.map((row) => row.group as CliGroup))]), '  ');
    prompt.say('Restart the agent so it loads the new servers.');
  }
  return code;
}

/** Uninstall: one recorded install, or everything gsm installed. The products to remove are picked, then a preview. */
export async function guidedUninstall(env: GuidedEnv): Promise<number> {
  const { prompt } = env;
  const records: InstallRecord[] = readInstalls(env.home);
  if (records.length === 0) {
    prompt.say(`gsm has no installs recorded in ${env.home}. Nothing to uninstall.`);
    return 0;
  }

  const choices: Choice<string>[] = [
    { value: 'all', label: 'Everything gsm installed', hint: `${records.length} recorded install${records.length === 1 ? '' : 's'}, every agent and scope` },
    ...records.map((record, index) => ({
      value: String(index),
      label: `${record.agent}, ${record.scope}${record.folder ? ` at ${record.folder}` : ''}`,
      hint: record.products.join(', '),
    })),
  ];
  const picked = await prompt.choose('What do you want to uninstall?', choices);

  if (picked === 'all') {
    prompt.say('This removes gsm\'s own entries from every recorded install. The logins, the OAuth client and the other agents stay.');
    await env.run(['uninstall', '--all', '--dry-run']);
    if (!(await prompt.confirm('Remove every install listed above? Logins are kept.', false))) {
      prompt.say('Nothing was removed.');
      return 0;
    }
    return env.run(['uninstall', '--all', '--yes']);
  }

  const record = records[Number(picked)];
  if (record === undefined) throw new UsageError('that install is not in the record any more');
  prompt.say('Removing gsm\'s entries from this install:');
  sayAll(env, describeAgent(record.agent), '  ');
  const products = await prompt.pick(
    'Which products to remove from this install?',
    record.products.map((id) => ({ value: id, label: id })),
    record.products,
  );
  const args = ['uninstall', '--agent', record.agent, '--plugin', products.join(','), '--scope', record.scope];
  if (record.folder) args.push('--path', record.folder);

  showCommand(env, args);
  prompt.say('Preview (nothing is removed):');
  await env.run([...args, '--dry-run']);
  if (!(await prompt.confirm('Remove these entries now? Logins are kept.', true))) {
    prompt.say('Nothing was removed.');
    return 0;
  }
  return env.run(args);
}

/** Sign in: a group's client file, then its login. API keys and the admin setup are typed here too. */
export async function guidedSignIn(env: GuidedEnv): Promise<number> {
  const { prompt } = env;
  const group = await prompt.choose('Which group do you want to set up?', GROUP_CHOICES);
  sayAll(env, describeLogin(group), '  ');

  if (group === 'apikey') {
    let force = false;
    if (env.apiKeySaved) force = await prompt.confirm('An API key is already saved. Replace it?', false);
    if (env.apiKeySaved && !force) return 0;
    const key = await prompt.secret('API key');
    if (key === '') throw new UsageError('no key was typed. Nothing was saved.');
    return env.saveApiKey(key, force);
  }

  if (group === 'workspace-admin') {
    let subject = '';
    while (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) {
      subject = (await prompt.ask('Super admin email (the Workspace admin that gsm acts as)')).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) prompt.say('That is not an email address.');
    }
    const keyFile = await askFile(env, 'Path to the service account JSON key file');
    const profile = await prompt.choose('Which access profile?', PROFILE_CHOICES, 'readonly');
    const args = ['setup-admin', '--subject', subject, '--key-file', keyFile, '--profile', profile];
    showCommand(env, args);
    return env.run(args);
  }

  if (!existsSync(env.clientSecretFile)) {
    prompt.say('This group needs the OAuth desktop client once. Give the path of the downloaded JSON file here, and gsm saves it in your token folder.');
    const file = await askFile(env, 'Path to the client_secret.json file');
    const setup = ['setup-client', file];
    showCommand(env, setup);
    const saved = await env.run(setup);
    if (saved !== 0) return saved;
  }

  const profile = await prompt.choose('Which access profile?', PROFILE_CHOICES, 'readonly');
  const openBrowser = await prompt.confirm('Open the browser to sign in now?', true);
  const args = ['login', group, '--profile', profile];
  if (!openBrowser) args.push('--no-browser');
  showCommand(env, args);
  prompt.say('Approve the sign-in in the browser. Restart the agent afterwards so the servers load the new scopes.');
  return env.run(args);
}

/** Sign out: removes one group's stored login. The OAuth client and the other groups are kept. */
export async function guidedSignOut(env: GuidedEnv): Promise<number> {
  const group = await env.prompt.choose('Which group do you want to sign out of?', GROUP_CHOICES);
  if (!(await env.prompt.confirm(`Remove the stored login for ${group}?`, false))) {
    env.prompt.say('Nothing was removed.');
    return 0;
  }
  return env.run(['logout', group]);
}

/** Browse: the APIs of a product, or the methods of one API (with optional filters). */
export async function guidedBrowse(env: GuidedEnv): Promise<number> {
  const { prompt } = env;
  const what = await prompt.choose('What do you want to see?', [
    { value: 'apis', label: 'The APIs of a product, or of the whole catalog' },
    { value: 'methods', label: 'The methods of one API' },
  ]);
  const search = (await prompt.ask('Filter by text, or empty for none')).trim();
  if (what === 'apis') {
    const product = (await prompt.ask('Product id, or empty for the whole catalog')).trim();
    const args = ['apis'];
    if (product !== '') args.push(product);
    if (search !== '') args.push('--search', search);
    showCommand(env, args);
    return env.run(args);
  }
  const api = (await prompt.ask('API name (run "apis" to see the names), for example drive')).trim();
  if (api === '') throw new UsageError('an API name is needed');
  const version = (await prompt.ask('Version, or empty for the default')).trim();
  const args = ['methods', api];
  if (version !== '') args.push(version);
  if (search !== '') args.push('--search', search);
  showCommand(env, args);
  return env.run(args);
}

/** Scopes: the scopes of one group for each profile. */
export async function guidedScopes(env: GuidedEnv): Promise<number> {
  const group = await env.prompt.choose('Which group?', GROUP_CHOICES);
  const profile = await env.prompt.choose('Which profile?', PROFILE_CHOICES, 'readonly');
  const args = ['scopes', group, '--profile', profile];
  showCommand(env, args);
  return env.run(args);
}

/** The menu. It loops until the user quits, and a flow that fails is reported, not fatal. */
export async function runMenu(env: GuidedEnv): Promise<number> {
  const { prompt } = env;
  prompt.say('Google services MCP suite. Choose an action. Ctrl+C stops at any question, and nothing is changed until you confirm.');
  for (;;) {
    prompt.say('');
    const action = await prompt.choose('What do you want to do?', MENU, 'install');
    if (action === 'quit') return 0;
    prompt.say(ACTION_TEXT[action] ?? '');
    try {
      await runAction(env, action);
    } catch (err) {
      prompt.say(`Stopped: ${(err as Error).message}`);
    }
  }
}

async function runAction(env: GuidedEnv, action: MenuAction): Promise<number> {
  switch (action) {
    case 'install':
      return guidedInstall(env);
    case 'uninstall':
      return guidedUninstall(env);
    case 'signin':
      return guidedSignIn(env);
    case 'signout':
      return guidedSignOut(env);
    case 'browse':
      return guidedBrowse(env);
    case 'scopes':
      return guidedScopes(env);
    case 'list':
      return env.run(['list']);
    case 'status':
      return env.run(['status']);
    case 'products':
      return env.run(['products']);
    case 'doctor':
      return env.run(['doctor']);
    case 'version':
      return env.run(['version']);
    case 'help':
      return env.run(['--help']);
    case 'quit':
      return 0;
  }
}

export { GROUP_CHOICES, AGENT_CHOICES, SCOPE_CHOICES, PROFILE_CHOICES, CONFIRM_CHOICES, MENU };
