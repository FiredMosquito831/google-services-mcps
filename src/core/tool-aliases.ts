/**
 * The old tool names of a plugin, accepted for one release (2.0.0 -> 3.0.0).
 *
 * 2.0.0 renamed the generated per-method tools to readable names (core/discovery/tool-names.ts). A user's policy rule
 * (`policy.json` in the token folder), a Claude Code permission rule or a script may still name an old tool, so the
 * old name keeps working until the next major version:
 *
 *  - tools/call with an old name runs the same tool: the server rewrites the name before dispatch (runServer);
 *  - the consent hook resolves an old name to the same entry of tool-map.json, so it decides the same way;
 *  - a policy rule that names the old tool matches a call under the new name, and the other way round. A deny that
 *    names either name wins (decide in core/policy.ts matches every name of the tool).
 *
 * tools/list lists each tool once, under its new name: the alias table is not part of the tool list.
 *
 * The table is data: the build writes each plugin's tool-aliases.json from the renames the generator reports
 * (scripts/bundle.mjs), the hook and the server read it, and nothing is spelled out twice. The file holds one entry
 * per renamed tool, `{ "<old name>": "<new name>" }`, under "aliases".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolRename } from './discovery/tool-names.js';

/** The file beside tool-map.json in a plugin folder. */
export const TOOL_ALIASES_FILE = 'tool-aliases.json';

/** The name of the release that introduced the aliases, and the one that removes them. */
export const ALIASES_SINCE = '2.0.0';
export const ALIASES_UNTIL = '3.0.0';

/** The alias table of one plugin, both ways round. */
export interface ToolAliases {
  /** Old name -> name used now. */
  readonly renames: Readonly<Record<string, string>>;
  /** True when the table is empty (nothing was renamed). */
  readonly empty: boolean;
  /** The name the tool has now, for either an old or a current name. */
  canonical(name: string): string;
  /** Every name the policy may match for a call under `name`: the name itself, then the others. */
  namesFor(name: string): string[];
}

/** Builds the table from the generator's renames (core.dump's aliases, or tool-aliases.json's "aliases"). */
export function toolAliasesFrom(renames: Readonly<Record<string, string>>): ToolAliases {
  const byNew = new Map<string, string[]>();
  for (const [from, to] of Object.entries(renames)) {
    const list = byNew.get(to) ?? [];
    list.push(from);
    byNew.set(to, list);
  }
  for (const list of byNew.values()) list.sort();
  const empty = Object.keys(renames).length === 0;
  return {
    renames,
    empty,
    canonical: (name) => renames[name] ?? name,
    namesFor: (name) => {
      const canonical = renames[name] ?? name;
      return [name, canonical, ...(byNew.get(canonical) ?? [])].filter((n, i, all) => all.indexOf(n) === i);
    },
  };
}

/** The empty table: no name is an alias, and every name stands for itself. */
export const NO_TOOL_ALIASES: ToolAliases = toolAliasesFrom({});

function readAliasesObject(file: string): Record<string, string> {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${file} must hold a JSON object`);
  const aliases = (raw as { aliases?: unknown }).aliases;
  if (aliases === undefined) return {};
  if (aliases === null || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error(`${file}: "aliases" must be an object`);
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(aliases as Record<string, unknown>)) {
    if (typeof to !== 'string' || to.length === 0) throw new Error(`${file}: aliases["${from}"] must be a tool name`);
    out[from] = to;
  }
  return out;
}

/**
 * The alias table of a plugin folder. A missing file means no aliases (a plugin built before 2.0.0, or a plain
 * checkout). A malformed file throws, so the hook asks to be safe and the server reports it.
 */
export function readToolAliases(root: string): ToolAliases {
  const file = join(root, TOOL_ALIASES_FILE);
  if (!existsSync(file)) return NO_TOOL_ALIASES;
  return toolAliasesFrom(readAliasesObject(file));
}

/** The file's contents for a plugin: the renames the build found (old name -> name now), sorted by the old name. */
export function toolAliasesDocument(renames: Readonly<Record<string, string>> | readonly ToolRename[]): { note: string; aliases: Record<string, string> } {
  const pairs: ToolRename[] = Array.isArray(renames) ? [...renames] : Object.entries(renames).map(([from, to]) => ({ from, to }));
  const aliases: Record<string, string> = {};
  for (const { from, to } of [...pairs].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) aliases[from] = to;
  return {
    note:
      `Old names of generated tools, accepted until ${ALIASES_UNTIL} (renamed in ${ALIASES_SINCE}). ` +
      'Each key is an old tool name, each value the name that tool has now. See CHANGELOG.md.',
    aliases,
  };
}
