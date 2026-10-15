import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerRef } from './types.js';

/**
 * Where the CLI is running from.
 *  - repo:   the repo checkout. The CLI is compiled to dist/cli, and the product map is config/products.json.
 *            Bundles live in <root>/plugins/<product>/servers/<name>.mjs.
 *  - plugin: a bundled plugin folder, <plugin>/bin/gsm.mjs. The map is <plugin>/servers.json (registry format).
 *            Bundles live in <plugin>/servers/<name>.mjs.
 */
export interface InstallRoots {
  layout: 'repo' | 'plugin';
  /** The repo checkout (repo layout) or the plugin folder (plugin layout). */
  root: string;
  /** The map file that was found: config/products.json (repo) or servers.json (plugin). */
  mapFile: string;
}

/**
 * Walks up from the module URL. Each folder is checked for servers.json (plugin layout), then for
 * config/products.json (repo layout). This is the same walk as loadRegistry in core/registry.ts, which
 * is not changed; the repo marker differs because config/products.json is not a registry file.
 */
export function findRoots(fromUrl: string): InstallRoots {
  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    const pluginMap = join(dir, 'servers.json');
    if (existsSync(pluginMap)) return { layout: 'plugin', root: dir, mapFile: pluginMap };
    const repoMap = join(dir, 'config', 'products.json');
    if (existsSync(repoMap)) return { layout: 'repo', root: dir, mapFile: repoMap };
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`servers.json or config/products.json not found above ${dirname(fileURLToPath(fromUrl))}`);
    dir = parent;
  }
}

/**
 * The marketplace root for `claude plugin marketplace add`. In the repo it is the
 * root. In a plugin folder inside <repo>/plugins/<plugin>, it is <repo>. Otherwise
 * (a copy in the Claude plugin cache) it is unknown, and the claude adapter then
 * relies on the marketplace already being registered.
 */
export function repoRootFor(roots: InstallRoots): string | undefined {
  if (roots.layout === 'repo') return roots.root;
  const parent = dirname(roots.root);
  return basename(parent) === 'plugins' ? dirname(parent) : undefined;
}

/** The folder for --scope folder. The scope requires --path, and the CLI checks that it exists. */
export function folderDir(pathArg: string | undefined): string {
  if (!pathArg) throw new Error('folder scope needs --path <dir>');
  return pathArg;
}

/** Absolute path of a server's bundled .mjs file. */
export function serverFileFor(roots: InstallRoots, server: ServerRef): string {
  if (roots.layout === 'repo') return join(roots.root, 'plugins', server.plugin, 'servers', `${server.name}.mjs`);
  return join(roots.root, 'servers', `${server.name}.mjs`);
}
