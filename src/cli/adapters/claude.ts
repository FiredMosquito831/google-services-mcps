/**
 * Claude Code adapter. It drives the official `claude plugin` CLI and never edits Claude's settings files.
 *
 * Global (--scope global, which is user scope):
 *   install:   claude plugin marketplace list --json
 *              claude plugin marketplace add <source> --scope user   (only if google-services-mcps is not registered)
 *              claude plugin install <plugin>@google-services-mcps --scope user [--config allow_writes=true] [--config confirmation=<mode>]
 *   uninstall: claude plugin uninstall <plugin>@google-services-mcps --scope user [--keep-data]
 *
 * Project and local (--scope project or local, with --path or the current folder):
 *   install:   claude plugin marketplace add <source> --scope project|local   (every time: repeating it is safe)
 *              claude plugin install <plugin>@google-services-mcps --scope project|local [--config ...]
 *   The marketplace is declared in the same scope as the plugin. In a project, that puts it in .claude/settings.json next to
 *   the plugin's enabledPlugins entry, so a teammate who clones the project gets both (see the Claude Code docs, "Install and
 *   manage plugins", and "Settings files and precedence").
 *
 * <source> is --marketplace when given, else the repo checkout (only when it is a git checkout), else
 * FiredMosquito831/google-services-mcps on GitHub. Every call goes through ctx.run with shell: false and an argument array.
 * On Windows the program is tried as "claude", then "claude.cmd". Dry-run only plans.
 *
 * --allow-writes, --confirmation and --toolset are Claude Code plugin options (allow_writes, confirmation, toolset). They
 * are passed to the install as --config key=value, each only when given. Options that are not given keep their values; `claude plugin configure <plugin>` shows them.
 */
import { displayCommand } from '../exec.js';
import { scopeFolder } from '../paths.js';
import {
  MARKETPLACE_NAME,
  MARKETPLACE_SOURCE,
  type AdapterContext,
  type AdapterResult,
  type RunResult,
  type Scope,
} from '../types.js';

/** global -> user; project -> project; local -> local. The alias folder reads as local. */
export function claudeScopeFlag(scope: Scope): string {
  if (scope === 'global') return 'user';
  if (scope === 'project') return 'project';
  return 'local';
}

export function claudePluginId(plugin: string): string {
  return `${plugin}@${MARKETPLACE_NAME}`;
}

/** Parses `claude plugin marketplace list --json` and returns the registered names. */
export function registeredMarketplaces(stdout: string): string[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error('unexpected output from `claude plugin marketplace list --json`');
  return parsed.map((entry) => {
    const name = typeof entry === 'object' && entry !== null ? (entry as { name?: unknown }).name : undefined;
    return typeof name === 'string' ? name : '';
  });
}

/** Runs claude, falling back from "claude" to "claude.cmd" when the first name cannot be started. */
export async function runClaude(ctx: AdapterContext, args: readonly string[], cwd: string): Promise<RunResult> {
  const names = ctx.platform === 'win32' ? ['claude', 'claude.cmd'] : ['claude'];
  let lastError: unknown;
  for (const name of names) {
    try {
      return await ctx.run(name, args, cwd);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'EINVAL') throw err;
      lastError = err;
    }
  }
  throw new Error(
    `could not start claude (tried ${names.join(', ')}): ${(lastError as Error).message}. Install Claude Code or add it to PATH.`,
  );
}

/** The marketplace source for `claude plugin marketplace add`: --marketplace, else the checkout, else GitHub. */
export function marketplaceSourceFor(ctx: Pick<AdapterContext, 'marketplace' | 'repoRoot'>): string {
  return ctx.marketplace ?? ctx.repoRoot ?? MARKETPLACE_SOURCE;
}

/** The plugin options that gsm sets on install, as --config pairs. Only the ones the user gave are sent. */
export function configArgs(ctx: Pick<AdapterContext, 'allowWrites' | 'confirmation' | 'toolset'>): string[] {
  const pairs: string[] = [];
  if (ctx.allowWrites) pairs.push('allow_writes=true');
  if (ctx.confirmation !== undefined) pairs.push(`confirmation=${ctx.confirmation}`);
  if (ctx.toolset !== undefined) pairs.push(`toolset=${ctx.toolset}`);
  return pairs.flatMap((pair) => ['--config', pair]);
}

function marketplaceAddArgs(source: string, scopeFlag: string): string[] {
  return ['plugin', 'marketplace', 'add', source, '--scope', scopeFlag];
}

/**
 * Declares the marketplace for the install. Global: once, in user settings (checked first, so it is not cloned again).
 * Project and local: in that scope's settings, every time, because a repeated add reports that it is already declared.
 * Returns false when the install must stop.
 */
async function ensureMarketplace(ctx: AdapterContext, cwd: string, result: AdapterResult): Promise<boolean> {
  const source = marketplaceSourceFor(ctx);
  const scopeFlag = claudeScopeFlag(ctx.scope);
  const addArgs = marketplaceAddArgs(source, scopeFlag);
  const listArgs = ['plugin', 'marketplace', 'list', '--json'];

  if (ctx.scope !== 'global' && ctx.marketplace === undefined && ctx.repoRoot !== undefined && source === ctx.repoRoot) {
    result.notes.push(
      `the marketplace is this folder (${source}), so the ${scopeFlag} settings record that path. Commit them only if teammates have the same path, or install with --marketplace FiredMosquito831/google-services-mcps to record the GitHub source.`,
    );
  }

  if (ctx.scope !== 'global') {
    result.commands.push(displayCommand('claude', addArgs));
    if (ctx.dryRun) {
      result.notes.push(`the marketplace is declared in ${scopeFlag} settings; repeating the add is safe`);
      return true;
    }
    const add = await runClaude(ctx, addArgs, cwd);
    if (add.code !== 0) {
      result.errors.push(`claude plugin marketplace add failed: ${(add.stderr || add.stdout).trim()}`);
      return false;
    }
    result.notes.push(`marketplace ${MARKETPLACE_NAME} is declared in ${scopeFlag} settings`);
    return true;
  }

  if (ctx.dryRun) {
    result.commands.push(displayCommand('claude', listArgs));
    result.commands.push(displayCommand('claude', addArgs));
    result.notes.push(`marketplace add runs only if ${MARKETPLACE_NAME} is not registered yet (source: ${source})`);
    return true;
  }

  const list = await runClaude(ctx, listArgs, cwd);
  if (list.code !== 0) {
    result.errors.push(`claude plugin marketplace list failed: ${(list.stderr || list.stdout).trim()}`);
    return false;
  }
  if (registeredMarketplaces(list.stdout).includes(MARKETPLACE_NAME)) {
    result.notes.push(`marketplace ${MARKETPLACE_NAME} is already registered`);
    return true;
  }
  result.commands.push(displayCommand('claude', addArgs));
  const add = await runClaude(ctx, addArgs, cwd);
  if (add.code !== 0) {
    result.errors.push(`claude plugin marketplace add failed: ${(add.stderr || add.stdout).trim()}`);
    return false;
  }
  return true;
}

async function run(ctx: AdapterContext, action: 'install' | 'uninstall'): Promise<AdapterResult> {
  const result: AdapterResult = { agent: 'claude', action, changes: [], commands: [], backups: [], notes: [], errors: [] };
  // Global runs from the current folder; project and local run inside the folder, which the claude CLI reads from its cwd.
  const cwd = ctx.scope === 'global' ? ctx.cwd : scopeFolder(ctx.pathArg, ctx.cwd);
  const scopeFlag = claudeScopeFlag(ctx.scope);
  if (ctx.scope === 'project') result.notes.push(`project scope: written to ${cwd}/.claude/settings.json by Claude Code`);
  if (ctx.scope === 'local') result.notes.push(`local scope: written to ${cwd}/.claude/settings.local.json by Claude Code`);

  if (action === 'install') {
    const ready = await ensureMarketplace(ctx, cwd, result);
    if (!ready) return result;
  }

  const options = configArgs(ctx);
  for (const plugin of ctx.plugins) {
    const extra = action === 'uninstall' && ctx.keepData ? ['--keep-data'] : [];
    const args =
      action === 'install'
        ? ['plugin', 'install', claudePluginId(plugin), '--scope', scopeFlag, ...options]
        : ['plugin', 'uninstall', claudePluginId(plugin), '--scope', scopeFlag, ...extra];
    const shown = displayCommand('claude', args);
    result.commands.push(shown);
    if (ctx.dryRun) continue;
    try {
      const outcome = await runClaude(ctx, args, cwd);
      if (outcome.code !== 0) result.errors.push(`${shown} exited ${outcome.code}: ${(outcome.stderr || outcome.stdout).trim()}`);
    } catch (err) {
      result.errors.push(`${shown}: ${(err as Error).message}`);
    }
  }

  if (action === 'install') {
    const set = configArgs(ctx);
    if (set.length > 0) {
      const pairs = set.filter((_, index) => index % 2 === 1).join(', ');
      result.notes.push(`plugin options set: ${pairs}`);
    }
    result.notes.push(
      `other plugin options keep their values. See them with: claude plugin configure ${ctx.plugins.map(claudePluginId).join(' ')}`,
    );
  }
  return result;
}

export function install(ctx: AdapterContext): Promise<AdapterResult> {
  return run(ctx, 'install');
}

export function uninstall(ctx: AdapterContext): Promise<AdapterResult> {
  return run(ctx, 'uninstall');
}
