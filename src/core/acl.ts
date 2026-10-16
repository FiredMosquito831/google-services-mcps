import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';

/**
 * Who may read the token folder. POSIX systems use the modes: 0700 for the folder, 0600 for each token file. Windows
 * ignores those modes, so the folder's access list (ACL) is set instead: only the current user, SYSTEM and
 * Administrators. icacls runs with an argument array, never through a shell. The well-known SIDs keep the names
 * the same in every Windows language.
 */
const SYSTEM_SID = '*S-1-5-18';
const ADMINISTRATORS_SID = '*S-1-5-32-544';

/** Folders already limited in this process, so each server start runs icacls once per folder. */
const limited = new Set<string>();

function currentUser(): string {
  return userInfo().username;
}

/**
 * Limits the folder to the current user, SYSTEM and Administrators. Windows only. Files created in it afterwards
 * inherit that list. Files that already exist keep their entries: the recursive form (/T) is not used, because it
 * strips the entries of existing files, and their owner could no longer open them.
 */
export function restrictToCurrentUser(dir: string): boolean {
  if (process.platform !== 'win32') return false;
  execFileSync(
    'icacls',
    [
      dir,
      '/inheritance:r',
      '/grant:r',
      `${currentUser()}:(OI)(CI)F`,
      '/grant:r',
      `${SYSTEM_SID}:(OI)(CI)F`,
      '/grant:r',
      `${ADMINISTRATORS_SID}:(OI)(CI)F`,
      '/Q',
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return true;
}

/**
 * Creates the token folder with mode 0700. On Windows it also limits the folder's access list, once per process.
 * A failure is reported on stderr and does not stop the write: `gsm doctor` reports the folder's access list.
 */
export function ensureTokenDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32' || limited.has(dir)) return;
  limited.add(dir);
  try {
    restrictToCurrentUser(dir);
  } catch (err) {
    process.stderr.write(`[gsm] could not limit ${dir} to your user (icacls): ${(err as Error).message.split('\n')[0]}\n`);
  }
}

/**
 * The principals other than the current user, SYSTEM and Administrators that can read the folder. Windows only:
 * elsewhere `supported` is false and the list is empty.
 */
export function aclExtras(dir: string): { supported: boolean; extra: string[] } {
  if (process.platform !== 'win32') return { supported: false, extra: [] };
  const text = execFileSync('icacls', [dir], { encoding: 'utf8', windowsHide: true });
  const user = currentUser().toLowerCase();
  const extra = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    // The first line starts with the folder's own path, and its first entry follows that path on the same line.
    let entry = raw.trim();
    if (entry.startsWith(dir)) entry = entry.slice(dir.length).trim();
    const match = /^(.+?):\(/.exec(entry);
    if (!match) continue;
    const who = (match[1] ?? '').trim();
    const lower = who.toLowerCase();
    // CREATOR OWNER is the placeholder Windows shows for the owner of an inherited entry, so it is not a second reader.
    const allowed =
      lower === 'nt authority\\system' ||
      lower === 'builtin\\administrators' ||
      lower === 'creator owner' ||
      lower === user ||
      lower.endsWith(`\\${user}`);
    if (!allowed) extra.add(who);
  }
  return { supported: true, extra: [...extra] };
}
