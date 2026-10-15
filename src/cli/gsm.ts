#!/usr/bin/env node
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadRegistry } from '../core/registry.js';
import { parseCliArgs, parseGroup, parseInstallArgs } from './args.js';
import { runStatus, runLogout, runSetupClient } from './credentials.js';
import { spawnRunner } from './exec.js';
import { runInstall } from './install.js';
import { runLogin } from './login.js';
import { findRoots } from './paths.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export const HELP = `gsm: install and manage the Google services MCP suite

Usage:
  gsm install   --agent <claude|codex|opencode|agy|all> --plugin <google-cloud|google-workspace|google-search|google-business|all>
                --scope <global|project|folder> [--path <dir>] [--servers <a,b>] [--allow-writes] [--dry-run] [--home <dir>]
  gsm uninstall --agent <...> --plugin <...> --scope <...> [--path <dir>] [--servers <a,b>] [--dry-run] [--home <dir>] [--keep-data]
  gsm login <group> [--servers <a,b>] [--client-secret <file>]
  gsm setup-client <path-to-client_secret.json> [--force]
  gsm status
  gsm logout <group>
  gsm --help

Scopes:  global = your home config, project = the current folder, folder = --path (must exist).
Groups:  cloud, workspace-user, searchconsole, business (login); workspace-admin (service account, no login).
Agents:  claude (official plugin CLI), codex (config.toml), opencode (opencode.json), agy (global scope only).
Flags:   --dry-run prints every planned change and command and writes nothing.
         --allow-writes sets GSM_ALLOW_WRITES=true for the installed servers (install only).
         --home overrides the home folder for codex, opencode and agy (not claude).
         --keep-data keeps claude's plugin data directory on uninstall.
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

async function dispatch(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  const moduleUrl = import.meta.url;
  switch (parsed.command) {
    case 'help':
      console.log(HELP);
      return 0;

    case 'install':
    case 'uninstall': {
      const request = parseInstallArgs(parsed.values, parsed.command, resolvePath);
      if (request.pathArg !== undefined) requireDirectory(request.pathArg, '--path');
      if (request.home !== undefined) requireDirectory(request.home, '--home');
      return runInstall(
        { ...request, action: parsed.command },
        {
          roots: findRoots(moduleUrl),
          registry: loadRegistry(moduleUrl),
          cwd: process.cwd(),
          defaultHome: homedir(),
          platform: process.platform,
          run: spawnRunner,
          out,
        },
      );
    }

    case 'login': {
      const group = parseGroup(parsed.positionals, 'usage: gsm login <group> [--servers a,b] [--client-secret <file>]');
      const servers = typeof parsed.values.servers === 'string' ? parsed.values.servers.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const clientSecretFile = typeof parsed.values['client-secret'] === 'string' ? parsed.values['client-secret'] : undefined;
      return runLogin({ group, servers, clientSecretFile }, () => loadRegistry(moduleUrl), out);
    }

    case 'setup-client': {
      if (parsed.positionals.length !== 1) throw new UsageError('usage: gsm setup-client <path-to-client_secret.json> [--force]');
      return runSetupClient(parsed.positionals[0] ?? '', parsed.values.force === true, out);
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
