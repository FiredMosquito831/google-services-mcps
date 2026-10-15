#!/usr/bin/env node
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseCliArgs, parseGroup, parseInstallArgs, parseLoginScopes, parseProfile, parseServers, parseSetupAdminArgs } from './args.js';
import { runSetupAdmin } from './admin.js';
import { runSetupApiKey } from './apikey.js';
import { runStatus, runLogout, runSetupClient } from './credentials.js';
import { spawnRunner } from './exec.js';
import { runInstall } from './install.js';
import { runLogin } from './login.js';
import { findRoots } from './paths.js';
import { loadProductRegistry, productIds } from './products.js';
import type { Output } from './report.js';
import { runScopes } from './scopes.js';
import { UsageError } from './types.js';

export const HELP = `gsm: install and manage the Google services MCP suite

Commands:
  install       Install product plugins for an agent: claude, codex, opencode, agy, or all
  uninstall     Remove the product plugins again; only the gsm entries are removed
  login         Log in one OAuth group. "gsm login apikey" only explains the API key step
  scopes        Show each profile's scopes, the products of a group and their tool counts
  setup-client  Save the OAuth Desktop client file (client_secret.json)
  setup-apikey  Save the API key for the apikey group (reads GSM_API_KEY_INPUT or stdin)
  setup-admin   Set up workspace-admin: service account and super admin subject
  status        Show logins, the API key and the security posture of each token
  logout        Remove one group's stored token (apikey: shows where the key file is)
  --help        Show this help

Usage:
  gsm install   --agent <claude|codex|opencode|agy|all> --plugin <id[,id...]|all> --scope <global|project|folder>
                [--path <dir>] [--servers <a,b>] [--allow-writes] [--confirmation <every-change|destructive-only|off>]
                [--dry-run] [--home <dir>]
  gsm uninstall --agent <...> --plugin <...> --scope <...> [--path <dir>] [--servers <a,b>] [--dry-run] [--home <dir>] [--keep-data]
  gsm login <group> [--profile readonly|readwrite|full] [--scopes <url,url>] [--servers <a,b>] [--client-secret <file>]
  gsm scopes <group> [--profile readonly|readwrite|full] [--servers <a,b>] [--json]
  gsm setup-client <path-to-client_secret.json> [--force]
  gsm setup-apikey [--force]
  gsm setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers <a,b>]
  gsm status
  gsm logout <group>
  gsm --help

Plugins: --plugin takes product ids, for example gcloud, gsc, gsearch, gdrive, gmail or gai. An unknown id is refused,
         and the error lists the valid ids. Plugin folders bundle only their own product.
Profiles: readonly (default) covers the read tools with read-only scopes. readwrite adds write and
          destructive tools with the narrowest scopes that cover them. full covers every tool with the
          broadest listed scope. --scopes gives an exact list instead, and nothing else is added.
          The scope list decides which tools the token can run: a tool whose scopes it lacks is not registered.
          After a login, restart the MCP server (or restart the agent) so the new scopes apply.
Scopes:  global = your home config, project = the current folder, folder = --path (must exist).
Groups:  OAuth login: cloud, workspace-user, searchconsole, business, developer.
         apikey: no login. Save the key with setup-apikey (used by gsearch).
         workspace-admin: setup-admin (service account with domain-wide delegation, no login).
Agents:  claude (official plugin CLI), codex (config.toml), opencode (opencode.json), agy (global scope only).
Flags:   --dry-run prints every planned change and command and writes nothing.
         --allow-writes sets GSM_ALLOW_WRITES=true for the installed servers (install only).
         --confirmation sets GSM_CONFIRMATION (every-change, destructive-only or off) for codex, opencode and agy.
                        For claude it is the plugin option "confirmation": the command prints how to set it.
                        Without the flag nothing is written, so the plugin default applies.
         --home overrides the home folder for codex, opencode and agy (not claude).
         --keep-data keeps claude's plugin data directory on uninstall.
         --json prints gsm scopes output as JSON.
API key: setup-apikey reads GSM_API_KEY_INPUT or stdin. The key is never a command-line argument and is never printed.
Backups: an existing config file is copied to <file>.gsm-backup-<YYYYMMDD-HHMMSS> before it changes.
`;

const resolvePath = (p: string): string => resolve(process.cwd(), p);

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

async function dispatch(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  const moduleUrl = import.meta.url;
  // The product map: servers.json next to bin/ in a plugin folder, or config/products.json in the repo.
  const registryFor = () => loadProductRegistry(findRoots(moduleUrl), moduleUrl);

  switch (parsed.command) {
    case 'help':
      console.log(HELP);
      return 0;

    case 'install':
    case 'uninstall': {
      const roots = findRoots(moduleUrl);
      const registry = loadProductRegistry(roots, moduleUrl);
      const request = parseInstallArgs(parsed.values, parsed.command, resolvePath, productIds(registry));
      if (request.pathArg !== undefined) requireDirectory(request.pathArg, '--path');
      if (request.home !== undefined) requireDirectory(request.home, '--home');
      return runInstall(
        { ...request, action: parsed.command },
        {
          roots,
          registry,
          cwd: process.cwd(),
          defaultHome: homedir(),
          platform: process.platform,
          run: spawnRunner,
          out,
        },
      );
    }

    case 'login': {
      const group = parseGroup(parsed.positionals, 'usage: gsm login <group> [--profile readonly|readwrite|full] [--scopes <urls>] [--servers a,b] [--client-secret <file>]');
      const choice = parseLoginScopes(parsed.values);
      const servers = parseServers(parsed.values);
      const clientSecretFile = typeof parsed.values['client-secret'] === 'string' ? parsed.values['client-secret'] : undefined;
      return runLogin({ group, servers, clientSecretFile, profile: choice.profile, customScopes: choice.customScopes }, registryFor, out);
    }

    case 'scopes': {
      const group = parseGroup(parsed.positionals, 'usage: gsm scopes <group> [--profile readonly|readwrite|full] [--servers a,b] [--json]');
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
        throw new UsageError('usage: gsm setup-admin --subject <admin email> --key-file <service account JSON> [--profile readonly|readwrite|full] [--servers a,b]');
      }
      return runSetupAdmin(parseSetupAdminArgs(parsed.values), registryFor(), out);
    }

    case 'setup-client': {
      if (parsed.positionals.length !== 1) throw new UsageError('usage: gsm setup-client <path-to-client_secret.json> [--force]');
      return runSetupClient(parsed.positionals[0] ?? '', parsed.values.force === true, out);
    }

    case 'setup-apikey': {
      // A positional argument could be the key itself, so the error does not repeat it.
      if (parsed.positionals.length !== 0) {
        throw new UsageError('usage: gsm setup-apikey [--force]. The key is read from GSM_API_KEY_INPUT or stdin, never from an argument.');
      }
      return runSetupApiKey({ force: parsed.values.force === true, env: process.env, readStdin }, out);
    }

    case 'status':
      return runStatus(out);

    case 'logout': {
      const group = parseGroup(parsed.positionals, 'usage: gsm logout <group>');
      return runLogout(group, out);
    }
  }
}

try {
  process.exitCode = await dispatch(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`gsm: ${err.message}`);
    console.error('Run gsm --help for usage.');
    process.exitCode = 2;
  } else {
    console.error(`gsm: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
