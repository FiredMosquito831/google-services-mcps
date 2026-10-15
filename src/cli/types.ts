/** Shared types and constants for the gsm installer and login CLI. */

export const AGENTS = ['claude', 'codex', 'opencode', 'agy'] as const;
export type AgentId = (typeof AGENTS)[number];

/**
 * Plugin ids are product ids from config/products.json. The valid list is not fixed here: it is
 * read at run time from the plugin's own servers.json, or from config/products.json in the repo.
 */
export type PluginChoice = string[] | 'all';

/** Values of --confirmation. The servers read the same values from GSM_CONFIRMATION. */
export const CONFIRMATION_MODES = ['every-change', 'destructive-only', 'off'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

/**
 * global: the user-wide config. project: the project folder (cwd, or --path). local: only that folder, not shared.
 * `folder` is accepted on input as an alias of `local` (see canonicalScope). Adapters also accept it at run time.
 */
export const SCOPES = ['global', 'project', 'local'] as const;
export type Scope = (typeof SCOPES)[number];

/** Maps the accepted spelling of a scope to its name. Unknown values are returned unchanged. */
export function canonicalScope(value: string): string {
  return value === 'folder' ? 'local' : value;
}

/** The refusal for agy at project or local scope. Used by the flag parser and by the agy adapter, so the text matches. */
export const AGY_GLOBAL_ONLY = 'agy supports only --scope global: no project or local MCP config file is verified for agy';

/** Name of the Claude marketplace, and the suffix of every plugin install id. */
export const MARKETPLACE_NAME = 'google-services-mcps';

/** The marketplace source used when the installer is not run from a checkout and --marketplace is not given. */
export const MARKETPLACE_SOURCE = 'FiredMosquito831/google-services-mcps';

/** Managed block markers in Codex config.toml. Byte-identical across versions. */
export const CODEX_BEGIN = '# >>> google-services-mcps (managed by gsm) >>>';
export const CODEX_END = '# <<< google-services-mcps (managed by gsm) <<<';

/** Every config key or table this tool writes starts with this prefix. */
export const SERVER_PREFIX = 'gsm-';

/** The fields of a server that the installers need. Matches ServerSpec in core/registry. */
export interface ServerRef {
  name: string;
  plugin: string;
  group: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a program with an argument array and shell: false. Production uses
 * spawnRunner from exec.ts; tests inject a fake. Rejects with the spawn error
 * (code ENOENT when the program is not found).
 */
export type Runner = (command: string, args: readonly string[], cwd: string) => Promise<RunResult>;

export interface AdapterContext {
  /** User home directory (the default, or --home). */
  home: string;
  /** Current working directory. The folder for project and local scope when pathArg is not set. */
  cwd: string;
  scope: Scope;
  /** Absolute folder for project and local scope (--path, or the cwd when runInstall fills it in). Unused for global. */
  pathArg?: string;
  /** The plugin folder when running from a bundled plugin (plugin layout). */
  pluginRoot?: string;
  /** The marketplace root (the repo checkout), when known. */
  repoRoot?: string;
  /** Claude only: the marketplace source (--marketplace, or the checkout, or MARKETPLACE_SOURCE). */
  marketplace?: string;
  /** Plugin ids to install or uninstall (used by the claude adapter). */
  plugins: string[];
  /** --confirmation, when given on install. Undefined means nothing is written, so the plugin default applies. */
  confirmation?: ConfirmationMode;
  /** Servers to write (used by the config-file adapters). */
  servers: readonly ServerRef[];
  /** Absolute path of the bundled .mjs file for a server. */
  serverFile(server: ServerRef): string;
  dryRun: boolean;
  allowWrites: boolean;
  keepData: boolean;
  run: Runner;
  platform: NodeJS.Platform;
}

/** A planned edit to one config file. Nothing is written until commitChanges runs. */
export interface FileChange {
  file: string;
  /** Contents before the change, or null when the file does not exist yet. */
  before: string | null;
  /** Contents after the change, or null when there is nothing to write. */
  after: string | null;
  added: string[];
  updated: string[];
  removed: string[];
}

export interface AdapterResult {
  agent: AgentId;
  action: 'install' | 'uninstall';
  changes: FileChange[];
  /** Command lines (claude). In dry-run these are planned; otherwise they were run. */
  commands: string[];
  /** Backup files created while writing. Always empty in dry-run. */
  backups: string[];
  notes: string[];
  errors: string[];
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
