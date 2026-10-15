/**
 * Builds the tool map that the build step writes into each plugin as tool-map.json.
 * The PreToolUse hook reads that file to classify a tool without starting the server.
 *
 * Each entry's name must be the exact tool name Claude Code sends to hooks:
 * mcp__plugin_<plugin>_<server>__<tool>, where every non-alphanumeric character of the
 * plugin and server names is replaced by "_".
 */

/** The map's kinds. A dynamic tool decides per call: the hook classifies the method in tool_input. */
export type ToolMapKind = 'read' | 'write' | 'destructive';
export type ToolMapEntryKind = ToolMapKind | 'dynamic';

export interface ToolMapEntry {
  name: string;
  kind: ToolMapEntryKind;
  scopes: string[];
  methodId?: string;
  title?: string;
}

export interface ToolMapInput {
  name: string;
  /** dynamic tools decide per call (the gateway's api_call). The hook reads the method's kind from the plugin's catalog. */
  kind: ToolMapEntryKind;
  scopes?: string[];
  title?: string;
  methodId?: string;
}

const KINDS: ReadonlySet<string> = new Set(['read', 'write', 'destructive', 'dynamic']);

/** Dynamic tools keep their kind in the map, so the hook can classify each call from its method. */
function mapKind(kind: ToolMapInput['kind']): ToolMapEntryKind {
  return kind;
}

/**
 * Turns tool definitions into tool-map entries, sorted by name. Throws on a duplicate
 * name, an empty name or an unknown kind, so the build fails rather than writing a bad map.
 */
export function toolMapFromDefs(tools: ReadonlyArray<ToolMapInput>): ToolMapEntry[] {
  const seen = new Set<string>();
  const entries: ToolMapEntry[] = [];
  for (const tool of tools) {
    if (typeof tool.name !== 'string' || tool.name.length === 0) {
      throw new Error('tool map: every tool needs a non-empty name');
    }
    if (!KINDS.has(tool.kind)) {
      throw new Error(`tool map: ${tool.name} has unknown kind "${String(tool.kind)}"`);
    }
    if (seen.has(tool.name)) throw new Error(`tool map: duplicate tool name ${tool.name}`);
    seen.add(tool.name);

    const entry: ToolMapEntry = { name: tool.name, kind: mapKind(tool.kind), scopes: [...(tool.scopes ?? [])] };
    if (tool.methodId !== undefined) entry.methodId = tool.methodId;
    if (tool.title !== undefined) entry.title = tool.title;
    entries.push(entry);
  }
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
