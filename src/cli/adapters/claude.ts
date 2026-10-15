/**
 * Claude Code adapter. It drives the official `claude plugin` CLI and never edits
 * Claude's settings files.
 *
 *   install:   claude plugin marketplace list --json
 *              claude plugin marketplace add <repoRoot>      (only if google-services-mcps is not registered)
 *              claude plugin install <plugin>@google-services-mcps --scope user|project|local
 *   uninstall: claude plugin uninstall <plugin>@google-services-mcps --scope ... [--keep-data]
 *
 * Scope mapping: global -> user, project -> project, folder -> local (run inside --path).
 * Every call goes through ctx.run with shell: false and an argument array. On
 * Windows the program is tried as "claude", then "claude.cmd". Dry-run only plans.
 *
 * --confirmation is not written here. It is the plugin user option "confirmation", which the user
 * sets with `claude plugin configure`; install prints that instruction as a note.
 */
import { displayCommand } from '../exec.js';
import {
  MARKETPLACE_NAME,
  type AdapterContext,
  type AdapterResult,
  type RunResult,
  type Scope,
} from '../types.js';
import { folderDir } from '../paths.js';

const SCOPE_FLAG: Record<Scope, string> = { global: 'user', project: 'project', folder: 'local' };

export function claudeScopeFlag(scope: Scope): string {
  return SCOPE_FLAG[scope];
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

function marketplaceAddArgs(repoRoot: string): string[] {
  return ['plugin', 'marketplace', 'add', repoRoot];
}

/** Ensures the marketplace is registered. Returns false when the install must stop. */
async function ensureMarketplace(ctx: AdapterContext, cwd: string, result: AdapterResult): Promise<boolean> {
  const listArgs = ['plugin', 'marketplace', 'list', '--json'];
  if (ctx.dryRun) {
    result.commands.push(displayCommand('claude', listArgs));
    if (ctx.repoRoot) {
      result.commands.push(displayCommand('claude', marketplaceAddArgs(ctx.repoRoot)));
      result.notes.push(`marketplace add runs only if ${MARKETPLACE_NAME} is not registered yet`);
    } else {
      result.notes.push(
        `repo checkout not found from here; if ${MARKETPLACE_NAME} is not registered, run gsm from the repo checkout`,
      );
    }
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
  if (!ctx.repoRoot) {
    result.errors.push(
      `marketplace ${MARKETPLACE_NAME} is not registered, and the repo checkout was not found. Run gsm from the repo checkout once.`,
    );
    return false;
  }
  const addArgs = marketplaceAddArgs(ctx.repoRoot);
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
  const cwd = ctx.scope === 'folder' ? folderDir(ctx.pathArg) : ctx.cwd;
  const scopeFlag = claudeScopeFlag(ctx.scope);
  if (ctx.scope === 'folder') result.notes.push(`local scope: applies only inside ${cwd}`);

  if (action === 'install') {
    const ready = await ensureMarketplace(ctx, cwd, result);
    if (!ready) return result;
  }

  for (const plugin of ctx.plugins) {
    const extra = action === 'uninstall' && ctx.keepData ? ['--keep-data'] : [];
    const args =
      action === 'install'
        ? ['plugin', 'install', claudePluginId(plugin), '--scope', scopeFlag]
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

  if (action === 'install' && ctx.confirmation !== undefined) {
    const ids = ctx.plugins.map(claudePluginId).join(', ');
    result.notes.push(
      `confirmation is a plugin user option, so gsm does not write it. Set the option "confirmation" to ${ctx.confirmation} with claude plugin configure (plugins: ${ids}).`,
    );
  }
  if (action === 'install' && !ctx.dryRun && result.errors.length === 0) {
    result.notes.push('restart Claude Code (or start a new session) to load the plugins');
  }
  return result;
}

export function install(ctx: AdapterContext): Promise<AdapterResult> {
  return run(ctx, 'install');
}

export function uninstall(ctx: AdapterContext): Promise<AdapterResult> {
  return run(ctx, 'uninstall');
}
