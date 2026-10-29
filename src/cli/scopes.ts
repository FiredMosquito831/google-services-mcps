/**
 * `gsm scopes`: the scope list and tool coverage of each profile for a group, with the products
 * (plugin ids) of the group and their tool counts. Gateway methods (reached through api_call) are counted
 * apart from the per-method tools, because the gateway checks their scopes per call. Makes no network call
 * and does not log in. Also the shared helpers that gsm login and gsm setup-admin use to pick servers and report coverage.
 */
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import { loadRegistry, scopesForGroup, serverByName, type AuthGroup, type Registry } from '../core/registry.js';
import {
  PROFILES,
  PROFILE_TEXT,
  coveredTools,
  heldBackBy,
  optionalPartsOf,
  requirementsForSpecs,
  resolveScopes,
  serversOfGroup,
  type Profile,
  type Requirement,
  type ScopeResolution,
} from '../core/scopes.js';
import type { ToolKind } from '../core/tools.js';
import { TOOLSET_TEXT, type Toolset } from '../core/toolset.js';
import type { CliGroup } from './args.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

/** The scopes Google adds for the email scope. They name the account and grant no tool access. */
export const IDENTITY_SCOPES: readonly string[] = ['https://www.googleapis.com/auth/userinfo.email', 'openid', 'email'];

/**
 * Every scope a server of the group can use: the scopes of its tools and gateway methods, plus the identity scopes. A
 * login keeps a stored scope only when it is in this set, so a scope that came from another group (a Cloud or Search
 * Console scope in a Gmail token, for example) is not requested again. A plugin knows only its own server, so the bundle
 * writes the group's list into the plugin's servers.json (groupScopes). The repository map has every server, so there
 * the servers the login did not cover are read too. `known` holds the requirements already built for `knownServers`.
 */
export async function groupScopeUniverse(
  reg: Registry,
  group: AuthGroup,
  cfg: RuntimeConfig,
  known: readonly Requirement[],
  knownServers: readonly string[],
): Promise<Set<string>> {
  const set = new Set<string>(IDENTITY_SCOPES);
  for (const scope of reg.groupScopes?.[group] ?? []) set.add(scope);
  for (const r of known) for (const scope of r.scopes) set.add(scope);
  const others = reg.servers.filter((s) => s.group === group && !knownServers.includes(s.name));
  if (others.length > 0) {
    // The notes about a missing catalog were printed for the login's own servers already.
    for (const r of await requirementsForSpecs(others, cfg, { warn: () => undefined })) for (const scope of r.scopes) set.add(scope);
  }
  // The server map the servers read (config/servers.json, or the plugin's servers.json) also lists the gateway APIs,
  // which the repository's product list does not. Its scope lists only add to the set; a missing file adds nothing.
  try {
    const served = loadRegistry();
    for (const scope of served.groupScopes?.[group] ?? []) set.add(scope);
    for (const scope of scopesForGroup(served, group)) set.add(scope);
  } catch {
    // No server map or scope list next to this module: the lists above are what is known.
  }
  return set;
}

/** The servers of one auth group, narrowed by --servers. Every requested name must belong to the group. */
export function selectGroupServers(reg: Registry, group: AuthGroup, requested?: readonly string[]): string[] {
  const names = serversOfGroup(reg, group);
  if (names.length === 0) {
    // Each plugin's CLI knows only its own servers, so the group may live in another plugin.
    throw new UsageError(`no servers of the ${group} group are in this plugin. Run the command from the plugin that holds them.`);
  }
  for (const name of requested ?? []) {
    if (names.includes(name)) continue;
    const owner = reg.servers.find((s) => s.name === name);
    throw new UsageError(
      owner
        ? `server "${name}" uses the ${owner.group} group. It is not part of ${group}.`
        : `unknown server "${name}". Servers of ${group}: ${names.join(', ')}`,
    );
  }
  return requested ? names.filter((n) => requested.includes(n)) : names;
}

/**
 * --with: every name must be an optional part of one of the servers (their scopePolicy.optional). Returns the names, or
 * an empty list when none were given.
 */
export function checkOptionalParts(reg: Registry, servers: readonly string[], requested: readonly string[] | undefined): string[] {
  if (!requested || requested.length === 0) return [];
  const known = optionalPartsOf(servers.map((name) => serverByName(reg, name)));
  for (const name of requested) {
    if (known.includes(name)) continue;
    throw new UsageError(
      known.length > 0
        ? `--with: "${name}" is not an optional part of ${servers.join(', ')}. Optional parts: ${known.join(', ')}`
        : `--with: ${servers.join(', ')} ha${servers.length === 1 ? 's' : 've'} no optional parts.`,
    );
  }
  return [...requested];
}

/** "3 tool(s)" or "3 tool(s) and 4 gateway method(s)", for a list of requirement keys. */
function countText(keys: readonly string[], requirements: readonly Requirement[]): string {
  const gateway = new Set(requirements.filter((r) => r.gateway).map((r) => r.tool));
  const g = keys.filter((k) => gateway.has(k)).length;
  const t = keys.length - g;
  return g > 0 ? `${t} tool(s) and ${g} gateway method(s)` : `${t} tool(s)`;
}

/**
 * The lines that say what a profile left out because of a product's scope policy (heldBackBy in core/scopes.ts). Each
 * starts with "Held back:". Empty for servers without a policy, so their output is unchanged.
 */
export function heldBackLines(requirements: readonly Requirement[], profile: Profile, include: readonly string[], scopes: readonly string[]): string[] {
  const held = heldBackBy(requirements, profile, include, scopes);
  const lines: string[] = [];
  for (const [p, list] of Object.entries(held.needsProfile)) {
    lines.push(
      `Held back: ${countText(list.tools, requirements)} need ${list.scopes.join(' or ')}, which only the ${p} profile requests (--profile ${p}; in the chat: auth_login with profile "${p}"): ${list.tools.join(', ')}`,
    );
  }
  if (held.noProfile.tools.length > 0) {
    lines.push(
      `Held back: ${countText(held.noProfile.tools, requirements)} need ${held.noProfile.scopes.join(' or ')}, which no profile requests (only an exact --scopes list asks for it): ${held.noProfile.tools.join(', ')}`,
    );
  }
  for (const [name, list] of Object.entries(held.optional)) {
    lines.push(
      `Held back: the optional part "${name}" (${countText(list.tools, requirements)}). Add it with --with ${name} (in the chat: auth_login with "with": ["${name}"]).`,
    );
  }
  return lines;
}

export type KindCounts = Record<ToolKind, { total: number; enabled: number }>;

export interface Coverage {
  total: number;
  enabled: number;
  byKind: KindCounts;
}

function coverageOfList(list: readonly Requirement[], scopes: readonly string[]): Coverage {
  const enabled = new Set(coveredTools(list, scopes));
  const byKind: KindCounts = {
    read: { total: 0, enabled: 0 },
    write: { total: 0, enabled: 0 },
    destructive: { total: 0, enabled: 0 },
    dynamic: { total: 0, enabled: 0 },
  };
  for (const r of list) {
    const bucket = byKind[r.kind];
    bucket.total += 1;
    if (enabled.has(r.tool)) bucket.enabled += 1;
  }
  return { total: list.length, enabled: enabled.size, byKind };
}

/** How many of the per-method tools a scope list enables, in total and by kind. Gateway methods are not counted here. */
export function coverageOf(requirements: readonly Requirement[], scopes: readonly string[]): Coverage {
  return coverageOfList(
    requirements.filter((r) => !r.gateway),
    scopes,
  );
}

/** How many gateway methods a scope list reaches, in total and by kind: the same check the gateway makes per call. */
export function gatewayCoverageOf(requirements: readonly Requirement[], scopes: readonly string[]): Coverage {
  return coverageOfList(
    requirements.filter((r) => r.gateway),
    scopes,
  );
}

/**
 * One line for people: "1234 of 1500 tools (read 300 of 300, write 0 of 900, destructive 0 of 300)".
 * The dynamic kind (tools whose effect depends on the call) is shown only when there are such tools.
 */
export function formatCoverage(c: Coverage, noun = 'tools'): string {
  const k = c.byKind;
  const dynamic = k.dynamic.total > 0 ? `, dynamic ${k.dynamic.enabled} of ${k.dynamic.total}` : '';
  return (
    `${c.enabled} of ${c.total} ${noun} (read ${k.read.enabled} of ${k.read.total}, ` +
    `write ${k.write.enabled} of ${k.write.total}, destructive ${k.destructive.enabled} of ${k.destructive.total}${dynamic})`
  );
}

/**
 * The gateway line of gsm login: "N gateway methods reachable with this profile, M need a broader profile".
 * Reachable means the gateway's scope check passes for the scopes. A reachable write still asks for approval.
 */
export function gatewayReachLine(requirements: readonly Requirement[], scopes: readonly string[], profile: Profile | 'custom'): string {
  const c = gatewayCoverageOf(requirements, scopes);
  const rest = c.total - c.enabled;
  return profile === 'custom'
    ? `${c.enabled} gateway methods reachable with these scopes, ${rest} not reachable.`
    : `${c.enabled} gateway methods reachable with this profile, ${rest} need a broader profile.`;
}

export interface ScopesRequest {
  group: CliGroup;
  servers?: string[];
  profile?: Profile;
  json: boolean;
  /** --with: optional parts of the products to include (a product's scopePolicy.optional). */
  with?: string[];
  /** --toolset: only the tools of this toolset count. Absent: GSM_TOOLSET, else all. */
  toolset?: Toolset;
}

/** The products (plugin ids) of a group's servers, each with its server names, in server-map order. */
export function productsOf(reg: Registry, servers: readonly string[]): Array<{ id: string; servers: string[] }> {
  const byId = new Map<string, string[]>();
  for (const name of servers) {
    const id = reg.servers.find((s) => s.name === name)?.plugin ?? name;
    byId.set(id, [...(byId.get(id) ?? []), name]);
  }
  return [...byId].map(([id, names]) => ({ id, servers: names }));
}

/** True when one of the servers reaches APIs through the gateway, so the gateway lines apply. */
export function hasGatewayApis(reg: Registry, servers: readonly string[]): boolean {
  return servers.some((name) => (serverByName(reg, name).gatewayApis?.length ?? 0) > 0);
}

export async function runScopes(req: ScopesRequest, reg: Registry, out: Output): Promise<number> {
  if (req.group === 'apikey') {
    // No OAuth scopes here, but --json still prints JSON (products and servers) like the other groups do.
    const note = 'the products in this group use an API key, not OAuth scopes. Save the key with: node gsm.mjs setup-apikey';
    if (!req.json) {
      out.log(`apikey: ${note}`);
      return 0;
    }
    const servers = reg.servers.filter((s) => (s.group as string) === 'apikey').map((s) => s.name);
    out.log(
      JSON.stringify({ group: 'apikey', products: productsOf(reg, servers).map((p) => p.id), servers, profiles: {}, note: `apikey: ${note}` }, null, 2),
    );
    return 0;
  }
  const group = req.group as AuthGroup;
  const cfg = loadConfig();
  const servers = selectGroupServers(reg, group, req.servers);
  const include = checkOptionalParts(reg, servers, req.with);
  const optionalParts = optionalPartsOf(servers.map((name) => serverByName(reg, name)));
  const toolset = req.toolset ?? cfg.toolset;
  const requirements = await requirementsForSpecs(
    servers.map((name) => serverByName(reg, name)),
    cfg,
    { warn: (line) => out.warn(line), ...(toolset !== 'all' ? { toolset } : {}) },
  );
  const profiles = req.profile ? [req.profile] : [...PROFILES];
  const products = productsOf(reg, servers);
  const gatewayTotal = requirements.filter((r) => r.gateway).length;
  const toolTotal = requirements.length - gatewayTotal;
  const showGateway = hasGatewayApis(reg, servers);

  const results = profiles.map((profile) => {
    const resolution: ScopeResolution = resolveScopes(requirements, profile, include);
    // What the product's scope policy left out. Empty, and not shown, for products without a policy.
    const heldBack = heldBackLines(requirements, profile, include, resolution.scopes);
    const byProduct = products.map((p) => {
      // Requirements are keyed "<server>/<tool>", so a product's tools are the ones whose server is one of its servers.
      const subset = requirements.filter((r) => p.servers.some((name) => r.tool.startsWith(`${name}/`)));
      return {
        id: p.id,
        coverage: coverageOf(subset, resolution.scopes),
        gateway: gatewayCoverageOf(subset, resolution.scopes),
      };
    });
    return {
      profile,
      scopes: resolution.scopes,
      coverage: coverageOf(requirements, resolution.scopes),
      gateway: gatewayCoverageOf(requirements, resolution.scopes),
      byProduct,
      heldBack,
    };
  });

  if (req.json) {
    const profilesOut = Object.fromEntries(
      results.map((r) => [
        r.profile,
        {
          scopes: r.scopes,
          covered: r.coverage.enabled,
          uncovered: r.coverage.total - r.coverage.enabled,
          byKind: r.coverage.byKind,
          gatewayMethods: {
            covered: r.gateway.enabled,
            uncovered: r.gateway.total - r.gateway.enabled,
            total: r.gateway.total,
            byKind: r.gateway.byKind,
          },
          products: Object.fromEntries(
            r.byProduct.map((p) => [
              p.id,
              {
                covered: p.coverage.enabled,
                total: p.coverage.total,
                gatewayCovered: p.gateway.enabled,
                gatewayTotal: p.gateway.total,
              },
            ]),
          ),
          ...(r.heldBack.length > 0 ? { heldBack: r.heldBack } : {}),
        },
      ]),
    );
    out.log(
      JSON.stringify(
        {
          group,
          products: products.map((p) => p.id),
          servers,
          tools: toolTotal,
          gatewayMethods: gatewayTotal,
          ...(optionalParts.length > 0 ? { optionalParts, with: include } : {}),
          // Only a toolset other than all adds the key, so the default output is unchanged.
          ...(toolset !== 'all' ? { toolset } : {}),
          profiles: profilesOut,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const gatewayPart = showGateway ? ` and ${gatewayTotal} gateway methods` : '';
  out.log(
    `Group ${group}: products ${products.map((p) => p.id).join(', ')} (servers ${servers.join(', ')}), ${toolTotal} tools${gatewayPart} in total`,
  );
  if (toolset !== 'all') out.log(`Toolset ${toolset}: only the tools of this toolset are counted (${TOOLSET_TEXT[toolset]}).`);
  for (const r of results) {
    out.log('');
    out.log(`${r.profile}: ${PROFILE_TEXT[r.profile]}`);
    out.log(`  covered ${r.coverage.enabled}, uncovered ${r.coverage.total - r.coverage.enabled}`);
    out.log(`  ${formatCoverage(r.coverage)}`);
    if (showGateway) {
      out.log(`  gateway methods covered ${r.gateway.enabled}, uncovered ${r.gateway.total - r.gateway.enabled}`);
      out.log(`  ${formatCoverage(r.gateway, 'gateway methods')}`);
    }
    const perProduct = r.byProduct.map((p) => `${p.id} ${p.coverage.enabled} of ${p.coverage.total}`).join(', ');
    out.log(`  products (tools covered): ${perProduct}`);
    if (showGateway) {
      const perGateway = r.byProduct.map((p) => `${p.id} ${p.gateway.enabled} of ${p.gateway.total}`).join(', ');
      out.log(`  products (gateway methods covered): ${perGateway}`);
    }
    out.log(`  scopes (${r.scopes.length}):`);
    for (const scope of r.scopes) out.log(`    ${scope}`);
    for (const line of r.heldBack) out.log(`  ${line}`);
  }
  out.log('');
  if (optionalParts.length > 0) {
    out.log(
      `Optional parts (left out of every profile unless named with --with): ${optionalParts.join(', ')}.${include.length > 0 ? ` Included here: ${include.join(', ')}.` : ''}`,
    );
  }
  out.log('Write and destructive tools also need GSM_ALLOW_WRITES=true. The token only decides which tools register.');
  if (showGateway) {
    out.log('Gateway methods run through api_call, which checks the same scopes on each call. Its writes and deletes ask for approval first.');
  }
  return 0;
}
