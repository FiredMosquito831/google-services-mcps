/**
 * `gsm health`: one row per server. Offline by default: each server's login as its token file says, the account it
 * belongs to, and its tool count. `--check` also asks Google about each OAuth group, once per group (once per server for the
 * service-account group, whose servers ask for their own scopes). Exits 1 when a
 * plugin folder is missing or a login check fails. A login that was never made is information, not a failure.
 */
import { loadConfig } from '../core/config.js';
import { liveHealth, loginHealth, type LiveHealth, type LoginHealth } from '../core/health.js';
import type { Registry } from '../core/registry.js';
import type { InstallRoots } from './paths.js';
import { productRows } from './products.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export interface HealthRequest {
  roots: InstallRoots;
  registry: Registry;
  /** One server id. Undefined lists every server. */
  pluginId?: string;
  /** Ask Google about each OAuth login (network calls). */
  check: boolean;
  /** Print JSON instead of the table. */
  json: boolean;
  env: NodeJS.ProcessEnv;
}

interface HealthRow {
  server: string;
  group: string;
  folder: boolean;
  tools: number | undefined;
  login: LoginHealth;
  live?: LiveHealth;
}

const FAILED_STATES = new Set(['expired', 'revoked', 'unreachable']);

export async function runHealth(req: HealthRequest, out: Output): Promise<number> {
  const cfg = loadConfig(req.env);
  const rows = productRows(req.roots, req.registry, req.pluginId ? [req.pluginId] : undefined);
  if (req.pluginId && rows.length === 0) throw new UsageError(`no server "${req.pluginId}"`);

  const liveByGroup = new Map<string, LiveHealth>();
  const report: HealthRow[] = [];
  for (const row of rows) {
    let live: LiveHealth | undefined;
    if (req.check) {
      // A service-account server's token asks for its own scopes only, so each of those servers is checked on its own.
      const perServer = row.group === 'service-account';
      const key = perServer ? `${row.group}:${row.id}` : row.group;
      if (!liveByGroup.has(key)) liveByGroup.set(key, await liveHealth(row.group, perServer ? { ...cfg, server: row.id } : cfg));
      live = liveByGroup.get(key);
    }
    report.push({
      server: row.id,
      group: row.group,
      folder: row.folderExists,
      tools: row.tools,
      login: loginHealth(row.group, cfg),
      live,
    });
  }

  const failures = report.filter((row) => !row.folder || (row.live !== undefined && FAILED_STATES.has(row.live.state)));
  if (req.json) {
    out.log(JSON.stringify(report, null, 2));
  } else {
    printTable(report, out);
    const summary = `${report.length} server(s), ${failures.length} failure(s)`;
    out.log(failures.length === 0 ? `health: ${summary}` : `health: ${summary}. See the FAIL rows above.`);
    for (const row of failures) {
      out.log(`FAIL ${row.server}: ${!row.folder ? 'plugin folder missing' : `login ${row.live?.state}: ${row.live?.detail ?? ''}`}`);
    }
  }
  return failures.length === 0 ? 0 : 1;
}

function loginCell(row: HealthRow): string {
  if (row.login.kind === 'api-key') return row.login.loggedIn ? 'key set' : 'no key';
  if (row.login.kind === 'service-account') return row.login.loggedIn ? 'set up' : 'not set up';
  return row.login.loggedIn ? 'logged in' : 'not logged in';
}

function checkCell(row: HealthRow): string {
  if (!row.live) return '-';
  return row.live.state;
}

function printTable(report: HealthRow[], out: Output): void {
  const header = ['server', 'group', 'login', 'account', 'tools', 'check'];
  const lines = report.map((row) => [
    row.server,
    row.group,
    loginCell(row),
    row.login.account ?? '-',
    row.tools === undefined ? '?' : String(row.tools),
    checkCell(row),
  ]);
  const widths = header.map((title, i) => Math.max(title.length, ...lines.map((line) => (line[i] ?? '').length)));
  const format = (cells: string[]): string => cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  out.log(format(header));
  for (const line of lines) out.log(format(line));
}
