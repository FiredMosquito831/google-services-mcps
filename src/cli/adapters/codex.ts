/**
 * OpenAI Codex CLI adapter (config.toml).
 *
 * Locations: global <home>/.codex/config.toml; project and local <folder>/.codex/config.toml, where the folder is
 * --path or the current folder. Codex has no separate local file, so project and local are the same file.
 *
 * All gsm entries live in ONE managed block, bounded by the exact marker lines
 * CODEX_BEGIN and CODEX_END. Text outside the block is never touched. Each
 * server is one table, [mcp_servers.gsm-<name>], with command = "node" and
 * args = ['<absolute .mjs>'] (a TOML literal string, so no backslash escaping).
 * With --allow-writes, the table also gets env = { GSM_ALLOW_WRITES = "true" }. With --confirmation,
 * it gets GSM_CONFIRMATION too. Each key appears only when its flag is given, so the server default applies otherwise.
 * Installing a subset merges into the block and keeps the other gsm tables.
 * No secret is ever written here.
 *
 * Refusals: unbalanced or duplicate markers, and a user-owned table with the
 * same name outside the block.
 *
 * Verified facts: stdio servers take command, args, env, cwd under [mcp_servers.<name>].
 * A project-scoped .codex/config.toml works only in trusted projects.
 */
import { join } from 'node:path';
import { readText, commitChanges } from '../fsutil.js';
import { scopeFolder } from '../paths.js';
import { serverEnvironment, type EnvPairs } from '../settings.js';
import {
  CODEX_BEGIN,
  CODEX_END,
  SERVER_PREFIX,
  type AdapterContext,
  type AdapterResult,
  type ConfirmationMode,
  type FileChange,
  type ServerRef,
} from '../types.js';

const TABLE_HEADER = /^\[mcp_servers\.(gsm-[A-Za-z0-9_-]+)\]\s*$/;
/**
 * Written inside the block when install added a final newline to a file that had none. Uninstall reads it and removes
 * exactly that newline, so install followed by uninstall gives back the original bytes.
 */
const NEWLINE_MARK = '# gsm: a newline was added above this block; uninstall removes it';

/** Global: <home>/.codex/config.toml. Project and local: <folder>/.codex/config.toml (the same file for both). */
export function codexConfigPath(ctx: AdapterContext): string {
  if (ctx.scope === 'global') return join(ctx.home, '.codex', 'config.toml');
  return join(scopeFolder(ctx.pathArg, ctx.cwd), '.codex', 'config.toml');
}

/** A TOML literal string when possible (no escaping needed), else a basic string with escapes. */
export function tomlString(value: string): string {
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `"${escaped}"`;
}

/** Values written here are fixed words (true, every-change, ...), so they need no escaping. */
function renderEntry(key: string, file: string, env: EnvPairs): string[] {
  const lines = [`[mcp_servers.${key}]`, 'command = "node"', `args = [${tomlString(file)}]`];
  if (env.length > 0) lines.push(`env = { ${env.map(([name, value]) => `${name} = "${value}"`).join(', ')} }`);
  return lines;
}

/** Splits the block body into tables, keyed by table name. Each table keeps its own lines. */
function parseTables(body: readonly string[]): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of body) {
    const name = TABLE_HEADER.exec(line)?.[1];
    if (name) {
      current = [line];
      tables.set(name, current);
    } else if (current) {
      current.push(line);
    }
  }
  for (const lines of tables.values()) {
    while (lines.length > 1 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  }
  return tables;
}

function renderBlock(tables: ReadonlyMap<string, readonly string[]>, addedNewline: boolean): string[] {
  const out = [CODEX_BEGIN];
  if (addedNewline) out.push(NEWLINE_MARK);
  let first = true;
  for (const lines of tables.values()) {
    if (!first) out.push('');
    out.push(...lines);
    first = false;
  }
  out.push(CODEX_END);
  return out;
}

interface Located {
  begin: number;
  end: number;
}

/** Finds the one managed block. Returns null when there is none, and throws when the markers are unbalanced. */
function locate(lines: readonly string[], file: string): Located | null {
  const begins: number[] = [];
  const ends: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t === CODEX_BEGIN) begins.push(i);
    else if (t === CODEX_END) ends.push(i);
  });
  if (begins.length === 0 && ends.length === 0) return null;
  const begin = begins[0];
  const end = ends[0];
  if (begins.length !== 1 || ends.length !== 1 || begin === undefined || end === undefined || begin > end) {
    throw new Error(
      `${file} has ${begins.length} gsm begin marker(s) and ${ends.length} end marker(s). ` +
        'The managed block is unbalanced, so gsm refuses to edit this file. ' +
        'Restore the marker lines (or delete the whole block) by hand, then retry.',
    );
  }
  return { begin, end };
}

interface PlanInput {
  file: string;
  text: string | null;
  action: 'install' | 'uninstall';
  servers: readonly ServerRef[];
  serverFile(server: ServerRef): string;
  allowWrites: boolean;
  confirmation?: ConfirmationMode;
}

/** Pure planning step: computes the new file text without touching the disk. */
export function planCodex(input: PlanInput): FileChange {
  const { file, text, action } = input;
  const unchanged = (): FileChange => ({ file, before: text, after: text, added: [], updated: [], removed: [] });
  if (input.servers.length === 0) return unchanged();

  const eol = text !== null && text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text === null || text === '' ? [] : text.split(/\r?\n/);
  const located = locate(lines, file);
  const keys = input.servers.map((s) => `${SERVER_PREFIX}${s.name}`);

  if (action === 'uninstall') {
    if (!located) return unchanged();
    const body = lines.slice(located.begin + 1, located.end);
    const tables = parseTables(body);
    const addedNewline = body.some((line) => line.trim() === NEWLINE_MARK);
    const removed: string[] = [];
    for (const key of keys) if (tables.delete(key)) removed.push(key);
    if (removed.length === 0) return unchanged();

    const before = lines.slice(0, located.begin);
    const after = lines.slice(located.end + 1);
    let next: string[];
    if (tables.size === 0) {
      // Install puts one blank separator line before the block. Remove it with the block.
      if (before.length > 0 && (before[before.length - 1] ?? '').trim() === '') before.pop();
      // The file ended without a newline before install, and install added one. The block is the last thing in the
      // file (after holds only the empty piece after its final newline), so that newline goes too.
      const endsWithBlock = after.length === 1 && after[0] === '';
      next = addedNewline && endsWithBlock ? before : [...before, ...after];
    } else {
      next = [...before, ...renderBlock(tables, addedNewline), ...after];
    }
    return { file, before: text, after: next.join(eol), added: [], updated: [], removed };
  }

  // Install. Refuse to shadow a table that the user owns outside the block.
  const outside = located ? [...lines.slice(0, located.begin), ...lines.slice(located.end + 1)] : lines;
  for (const key of keys) {
    const header = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*"?${key}"?\\s*\\]`);
    if (outside.some((line) => header.test(line))) {
      throw new Error(
        `${file} already defines [mcp_servers.${key}] outside the gsm block. gsm will not overwrite a table it does not own. ` +
          'Rename or remove that table, then retry.',
      );
    }
  }

  const body = located ? lines.slice(located.begin + 1, located.end) : [];
  const tables = parseTables(body);
  // A block that already exists keeps its own record of the newline. A new block records one when the text has
  // content and no final newline, because the block is appended after a newline that install adds.
  const addsNewline = text !== null && text !== '' && !text.endsWith('\n');
  const addedNewline = located ? body.some((line) => line.trim() === NEWLINE_MARK) : addsNewline;
  const added: string[] = [];
  const updated: string[] = [];
  for (const server of input.servers) {
    const key = `${SERVER_PREFIX}${server.name}`;
    const next = renderEntry(key, input.serverFile(server), serverEnvironment(input.allowWrites, input.confirmation));
    const prev = tables.get(key);
    if (prev === undefined) added.push(key);
    else if (prev.join('\n') !== next.join('\n')) updated.push(key);
    tables.set(key, next);
  }

  const block = renderBlock(tables, addedNewline);
  let nextText: string;
  if (located) {
    nextText = [...lines.slice(0, located.begin), ...block, ...lines.slice(located.end + 1)].join(eol);
  } else if (text === null || text === '') {
    nextText = block.join(eol) + eol;
  } else {
    const base = addsNewline ? text + eol : text;
    nextText = base + eol + block.join(eol) + eol;
  }
  return { file, before: text, after: nextText, added, updated, removed: [] };
}

async function apply(ctx: AdapterContext, action: 'install' | 'uninstall'): Promise<AdapterResult> {
  const file = codexConfigPath(ctx);
  const text = readText(file);
  const change = planCodex({
    file,
    text,
    action,
    servers: ctx.servers,
    serverFile: (s) => ctx.serverFile(s),
    allowWrites: ctx.allowWrites,
    confirmation: ctx.confirmation,
  });
  const changed = change.before !== change.after;
  const backups = ctx.dryRun ? [] : commitChanges([change]);

  const notes: string[] = [];
  if (action === 'install') {
    if (ctx.scope !== 'global') {
      notes.push('Codex reads a project .codex/config.toml only for trusted projects. Trust this folder in Codex or the servers stay off.');
    }
    if (ctx.scope !== 'global' && ctx.scope !== 'project') {
      notes.push('Codex does not separate local from project: --scope local writes the same .codex/config.toml as --scope project.');
    }
    if (ctx.allowWrites) notes.push('GSM_ALLOW_WRITES=true is set: write tools are enabled for these servers.');
    if (ctx.confirmation !== undefined) notes.push(`GSM_CONFIRMATION=${ctx.confirmation} is set for these servers.`);
  } else if (!changed) {
    notes.push('no gsm entries found in this scope; nothing to remove');
  }
  return { agent: 'codex', action, changes: [change], commands: [], backups, notes, errors: [] };
}

export function install(ctx: AdapterContext): Promise<AdapterResult> {
  return apply(ctx, 'install');
}

export function uninstall(ctx: AdapterContext): Promise<AdapterResult> {
  return apply(ctx, 'uninstall');
}
