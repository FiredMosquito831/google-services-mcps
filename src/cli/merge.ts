/**
 * The one scope rule for `gsm login` and `gsm setup-admin`.
 *
 * By default a login merges the scopes it requests with the scopes already stored, so logging in for one product keeps
 * the scopes of the others. For `gsm login` the stored scopes are those of the account named with --account (and only
 * the ones a server of the group can use); with no account named nothing is merged. --replace keeps only the requested
 * scopes: the stored ones are dropped when the new token is saved. This module is pure: it reads no file and calls no network.
 */

export interface MergeInput {
  /** The scopes this login asks for: from the profile, from --scopes, or from the servers. */
  requested: readonly string[];
  /** The scopes stored for the group before this login. Empty when nothing is stored. */
  stored: readonly string[];
  /** --replace: keep only the requested scopes. */
  replace: boolean;
}

export interface MergeResult {
  /** The scopes the new token is saved with: sorted, unique. */
  scopes: string[];
  /** Stored scopes that are still in the result. */
  kept: string[];
  /** Scopes in the result that were not stored before. */
  added: string[];
  /** Stored scopes that are not in the result. Only --replace can drop one. */
  dropped: string[];
}

/** Sorted, unique, without empty strings. */
function normal(list: readonly string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter((s) => s.length > 0))].sort();
}

/**
 * Merge rule. Merge (the default): scopes = stored plus requested. Replace: scopes = requested.
 * kept = stored scopes in the result, added = result scopes not stored, dropped = stored scopes not in the result.
 */
export function mergeScopes({ requested, stored, replace }: MergeInput): MergeResult {
  const storedList = normal(stored);
  const scopes = normal(replace ? requested : [...requested, ...storedList]);
  const inResult = new Set(scopes);
  const wasStored = new Set(storedList);
  return {
    scopes,
    kept: storedList.filter((s) => inResult.has(s)),
    added: scopes.filter((s) => !wasStored.has(s)),
    dropped: storedList.filter((s) => !inResult.has(s)),
  };
}

/**
 * Splits stored scopes into the ones a server of the group can use and the ones none can (foreign). A foreign scope came
 * from another group's sign-in, such as a Cloud scope that Google once added to a Gmail token, so it is not requested again.
 */
export function splitUsable(stored: readonly string[], usable: ReadonlySet<string>): { usable: string[]; foreign: string[] } {
  const list = normal(stored);
  return { usable: list.filter((s) => usable.has(s)), foreign: list.filter((s) => !usable.has(s)) };
}

/**
 * The scopes a save would take away from an account: scopes its current token holds that a server of the group can use,
 * and that the new token does not hold. Foreign scopes do not count: losing them is the point of not requesting them.
 */
export function scopesDroppedBySave(existing: readonly string[], next: readonly string[], usable: ReadonlySet<string>): string[] {
  const kept = new Set(next);
  return normal(existing).filter((s) => usable.has(s) && !kept.has(s));
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The line printed before the browser step (login) or before the setup is saved (setup-admin). Undefined when
 * nothing is stored, because then there is nothing to merge or drop and nothing is said.
 */
export function describeMerge(result: MergeResult, replace: boolean): string | undefined {
  const stored = result.kept.length + result.dropped.length;
  if (stored === 0) return undefined;
  if (replace) {
    if (result.dropped.length === 0) return 'Replacing: no stored scope is dropped; every stored scope is requested again.';
    return `Replacing: the ${plural(result.dropped.length, 'stored scope')} will be dropped.`;
  }
  return `Merging: ${plural(result.kept.length, 'scope')} already stored ${result.kept.length === 1 ? 'is' : 'are'} kept; ${result.added.length} new.`;
}
