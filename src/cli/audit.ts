/**
 * `gsm audit`: a read-only view of the lines the approval gate and runtime guard wrote to <tokenDir>/audit.log.
 *
 * This module never opens any other file in the token directory, never creates a directory or file, never imports
 * the gate or policy, and never prints an argument value or an unknown record field. audit.log is plain text that
 * any local process can edit, so only the values of a fixed allowlist are passed through; extra keys and their
 * values are dropped without being echoed, in stdout or in warnings.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { optionValue } from '../core/plugin-option.js';
import { parseLimit, type ParsedArgs } from './args.js';
import { UsageError } from './types.js';

/** The only keys ever emitted, in output order. `methodId` is omitted when the source line has no such key. */
const ALLOWLIST = ['time', 'tool', 'methodId', 'risk', 'decision', 'outcome', 'argsSha256'] as const;
const ALLOWED = new Set<string>(ALLOWLIST);
const DIGEST = /^[0-9a-f]{16}$/;

export interface AuditFilters {
  tool?: string;
  outcome?: string;
  risk?: string;
  /** Parsed inclusive ISO bounds, in milliseconds. */
  sinceMs?: number;
  untilMs?: number;
  limit?: number;
}

export interface AuditRead {
  /** JSONL-ready lines, in file order, after filtering and allowlisting. */
  lines: string[];
  /** Warnings in encounter order, then the two final counts when non-zero. */
  warnings: string[];
  /** The file exists but cannot be read; the caller reports a generic error and exits non-zero. */
  unreadable: boolean;
}

function stringValue(value: string | boolean | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`--${flag} needs a value`);
  return value.trim();
}

function isoBound(value: string | boolean | undefined, flag: string): number | undefined {
  const text = stringValue(value, flag);
  if (text === undefined) return undefined;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new UsageError(`--${flag} needs an ISO date and time, for example 2026-11-19T00:00:00.000Z`);
  return ms;
}

/** Validates the named filters. Unknown flags are rejected earlier by parseCliArgs. */
export function parseAuditFilters(values: ParsedArgs['values']): AuditFilters {
  const tool = stringValue(values.tool, 'tool');
  const outcome = stringValue(values.outcome, 'outcome');
  const risk = stringValue(values.risk, 'risk');
  const sinceMs = isoBound(values.since, 'since');
  const untilMs = isoBound(values.until, 'until');
  const limit = parseLimit(values.limit);
  return {
    ...(tool !== undefined ? { tool } : {}),
    ...(outcome !== undefined ? { outcome } : {}),
    ...(risk !== undefined ? { risk } : {}),
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    ...(untilMs !== undefined ? { untilMs } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

/** --token-dir wins, then GSM_TOKEN_DIR (the plugin token_dir reaches the CLI that way), then the fixed default. */
export function auditTokenDir(value: string | boolean | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = stringValue(value, 'token-dir');
  if (explicit !== undefined) return resolve(process.cwd(), explicit);
  return optionValue(env.GSM_TOKEN_DIR) ?? join(homedir(), '.google-services-mcps');
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads only audit.log. Malformed lines are skipped with a line-number-only warning; unknown keys are dropped
 * without their names or values ever reaching a warning. A missing log is indistinguishable from an empty one.
 */
export function readAuditLog(tokenDir: string, filters: AuditFilters): AuditRead {
  let text: string;
  try {
    text = readFileSync(join(tokenDir, 'audit.log'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { lines: [], warnings: [], unreadable: false };
    return { lines: [], warnings: [], unreadable: true };
  }

  const lines: string[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let dropped = 0;
  let lineNumber = 0;

  for (const raw of text.split(/\r?\n/)) {
    lineNumber += 1;
    if (raw.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skipped += 1;
      warnings.push(`[audit] skipped line ${lineNumber}`);
      continue;
    }
    if (!isObject(parsed)) {
      skipped += 1;
      warnings.push(`[audit] skipped line ${lineNumber}`);
      continue;
    }

    if (Object.keys(parsed).some((key) => !ALLOWED.has(key))) dropped += 1;

    const time = parsed.time;
    const tool = parsed.tool;
    const risk = parsed.risk;
    const decision = parsed.decision;
    const outcome = parsed.outcome;
    const digest = parsed.argsSha256;
    const methodId = parsed.methodId;
    const valid =
      typeof time === 'string' &&
      !Number.isNaN(Date.parse(time)) &&
      typeof tool === 'string' &&
      (methodId === undefined || typeof methodId === 'string') &&
      typeof risk === 'string' &&
      typeof decision === 'string' &&
      typeof outcome === 'string' &&
      typeof digest === 'string' &&
      DIGEST.test(digest);
    if (!valid) {
      skipped += 1;
      warnings.push(`[audit] skipped line ${lineNumber}`);
      continue;
    }

    if (filters.tool !== undefined && tool !== filters.tool) continue;
    if (filters.outcome !== undefined && outcome !== filters.outcome) continue;
    if (filters.risk !== undefined && risk !== filters.risk) continue;
    const at = Date.parse(time as string);
    if (filters.sinceMs !== undefined && at < filters.sinceMs) continue;
    if (filters.untilMs !== undefined && at > filters.untilMs) continue;

    if (filters.limit === undefined || lines.length < filters.limit) {
      const record: Record<string, string> = {
        time: time as string,
        tool: tool as string,
        ...(methodId === undefined ? {} : { methodId: methodId as string }),
        risk: risk as string,
        decision: decision as string,
        outcome: outcome as string,
        argsSha256: digest as string,
      };
      lines.push(JSON.stringify(record));
    }
  }

  if (skipped > 0) warnings.push(`[audit] skipped ${skipped} malformed line(s)`);
  if (dropped > 0) warnings.push(`[audit] dropped ${dropped} line(s) with unknown fields`);
  return { lines, warnings, unreadable: false };
}

/** Writes JSONL to stdout only; every warning goes to stderr so stdout stays machine-parseable. */
export function runAuditExport(tokenDir: string, filters: AuditFilters): number {
  const result = readAuditLog(tokenDir, filters);
  if (result.unreadable) {
    process.stderr.write('[audit] could not read audit.log (unreadable)\n');
    return 1;
  }
  for (const warning of result.warnings) process.stderr.write(`${warning}\n`);
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  return 0;
}
