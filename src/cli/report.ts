import type { AdapterResult, FileChange } from './types.js';

/** Multiset line diff: lines only in `before` are removed, lines only in `after` are added. */
export function lineDiff(before: string | null, after: string): { removed: string[]; added: string[] } {
  const beforeLines = before === null ? [] : before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  return {
    removed: unmatched(beforeLines, afterLines),
    added: unmatched(afterLines, beforeLines),
  };
}

function unmatched(from: string[], pool: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of pool) counts.set(line, (counts.get(line) ?? 0) + 1);
  return from.filter((line) => {
    const n = counts.get(line) ?? 0;
    if (n > 0) {
      counts.set(line, n - 1);
      return false;
    }
    return true;
  });
}

/** Human summary of one planned file change, with a +/- excerpt when `withDiff` is set. */
export function describeChange(change: FileChange, withDiff: boolean): string[] {
  const out: string[] = [];
  const isNew = change.before === null;
  const changed = change.after !== null && change.before !== change.after;
  const action = !changed ? 'unchanged' : isNew ? 'create' : 'update';
  out.push(`  file: ${change.file} (${action})`);
  if (change.added.length) out.push(`    added keys: ${change.added.join(', ')}`);
  if (change.updated.length) out.push(`    updated keys: ${change.updated.join(', ')}`);
  if (change.removed.length) out.push(`    removed keys: ${change.removed.join(', ')}`);
  if (withDiff && changed && change.after !== null) {
    const diff = lineDiff(change.before, change.after);
    const lines = [...diff.removed.map((l) => `-${l}`), ...diff.added.map((l) => `+${l}`)];
    const max = 60;
    for (const line of lines.slice(0, max)) out.push(`      ${line}`);
    if (lines.length > max) out.push(`      ... ${lines.length - max} more line(s)`);
  }
  return out;
}

export interface Output {
  log(line: string): void;
  warn(line: string): void;
}

/** Prints an adapter result. Used by both install and uninstall. Errors go to warn (stderr). */
export function printResult(result: AdapterResult, dryRun: boolean, out: Output): void {
  out.log(`[${result.agent}] ${result.action}${dryRun ? ' (dry-run)' : ''}`);
  for (const change of result.changes) {
    for (const line of describeChange(change, dryRun)) out.log(line);
  }
  for (const command of result.commands) {
    out.log(`  ${dryRun ? 'would run' : 'ran'}: ${command}`);
  }
  for (const backup of result.backups) out.log(`  backup: ${backup}`);
  for (const note of result.notes) out.log(`  note: ${note}`);
  for (const error of result.errors) out.warn(`  error: ${error}`);
}
