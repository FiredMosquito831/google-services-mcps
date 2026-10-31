#!/usr/bin/env node
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  parseCliArgs,
  type ParsedArgs,
  parseGroup,
  parseInstallArgs,
  parseLimit,
  parseLoginAccount,
  parseLoginScopes,
  parseProfile,
  parseSearch,
  parseServers,
  parseSetupAdminArgs,
  parseToolset,
  parseUninstallAllArgs,
  parseWith,
} from './args.js';
import { runSetupAdmin } from './admin.js';
import { runSetupServiceAccount } from './service-account.js';
import { runProtect } from './protect.js';
import { API_KEY_ENV, runSetupApiKey } from './apikey.js';
import {
  apiKeyFileFor,
  apiKeyState,
  runAccounts,
  runLogout,
  runSetDefaultAccount,
  runSetupClient,
  runStatus,
  runStatusCheck,
} from './credentials.js';
import { guidedInstall, guidedSignIn, guidedUninstall, runMenu, type GuidedEnv, type InstallPrefill } from './guided.js';
import { checkRequirements } from './requirements.js';
import { createPrompter, type Prompter } from './prompt.js';
import { invocationFor, invocationText, setInvocation } from '../core/invocation.js';
import { loadConfig } from '../core/config.js';
import { runDoctor } from './doctor.js';
import { runHealth } from './health.js';
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

Interactive: in a terminal, run gsm with no arguments for a menu. Install and uninstall ask for whatever is missing,
             and sign-in asks for the group, the client file and the profile. Each answer shows the command it runs,
             so the same steps can be typed later with flags. Scripts (no terminal) always need the flags.

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
  setup-service-account  Set up the service account for Google Play and Merchant Center (--remove forgets it)
  protect       Move the saved secrets into the OS store (DPAPI, Keychain or libsecret). --off moves them back to plain files
  status        Show logins, the API key and the security posture of each token (--check asks Google: validity, scopes, key restrictions)
  logout        Revoke one group's login at Google and remove its token (--account <email> names one account; --local-only: only remove the file;
                the revoke is skipped when another group here has the same account, because it would end that login too: --revoke-all revokes anyway;
                apikey: shows where the key file is)
  accounts      List the signed-in accounts of each group. "accounts default <group> <email>" sets the default one
  products      List the products: id, title, group, tool count, gateway APIs and whether the plugin folder exists
  apis          List the APIs of a product (generated and gateway), or of the whole catalog, with method counts
  methods       List the methods of one catalog API: id, HTTP verb, path and kind (read, write or destructive)
  doctor        Check the plugin folders, hooks, tool names, token directory and credentials: PASS or FAIL per check
  health        One row per server: login, account, tool count (--check asks Google about each login)
  version       Show the suite version and the Node version
  --help        Show this help

Usage:
  node gsm.mjs install   --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [--scope global|project|local]
                         [--path <dir>] [--allow-writes] [--confirmation <every-change|destructive-only|off>]
                         [--toolset <all|google|curated>] [--dry-run]
  node gsm.mjs uninstall --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> [--scope global|project|local]
                         [--path <dir>] [--dry-run]
  node gsm.mjs uninstall --all [--dry-run] [--yes]
  node gsm.mjs list [--json] [--home <dir>]
  node gsm.mjs login <group> [--profile readonly|readwrite|full] [--scopes <url,url>] [--servers <a,b>] [--client-secret <file>] [--no-browser] [--replace] [--account <email>] [--with <part,...>] [--toolset all|google|curated]
  node gsm.mjs scopes <group> [--profile readonly|readwrite|full] [--servers <a,b>] [--with <part,...>] [--toolset all|google|curated] [--json]
  node gsm.mjs setup-client <path-to-client_secret.json> [--force]
  node gsm.mjs setup-apikey [--force]
  node gsm.mjs setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers <a,b>] [--replace] [--toolset all|google|curated]
  node gsm.mjs setup-service-account --key-file <service account JSON>   (gplay and gmerchant; --remove forgets the setup)
  node gsm.mjs status [--check]
  node gsm.mjs logout <group> [--account <email>] [--local-only | --revoke-all]
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
  --install-missing   install only: installs what the install needs and is missing (npm for Claude Code, Codex and OpenCode;
                winget or brew for git). Without it, a missing requirement stops the install, and nothing is changed.
                Requirements: Claude Code (claude) for --agent claude; git when the marketplace comes from GitHub; codex or
                opencode for those agents. Antigravity is installed by its own installer.
  --allow-writes, --confirmation   Set GSM_ALLOW_WRITES and GSM_CONFIRMATION for codex, opencode and agy.
                For claude they are the plugin options allow_writes and confirmation, passed to claude plugin install
                as --config. Options that are not given keep their values (claude plugin configure shows them).
  --toolset     all, google or curated: which tools each server lists. Only when given: GSM_TOOLSET for codex, opencode
                and agy, and the plugin option toolset (--config toolset=<value>) for claude. Without it the servers list
                every tool. agy: the install warns when a product can list more than 100 tools (a reported agy limit).
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
          A product can hold scopes back: Gmail's readwrite asks for gmail.modify and gmail.settings.basic, and only full
          asks for https://mail.google.com/ (permanent delete). No profile asks for gmail.settings.sharing (it is for
          domain-wide delegation). The login and gsm scopes list the tools held back ("Held back:").
Groups:   OAuth login: cloud, workspace-user, searchconsole, business, developer. apikey: setup-apikey, no login.
          workspace-admin: setup-admin (service account with domain-wide delegation).
Flags:    --no-browser (login) prints the login URL only, and does not open the browser.
          --replace (login, setup-admin): by default a login merges the requested scopes with the stored ones; --replace drops the stored ones.
          --account (login): the Google account to sign in. Google is asked to preselect it, and the merge reads that
          account's stored scopes only (scopes no server of the group uses are left out). Without it, nothing is merged.
          --with (login, scopes): add an optional part of a product, left out of every profile otherwise: gmail
          postmaster, gtasks keep, gcontacts health and portability, gsc indexing (--with keep, for example).
          gsm scopes lists the optional parts of a group. An account named with --account keeps the parts it holds.
          --toolset (login, scopes, setup-admin): all (default), google or curated. Only the tools of that toolset count
          toward the scopes, and gateway methods count only when the toolset holds api_call. Default: GSM_TOOLSET, else
          all. A product without the toolset counts every tool. With --account, the account's other scopes are kept.
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

/** Every printed line uses the command for this route (npx, or node with the path of gsm.mjs). */
const out: Output = {
  log: (line) => console.log(invocationText(line)),
  warn: (line) => console.error(invocationText(line)),
};

/** A terminal on both sides: the guided flows run, and the questions are asked. */
const isInteractive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function withPrompter<T>(body: (prompt: Prompter) => Promise<T>): Promise<T> {
  const prompt = createPrompter(process.stdin, process.stdout, true);
  try {
    return await body(prompt);
  } finally {
    prompt.close();
  }
}

/** What the guided flows need. The API key is saved from the typed value, never from GSM_API_KEY_INPUT. */
function guidedEnvFor(prompt: Prompter, moduleUrl: string): GuidedEnv {
  const roots = findRoots(moduleUrl);
  const registry = loadProductRegistry(roots);
  const cfg = loadConfig();
  const environment = { ...process.env };
  delete environment[API_KEY_ENV];
  return {
    prompt,
    run: (argv) => dispatch(argv),
    roots,
    registry,
    home: homedir(),
    cwd: process.cwd(),
    out,
    clientSecretFile: cfg.clientSecretFile,
    apiKeySaved: apiKeyState(cfg) === 'saved',
    saveApiKey: (key, force) => runSetupApiKey({ force, env: environment, readStdin: async () => key }, out),
    requirements: (agents, needGit) => checkRequirements({ run: spawnRunner, platform: process.platform, cwd: process.cwd() }, agents, needGit),
  };
}

/** The install options that were already given as flags. An option not given is asked for. */
function prefillFrom(values: ParsedArgs['values']): InstallPrefill {
  const text = (value: string | boolean | undefined): string | undefined => (typeof value === 'string' ? value : undefined);
  const path = text(values.path);
  return {
    agent: text(values.agent),
    plugin: text(values.plugin),
    scope: text(values.scope),
    path: path === undefined ? undefined : resolvePath(path),
    allowWrites: values['allow-writes'] === true ? true : undefined,
    confirmation: text(values.confirmation),
    toolset: text(values.toolset),
  };
}

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

async function dispatch(argv: readonly string[]): Promise<number> {
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
      if (argv.length === 0 && isInteractive()) return withPrompter((prompt) => runMenu(guidedEnvFor(prompt, moduleUrl)));
      console.log(invocationText(HELP));
      return 0;

    case 'install': {
      // In a terminal, a missing --agent or --plugin is asked for. Given flags run as before, with no questions.
      if (isInteractive() && (parsed.values.agent === undefined || parsed.values.plugin === undefined)) {
        const prefill = prefillFrom(parsed.values);
        return withPrompter((prompt) => guidedInstall(guidedEnvFor(prompt, moduleUrl), prefill));
      }
      const roots = findRoots(moduleUrl);
      const registry = loadProductRegistry(roots);
      const request = parseInstallArgs(parsed.values, 'install', resolvePath, productIds(registry));
      if (request.pathArg !== undefined) requireDirectory(request.pathArg, '--path');
      if (request.home !== undefined) requireDirectory(request.home, '--home');
      return runInstall({ ...request, action: 'install' }, installEnv(roots, registry));
    }

    case 'uninstall': {
      if (parsed.values.all !== true && isInteractive() && (parsed.values.agent === undefined || parsed.values.plugin === undefined)) {
        return withPrompter((prompt) => guidedUninstall(guidedEnvFor(prompt, moduleUrl)));
      }
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
      // In a terminal, `login` with no group starts the guided sign-in (group, client file, profile, API key, admin).
      if (parsed.positionals.length === 0 && isInteractive()) return withPrompter((prompt) => guidedSignIn(guidedEnvFor(prompt, moduleUrl)));
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs login <group> [--profile readonly|readwrite|full] [--scopes <urls>] [--servers a,b] [--client-secret <file>] [--no-browser] [--replace] [--account <email>] [--with <part,...>] [--toolset all|google|curated]');
      const choice = parseLoginScopes(parsed.values);
      const toolset = parseToolset(parsed.values.toolset);
      const servers = parseServers(parsed.values);
      const clientSecretFile = typeof parsed.values['client-secret'] === 'string' ? parsed.values['client-secret'] : undefined;
      const noBrowser = parsed.values['no-browser'] === true;
      const replace = parsed.values.replace === true;
      const account = parseLoginAccount(parsed.values.account);
      const withParts = parseWith(parsed.values.with);
      return runLogin(
        {
          group,
          servers,
          clientSecretFile,
          profile: choice.profile,
          customScopes: choice.customScopes,
          noBrowser,
          replace,
          account,
          ...(withParts ? { with: withParts } : {}),
          ...(toolset ? { toolset } : {}),
        },
        registryFor,
        out,
      );
    }

    case 'scopes': {
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs scopes <group> [--profile readonly|readwrite|full] [--servers a,b] [--with <part,...>] [--toolset all|google|curated] [--json]');
      const withParts = parseWith(parsed.values.with);
      const toolset = parseToolset(parsed.values.toolset);
      return runScopes(
        {
          group,
          servers: parseServers(parsed.values),
          profile: parseProfile(parsed.values.profile),
          json: parsed.values.json === true,
          ...(withParts ? { with: withParts } : {}),
          ...(toolset ? { toolset } : {}),
        },
        registryFor(),
        out,
      );
    }

    case 'setup-admin': {
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: node gsm.mjs setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers a,b] [--replace] [--toolset all|google|curated]');
      }
      return runSetupAdmin(parseSetupAdminArgs(parsed.values), registryFor(), out);
    }

    case 'protect': {
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: node gsm.mjs protect [--backend dpapi|keychain|secret-service] | protect --off');
      }
      const protectCfg = loadConfig();
      return runProtect(
        {
          tokenDir: protectCfg.tokenDir,
          off: parsed.values.off === true,
          backend: optionalString(parsed.values.backend, 'backend'),
        },
        out,
      );
    }

    case 'setup-service-account': {
      // Play and Merchant Center: one key for the service-account group. Never read the key from an argument.
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: node gsm.mjs setup-service-account --key-file <service account JSON>  (or --remove)');
      }
      return runSetupServiceAccount(
        { keyFile: optionalString(parsed.values['key-file'], 'key-file'), remove: parsed.values.remove === true },
        out,
      );
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
      return parsed.values.check === true ? runStatusCheck(out) : runStatus(out);

    case 'logout': {
      const group = parseGroup(parsed.positionals, 'usage: node gsm.mjs logout <group> [--account <email>] [--local-only | --revoke-all]');
      const localOnly = parsed.values['local-only'] === true;
      const revokeAll = parsed.values['revoke-all'] === true;
      if (localOnly && revokeAll) throw new UsageError('use --local-only (do not revoke) or --revoke-all (revoke even when other groups use the account), not both');
      return runLogout(group, out, { localOnly, revokeAll, account: optionalString(parsed.values.account, 'account') });
    }

    case 'accounts': {
      // accounts [--group <g>]: the signed-in accounts. accounts default <group> <email>: the default one.
      if (parsed.positionals[0] === 'default') {
        const [, group, email] = parsed.positionals;
        if (!group || !email) throw new UsageError('usage: node gsm.mjs accounts default <group> <email>');
        return runSetDefaultAccount(group, email, out);
      }
      noPositionals(parsed.positionals, 'usage: node gsm.mjs accounts [--group <group>] | accounts default <group> <email>');
      return runAccounts(out, optionalString(parsed.values.group, 'group'));
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

    case 'health': {
      noPositionals(parsed.positionals, 'usage: node gsm.mjs health [--check] [--plugin <id>] [--json]');
      const roots = findRoots(moduleUrl);
      return runHealth(
        {
          roots,
          registry: loadProductRegistry(roots),
          check: parsed.values.check === true,
          pluginId: optionalString(parsed.values.plugin, 'plugin'),
          json: parsed.values.json === true,
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
  setInvocation(invocationFor(import.meta.url, process.cwd()));
  process.exitCode = await dispatch(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    console.error(invocationText(`gsm: ${err.message}`));
    console.error(invocationText('Run node gsm.mjs --help for usage.'));
    process.exitCode = 2;
  } else {
    console.error(invocationText(`gsm: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
