/**
 * The runtime copy. Install copies each chosen product's bundled servers and hook out of its plugin folder into
 * <home>/.google-services-mcps/runtime/<product>/. The Codex, OpenCode and agy configs point at that copy, so they
 * keep working when the checkout or the package moves. Claude Code does not use it: the claude CLI installs its own copy.
 *
 * Layout of one runtime folder (only the items the plugin folder has are copied):
 *   servers/<name>.mjs, bin/, hooks/, tool-map.json, method-kinds.json, catalog.json, discovery/,
 *   scopes.json, servers.json, tool-kinds.json
 * The servers find servers.json, discovery/, catalog.json, scopes.json and tool-kinds.json by walking up from
 * their own file, so these items must stay next to servers/.
 *
 * The token directory is never read, changed or removed here. Its default is <home>/.google-services-mcps, so
 * this module creates and removes only the runtime folder inside it (and the runtime folder itself when it is empty).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pluginFolderFor } from './products.js';
import type { InstallRoots } from './paths.js';

/** The items of a plugin folder that the runtime copy has. Items the folder lacks are skipped. */
export const RUNTIME_ITEMS: readonly string[] = [
  'servers',
  'bin',
  'hooks',
  'tool-map.json',
  'method-kinds.json',
  'catalog.json',
  'discovery',
  'scopes.json',
  'servers.json',
  'tool-kinds.json',
];

/** <home>/.google-services-mcps/runtime */
export function runtimeRootFor(home: string): string {
  return join(home, '.google-services-mcps', 'runtime');
}

/** <home>/.google-services-mcps/runtime/<product> */
export function runtimeFolderFor(home: string, product: string): string {
  return join(runtimeRootFor(home), product);
}

/** The bundled .mjs of a server inside its product's runtime copy. This is what the agent configs point at. */
export function runtimeServerFile(home: string, server: { name: string; plugin: string }): string {
  return join(runtimeFolderFor(home, server.plugin), 'servers', `${server.name}.mjs`);
}

export interface RuntimeCopy {
  product: string;
  /** The plugin folder the copy comes from. */
  source: string;
  /** The runtime folder the copy goes to. */
  target: string;
  /** The items of RUNTIME_ITEMS that the source folder has. */
  items: string[];
  /** False when the plugin folder is missing. A real install stops then; a dry run reports it. */
  sourceExists: boolean;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The copies for the products, in the order given. Reads only; nothing is written. */
export function planRuntimeCopies(roots: InstallRoots, home: string, products: readonly string[]): RuntimeCopy[] {
  return products.map((product) => {
    const source = pluginFolderFor(roots, product);
    const sourceExists = isDirectory(source);
    const items = sourceExists ? RUNTIME_ITEMS.filter((item) => existsSync(join(source, item))) : [];
    return { product, source, target: runtimeFolderFor(home, product), items, sourceExists };
  });
}

/**
 * Replaces the runtime folder of one product with a fresh copy. A copy that is already the runtime folder (the CLI
 * was started from it) is left alone.
 */
export function copyRuntime(copy: RuntimeCopy): void {
  if (resolve(copy.source) === resolve(copy.target)) return;
  rmSync(copy.target, { recursive: true, force: true });
  mkdirSync(copy.target, { recursive: true });
  for (const item of copy.items) {
    cpSync(join(copy.source, item), join(copy.target, item), { recursive: true });
  }
}

/** Removes the runtime folder of one product. Returns false when it was not there. */
export function removeRuntime(home: string, product: string): boolean {
  const target = runtimeFolderFor(home, product);
  if (!existsSync(target)) return false;
  rmSync(target, { recursive: true, force: true });
  removeRuntimeRootIfEmpty(home);
  return true;
}

/** Removes runtime/ when nothing is left in it. Never removes the token directory above it. */
export function removeRuntimeRootIfEmpty(home: string): void {
  const root = runtimeRootFor(home);
  try {
    if (readdirSync(root).length === 0) rmdirSync(root);
  } catch {
    // The folder is missing, or not empty. Either way there is nothing to do.
  }
}
