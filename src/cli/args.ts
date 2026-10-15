import { parseArgs } from 'node:util';
import { AGENTS, PLUGINS, SCOPES, UsageError, type AgentId, type PluginId, type Scope } from './types.js';

export const LOGIN_GROUPS = ['cloud', 'workspace-user', 'searchconsole', 'business'] as const;
export const ALL_GROUPS = [...LOGIN_GROUPS, 'workspace-admin'] as const;
export type CliGroup = (typeof ALL_GROUPS)[number];

export type Command = 'install' | 'uninstall' | 'login' | 'setup-client' | 'status' | 'logout' | 'help';

type OptionType = 'string' | 'boolean';
const COMMANDS: Record<Exclude<Command, 'help'>, Record<string, OptionType>> = {
  install: { agent: 'string', plugin: 'string', scope: 'string', path: 'string', servers: 'string', 'allow-writes': 'boolean', 'dry-run': 'boolean', home: 'string' },
  uninstall: { agent: 'string', plugin: 'string', scope: 'string', path: 'string', servers: 'string', 'dry-run': 'boolean', home: 'string', 'keep-data': 'boolean' },
  login: { servers: 'string', 'client-secret': 'string' },
  'setup-client': { force: 'boolean' },
  status: {},
  logout: {},
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
    throw new UsageError((err as Error).message);
  }
  if (parsed.values.help === true) return { command: 'help', positionals: [], values: {} };
  // No option is declared `multiple`, so every value is a single string or boolean.
  return { command, positionals: parsed.positionals, values: parsed.values as ParsedArgs['values'] };
}

export interface InstallRequestArgs {
  agent: AgentId | 'all';
  plugin: PluginId | 'all';
  scope: Scope;
  pathArg?: string;
  servers?: string[];
  allowWrites: boolean;
  dryRun: boolean;
  home?: string;
  keepData: boolean;
}

function choice<T extends string>(value: string | boolean | undefined, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new UsageError(`--${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function splitList(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const names = [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) throw new UsageError('--servers needs at least one server name');
  return names;
}

/** Validates install and uninstall flags. `resolvePath` makes --path and --home absolute. */
export function parseInstallArgs(values: ParsedArgs['values'], command: 'install' | 'uninstall', resolvePath: (p: string) => string): InstallRequestArgs {
  for (const name of ['agent', 'plugin', 'scope'] as const) {
    if (values[name] === undefined) throw new UsageError(`--${name} is required`);
  }
  const agent = choice(values.agent, 'agent', [...AGENTS, 'all'] as const);
  const plugin = choice(values.plugin, 'plugin', [...PLUGINS, 'all'] as const);
  const scope = choice(values.scope, 'scope', SCOPES);

  let pathArg: string | undefined;
  if (scope === 'folder') {
    if (typeof values.path !== 'string') throw new UsageError('--scope folder needs --path <dir>');
    pathArg = resolvePath(values.path);
  } else if (values.path !== undefined) {
    throw new UsageError('--path is only valid with --scope folder');
  }

  const home = typeof values.home === 'string' ? resolvePath(values.home) : undefined;
  if (home !== undefined && agent === 'claude') {
    throw new UsageError('--home does not apply to claude: the claude CLI always uses your real Claude Code configuration');
  }

  return {
    agent,
    plugin,
    scope,
    pathArg,
    servers: splitList(values.servers),
    allowWrites: command === 'install' && values['allow-writes'] === true,
    dryRun: values['dry-run'] === true,
    home,
    keepData: command === 'uninstall' && values['keep-data'] === true,
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
