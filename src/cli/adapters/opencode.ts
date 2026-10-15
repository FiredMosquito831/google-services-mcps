/**
 * OpenCode adapter (opencode.json).
 *
 * Locations: global <home>/.config/opencode/opencode.json, project <cwd>/opencode.json,
 * folder <path>/opencode.json.
 *
 * Entries: mcp["gsm-<name>"] = { type: "local", command: ["node", "<absolute .mjs>"],
 * environment?: { GSM_ALLOW_WRITES: "true", GSM_CONFIRMATION: "<mode>" }, enabled: true }.
 * environment holds only the keys whose flags were given (--allow-writes, --confirmation).
 * The schema is {"$schema": "https://opencode.ai/config.json", "mcp": {...}}.
 * A new file gets $schema. An existing file never gets it added.
 *
 * JSON only: a file with comments or trailing commas (JSONC) is refused.
 * Every other key keeps its value and position. Uninstall removes only the exact
 * gsm- keys it would install. An empty "mcp" object is left in place, because
 * gsm cannot tell whether it created that object, and an empty object has no effect.
 */
import { join } from 'node:path';
import { readText, commitChanges } from '../fsutil.js';
import { folderDir } from '../paths.js';
import { planJsonMap, isPlainObject } from './json-map.js';
import { envObject, serverEnvironment, type EnvPairs } from '../settings.js';
import { SERVER_PREFIX, type AdapterContext, type AdapterResult } from '../types.js';

const SCHEMA_URL = 'https://opencode.ai/config.json';

export function opencodeConfigPath(ctx: AdapterContext): string {
  switch (ctx.scope) {
    case 'global':
      return join(ctx.home, '.config', 'opencode', 'opencode.json');
    case 'project':
      return join(ctx.cwd, 'opencode.json');
    case 'folder':
      return join(folderDir(ctx.pathArg), 'opencode.json');
  }
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
    const env = serverEnvironment(ctx.allowWrites, ctx.confirmation);
    set.set(`${SERVER_PREFIX}${server.name}`, opencodeEntry(ctx.serverFile(server), env));
  }
  const change = planJsonMap({
    file,
    before: readText(file),
    containerKey: 'mcp',
    template: { $schema: SCHEMA_URL },
    set,
  });
  const changed = change.before !== change.after;
  const notes = changed ? ['Restart OpenCode to load the servers.'] : [];
  if (ctx.allowWrites) notes.push('GSM_ALLOW_WRITES=true is set: write tools are enabled for these servers.');
  if (ctx.confirmation !== undefined) notes.push(`GSM_CONFIRMATION=${ctx.confirmation} is set for these servers.`);
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
  });
  const notes: string[] = [];
  if (change.removed.length === 0) {
    notes.push('no gsm entries found in this scope; nothing to remove');
  } else if (change.after !== null) {
    const parsed: unknown = JSON.parse(change.after);
    if (isPlainObject(parsed) && isPlainObject(parsed.mcp) && Object.keys(parsed.mcp).length === 0) {
      notes.push('left an empty "mcp" object in place (gsm cannot tell whether it created it; it has no effect)');
    }
  }
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
