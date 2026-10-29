/**
 * How many tools a product's server can list under a toolset, read from the plugin's tool-map.json (the hook's map of
 * every tool) and the toolset rule (selectToolset in core/toolset.ts). The map has no origin field, so the origin is
 * read from the entry: a methodId means a generated tool, the gateway names mean the gateway, the runtime tools are
 * counted in every toolset, and the rest are curated. The count is an upper bound: it includes write tools and every
 * runtime tool in the map, which a server registers only with writes allowed, or for its own sign-in kind.
 */
import { existsSync, readFileSync } from 'node:fs';
import { GATEWAY_TOOL_NAMES, selectToolset, type ServerToolsets, type ToolOrigin, type Toolset } from '../core/toolset.js';

/**
 * The per-server tool limit Antigravity is reported to enforce ("enabled tools would exceed max limit of 100"). From a
 * forum report and a third-party change, not from Google's documentation, and not verified by gsm.
 */
export const AGY_TOOL_LIMIT = 100;

/** The tools runServer adds to every server (dumpTools in core/tools.ts lists them in the tool map). */
export const RUNTIME_TOOL_NAMES: readonly string[] = [
  'health',
  'auth_status',
  'auth_setup_client',
  'auth_login',
  'auth_setup_admin',
  'auth_setup_service_account',
  'accounts_list',
  'account_set_default',
  'account_remove',
];

interface MapEntry {
  name: string;
  methodId?: string;
}

/** The short tool names of a tool map (without mcp__plugin_<plugin>_<server>__), with their method ids. */
function mapEntries(file: string, plugin: string, server: string): MapEntry[] | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return undefined;
    const prefix = `mcp__plugin_${plugin}_${server}__`.replace(/[^A-Za-z0-9_-]/g, '_');
    return parsed.map((entry) => {
      const e = entry as { name?: unknown; methodId?: unknown };
      const name = typeof e.name === 'string' ? e.name : '';
      return { name: name.startsWith(prefix) ? name.slice(prefix.length) : name, ...(typeof e.methodId === 'string' ? { methodId: e.methodId } : {}) };
    });
  } catch {
    return undefined;
  }
}

function originOf(entry: MapEntry): ToolOrigin {
  if (entry.methodId !== undefined) return 'generated';
  return (GATEWAY_TOOL_NAMES as readonly string[]).includes(entry.name) ? 'gateway' : 'curated';
}

export interface ToolsetCount {
  /** Tools the server can list under the toolset (an upper bound, see above). */
  count: number;
  /** The toolset in effect: the requested one, or all when the product does not have it. */
  effective: Toolset;
}

/** The tool count of one product's server under a toolset. Undefined when its tool map is missing or unreadable. */
export function toolsetCount(mapFile: string, plugin: string, server: string, toolset: Toolset, lists: ServerToolsets | undefined): ToolsetCount | undefined {
  const entries = mapEntries(mapFile, plugin, server);
  if (!entries) return undefined;
  const runtime = entries.filter((e) => RUNTIME_TOOL_NAMES.includes(e.name)).length;
  const tools = entries
    .filter((e) => !RUNTIME_TOOL_NAMES.includes(e.name))
    .map((e) => ({ name: e.name, origin: originOf(e), description: '', handler: async () => undefined }));
  const selection = selectToolset(tools, toolset, lists);
  return { count: runtime + selection.tools.length, effective: selection.effective };
}
