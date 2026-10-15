import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../core/config.js';
import { serverByName, type Registry, type ServerSpec } from '../core/registry.js';
import * as agy from './adapters/agy.js';
import * as claude from './adapters/claude.js';
import * as codex from './adapters/codex.js';
import * as opencode from './adapters/opencode.js';
import { OAUTH_GROUPS, type InstallRequestArgs } from './args.js';
import { apiKeyFileFor, apiKeyState, tokenFileFor } from './credentials.js';
import { productIds, productRows } from './products.js';
import { repoRootFor, serverFileFor, type InstallRoots } from './paths.js';
import { printResult, type Output } from './report.js';
import {
  AGENTS,
  UsageError,
  type AdapterContext,
  type AdapterResult,
  type AgentId,
  type PluginChoice,
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

/**
 * The plugin ids to act on. --plugin was already checked against `known` (the product ids of this
 * plugin's servers.json, or of config/products.json in the repo), so the choice is used as it is.
 */
export function selectPlugins(choice: PluginChoice, known: readonly string[]): string[] {
  return choice === 'all' ? [...known] : [...choice];
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
  // The group field is typed narrowly in core; apikey is a group of its own.
  const groups = servers.map((s) => s.group as string);
  const loginGroups = [...new Set(groups)].filter((g) => (OAUTH_GROUPS as readonly string[]).includes(g));
  const pending = loginGroups.filter((g) => !existsSync(tokenFileFor(g, cfg)));
  if (pending.length > 0) {
    out.log('Login still needed before these servers can call Google:');
    for (const group of pending) out.log(`  gsm login ${group}`);
    if (!existsSync(cfg.clientSecretFile)) out.log('First save the OAuth Desktop client: gsm setup-client <client_secret.json>');
  }
  if (groups.includes('apikey') && apiKeyState(apiKeyFileFor(cfg)) !== 'saved') {
    out.log('The apikey products need an API key. Save it with: gsm setup-apikey (reads GSM_API_KEY_INPUT or stdin)');
  }
  if (groups.includes('workspace-admin')) {
    out.log('workspace-admin needs a service account. Run: gsm login workspace-admin (prints the setup steps)');
  }
}

/**
 * The write setting in the summary, for the agents that ran. --allow-writes reaches codex, opencode and agy as
 * GSM_ALLOW_WRITES=true. Claude does not get it: its write setting is the plugin option allow_writes, which the
 * user sets with `claude plugin configure`, so the summary names that command and never says writes are enabled for it.
 */
function writesText(allowWrites: boolean, agents: readonly AgentId[], products: readonly string[]): string {
  if (!allowWrites) return 'not set (write tools stay off)';
  if (!agents.includes('claude')) return 'enabled (GSM_ALLOW_WRITES=true)';
  const claudeNote = `set the plugin option allow_writes with ${products.map((p) => `\`claude plugin configure ${claude.claudePluginId(p)}\``).join(', ')}`;
  const others = agents.filter((a) => a !== 'claude');
  return others.length === 0 ? claudeNote : `enabled (GSM_ALLOW_WRITES=true) for ${others.join(', ')}; for claude, ${claudeNote}`;
}

/**
 * The last line of an install: the number of products, servers and tools, and the confirmation and write
 * settings that were set. A product without a tool count (no tool-map.json and no generatedToolCount) is
 * counted as unknown instead of zero. `agents` are the agents that ran (after any skipped by --agent all).
 */
export function installSummary(
  run: InstallRun,
  env: InstallEnv,
  servers: readonly ServerSpec[],
  failed = false,
  agents: readonly AgentId[] = run.agent === 'all' ? [...AGENTS] : [run.agent],
): string {
  const products = [...new Set(servers.map((s) => s.plugin))];
  const counts = new Map<string, number | undefined>();
  try {
    for (const row of productRows(env.roots, env.registry, products)) counts.set(row.id, row.tools);
  } catch {
    // Without a readable product map the tool counts are unknown; the other numbers are still printed.
  }
  let tools = 0;
  let unknown = 0;
  for (const id of products) {
    const count = counts.get(id);
    if (count === undefined) unknown += 1;
    else tools += count;
  }
  const toolText = `${tools} tools${unknown > 0 ? ` (${unknown} product(s) without a tool count)` : ''}`;
  const confirmation = run.confirmation ?? 'not set (plugin default every-change)';
  const writes = writesText(run.allowWrites, agents, products);
  // A run with an error must not say "installed": the error was printed above and the exit code is 1.
  const verb = run.dryRun ? 'would install' : failed ? 'could not install' : 'installed';
  const note = failed && !run.dryRun ? ' (an agent reported an error above)' : '';
  return `summary: ${verb} ${products.length} products, ${servers.length} servers, ${toolText}${note}; confirmation: ${confirmation}; writes: ${writes}`;
}

export async function runInstall(run: InstallRun, env: InstallEnv): Promise<number> {
  const { out } = env;
  const plugins = selectPlugins(run.plugin, productIds(env.registry));
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
      confirmation: run.confirmation,
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
  if (run.action === 'install') out.log(installSummary(run, env, servers, failed, agents));
  return failed ? 1 : 0;
}
