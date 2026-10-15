import type { FileChange } from '../types.js';

/**
 * Shared JSON planning for adapters that keep servers in one keyed object
 * (OpenCode "mcp", agy "mcpServers"). Strict JSON only: a file with comments or
 * trailing commas is refused rather than rewritten. Key order is preserved, and
 * keys that gsm does not own are never changed.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonObject(text: string, file: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${file} is not strict JSON (${(err as Error).message}). gsm does not edit JSON with comments or trailing commas (JSONC). ` +
        'Remove them, or add the entries by hand.',
    );
  }
  if (!isPlainObject(parsed)) throw new Error(`${file} must hold a JSON object at the top level.`);
  return parsed;
}

export interface JsonMapPlan {
  file: string;
  /** File text now, or null when the file does not exist. */
  before: string | null;
  /** Top-level key that holds the server map, e.g. "mcp" or "mcpServers". */
  containerKey: string;
  /** Used only when the file is missing or empty. */
  template: Record<string, unknown>;
  /** Keys to add or replace inside the container (install). */
  set?: ReadonlyMap<string, unknown>;
  /** Keys to delete inside the container (uninstall). Only these exact keys are removed. */
  remove?: readonly string[];
  /**
   * When a removal deletes at least one key and leaves the container empty, drop the container too. Used by uninstall,
   * so an install that added the container leaves the file as it was. An empty container that nothing removed is kept.
   */
  dropEmptyContainer?: boolean;
}

export function planJsonMap(plan: JsonMapPlan): FileChange {
  const missing = plan.before === null || plan.before.trim() === '';
  const root: Record<string, unknown> = missing ? { ...plan.template } : parseJsonObject(plan.before ?? '', plan.file);

  const current = root[plan.containerKey];
  if (current !== undefined && !isPlainObject(current)) {
    throw new Error(`"${plan.containerKey}" in ${plan.file} is not an object. gsm will not edit it.`);
  }
  const container: Record<string, unknown> = isPlainObject(current) ? { ...current } : {};

  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  for (const [key, value] of plan.set ?? []) {
    if (Object.prototype.hasOwnProperty.call(container, key)) {
      if (JSON.stringify(container[key]) !== JSON.stringify(value)) updated.push(key);
    } else {
      added.push(key);
    }
    container[key] = value;
  }
  for (const key of plan.remove ?? []) {
    if (Object.prototype.hasOwnProperty.call(container, key)) {
      delete container[key];
      removed.push(key);
    }
  }

  const changed = added.length + updated.length + removed.length > 0;
  const next: Record<string, unknown> = { ...root };
  if (plan.dropEmptyContainer && removed.length > 0 && Object.keys(container).length === 0) {
    delete next[plan.containerKey];
  } else {
    next[plan.containerKey] = container;
  }
  // With no change, keep the original text as-is (null stays null: nothing to write).
  const after = changed ? JSON.stringify(next, null, 2) + '\n' : plan.before;
  return { file: plan.file, before: plan.before, after, added, updated, removed };
}
