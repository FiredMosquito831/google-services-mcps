/** Shared types and constants for the gsm installer and login CLI. */

export const AGENTS = ['claude', 'codex', 'opencode', 'agy'] as const;
export type AgentId = (typeof AGENTS)[number];

export const PLUGINS = ['google-cloud', 'google-workspace', 'google-search', 'google-business'] as const;
export type PluginId = (typeof PLUGINS)[number];

export const SCOPES = ['global', 'project', 'folder'] as const;
export type Scope = (typeof SCOPES)[number];

/** Name of the Claude marketplace, and the suffix of every plugin install id. */
export const MARKETPLACE_NAME = 'google-services-mcps';

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
  /** Current working directory; the project scope root. */
  cwd: string;
  scope: Scope;
  /** Absolute folder for folder scope. */
  pathArg?: string;
  /** The plugin folder when running from a bundled plugin (plugin layout). */
  pluginRoot?: string;
  /** The marketplace root (the repo checkout), when known. */
  repoRoot?: string;
  /** Plugin ids to install or uninstall (used by the claude adapter). */
  plugins: string[];
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
