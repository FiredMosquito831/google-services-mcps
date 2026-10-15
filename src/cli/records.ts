/**
 * The install record: every install this installer made, one entry per (agent, scope, folder). It lives in
 * <home>/.google-services-mcps/runtime/installs.json, next to the runtime copies, and is the list that `gsm list`
 * and `gsm uninstall --all` work from. Each entry names the config file the agent wrote (null for claude, whose
 * plugin registry is the claude CLI's), the servers it installed, and the products those servers belong to.
 *
 * The file is written only by a real install or uninstall, never by a dry run. It is removed when no install is left.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './fsutil.js';
import { runtimeRootFor } from './runtime.js';
import { AGENTS, type AgentId, type Scope, SCOPES } from './types.js';

export interface ServerEntry {
  name: string;
  plugin: string;
}

export interface InstallRecord {
  agent: AgentId;
  scope: Scope;
  /** The folder of project and local scope (absolute). Null for global. */
  folder: string | null;
  /** The config file this installer wrote. Null for claude (the claude CLI keeps the plugin registry). */
  file: string | null;
  /** The servers installed by this record. */
  servers: ServerEntry[];
  /** The product (plugin) ids of those servers, in order of first appearance. */
  products: string[];
  /** ISO time of the last install or uninstall that changed this record. */
  updatedAt: string;
}

export interface RecordKey {
  agent: AgentId;
  scope: Scope;
  folder: string | null;
}

export function installsFileFor(home: string): string {
  return join(runtimeRootFor(home), 'installs.json');
}

/** Products of a server list, without repeats, in order of first appearance. */
export function productsOf(servers: readonly ServerEntry[]): string[] {
  return [...new Set(servers.map((s) => s.plugin))];
}

function sameKey(a: RecordKey, b: RecordKey): boolean {
  return a.agent === b.agent && a.scope === b.scope && a.folder === b.folder;
}

function isRecord(value: unknown): value is InstallRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<InstallRecord>;
  return (
    (AGENTS as readonly string[]).includes(r.agent as string) &&
    (SCOPES as readonly string[]).includes(r.scope as string) &&
    Array.isArray(r.servers) &&
    Array.isArray(r.products)
  );
}

/** Reads the install record. A missing file means nothing is installed. A file that is not valid is an error. */
export function readInstalls(home: string): InstallRecord[] {
  const file = installsFileFor(home);
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON. It is the list of gsm installs; fix it or delete it, then retry.`);
  }
  const installs = typeof parsed === 'object' && parsed !== null ? (parsed as { installs?: unknown }).installs : undefined;
  if (!Array.isArray(installs)) throw new Error(`${file} has no "installs" list. Fix it or delete it, then retry.`);
  return installs.filter(isRecord);
}

/** Writes the record, or removes the file when no install is left. Atomic, so a crash never leaves half a file. */
export function writeInstalls(home: string, records: readonly InstallRecord[]): void {
  const file = installsFileFor(home);
  if (records.length === 0) {
    rmSync(file, { force: true });
    return;
  }
  writeAtomic(file, `${JSON.stringify({ version: 1, installs: records }, null, 2)}\n`);
}

/**
 * Adds servers to the record with this key, creating it when needed. Servers already listed keep their place.
 * `file` is set when given (the config file the agent wrote). Returns a new list; the input is not changed.
 */
export function recordInstall(
  records: readonly InstallRecord[],
  key: RecordKey,
  file: string | null,
  servers: readonly ServerEntry[],
  now: Date = new Date(),
): InstallRecord[] {
  const next = records.map((r) => ({ ...r, servers: [...r.servers] }));
  let record = next.find((r) => sameKey(r, key));
  if (!record) {
    record = { agent: key.agent, scope: key.scope, folder: key.folder, file, servers: [], products: [], updatedAt: now.toISOString() };
    next.push(record);
  }
  if (file !== null) record.file = file;
  for (const server of servers) {
    if (!record.servers.some((s) => s.name === server.name)) record.servers.push({ name: server.name, plugin: server.plugin });
  }
  record.products = productsOf(record.servers);
  record.updatedAt = now.toISOString();
  return next;
}

/**
 * Removes servers from the record with this key. A record left with no server is dropped. Returns a new list.
 */
export function recordUninstall(
  records: readonly InstallRecord[],
  key: RecordKey,
  servers: readonly ServerEntry[],
  now: Date = new Date(),
): InstallRecord[] {
  const names = new Set(servers.map((s) => s.name));
  const out: InstallRecord[] = [];
  for (const r of records) {
    if (!sameKey(r, key)) {
      out.push({ ...r, servers: [...r.servers] });
      continue;
    }
    const kept = r.servers.filter((s) => !names.has(s.name));
    if (kept.length === 0) continue;
    out.push({ ...r, servers: kept, products: productsOf(kept), updatedAt: now.toISOString() });
  }
  return out;
}

/**
 * The products that a non-claude record still uses. A runtime copy is kept while any of these needs it.
 * Claude does not use the runtime copy, so its records do not count.
 */
export function productsInRuntimeUse(records: readonly InstallRecord[]): Set<string> {
  const used = new Set<string>();
  for (const r of records) {
    if (r.agent === 'claude') continue;
    for (const p of r.products) used.add(p);
  }
  return used;
}
