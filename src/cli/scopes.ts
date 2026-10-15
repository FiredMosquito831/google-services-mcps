/**
 * `gsm scopes`: the scope list and tool coverage of each profile for a group, with the products
 * (plugin ids) of the group and their tool counts. Makes no network call and does not log in.
 * Also the shared helpers that gsm login and gsm setup-admin use to pick servers and report coverage.
 */
import { loadConfig } from '../core/config.js';
import type { AuthGroup, Registry } from '../core/registry.js';
import {
  PROFILES,
  PROFILE_TEXT,
  coveredTools,
  requirementsFor,
  resolveScopes,
  serversOfGroup,
  type Profile,
  type Requirement,
  type ScopeResolution,
} from '../core/scopes.js';
import type { ToolKind } from '../core/tools.js';
import type { CliGroup } from './args.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

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

export type KindCounts = Record<ToolKind, { total: number; enabled: number }>;

export interface Coverage {
  total: number;
  enabled: number;
  byKind: KindCounts;
}

/** How many of the requirements a scope list enables, in total and by kind. */
export function coverageOf(requirements: readonly Requirement[], scopes: readonly string[]): Coverage {
  const enabled = new Set(coveredTools(requirements, scopes));
  const byKind: KindCounts = {
    read: { total: 0, enabled: 0 },
    write: { total: 0, enabled: 0 },
    destructive: { total: 0, enabled: 0 },
    dynamic: { total: 0, enabled: 0 },
  };
  for (const r of requirements) {
    const bucket = byKind[r.kind];
    bucket.total += 1;
    if (enabled.has(r.tool)) bucket.enabled += 1;
  }
  return { total: requirements.length, enabled: enabled.size, byKind };
}

/**
 * One line for people: "1234 of 1500 tools (read 300 of 300, write 0 of 900, destructive 0 of 300)".
 * The dynamic kind (tools whose effect depends on the call) is shown only when there are such tools.
 */
export function formatCoverage(c: Coverage): string {
  const k = c.byKind;
  const dynamic = k.dynamic.total > 0 ? `, dynamic ${k.dynamic.enabled} of ${k.dynamic.total}` : '';
  return (
    `${c.enabled} of ${c.total} tools (read ${k.read.enabled} of ${k.read.total}, ` +
    `write ${k.write.enabled} of ${k.write.total}, destructive ${k.destructive.enabled} of ${k.destructive.total}${dynamic})`
  );
}

export interface ScopesRequest {
  group: CliGroup;
  servers?: string[];
  profile?: Profile;
  json: boolean;
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

export async function runScopes(req: ScopesRequest, reg: Registry, out: Output): Promise<number> {
  if (req.group === 'apikey') {
    out.log('apikey: the products in this group use an API key, not OAuth scopes. Save the key with: gsm setup-apikey');
    return 0;
  }
  const group = req.group as AuthGroup;
  const cfg = loadConfig();
  const servers = selectGroupServers(reg, group, req.servers);
  const requirements = await requirementsFor(servers, cfg);
  const profiles = req.profile ? [req.profile] : [...PROFILES];
  const products = productsOf(reg, servers);

  const results = profiles.map((profile) => {
    const resolution: ScopeResolution = resolveScopes(requirements, profile);
    const byProduct = products.map((p) => {
      // Requirements are keyed "<server>/<tool>", so a product's tools are the ones whose server is one of its servers.
      const subset = requirements.filter((r) => p.servers.some((name) => r.tool.startsWith(`${name}/`)));
      return { id: p.id, coverage: coverageOf(subset, resolution.scopes) };
    });
    return { profile, scopes: resolution.scopes, coverage: coverageOf(requirements, resolution.scopes), byProduct };
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
          products: Object.fromEntries(r.byProduct.map((p) => [p.id, { covered: p.coverage.enabled, total: p.coverage.total }])),
        },
      ]),
    );
    out.log(
      JSON.stringify(
        { group, products: products.map((p) => p.id), servers, tools: requirements.length, profiles: profilesOut },
        null,
        2,
      ),
    );
    return 0;
  }

  out.log(`Group ${group}: products ${products.map((p) => p.id).join(', ')} (servers ${servers.join(', ')}), ${requirements.length} tools in total`);
  for (const r of results) {
    out.log('');
    out.log(`${r.profile}: ${PROFILE_TEXT[r.profile]}`);
    out.log(`  covered ${r.coverage.enabled}, uncovered ${r.coverage.total - r.coverage.enabled}`);
    out.log(`  ${formatCoverage(r.coverage)}`);
    const perProduct = r.byProduct.map((p) => `${p.id} ${p.coverage.enabled} of ${p.coverage.total}`).join(', ');
    out.log(`  products (tools covered): ${perProduct}`);
    out.log(`  scopes (${r.scopes.length}):`);
    for (const scope of r.scopes) out.log(`    ${scope}`);
  }
  out.log('');
  out.log('Write and destructive tools also need GSM_ALLOW_WRITES=true. The token only decides which tools register.');
  return 0;
}
