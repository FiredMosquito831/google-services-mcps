/**
 * `gsm list`: every install this installer made. The rows come from the install record (records.ts). Each row is then
 * checked against the file it names (the config entries for codex, opencode and agy) and against the runtime copies.
 * Read-only: nothing is written, no claude command runs, and no token file is read.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Output } from './report.js';
import { installsFileFor, readInstalls, type InstallRecord } from './records.js';
import { runtimeFolderFor } from './runtime.js';
import { formatTable } from './table.js';
import type { AgentId, Scope } from './types.js';

/**
 * ok: every entry and runtime copy is there. missing: an entry, the config file or a runtime copy is gone.
 * unreadable: the config file is not strict JSON. recorded: a claude install, which only the claude CLI can check.
 */
export type InstallState = 'ok' | 'missing' | 'unreadable' | 'recorded';

export interface RuntimeStatus {
  product: string;
  path: string;
  present: boolean;
}

export interface InstallRow {
  agent: AgentId;
  scope: Scope;
  folder: string | null;
  file: string | null;
  products: string[];
  servers: string[];
  state: InstallState;
  /** What is wrong, in one line. Empty when the state is ok. */
  detail: string;
  runtime: RuntimeStatus[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The gsm entries of one config file that are missing. For codex the entry is a TOML table header; for opencode and
 * agy it is a key of the JSON container ("mcp" and "mcpServers").
 */
function missingEntries(agent: 'codex' | 'opencode' | 'agy', file: string, names: readonly string[]): { missing: string[]; unreadable: boolean } {
  const keys = names.map((n) => `gsm-${n}`);
  if (!existsSync(file)) return { missing: keys, unreadable: false };
  const text = readFileSync(file, 'utf8');
  if (agent === 'codex') {
    const missing = names.filter((n) => !new RegExp(`^\\[mcp_servers\\.gsm-${escapeRegExp(n)}\\]\\s*$`, 'm').test(text));
    return { missing: missing.map((n) => `gsm-${n}`), unreadable: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { missing: [], unreadable: true };
  }
  const root = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const container = agent === 'opencode' ? root.mcp : root.mcpServers;
  const map = typeof container === 'object' && container !== null ? (container as Record<string, unknown>) : {};
  return { missing: keys.filter((k) => !Object.prototype.hasOwnProperty.call(map, k)), unreadable: false };
}

/** Checks one record against its file and its runtime copies. Reads files only. */
export function checkInstall(home: string, record: InstallRecord): InstallRow {
  const names = record.servers.map((s) => s.name);
  const runtime: RuntimeStatus[] = record.agent === 'claude'
    ? []
    : record.products.map((product) => {
        const path = runtimeFolderFor(home, product);
        return { product, path, present: existsSync(path) };
      });
  const base = {
    agent: record.agent,
    scope: record.scope,
    folder: record.folder,
    file: record.file,
    products: record.products,
    servers: names,
    runtime,
  };

  if (record.agent === 'claude') {
    return { ...base, state: 'recorded', detail: 'installed through the claude CLI; check with: claude plugin list' };
  }
  const file = record.file ?? '';
  if (file === '' || !existsSync(file)) {
    return { ...base, state: 'missing', detail: `config file not found: ${file}` };
  }
  const check = missingEntries(record.agent, file, names);
  if (check.unreadable) return { ...base, state: 'unreadable', detail: `config file is not strict JSON: ${file}` };
  if (check.missing.length > 0) {
    return { ...base, state: 'missing', detail: `not in ${file}: ${check.missing.join(', ')}` };
  }
  const gone = runtime.filter((r) => !r.present);
  if (gone.length > 0) {
    return { ...base, state: 'missing', detail: `runtime copy not found: ${gone.map((r) => r.path).join(', ')}` };
  }
  return { ...base, state: 'ok', detail: '' };
}

/** The checked rows for every record of a home folder. */
export function listInstalls(home: string): InstallRow[] {
  return readInstalls(home).map((record) => checkInstall(home, record));
}

const folderText = (row: InstallRow): string => row.folder ?? '-';

/** The text of `gsm list`: one line per install, then one line per problem, then the runtime copies. */
export function renderInstallList(home: string, rows: readonly InstallRow[]): string[] {
  if (rows.length === 0) return [`No gsm installs are recorded in ${home}.`];
  const lines = [`gsm installs in ${home} (record: ${installsFileFor(home)})`];
  lines.push(
    ...formatTable(
      ['AGENT', 'SCOPE', 'FOLDER', 'PRODUCTS', 'STATE', 'CONFIG FILE'],
      rows.map((r) => [r.agent, r.scope, folderText(r), r.products.join(','), r.state, r.file ?? '-']),
    ),
  );
  for (const row of rows) {
    if (row.detail !== '') lines.push(`  ${row.agent} ${row.scope}${row.folder ? ` (${row.folder})` : ''}: ${row.detail}`);
  }
  const copies = new Map<string, string>();
  for (const row of rows) for (const r of row.runtime) copies.set(r.product, r.path);
  if (copies.size > 0) {
    lines.push('runtime copies:');
    for (const [product, path] of copies) lines.push(`  ${product.padEnd(12)} ${path}`);
  }
  return lines;
}

export interface ListArgs {
  home: string;
  json: boolean;
}

/** `gsm list`. Exit code 0 whether or not something is installed. */
export function runList(args: ListArgs, out: Output): number {
  const rows = listInstalls(args.home);
  if (args.json) {
    out.log(
      JSON.stringify(
        {
          home: args.home,
          installsFile: installsFileFor(args.home),
          installs: rows.map((r) => ({
            agent: r.agent,
            scope: r.scope,
            folder: r.folder,
            file: r.file,
            products: r.products,
            servers: r.servers,
            state: r.state,
            detail: r.detail,
            runtime: r.runtime.map((x) => ({ product: x.product, path: x.path, present: x.present })),
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }
  for (const line of renderInstallList(args.home, rows)) out.log(line);
  return 0;
}
