import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { serverByName, type Registry, type ServerSpec } from '../core/registry.js';
import * as agy from './adapters/agy.js';
import * as claude from './adapters/claude.js';
import * as codex from './adapters/codex.js';
import * as opencode from './adapters/opencode.js';
import { LOGIN_GROUPS, type InstallRequestArgs } from './args.js';
import { tokenFileFor } from './credentials.js';
import { ownPlugin, repoRootFor, serverFileFor, type InstallRoots } from './paths.js';
import { printResult, type Output } from './report.js';
import {
  AGENTS,
  UsageError,
  type AdapterContext,
  type AdapterResult,
  type AgentId,
  type Runner,
} from './types.js';

export interface InstallRun extends InstallRequestArgs {
  action: 'install' | 'uninstall';
}

export interface InstallEnv {
  roots: InstallRoots;
  registry: Registry;
  cwd: string;
  defaultHome: string;
  platform: NodeJS.Platform;
  run: Runner;
  out: Output;
}

interface AdapterModule {
  install(ctx: AdapterContext): Promise<AdapterResult>;
  uninstall(ctx: AdapterContext): Promise<AdapterResult>;
}

const ADAPTERS: Record<AgentId, AdapterModule> = { claude, codex, opencode, agy };

/** Plugin folders bundle only their own plugin. The repo can install any plugin. */
export function selectPlugins(choice: string, roots: InstallRoots, known: readonly string[]): string[] {
  const own = ownPlugin(roots);
  if (own !== undefined) {
    if (choice === 'all' || choice === own) return [own];
    throw new UsageError(`this is the ${own} plugin folder, which bundles only ${own}. To install ${choice}, run gsm from the repo checkout.`);
  }
  return choice === 'all' ? [...known] : [choice];
}

/** Servers of the selected plugins, or the named servers (each must belong to a selected plugin). */
export function selectServers(registry: Registry, names: readonly string[] | undefined, plugins: readonly string[]): ServerSpec[] {
  if (!names || names.length === 0) return registry.servers.filter((s) => plugins.includes(s.plugin));
  const picked: ServerSpec[] = [];
  for (const name of names) {
    let spec: ServerSpec;
    try {
      spec = serverByName(registry, name);
    } catch {
      throw new UsageError(`unknown server "${name}". Known servers: ${registry.servers.map((s) => s.name).join(', ')}`);
    }
    if (!plugins.includes(spec.plugin)) {
      throw new UsageError(`server "${name}" belongs to plugin ${spec.plugin}. Add --plugin ${spec.plugin} (or --plugin all).`);
    }
    if (!picked.includes(spec)) picked.push(spec);
  }
  return picked;
}

function printLoginHints(servers: readonly ServerSpec[], out: Output): void {
  const cfg = loadConfig();
  const loginGroups = [...new Set(servers.map((s) => s.group))].filter((g) => (LOGIN_GROUPS as readonly string[]).includes(g));
  const pending = loginGroups.filter((g) => !existsSync(tokenFileFor(g, cfg)));
  if (pending.length > 0) {
    out.log('Login still needed before these servers can call Google:');
    for (const group of pending) out.log(`  gsm login ${group}`);
    if (!existsSync(cfg.clientSecretFile)) out.log('First save the OAuth Desktop client: gsm setup-client <client_secret.json>');
  }
  if (servers.some((s) => s.group === 'workspace-admin')) {
    out.log('workspace-admin needs a service account. Run: gsm login workspace-admin (prints the setup steps)');
  }
}

export async function runInstall(run: InstallRun, env: InstallEnv): Promise<number> {
  const { out } = env;
  const plugins = selectPlugins(run.plugin, env.roots, Object.keys(env.registry.plugins));
  const servers = selectServers(env.registry, run.servers, plugins);
  const home = run.home ?? env.defaultHome;

  // With --agent all, an agent that cannot apply here is skipped with a note. An agent named
  // explicitly is never skipped: its adapter reports the problem as an error.
  const agents: AgentId[] = [];
  for (const agent of run.agent === 'all' ? [...AGENTS] : [run.agent]) {
    if (run.agent === 'all' && agent === 'claude' && run.home !== undefined) {
      // The claude CLI always uses the real Claude Code configuration, so --home must never reach it.
      out.log('[claude] skipped: --home does not apply to claude (it always uses your real Claude Code configuration)');
      continue;
    }
    if (run.agent === 'all' && agent === 'agy') {
      if (run.scope !== 'global') {
        out.log('[agy] skipped: agy supports only global scope in this build');
        continue;
      }
      if (run.action === 'install' && !existsSync(join(home, '.gemini', 'config'))) {
        out.log(`[agy] skipped: agy config folder not found (${join(home, '.gemini', 'config')}). Run agy once, then retry.`);
        continue;
      }
    }
    agents.push(agent);
  }

  // Claude installs whole plugins, so --servers selects the plugins that contain them.
  const claudePlugins = run.servers ? [...new Set(servers.map((s) => s.plugin))] : plugins;
  if (agents.includes('claude') && run.servers) {
    out.log(`[claude] installs whole plugins: ${claudePlugins.join(', ')}`);
  }

  if (run.dryRun) out.log('dry-run: nothing will be written or run.');

  if (run.action === 'install' && agents.some((a) => a !== 'claude')) {
    for (const server of servers) {
      const file = serverFileFor(env.roots, server);
      if (!existsSync(file)) {
        out.warn(`warning: server bundle not found: ${file} (build the bundles; the agent cannot start this server until it exists)`);
      }
    }
  }

  let failed = false;
  for (const agent of agents) {
    const ctx: AdapterContext = {
      home,
      cwd: env.cwd,
      scope: run.scope,
      pathArg: run.pathArg,
      pluginRoot: env.roots.layout === 'plugin' ? env.roots.root : undefined,
      repoRoot: repoRootFor(env.roots),
      plugins: agent === 'claude' ? claudePlugins : plugins,
      servers,
      serverFile: (s) => serverFileFor(env.roots, s),
      dryRun: run.dryRun,
      allowWrites: run.allowWrites,
      keepData: run.keepData,
      run: env.run,
      platform: env.platform,
    };
    try {
      const adapter = ADAPTERS[agent];
      const result = run.action === 'install' ? await adapter.install(ctx) : await adapter.uninstall(ctx);
      printResult(result, run.dryRun, out);
      if (result.errors.length > 0) failed = true;
    } catch (err) {
      failed = true;
      out.warn(`[${agent}] error: ${(err as Error).message}`);
    }
  }

  if (run.action === 'install' && !run.dryRun && !failed) printLoginHints(servers, out);
  return failed ? 1 : 0;
}
