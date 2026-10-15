import { parseArgs } from 'node:util';
import { PROFILES, type Profile } from '../core/scopes.js';
import {
  AGENTS,
  AGY_GLOBAL_ONLY,
  CONFIRMATION_MODES,
  SCOPES,
  UsageError,
  canonicalScope,
  type AgentId,
  type ConfirmationMode,
  type PluginChoice,
  type Scope,
} from './types.js';

/** Groups with an OAuth token file (<group>.token.json). */
export const OAUTH_GROUPS = ['cloud', 'workspace-user', 'searchconsole', 'business', 'developer'] as const;
/** Groups that `gsm login` accepts. apikey has no login: `gsm login apikey` explains setup-apikey. */
export const LOGIN_GROUPS = [...OAUTH_GROUPS, 'apikey'] as const;
export const ALL_GROUPS = [...LOGIN_GROUPS, 'workspace-admin'] as const;
export type CliGroup = (typeof ALL_GROUPS)[number];

export type Command =
  | 'install'
  | 'uninstall'
  | 'list'
  | 'login'
  | 'setup-client'
  | 'setup-apikey'
  | 'status'
  | 'logout'
  | 'scopes'
  | 'setup-admin'
  | 'products'
  | 'apis'
  | 'methods'
  | 'doctor'
  | 'version'
  | 'help';

type OptionType = 'string' | 'boolean';
const COMMANDS: Record<Exclude<Command, 'help'>, Record<string, OptionType>> = {
  install: {
    agent: 'string',
    plugin: 'string',
    scope: 'string',
    path: 'string',
    servers: 'string',
    'allow-writes': 'boolean',
    confirmation: 'string',
    marketplace: 'string',
    'dry-run': 'boolean',
    home: 'string',
  },
  uninstall: {
    agent: 'string',
    plugin: 'string',
    scope: 'string',
    path: 'string',
    servers: 'string',
    all: 'boolean',
    yes: 'boolean',
    'dry-run': 'boolean',
    home: 'string',
    'keep-data': 'boolean',
  },
  list: { json: 'boolean', home: 'string' },
  login: { servers: 'string', 'client-secret': 'string', profile: 'string', scopes: 'string', 'no-browser': 'boolean', replace: 'boolean' },
  'setup-client': { force: 'boolean' },
  'setup-apikey': { force: 'boolean' },
  status: {},
  logout: {},
  scopes: { servers: 'string', profile: 'string', json: 'boolean' },
  'setup-admin': { subject: 'string', 'key-file': 'string', profile: 'string', servers: 'string', replace: 'boolean' },
  products: { json: 'boolean' },
  apis: { search: 'string', limit: 'string', json: 'boolean' },
  methods: { search: 'string', limit: 'string', json: 'boolean' },
  doctor: { plugin: 'string', 'token-dir': 'string' },
  version: {},
};

export interface ParsedArgs {
  command: Command;
  positionals: string[];
  values: Record<string, string | boolean | undefined>;
}

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const [first, ...rest] = argv;
  if (first === undefined || first === '--help' || first === '-h' || first === 'help') {
    return { command: 'help', positionals: [], values: {} };
  }
  if (!(first in COMMANDS)) throw new UsageError(`unknown command "${first}"`);
  const command = first as Exclude<Command, 'help'>;
  const options: Record<string, { type: OptionType }> = { help: { type: 'boolean' } };
  for (const [name, type] of Object.entries(COMMANDS[command])) options[name] = { type };

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: rest, options, allowPositionals: true, strict: true });
  } catch (err) {
    // parseArgs quotes the offending argument. For setup-apikey that argument may be the key itself, so it is not repeated.
    if (command === 'setup-apikey') {
      throw new UsageError('usage: node gsm.mjs setup-apikey [--force]. The key is read from GSM_API_KEY_INPUT or stdin, never from an argument.');
    }
    throw new UsageError((err as Error).message);
  }
  if (parsed.values.help === true) return { command: 'help', positionals: [], values: {} };
  // No option is declared `multiple`, so every value is a single string or boolean.
  return { command, positionals: parsed.positionals, values: parsed.values as ParsedArgs['values'] };
}

export interface InstallRequestArgs {
  agent: AgentId | 'all';
  plugin: PluginChoice;
  scope: Scope;
  /** Absolute --path, for project and local scope. Undefined means the current folder. */
  pathArg?: string;
  servers?: string[];
  allowWrites: boolean;
  /** --confirmation, install only. Undefined: nothing is written for it. */
  confirmation?: ConfirmationMode;
  /** --marketplace, install with claude only: owner/repo, a URL or a path. */
  marketplace?: string;
  dryRun: boolean;
  home?: string;
  keepData: boolean;
}

/** The usage lines of install and uninstall. A missing required flag prints them, with the valid values. */
export const INSTALL_USAGE = 'usage: node gsm.mjs install --agent <claude|codex|opencode|agy|all> --plugin <id,...|all> [--scope global|project|local] [--path <dir>] [--dry-run]';
export const UNINSTALL_USAGE =
  'usage: node gsm.mjs uninstall --agent <claude|codex|opencode|agy|all> --plugin <id,...|all> [--scope global|project|local] [--path <dir>] [--dry-run]\n' +
  '       node gsm.mjs uninstall --all [--dry-run] [--yes]';

/**
 * --scope: global (the default), project or local. `folder` is an alias of local, accepted with no warning.
 * Returns the scope name. Refuses any other value with the list of valid ones.
 */
export function parseScope(value: string | boolean | undefined): Scope {
  if (value === undefined) return 'global';
  return choice(typeof value === 'string' ? canonicalScope(value) : value, 'scope', SCOPES);
}

function choice<T extends string>(value: string | boolean | undefined, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`--${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function splitList(value: string | boolean | undefined, flag: string): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const names = [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) throw new UsageError(`--${flag} needs at least one value`);
  return names;
}

/**
 * --plugin: "all", or a comma list of product ids. Each id must be one of validIds, the
 * list read from the plugin's servers.json or from config/products.json. "all" cannot be mixed with ids.
 */
export function parsePluginChoice(value: string | boolean | undefined, validIds: readonly string[]): PluginChoice {
  const ids = splitList(value, 'plugin') ?? [];
  if (ids.length === 0) throw new UsageError('--plugin needs a product id or all');
  if (ids.includes('all')) {
    if (ids.length > 1) throw new UsageError('--plugin all cannot be combined with other plugin ids');
    return 'all';
  }
  const unknown = ids.filter((id) => !validIds.includes(id));
  if (unknown.length > 0) {
    const plural = unknown.length > 1 ? 's' : '';
    throw new UsageError(`unknown plugin id${plural} ${unknown.map((id) => `"${id}"`).join(', ')}. Valid plugin ids: ${validIds.join(', ')}, or all`);
  }
  return ids;
}

/**
 * Validates install and uninstall flags. `resolvePath` makes --path and --home absolute.
 * `validPluginIds` is the product list the caller read (see products.ts).
 */
export function parseInstallArgs(
  values: ParsedArgs['values'],
  command: 'install' | 'uninstall',
  resolvePath: (p: string) => string,
  validPluginIds: readonly string[],
): InstallRequestArgs {
  const usage = command === 'install' ? INSTALL_USAGE : UNINSTALL_USAGE;
  if (values.agent === undefined) {
    throw new UsageError(`--agent is required. Valid agents: ${[...AGENTS, 'all'].join(', ')}.\n${usage}`);
  }
  if (values.plugin === undefined) {
    throw new UsageError(`--plugin is required. Valid plugin ids: ${validPluginIds.join(', ')}, or all.\n${usage}`);
  }
  const agent = choice(values.agent, 'agent', [...AGENTS, 'all'] as const);
  const plugin = parsePluginChoice(values.plugin, validPluginIds);
  const scope = parseScope(values.scope);

  let pathArg: string | undefined;
  if (typeof values.path === 'string') {
    if (scope === 'global') throw new UsageError('--path is only used with --scope project or local (the folder to act on)');
    pathArg = resolvePath(values.path);
  }
  // agy has no verified project or local config file, so a named agy is refused here, before anything is written.
  if (agent === 'agy' && scope !== 'global') throw new UsageError(`${AGY_GLOBAL_ONLY}. Use --scope global.`);

  const home = typeof values.home === 'string' ? resolvePath(values.home) : undefined;
  if (home !== undefined && agent === 'claude') {
    throw new UsageError('--home does not apply to claude: the claude CLI always uses your real Claude Code configuration');
  }

  const confirmation = values.confirmation === undefined ? undefined : choice(values.confirmation, 'confirmation', CONFIRMATION_MODES);

  let marketplace: string | undefined;
  if (values.marketplace !== undefined) {
    if (command !== 'install') throw new UsageError('--marketplace applies only to install');
    if (typeof values.marketplace !== 'string' || values.marketplace.trim() === '') {
      throw new UsageError('--marketplace needs owner/repo, a git or https URL, or a path to the marketplace folder');
    }
    if (agent !== 'claude' && agent !== 'all') throw new UsageError('--marketplace applies only to --agent claude (or all)');
    marketplace = values.marketplace.trim();
  }

  return {
    agent,
    plugin,
    scope,
    pathArg,
    servers: splitList(values.servers, 'servers'),
    allowWrites: command === 'install' && values['allow-writes'] === true,
    confirmation: command === 'install' ? confirmation : undefined,
    marketplace,
    dryRun: values['dry-run'] === true,
    home,
    keepData: command === 'uninstall' && values['keep-data'] === true,
  };
}

/**
 * `gsm uninstall --all`: every install gsm made. It takes no --agent, --plugin, --scope, --path or --servers, so
 * those are refused here rather than ignored.
 */
export function parseUninstallAllArgs(values: ParsedArgs['values'], resolvePath: (p: string) => string): {
  dryRun: boolean;
  yes: boolean;
  keepData: boolean;
  home?: string;
} {
  for (const name of ['agent', 'plugin', 'scope', 'path', 'servers'] as const) {
    if (values[name] !== undefined) {
      throw new UsageError(`--all removes every gsm install and cannot be combined with --${name}. Use --all alone, or drop --all.`);
    }
  }
  return {
    dryRun: values['dry-run'] === true,
    yes: values.yes === true,
    keepData: values['keep-data'] === true,
    home: typeof values.home === 'string' ? resolvePath(values.home) : undefined,
  };
}

export function parseGroup(positionals: readonly string[], usage: string): CliGroup {
  if (positionals.length !== 1) throw new UsageError(usage);
  const group = positionals[0] ?? '';
  if (!(ALL_GROUPS as readonly string[]).includes(group)) {
    throw new UsageError(`unknown group "${group}". Groups: ${ALL_GROUPS.join(', ')}`);
  }
  return group as CliGroup;
}

/** --servers as a list of names, or undefined when not given. */
export function parseServers(values: ParsedArgs['values']): string[] | undefined {
  return splitList(values.servers, 'servers');
}

/** --limit: a whole number of at least 1, or undefined when not given. */
export function parseLimit(value: string | boolean | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new UsageError('--limit must be a whole number of at least 1');
  }
  return Number(value);
}

/** --search: some text to match, trimmed, or undefined when not given. */
export function parseSearch(value: string | boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError('--search needs some text to match');
  return value.trim();
}

/** --profile, or undefined when not given. */
export function parseProfile(value: string | boolean | undefined): Profile | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(PROFILES as readonly string[]).includes(value)) {
    throw new UsageError(`--profile must be one of: ${PROFILES.join(', ')}`);
  }
  return value as Profile;
}

/** The scope choice for gsm login: a profile (default readonly), or an exact list with --scopes. */
export interface LoginScopeChoice {
  profile: Profile | 'custom';
  customScopes?: string[];
}

export function parseLoginScopes(values: ParsedArgs['values']): LoginScopeChoice {
  if (values.profile !== undefined && values.scopes !== undefined) {
    throw new UsageError('use --profile or --scopes, not both. --scopes gives the exact scope list and adds nothing.');
  }
  if (values.scopes !== undefined) {
    const list = splitList(values.scopes, 'scopes') ?? [];
    for (const scope of list) {
      if (!scope.startsWith('https://')) {
        throw new UsageError(`--scopes takes full scope URLs, for example https://www.googleapis.com/auth/gmail.readonly. Got: ${scope}`);
      }
    }
    return { profile: 'custom', customScopes: list };
  }
  return { profile: parseProfile(values.profile) ?? 'readonly' };
}

/** Validates gsm setup-admin flags. The key file is checked later, when it is read. */
export function parseSetupAdminArgs(values: ParsedArgs['values']): {
  subject: string;
  keyFile: string;
  profile: Profile;
  servers?: string[];
  replace: boolean;
} {
  if (typeof values.subject !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.subject.trim())) {
    throw new UsageError('--subject must be the super admin email to impersonate, for example admin@example.com');
  }
  if (typeof values['key-file'] !== 'string' || values['key-file'].trim() === '') {
    throw new UsageError('--key-file must be the path to the service account JSON key');
  }
  return {
    subject: values.subject.trim(),
    keyFile: values['key-file'],
    profile: parseProfile(values.profile) ?? 'readonly',
    servers: parseServers(values),
    replace: values.replace === true,
  };
}
