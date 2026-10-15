/**
 * The API catalog for `gsm apis` and `gsm methods`: data/catalog.json in the repo, or catalog.json in a
 * plugin folder. The file is found by walking up from the CLI file, the same way the discovery engine finds it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActionKind } from '../core/tools.js';

export interface CatalogMethod {
  /** Discovery method id, for example storage.objects.list. */
  id: string;
  /** HTTP verb in upper case. */
  verb: string;
  path: string;
}

export interface CatalogApi {
  name: string;
  version: string;
  title: string;
  preferred: boolean;
  methods: CatalogMethod[];
}

export interface Catalog {
  /** The file that was read. */
  file: string;
  apis: CatalogApi[];
}

/** The catalog file found by walking up from fromUrl: <dir>/catalog.json, then <dir>/data/catalog.json, one level at a time. */
export function findCatalogFile(fromUrl: string): string | undefined {
  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    for (const candidate of [join(dir, 'catalog.json'), join(dir, 'data', 'catalog.json')]) {
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Reads the catalog. A missing catalog is an error that says so. Method rows are [id, verb, path, scopes, description]. */
export function loadCatalog(fromUrl: string): Catalog {
  const file = findCatalogFile(fromUrl);
  if (!file) {
    throw new Error(
      'no API catalog found: data/catalog.json (repo) or catalog.json (plugin folder) was not found above the CLI. Build the catalog first.',
    );
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { apis?: unknown };
  if (!Array.isArray(raw.apis)) throw new Error(`${file} has no "apis" list`);
  const apis: CatalogApi[] = [];
  for (const entry of raw.apis as Array<Record<string, unknown>>) {
    const methods: CatalogMethod[] = [];
    for (const row of Array.isArray(entry.methods) ? (entry.methods as unknown[]) : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
      methods.push({ id: row[0], verb: String(row[1] ?? '').toUpperCase(), path: String(row[2] ?? '') });
    }
    apis.push({
      name: String(entry.name ?? ''),
      version: String(entry.version ?? ''),
      title: typeof entry.title === 'string' ? entry.title : '',
      preferred: entry.preferred === true,
      methods,
    });
  }
  return { file, apis };
}

/**
 * Kind overrides for the methods, read the way the discovery engine reads them: config/tool-kinds.json or
 * tool-kinds.json, looked up beside the catalog and then one level up. Only read, write and destructive values
 * count; the "notes" block is skipped.
 */
export function loadKindOverrides(catalogFile: string): Record<string, ActionKind> {
  const dir = dirname(catalogFile);
  for (const root of [dir, dirname(dir)]) {
    const file = [join(root, 'config', 'tool-kinds.json'), join(root, 'tool-kinds.json')].find((p) => existsSync(p));
    if (!file) continue;
    const overrides: Record<string, ActionKind> = {};
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'notes') continue;
      if (value === 'read' || value === 'write' || value === 'destructive') overrides[key] = value;
    }
    if (Object.keys(overrides).length > 0) return overrides;
  }
  return {};
}
