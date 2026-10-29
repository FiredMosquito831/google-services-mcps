/**
 * OpenCode adapter (opencode.json).
 *
 * Locations: global <home>/.config/opencode/opencode.json; project and local <folder>/opencode.json, where the folder
 * is --path or the current folder. OpenCode has no separate local file, so project and local are the same file.
 *
 * Entries: mcp["gsm-<name>"] = { type: "local", command: ["node", "<absolute .mjs>"],
 * environment?: { GSM_ALLOW_WRITES: "true", GSM_CONFIRMATION: "<mode>", GSM_TOOLSET: "<toolset>" }, enabled: true }.
 * environment holds only the keys whose flags were given (--allow-writes, --confirmation, --toolset).
 * The schema is {"$schema": "https://opencode.ai/config.json", "mcp": {...}}.
 * A new file gets $schema. An existing file never gets it added.
 *
 * JSON only: a file with comments or trailing commas (JSONC) is refused.
 * Every other key keeps its value and position. Uninstall removes only the exact
 * gsm- keys it would install. When that removal leaves "mcp" empty, the empty object goes too, so an
 * install followed by an uninstall leaves the file as it was.
 */
import { join } from 'node:path';
import { readText, commitChanges } from '../fsutil.js';
import { scopeFolder } from '../paths.js';
import { planJsonMap } from './json-map.js';
import { envObject, serverEnvironment, type EnvPairs } from '../settings.js';
import { SERVER_PREFIX, type AdapterContext, type AdapterResult } from '../types.js';

const SCHEMA_URL = 'https://opencode.ai/config.json';

/** Global: <home>/.config/opencode/opencode.json. Project and local: <folder>/opencode.json (the same file for both). */
export function opencodeConfigPath(ctx: AdapterContext): string {
  if (ctx.scope === 'global') return join(ctx.home, '.config', 'opencode', 'opencode.json');
  return join(scopeFolder(ctx.pathArg, ctx.cwd), 'opencode.json');
}

export function opencodeEntry(serverFile: string, env: EnvPairs): Record<string, unknown> {
  return {
    type: 'local',
    command: ['node', serverFile],
    ...(env.length > 0 ? { environment: envObject(env) } : {}),
    enabled: true,
  };
}

export async function install(ctx: AdapterContext): Promise<AdapterResult> {
  const file = opencodeConfigPath(ctx);
  const set = new Map<string, unknown>();
  for (const server of ctx.servers) {
    const env = serverEnvironment(ctx.allowWrites, ctx.confirmation, ctx.toolset);
    set.set(`${SERVER_PREFIX}${server.name}`, opencodeEntry(ctx.serverFile(server), env));
  }
  const change = planJsonMap({
    file,
    before: readText(file),
    containerKey: 'mcp',
    template: { $schema: SCHEMA_URL },
    set,
  });
  const notes: string[] = [];
  if (ctx.scope !== 'global' && ctx.scope !== 'project') {
    notes.push('OpenCode does not separate local from project: --scope local writes the same opencode.json as --scope project.');
  }
  if (ctx.allowWrites) notes.push('GSM_ALLOW_WRITES=true is set: write tools are enabled for these servers.');
  if (ctx.confirmation !== undefined) notes.push(`GSM_CONFIRMATION=${ctx.confirmation} is set for these servers.`);
  if (ctx.toolset !== undefined) notes.push(`GSM_TOOLSET=${ctx.toolset} is set for these servers.`);
  return {
    agent: 'opencode',
    action: 'install',
    changes: [change],
    commands: [],
    backups: ctx.dryRun ? [] : commitChanges([change]),
    notes,
    errors: [],
  };
}

export async function uninstall(ctx: AdapterContext): Promise<AdapterResult> {
  const file = opencodeConfigPath(ctx);
  const change = planJsonMap({
    file,
    before: readText(file),
    containerKey: 'mcp',
    template: { $schema: SCHEMA_URL },
    remove: ctx.servers.map((s) => `${SERVER_PREFIX}${s.name}`),
    dropEmptyContainer: true,
  });
  const notes: string[] = [];
  if (change.removed.length === 0) notes.push('no gsm entries found in this scope; nothing to remove');
  return {
    agent: 'opencode',
    action: 'uninstall',
    changes: [change],
    commands: [],
    backups: ctx.dryRun ? [] : commitChanges([change]),
    notes,
    errors: [],
  };
}
