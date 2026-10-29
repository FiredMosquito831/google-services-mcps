/**
 * Toolsets: how many of a server's tools it registers (GSM_TOOLSET, the plugin option "toolset").
 *
 *   all      every tool. The default, and the same tool list as before toolsets existed.
 *   google   the tools that match Google's official MCP server for the product, listed by name in config/products.json
 *            (toolsets.google). A product without that list falls back to all, and says so.
 *   curated  the hand-written tools of the server and its gateway tools (api_search, api_describe, api_call). Derived
 *            from each tool's origin, not listed. A product with neither falls back to all, and says so.
 *
 * A toolset only hides tools. It never changes a tool's kind, the approval gate or the hook's tool map (the map is built
 * from every tool, so a hidden tool is still classified). The runtime tools (health, auth_*, accounts_*) are added by
 * runServer after the selection, so no toolset removes them.
 */
import type { ToolDef } from './tools.js';

/**
 * The name of a generated server's list tool (LIST_METHODS_SUFFIX in discovery/tools.ts; a test keeps the two equal).
 * Not imported: config.ts reads the toolset, and this module must not pull the discovery and auth modules into it.
 */
export const LIST_METHODS_SUFFIX = 'api_methods';

export const TOOLSETS = ['all', 'google', 'curated'] as const;
export type Toolset = (typeof TOOLSETS)[number];
export const DEFAULT_TOOLSET: Toolset = 'all';

/** One line per toolset, for help text and settings. */
export const TOOLSET_TEXT: Record<Toolset, string> = {
  all: 'every tool (the default)',
  google: "the tools that match Google's official MCP server for the product; all tools where that list is not defined yet",
  curated: 'the hand-written tools and the gateway tools (api_search, api_describe, api_call); all tools where a product has neither',
};

/** The toolsets a product lists by name in config/products.json. all and curated are never listed. */
export const LISTED_TOOLSETS = ['google'] as const;
export type ListedToolset = (typeof LISTED_TOOLSETS)[number];

/** A server's listed toolsets: tool names per toolset (ServerSpec.toolsets). */
export type ServerToolsets = Partial<Record<ListedToolset, string[]>>;

/** Where a tool comes from: a curated module, a Discovery document, or the gateway. Set where a server's tools are assembled. */
export type ToolOrigin = 'curated' | 'generated' | 'gateway';

export function isToolset(value: unknown): value is Toolset {
  return typeof value === 'string' && (TOOLSETS as readonly string[]).includes(value);
}

/**
 * The toolset from GSM_TOOLSET. Unset or empty: all. A value that is not a toolset: all, with one line on stderr (as
 * GSM_CONFIRMATION does).
 */
export function readToolset(value: string | undefined, warn: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Toolset {
  if (value === undefined || value.trim() === '') return DEFAULT_TOOLSET;
  const normalised = value.trim().toLowerCase();
  if (isToolset(normalised)) return normalised;
  warn(`[config] GSM_TOOLSET "${value}" is not a toolset (${TOOLSETS.join(', ')}); using ${DEFAULT_TOOLSET}.`);
  return DEFAULT_TOOLSET;
}

/** The tools of a list, each tagged with its origin. New objects: the input tools are not changed. */
export function withOrigin<T extends object>(origin: ToolOrigin, tools: readonly T[]): Array<T & { origin: ToolOrigin }> {
  return tools.map((tool) => ({ ...tool, origin }));
}

export interface ToolsetSelection<T> {
  /** The toolset asked for. */
  requested: Toolset;
  /** The toolset in effect: the requested one, or all when the product does not define it. */
  effective: Toolset;
  /** The tools of the toolset. With all in effect, the input array itself. */
  tools: T[];
  /** Tools of the server that are outside the toolset. */
  outside: number;
  /** Set when the requested toolset fell back to all: the line health and auth_status show. */
  note?: string;
}

/** The fallback line for a toolset this product does not have. */
export function fallbackNote(toolset: Toolset, reason: 'undefined' | 'empty'): string {
  return reason === 'undefined'
    ? `toolset ${toolset} is not defined for this product yet; showing all tools`
    : `toolset ${toolset} has no tools for this product (it has no hand-written or gateway tools); showing all tools`;
}

type Selectable = Pick<ToolDef, 'name' | 'description' | 'handler'> & { origin?: ToolOrigin };

/**
 * The tools of one toolset. all returns the input array unchanged. google keeps the listed names. curated keeps the tools
 * whose origin is curated or gateway (a tool without an origin counts as curated: it was handed to the server directly).
 * When api_methods is kept, it lists only the methods whose tools are kept (the others are hidden, not marked).
 */
export function selectToolset<T extends Selectable>(tools: T[], requested: Toolset, lists: ServerToolsets | undefined): ToolsetSelection<T> {
  const all = (note?: string): ToolsetSelection<T> => ({
    requested,
    effective: 'all',
    tools,
    outside: 0,
    ...(note !== undefined ? { note } : {}),
  });
  if (requested === 'all') return all();

  let keep: (tool: T) => boolean;
  if (requested === 'google') {
    const names = lists?.google;
    if (!names || names.length === 0) return all(fallbackNote('google', 'undefined'));
    const listed = new Set(names);
    keep = (tool) => listed.has(tool.name);
  } else {
    keep = (tool) => tool.name !== LIST_METHODS_SUFFIX && (tool.origin === undefined || tool.origin === 'curated' || tool.origin === 'gateway');
  }

  const kept = tools.filter(keep);
  if (kept.every((tool) => tool.name === LIST_METHODS_SUFFIX)) return all(fallbackNote(requested, requested === 'google' ? 'undefined' : 'empty'));
  const keptNames = new Set(kept.map((tool) => tool.name));
  const selected = kept.map((tool) => (tool.name === LIST_METHODS_SUFFIX ? narrowListTool(tool, keptNames, requested) : tool));
  return { requested, effective: requested, tools: selected, outside: tools.length - selected.length };
}

/** api_methods inside a toolset: the same tool, listing only the rows whose tool is in the toolset. */
function narrowListTool<T extends Selectable>(tool: T, kept: ReadonlySet<string>, toolset: Toolset): T {
  const handler = tool.handler;
  return {
    ...tool,
    description: `${tool.description} In the toolset "${toolset}" it lists only the methods whose tools are in that toolset.`,
    handler: async (args: never, ctx: never) => {
      const rows = (await handler(args, ctx)) as unknown;
      return Array.isArray(rows) ? rows.filter((row) => kept.has(String((row as { tool?: unknown }).tool))) : rows;
    },
  };
}
