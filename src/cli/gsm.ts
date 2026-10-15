#!/usr/bin/env node
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  parseCliArgs,
  parseGroup,
  parseInstallArgs,
  parseLimit,
  parseLoginScopes,
  parseProfile,
  parseSearch,
  parseServers,
  parseSetupAdminArgs,
  parseUninstallAllArgs,
} from './args.js';
import { runSetupAdmin } from './admin.js';
import { runSetupApiKey } from './apikey.js';
import { runStatus, runLogout, runSetupClient } from './credentials.js';
import { runDoctor } from './doctor.js';
import { spawnRunner } from './exec.js';
import { runInstall, runUninstallAll, type InstallEnv } from './install.js';
import { runList } from './list.js';
import { runLogin } from './login.js';
import { runApis, runMethods, runProducts, runVersion, type ListingEnv } from './listing.js';
import { findRoots, type InstallRoots } from './paths.js';
import { loadProductRegistry, productIds } from './products.js';
import type { Registry } from '../core/registry.js';
import type { Output } from './report.js';
import { runScopes } from './scopes.js';
import { UsageError } from './types.js';

export const HELP = `gsm: install the Google services MCP suite into an agent, and manage it

Examples:
  node gsm.mjs install --agent codex --plugin gmail                        Gmail for Codex, for this user (global is the default)
  node gsm.mjs install --agent claude --plugin gcalendar --scope project   Google Calendar for Claude Code, in this project only
  node gsm.mjs list                                                        Show every install gsm made, and where
  node gsm.mjs uninstall --agent codex --plugin gmail --dry-run            Preview the removal of the Gmail entry

Commands:
  install       Install product plugins for an agent: claude, codex, opencode, agy, or all
  uninstall     Remove product plugins again, or every install with --all. Only gsm's own entries are removed
  list          Show every install gsm made: agent, scope, folder, products, and whether it is still in place
  login         Log in one OAuth group. "node gsm.mjs login apikey" only explains the API key step
  scopes        Show each profile's scopes, the products of a group and their tool counts
  setup-client  Save the OAuth Desktop client file (client_secret.json)
  setup-apikey  Save the API key for the apikey group (reads GSM_API_KEY_INPUT or stdin)
  setup-admin   Set up workspace-admin: service account and super admin subject
  status        Show logins, the API key and the security posture of each token
  logout        Remove one group's stored token (apikey: shows where the key file is)
  products      List the products: id, title, group, tool count, gateway APIs and whether the plugin folder exists
  apis          List the APIs of a product (generated and gateway), or of the whole catalog, with method counts
  methods       List the methods of one catalog API: id, HTTP verb, path and kind (read, write or destructive)
  doctor        Check the plugin folders, hooks, tool names, token directory and credentials: PASS or FAIL per check
  version       Show the suite version and the Node version
  --help        Show this help

Usage:
  node gsm.mjs install   --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [--scope global|project|local]
                         [--path <dir>] [--allow-writes] [--confirmation <every-change|destructive-only|off>] [--dry-run]
  node gsm.mjs uninstall --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [--scope global|project|local]
                         [--path <dir>] [--dry-run]
  node gsm.mjs uninstall --all [--dry-run] [--yes]
  node gsm.mjs list [--json] [--home <dir>]
  node gsm.mjs login <group> [--profile readonly|readwrite|full] [--scopes <url,url>] [--servers <a,b>] [--client-secret <file>] [--no-browser] [--replace]
  node gsm.mjs scopes <group> [--profile readonly|readwrite|full] [--servers <a,b>] [--json]
  node gsm.mjs setup-client <path-to-client_secret.json> [--force]
  node gsm.mjs setup-apikey [--force]
  node gsm.mjs setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers <a,b>] [--replace]
  node gsm.mjs status
  node gsm.mjs logout <group>
  node gsm.mjs products [--json]
  node gsm.mjs apis [<product>] [--search <text>] [--json] [--limit <n>]
  node gsm.mjs methods <api> [<version>] [--search <text>] [--json] [--limit <n>]
  node gsm.mjs doctor [--plugin <id>] [--token-dir <dir>]
  node gsm.mjs version
  node gsm.mjs --help

Install and uninstall:
  --agent       claude (the claude CLI), codex (config.toml), opencode (opencode.json), agy (global only), or all.
  --scope       global (default): your user-wide config. project: the folder of --path, or the current folder.
                local: only that folder, not shared. "folder" is accepted as an alias of local.
                Codex and OpenCode have no separate local file, so project and local write the same file.
  --path        The folder for project and local scope. It must exist.
  --plugin      Product ids such as gcloud, gsc, gmail or gai, or all. An unknown id is refused, and the error lists them.
  --dry-run     Prints every planned change and command, and writes nothing.
  --allow-writes, --confirmation   Set GSM_ALLOW_WRITES and GSM_CONFIRMATION for codex, opencode and agy.
                For claude they are plugin options: the install prints the command that sets them.
  --marketplace claude only: owner/repo, a URL or a path. Default: this checkout, else FiredMosquito831/google-services-mcps.
  --all         uninstall only: removes every install in the list. It prints the list, then asks; --yes skips the question.
  --keep-data   uninstall with claude: keeps the plugin data directory.
  --home        A home folder other than yours, for tests. Not for claude.
Runtime:  install copies each product's servers and hook to ~/.google-services-mcps/runtime/<product>/, and the codex,
          opencode and agy configs point there. uninstall removes a copy when no other install uses it.
          Logins (the token files) are never touched by install or uninstall.

Profiles: readonly (default) covers the read tools with read-only scopes. readwrite adds write and destructive tools
          with the narrowest scopes that cover them. full covers every tool. --scopes gives an exact list instead.
          The scopes a token holds decide which tools run: a tool whose scopes it lacks is not registered.
Groups:   OAuth login: cloud, workspace-user, searchconsole, business, developer. apikey: setup-apikey, no login.
          workspace-admin: setup-admin (service account with domain-wide delegation).
Flags:    --no-browser (login) prints the login URL only, and does not open the browser.
          --replace (login, setup-admin): by default a login merges the requested scopes with the stored ones; --replace drops the stored ones.
          --json (scopes, products, apis, methods, list) prints JSON.
API key:  setup-apikey reads GSM_API_KEY_INPUT or stdin. The key is never a command-line argument and is never printed.
Backups:  an existing config file is copied to <file>.gsm-backup-<YYYYMMDD-HHMMSS> before it changes.
Doctor:   --plugin checks one product. Without it, every product of this checkout (or this plugin folder) is checked.
          --token-dir checks another token directory. Exit 1 when any check FAILs. It creates nothing and prints no secret.
`;

const resolvePath = (p: string): string => resolve(process.cwd(), p);

/** A command that takes no positional arguments refuses them. */
function noPositionals(positionals: readonly string[], usage: string): void {
  if (positionals.length > 0) throw new UsageError(usage);
}

/** An optional string option. A flag given without a value is a usage error. */
function optionalString(value: string | boolean | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`--${flag} needs a value`);
  return value;
}

function requireDirectory(path: string, label: string): void {
  let isDir = false;
  try {
    isDir = statSync(path).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) throw new UsageError(`${label} must be an existing directory: ${path}`);
}

const out: Output = {
  log: (line) => console.log(line),
  warn: (line) => console.error(line),
};

/** Reads all of stdin. Resolves undefined when stdin is a terminal, so a key is never typed where it would show. */
function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return Promise.resolve(undefined);
  return new Promise((resolveText, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      text += chunk;
    });
    process.stdin.once('end', () => resolveText(text));
    process.stdin.once('error', reject);
  });
}

/** A yes or no question on the terminal. Only offered when both stdin and stdout are terminals. */
async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

function installEnv(roots: InstallRoots, registry: Registry): InstallEnv {
  return { roots, registry, cwd: process.cwd(), defaultHome: homedir(), platform: process.platform, run: spawnRunner, out };
}

async function dispatch(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  const moduleUrl = import.meta.url;
  // The product map: servers.json next to bin/ in a plugin folder, or config/products.json in the repo.
  const registryFor = () => loadProductRegistry(findRoots(moduleUrl));
  const listingEnv = (): ListingEnv => {
    const roots = findRoots(moduleUrl);
    return { roots, registry: loadProductRegistry(roots), moduleUrl, out };
  };

  switch (parsed.command) {
    case 'help':
      console.log(HELP);
      return 0;

    case 'install': {
      const roots = findRoots(moduleUrl);
      const registry = loadProductRegistry(roots);
      const request = parseInstallArgs(parsed.values, 'install', resolvePath, productIds(registry));
      if (request.pathArg !== undefined) requireDirectory(request.pathArg, '--path');
      if (request.home !== undefined) requireDirectory(request.home, '--home');
      return runInstall({ ...request, action: 'install' }, installEnv(roots, registry));
    }

    case 'uninstall': {
      const roots = findRoots(moduleUrl);
      const registry = loadProductRegistry(roots);
      if (parsed.values.all === true) {
        const all = parseUninstallAllArgs(parsed.values, resolvePath);
        if (all.home !== undefined) requireDirectory(all.home, '--home');
        const terminal = process.stdin.isTTY && process.stdout.isTTY;
        return runUninstallAll(all, installEnv(roots, registry), terminal ? () => askYesNo('Remove every install listed above?') : undefined);
      }
      const request = parseInstallArgs(parsed.values, 'uninstall', resolvePath, productIds(registry));
      if (request.pathArg !== undefined) requireDirectory(request.pathArg, '--path');
      if (request.home !== undefined) requireDirectory(request.home, '--home');
      return runInstall({ ...request, action: 'uninstall' }, installEnv(roots, registry));
    }

    case 'list': {
      noPositionals(parsed.positionals, 'usage: node gsm.mjs list [--json] [--home <dir>]');
      const home = optionalString(parsed.values.home, 'home');
      if (home !== undefined) requireDirectory(resolvePath(home), '--home');
      return runList({ home: home === undefined ? homedir() : resolvePath(home), json: parsed.values.json === true }, out);
    }

    case 'login': {
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs login <group> [--profile readonly|readwrite|full] [--scopes <urls>] [--servers a,b] [--client-secret <file>] [--no-browser] [--replace]');
      const choice = parseLoginScopes(parsed.values);
      const servers = parseServers(parsed.values);
      const clientSecretFile = typeof parsed.values['client-secret'] === 'string' ? parsed.values['client-secret'] : undefined;
      const noBrowser = parsed.values['no-browser'] === true;
      const replace = parsed.values.replace === true;
      return runLogin({ group, servers, clientSecretFile, profile: choice.profile, customScopes: choice.customScopes, noBrowser, replace }, registryFor, out);
    }

    case 'scopes': {
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs scopes <group> [--profile readonly|readwrite|full] [--servers a,b] [--json]');
      return runScopes(
        {
          group,
          servers: parseServers(parsed.values),
          profile: parseProfile(parsed.values.profile),
          json: parsed.values.json === true,
        },
        registryFor(),
        out,
      );
    }

    case 'setup-admin': {
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: node gsm.mjs setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers a,b] [--replace]');
      }
      return runSetupAdmin(parseSetupAdminArgs(parsed.values), registryFor(), out);
    }

    case 'setup-client': {
      if (parsed.positionals.length !== 1) throw new UsageError('usage: node gsm.mjs setup-client <path-to-client_secret.json> [--force]');
      return runSetupClient(parsed.positionals[0] ?? '', parsed.values.force === true, out);
    }

    case 'setup-apikey': {
      // A positional argument could be the key itself, so the error does not repeat it.
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: node gsm.mjs setup-apikey [--force]. The key is read from GSM_API_KEY_INPUT or stdin, never from an argument.');
      }
      return runSetupApiKey({ force: parsed.values.force === true, env: process.env, readStdin }, out);
    }

    case 'status':
      return runStatus(out);

    case 'logout': {
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs logout <group>');
      return runLogout(group, out);
    }

    case 'products':
      noPositionals(parsed.positionals, 'usage: node gsm.mjs products [--json]');
      return runProducts(listingEnv(), parsed.values.json === true);

    case 'apis': {
      if (parsed.positionals.length > 1) {
        throw new UsageError('usage: node gsm.mjs apis [<product>] [--search <text>] [--json] [--limit <n>]');
      }
      return runApis(listingEnv(), {
        product: parsed.positionals[0],
        search: parseSearch(parsed.values.search),
        limit: parseLimit(parsed.values.limit),
        json: parsed.values.json === true,
      });
    }

    case 'methods': {
      if (parsed.positionals.length < 1 || parsed.positionals.length > 2) {
        throw new UsageError('usage: node gsm.mjs methods <api> [<version>] [--search <text>] [--json] [--limit <n>]');
      }
      return runMethods(listingEnv(), {
        api: parsed.positionals[0] ?? '',
        version: parsed.positionals[1],
        search: parseSearch(parsed.values.search),
        limit: parseLimit(parsed.values.limit),
        json: parsed.values.json === true,
      });
    }

    case 'doctor': {
      noPositionals(parsed.positionals, 'usage: node gsm.mjs doctor [--plugin <id>] [--token-dir <dir>]');
      const roots = findRoots(moduleUrl);
      const tokenDir = optionalString(parsed.values['token-dir'], 'token-dir');
      return runDoctor(
        {
          roots,
          registry: loadProductRegistry(roots),
          pluginId: optionalString(parsed.values.plugin, 'plugin'),
          tokenDir: tokenDir === undefined ? undefined : resolvePath(tokenDir),
          env: process.env,
        },
        out,
      );
    }

    case 'version':
      noPositionals(parsed.positionals, 'usage: node gsm.mjs version');
      return runVersion({ roots: findRoots(moduleUrl), out });
  }
}

try {
  process.exitCode = await dispatch(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`gsm: ${err.message}`);
    console.error('Run node gsm.mjs --help for usage.');
    process.exitCode = 2;
  } else {
    console.error(`gsm: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
