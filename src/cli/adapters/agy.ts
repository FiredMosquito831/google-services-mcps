/**
 * Google Antigravity CLI (agy) adapter. GLOBAL SCOPE ONLY in this build.
 *
 * Findings from read-only checks on this machine (agy.exe at
 * <your user folder>\AppData\Local\agy\bin\agy.exe):
 *  - `agy --help` lists the subcommand `mcp` (add, remove, list, enable, disable).
 *    `agy mcp add --help` documents no config path and no project or scope option.
 *    No project-level MCP config is documented, so project and folder scope are refused.
 *  - The brief's path <home>/.gemini/antigravity-cli/mcp_config.json does NOT exist
 *    (that folder exists, but has no mcp_config.json). The file agy actually reads is
 *    <home>/.gemini/config/mcp_config.json: `agy mcp list` shows the "ase-moodle"
 *    server, and its entry is in that file. Its top-level key is "mcpServers", and each
 *    entry has the keys command, args and disabled. This adapter writes that file.
 *  - NOT verified end to end: that agy loads entries that gsm writes. Check with
 *    `agy mcp list` after an install. The "env" key used for --allow-writes is assumed
 *    from `agy mcp add --env`.
 *
 * Entries: mcpServers["gsm-<name>"] = { command: "node", args: ["<absolute .mjs>"], disabled: false }
 * (plus env with GSM_ALLOW_WRITES: "true" for --allow-writes and GSM_CONFIRMATION for --confirmation,
 * each only when its flag is given). Other keys are preserved.
 * Uninstall removes only the exact gsm- keys it installs. An empty "mcpServers"
 * object is left in place (same reasoning as OpenCode).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readText, commitChanges } from '../fsutil.js';
import { planJsonMap } from './json-map.js';
import { envObject, serverEnvironment, type EnvPairs } from '../settings.js';
import { SERVER_PREFIX, type AdapterContext, type AdapterResult } from '../types.js';

export function agyConfigDir(home: string): string {
  return join(home, '.gemini', 'config');
}

export function agyConfigPath(home: string): string {
  return join(agyConfigDir(home), 'mcp_config.json');
}

function agyEntry(serverFile: string, env: EnvPairs): Record<string, unknown> {
  return {
    command: 'node',
    args: [serverFile],
    disabled: false,
    ...(env.length > 0 ? { env: envObject(env) } : {}),
  };
}

function assertGlobal(ctx: AdapterContext): void {
  if (ctx.scope !== 'global') throw new Error('agy supports only global scope in this build');
}

export async function install(ctx: AdapterContext): Promise<AdapterResult> {
  assertGlobal(ctx);
  const dir = agyConfigDir(ctx.home);
  const folderExists = existsSync(dir);
  // A real install stops until agy has created its folder. A dry run plans the change and reports that stop.
  if (!folderExists && !ctx.dryRun) {
    throw new Error(`agy config folder not found: ${dir}. Run agy once so it creates its folder, then retry.`);
  }
  const file = agyConfigPath(ctx.home);
  const set = new Map<string, unknown>();
  const env = serverEnvironment(ctx.allowWrites, ctx.confirmation);
  for (const server of ctx.servers) {
    set.set(`${SERVER_PREFIX}${server.name}`, agyEntry(ctx.serverFile(server), env));
  }
  const change = planJsonMap({ file, before: readText(file), containerKey: 'mcpServers', template: {}, set });
  const changed = change.before !== change.after;
  const notes = ['Verify with: agy mcp list (the gsm- servers should be listed).'];
  if (!folderExists) notes.push(`agy config folder not found (${dir}). A real install stops until agy has run once and created it.`);
  if (changed) notes.push('Restart agy to load the servers.');
  if (ctx.allowWrites) notes.push('GSM_ALLOW_WRITES=true is set: write tools are enabled for these servers.');
  if (ctx.confirmation !== undefined) notes.push(`GSM_CONFIRMATION=${ctx.confirmation} is set for these servers.`);
  return {
    agent: 'agy',
    action: 'install',
    changes: [change],
    commands: [],
    backups: ctx.dryRun ? [] : commitChanges([change]),
    notes,
    errors: [],
  };
}

export async function uninstall(ctx: AdapterContext): Promise<AdapterResult> {
  assertGlobal(ctx);
  const dir = agyConfigDir(ctx.home);
  if (!existsSync(dir)) {
    return {
      agent: 'agy',
      action: 'uninstall',
      changes: [],
      commands: [],
      backups: [],
      notes: [`agy config folder not found (${dir}); nothing to remove`],
      errors: [],
    };
  }
  const file = agyConfigPath(ctx.home);
  const change = planJsonMap({
    file,
    before: readText(file),
    containerKey: 'mcpServers',
    template: {},
    remove: ctx.servers.map((s) => `${SERVER_PREFIX}${s.name}`),
  });
  return {
    agent: 'agy',
    action: 'uninstall',
    changes: [change],
    commands: [],
    backups: ctx.dryRun ? [] : commitChanges([change]),
    notes: change.removed.length === 0 ? ['no gsm entries found in this scope; nothing to remove'] : [],
    errors: [],
  };
}
