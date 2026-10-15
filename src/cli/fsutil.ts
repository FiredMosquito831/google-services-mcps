import {
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { FileChange } from './types.js';

/** Local time as YYYYMMDD-HHMMSS, the suffix used for backup files. */
export function timestamp(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

export function readText(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Copies a file to <file>.gsm-backup-<YYYYMMDD-HHMMSS> in the same folder and
 * returns the backup path. An existing backup is never overwritten: a
 * collision in the same second gets a -1, -2, ... suffix.
 */
export function backupFile(file: string, now?: Date): string {
  const base = `${file}.gsm-backup-${timestamp(now)}`;
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    try {
      copyFileSync(file, candidate, fsConstants.COPYFILE_EXCL);
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
}

/** Writes <file>.gsm-tmp, then renames it over the target, so a crash never leaves a half-written config. */
export function writeAtomic(file: string, content: string, mode = 0o644): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.gsm-tmp`;
  writeFileSync(tmp, content, { encoding: 'utf8', mode });
  renameSync(tmp, file);
  try {
    chmodSync(file, mode);
  } catch {
    // Windows ignores POSIX modes; the directory ACL protects the file there.
  }
}

function existingMode(file: string): number {
  try {
    return statSync(file).mode & 0o777;
  } catch {
    return 0o644;
  }
}

/**
 * Applies planned changes. For each file that really changes: back up the
 * existing file first, then write atomically. Unchanged files are skipped, so
 * re-running an install never creates backups for nothing. Returns the backups.
 */
export function commitChanges(changes: readonly FileChange[]): string[] {
  const backups: string[] = [];
  for (const change of changes) {
    if (change.after === null || change.before === change.after) continue;
    if (change.before !== null) backups.push(backupFile(change.file));
    const mode = change.before === null ? 0o644 : existingMode(change.file);
    writeAtomic(change.file, change.after, mode);
  }
  return backups;
}
