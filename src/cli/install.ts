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
import { checkInstall, renderInstallList } from './list.js';
import { repoRootFor, serverFileFor, type InstallRoots } from './paths.js';
import { productIds, productRows } from './products.js';
import { printInstallResult, printResult, type Output } from './report.js';
import {
  productsOf,
  productsInRuntimeUse,
  readInstalls,
  recordInstall,
  recordUninstall,
  writeInstalls,
  type InstallRecord,
  type RecordKey,
  type ServerEntry,
} from './records.js';
import { copyRuntime, planRuntimeCopies, removeRuntime, runtimeFolderFor, runtimeServerFile } from './runtime.js';
import {
  AGENTS,
  AGY_GLOBAL_ONLY,
  UsageError,
  type AdapterContext,
  type AdapterResult,
  type AgentId,
  type PluginChoice,
  type Runner,
  type ServerRef,
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

const toEntry = (s: { name: string; plugin: string }): ServerEntry => ({ name: s.name, plugin: s.plugin });
const toRef = (s: ServerEntry): ServerRef => ({ name: s.name, plugin: s.plugin, group: '' });

/**
 * The login steps still needed for these servers: one command per OAuth group without a stored token, the client
 * file when it is missing, and the setup for the apikey and workspace-admin groups. Empty when nothing is needed.
 */
export function loginSteps(servers: readonly ServerSpec[]): string[] {
  const cfg = loadConfig();
  const groups = [...new Set(servers.map((s) => s.group as string))];
  const pending = groups.filter((g) => (OAUTH_GROUPS as readonly string[]).includes(g) && !existsSync(tokenFileFor(g, cfg)));
  const steps: string[] = [];
  if (pending.length > 0 && !existsSync(cfg.clientSecretFile)) {
    steps.push('node gsm.mjs setup-client <client_secret.json>   (once: the OAuth desktop client)');
  }
  for (const group of pending) {
    const names = servers.filter((s) => s.group === group).map((s) => s.name);
    steps.push(`node gsm.mjs login ${group} --profile readonly --servers ${names.join(',')}`);
  }
  if (groups.includes('apikey') && apiKeyState(apiKeyFileFor(cfg)) !== 'saved') {
    steps.push('node gsm.mjs setup-apikey   (reads GSM_API_KEY_INPUT or stdin)');
  }
  if (groups.includes('workspace-admin')) {
    steps.push('node gsm.mjs setup-admin --subject <super admin email> --key-file <service account JSON>');
  }
  return steps;
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

/**
 * The agents to act on. With --agent all, an agent that cannot apply here is skipped with a note. An agent named
 * explicitly is never skipped: its adapter reports the problem as an error.
 */
function pickAgents(run: InstallRun, home: string, out: Output): AgentId[] {
  const agents: AgentId[] = [];
  for (const agent of run.agent === 'all' ? [...AGENTS] : [run.agent]) {
    if (run.agent === 'all' && agent === 'claude' && run.home !== undefined) {
      // The claude CLI always uses the real Claude Code configuration, so --home must never reach it.
      out.log('[claude] skipped: --home does not apply to claude (it always uses your real Claude Code configuration)');
      continue;
    }
    if (run.agent === 'all' && agent === 'agy') {
      if (run.scope !== 'global') {
        out.log(`[agy] skipped: ${AGY_GLOBAL_ONLY}`);
        continue;
      }
      if (run.action === 'install' && !existsSync(join(home, '.gemini', 'config'))) {
        out.log(`[agy] skipped: agy config folder not found (${join(home, '.gemini', 'config')}). Run agy once, then retry.`);
        continue;
      }
    }
    agents.push(agent);
  }
  return agents;
}

export async function runInstall(run: InstallRun, env: InstallEnv): Promise<number> {
  const { out } = env;
  const plugins = selectPlugins(run.plugin, productIds(env.registry));
  const servers = selectServers(env.registry, run.servers, plugins);
  const home = run.home ?? env.defaultHome;
  // Global has no folder. Project and local act on --path, or on the current folder.
  const folder = run.scope === 'global' ? null : (run.pathArg ?? env.cwd);
  const agents = pickAgents(run, home, out);
  const products = productsOf(servers);

  // Claude installs whole plugins, so --servers selects the plugins that contain them.
  const claudePlugins = run.servers ? products : plugins;
  const claudeServers = env.registry.servers.filter((s) => claudePlugins.includes(s.plugin)).map(toEntry);
  if (agents.includes('claude') && run.servers) out.log(`[claude] installs whole plugins: ${claudePlugins.join(', ')}`);
  if (run.dryRun) out.log('dry-run: nothing will be written or run.');

  // The record is read before anything is written, so a damaged record file stops the run with nothing changed.
  let records: InstallRecord[] = readInstalls(home);
  const keyFor = (agent: AgentId): RecordKey => ({ agent, scope: run.scope, folder });

  // Every agent except claude runs the runtime copy, so the copy is made first. A plugin folder that is missing
  // stops a real install here, before any config file is touched.
  const fileAgents = agents.filter((a) => a !== 'claude');
  const copies = fileAgents.length > 0 && run.action === 'install' ? planRuntimeCopies(env.roots, home, products) : [];
  for (const copy of copies) {
    if (copy.sourceExists) continue;
    const message = `the plugin folder for ${copy.product} was not found: ${copy.source}. The plugins are built into plugins/ (run npm run build), or reinstall the package.`;
    if (!run.dryRun) throw new Error(message);
    out.warn(`warning: ${message}`);
  }
  if (run.action === 'install' && fileAgents.length > 0) {
    for (const server of servers) {
      const file = serverFileFor(env.roots, server);
      if (!existsSync(file)) {
        out.warn(`warning: server bundle not found: ${file} (build the bundles; the agent cannot start this server until it exists)`);
      }
    }
  }
  for (const copy of copies) {
    if (run.dryRun) {
      out.log(`would copy runtime: ${copy.source} -> ${copy.target}`);
    } else {
      copyRuntime(copy);
      out.log(`copied runtime: ${copy.target}`);
    }
  }

  let failed = false;
  const done: Array<{ agent: AgentId; result: AdapterResult }> = [];
  for (const agent of agents) {
    const ctx: AdapterContext = {
      home,
      cwd: env.cwd,
      scope: run.scope,
      pathArg: folder ?? undefined,
      pluginRoot: env.roots.layout === 'plugin' ? env.roots.root : undefined,
      repoRoot: repoRootFor(env.roots),
      marketplace: run.marketplace,
      plugins: agent === 'claude' ? claudePlugins : plugins,
      servers,
      serverFile: (s) => runtimeServerFile(home, s),
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
      if (run.action === 'install' && !run.dryRun) printInstallResult(result, out);
      else printResult(result, run.dryRun, out);
      if (result.errors.length > 0) failed = true;
      else done.push({ agent, result });
    } catch (err) {
      failed = true;
      out.warn(`[${agent}] error: ${(err as Error).message}`);
    }
  }

  // The record follows the agents that succeeded. A dry run computes the same record, but never writes it.
  for (const { agent, result } of done) {
    const entries = agent === 'claude' ? claudeServers : servers.map(toEntry);
    records =
      run.action === 'install'
        ? recordInstall(records, keyFor(agent), result.changes[0]?.file ?? null, entries)
        : recordUninstall(records, keyFor(agent), entries);
  }
  if (!run.dryRun && done.length > 0) writeInstalls(home, records);

  // A runtime copy is kept while a non-claude record still uses its product. Uninstall removes the ones no longer used.
  // Install removes the copies it just made when no agent ended up using them (every agent failed). A dry run removes nothing.
  const inUse = productsInRuntimeUse(records);
  const candidates = run.action === 'uninstall' ? products : run.dryRun ? [] : copies.map((c) => c.product);
  for (const product of candidates) {
    if (inUse.has(product)) continue;
    const target = runtimeFolderFor(home, product);
    if (!existsSync(target)) continue;
    if (run.dryRun) {
      out.log(`would remove runtime copy: ${target}`);
    } else {
      removeRuntime(home, product);
      out.log(`removed runtime copy: ${target}`);
    }
  }

  if (run.action === 'install' && !run.dryRun && !failed) {
    const steps = loginSteps(servers);
    if (steps.length > 0) {
      out.log('Still needed before these servers can call Google:');
      for (const step of steps) out.log(`  ${step}`);
    }
  }
  if (run.action === 'install') out.log(installSummary(run, env, servers, failed, agents));
  return failed ? 1 : 0;
}

/** The arguments of `gsm uninstall --all`. */
export interface UninstallAllRun {
  dryRun: boolean;
  yes: boolean;
  keepData: boolean;
  home?: string;
}

/**
 * `gsm uninstall --all`: removes every install in the record. It prints the list first. Without --dry-run it
 * needs --yes, or an interactive `confirm` answer (the CLI passes one only when run from a terminal).
 * Logins and token files are never touched.
 */
export async function runUninstallAll(run: UninstallAllRun, env: InstallEnv, confirm?: () => Promise<boolean>): Promise<number> {
  const { out } = env;
  const home = run.home ?? env.defaultHome;
  const records = readInstalls(home);
  if (records.length === 0) {
    out.log(`No gsm installs are recorded in ${home}. Nothing to uninstall.`);
    return 0;
  }
  for (const line of renderInstallList(home, records.map((r) => checkInstall(home, r)))) out.log(line);

  if (run.dryRun) {
    await uninstallRecords(records, run, env, true);
    out.log('dry-run: nothing will be removed.');
    return 0;
  }
  if (!run.yes) {
    if (!confirm) {
      throw new UsageError('uninstall --all removes every install listed above. Run it again with --yes to confirm (--yes is required when gsm is not run from a terminal). Nothing was removed.');
    }
    if (!(await confirm())) {
      out.log('Nothing was removed.');
      return 0;
    }
  }
  const failed = await uninstallRecords(records, run, env, false);
  return failed ? 1 : 0;
}

/** Uninstalls each record through its agent. Returns true when one failed. Writes the record and the runtime copies unless dry. */
async function uninstallRecords(records: readonly InstallRecord[], run: UninstallAllRun, env: InstallEnv, dry: boolean): Promise<boolean> {
  const { out } = env;
  const home = run.home ?? env.defaultHome;
  let failed = false;
  let current = [...records];
  for (const record of records) {
    const where = record.folder ? ` at ${record.folder}` : '';
    out.log(`removing ${record.agent} ${record.scope}${where}`);
    const ctx: AdapterContext = {
      home,
      cwd: env.cwd,
      scope: record.scope,
      pathArg: record.folder ?? undefined,
      pluginRoot: undefined,
      repoRoot: repoRootFor(env.roots),
      plugins: record.products,
      servers: record.servers.map(toRef),
      serverFile: (s) => runtimeServerFile(home, s),
      dryRun: dry,
      allowWrites: false,
      keepData: run.keepData,
      run: env.run,
      platform: env.platform,
    };
    try {
      const result = await ADAPTERS[record.agent].uninstall(ctx);
      printResult(result, dry, out);
      if (result.errors.length > 0) {
        failed = true;
        continue;
      }
      current = recordUninstall(current, { agent: record.agent, scope: record.scope, folder: record.folder }, record.servers);
    } catch (err) {
      failed = true;
      out.warn(`[${record.agent}] error: ${(err as Error).message}`);
    }
  }
  if (dry) return failed;

  writeInstalls(home, current);
  const inUse = productsInRuntimeUse(current);
  for (const product of new Set(records.flatMap((r) => r.products))) {
    if (inUse.has(product)) continue;
    if (!existsSync(runtimeFolderFor(home, product))) continue;
    removeRuntime(home, product);
    out.log(`removed runtime copy: ${runtimeFolderFor(home, product)}`);
  }
  return failed;
}
