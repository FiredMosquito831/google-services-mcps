/**
 * Scope profiles. A profile is a set of OAuth scopes chosen at login, sized to
 * the tools it has to run. Resolution is a greedy hitting-set over each tool's
 * any-of scope list: a tool is covered when the token holds at least one of its
 * scopes. Tools with no scopes are always covered.
 *
 * resolveScopes is pure. requirementsFor builds the tool definitions of some
 * servers, and reads the gateway catalog for their gateway methods, without starting
 * them and without a network call. A gateway method is a requirement too, so the
 * profiles and the login summary cover it the same way the gateway checks it per call.
 */
import type { RuntimeConfig } from './config.js';
import {
  gatewayMethodsOf,
  loadRegistry,
  pluginModuleUrl,
  serverByName,
  type AuthGroup,
  type Registry,
  type ScopePolicy,
  type ServerSpec,
} from './registry.js';
import { buildServerTools } from '../servers/index.js';
import type { ToolDef, ToolKind } from './tools.js';
import { GATEWAY_TOOL_NAMES, LISTED_TOOLSETS, selectToolset, type ListedToolset, type PreferredScopes, type Toolset } from './toolset.js';

export const PROFILES = ['readonly', 'readwrite', 'full'] as const;
export type Profile = (typeof PROFILES)[number];

export const PROFILE_TEXT: Record<Profile, string> = {
  readonly: 'read tools only, with read-only scopes; a read tool that offers no read-only scope is left out',
  readwrite: 'read, write and destructive tools, with the narrowest scopes that cover them',
  full: 'every tool, with the broadest commonly listed scope for each method',
};

/**
 * One tool and the scopes that grant it (any one of them). Keyed "<server>/<tool>". A gateway method is one
 * requirement too, keyed "<server>/<method id>", with gateway set: the gateway (api_call) checks its scopes per call.
 */
export interface Requirement {
  tool: string;
  kind: ToolKind;
  scopes: string[];
  gateway?: boolean;
  /** The product's optional part this requirement belongs to (ScopePolicy.optional). It is a target only when named. */
  optional?: string;
  /** The product's ScopePolicy.onlyIn: a scope listed there is requested for this requirement only by those profiles. */
  onlyIn?: Readonly<Record<string, readonly string[]>>;
  /**
   * The preferred scopes of the toolset the requirement's server runs, per profile (ServerSpec.toolsetScopes, see
   * preferFields). resolveScopes takes them before its greedy rule. Absent for all, curated and a product without them.
   */
  prefer?: Readonly<PreferredScopes>;
}

/**
 * The prefer field of a server's requirements for a toolset: its preferred scopes, when the toolset is a listed one in
 * effect and the product gives some (config/products.json toolsets.<name>.preferScopes). Empty otherwise, so the
 * requirements are the same as before preferences existed.
 */
export function preferFields(spec: Pick<ServerSpec, 'toolsetScopes'> | undefined, toolset: Toolset | undefined): Pick<Requirement, 'prefer'> {
  if (toolset === undefined || !(LISTED_TOOLSETS as readonly string[]).includes(toolset)) return {};
  const prefer = spec?.toolsetScopes?.[toolset as ListedToolset];
  return prefer && Object.values(prefer).some((list) => (list?.length ?? 0) > 0) ? { prefer } : {};
}

/**
 * preferFields for a server named in the server map, with the toolset its selection put in effect (a toolset that fell
 * back to all has none). Empty when the map cannot be read. Used where a server builds its own requirements (the ADC
 * sign-in in tools.ts).
 */
export function serverPreferFields(serverName: string, effective: Toolset): Pick<Requirement, 'prefer'> {
  if (effective === 'all') return {};
  try {
    return preferFields(serverByName(loadRegistry(), serverName), effective);
  } catch {
    return {};
  }
}

/** The preferred scopes the requirements carry for a profile, in their order, each once. Empty for full. */
function preferredScopes(requirements: readonly Requirement[], profile: Profile): string[] {
  if (profile === 'full') return [];
  const out: string[] = [];
  const seen = new Set<Readonly<PreferredScopes>>();
  for (const r of requirements) {
    if (!r.prefer || seen.has(r.prefer)) continue;
    seen.add(r.prefer);
    for (const scope of r.prefer[profile] ?? []) if (!out.includes(scope)) out.push(scope);
  }
  return out;
}

/**
 * The policy fields of one requirement: the optional part its API belongs to, and the profile limits of its product.
 * `api` is the Discovery name of the method's API (the first part of a method id), or undefined for a curated tool.
 * Empty for a product without a policy, so its requirements are the same as before policies existed.
 */
export function policyFields(policy: ScopePolicy | undefined, api: string | undefined): Pick<Requirement, 'optional' | 'onlyIn'> {
  if (!policy) return {};
  const optional = api === undefined ? undefined : Object.keys(policy.optional ?? {}).find((name) => policy.optional?.[name]?.includes(api));
  return {
    ...(optional !== undefined ? { optional } : {}),
    ...(policy.onlyIn && Object.keys(policy.onlyIn).length > 0 ? { onlyIn: policy.onlyIn } : {}),
  };
}

/** The API of a method id ("gmail.users.messages.list" gives "gmail"), or undefined when there is no method id. */
export function apiOfMethod(methodId: string | undefined): string | undefined {
  if (!methodId) return undefined;
  const dot = methodId.indexOf('.');
  return dot > 0 ? methodId.slice(0, dot) : undefined;
}

/** The names of the optional parts of some servers, sorted, each once. */
export function optionalPartsOf(specs: readonly ServerSpec[]): string[] {
  return [...new Set(specs.flatMap((s) => Object.keys(s.scopePolicy?.optional ?? {})))].sort();
}

export interface ScopeResolution {
  /** The scopes to request, sorted. */
  scopes: string[];
  /** Tools the token can run: they have no scopes, or hold at least one of them. */
  covered: string[];
  /** Tools the token cannot run. */
  uncovered: string[];
}

/**
 * A read-only scope: its last path segment is "readonly" or "read-only", or ends with
 * ".readonly" or ".read-only". Such as .../auth/gmail.readonly or .../auth/readonly.
 */
export function isReadonlyScope(scope: string): boolean {
  const last = scope.slice(scope.lastIndexOf('/') + 1);
  return last === 'readonly' || last === 'read-only' || last.endsWith('.readonly') || last.endsWith('.read-only');
}

/**
 * A broad scope with no qualifier after the service name, such as .../auth/drive
 * or .../auth/cloud-platform, or the Gmail full-access scope. Qualified scopes
 * such as .../auth/gmail.modify are narrower.
 */
export function isFullAccessScope(scope: string): boolean {
  if (scope === 'https://mail.google.com/') return true;
  const last = scope.slice(scope.lastIndexOf('/') + 1);
  return !last.includes('.');
}

interface Candidate {
  scope: string;
  /** Still-uncovered target tools this scope would cover. */
  covers: number;
}

/**
 * Preference order for one greedy step (negative means a is preferred).
 * readonly: the most coverage, then narrower than full access. Only read-only scopes are candidates.
 * readwrite: the most coverage, then non-read-only, then narrower than full access.
 * full: the most coverage. Ties go to the shorter URL, then alphabetical order.
 * Every profile breaks remaining ties by URL length, then alphabetically.
 */
function comparePreference(a: Candidate, b: Candidate, profile: Profile): number {
  if (a.covers !== b.covers) return b.covers - a.covers;
  if (profile === 'readwrite') {
    const byWrite = Number(isReadonlyScope(a.scope)) - Number(isReadonlyScope(b.scope));
    if (byWrite !== 0) return byWrite;
  }
  if (profile !== 'full') {
    const byNarrow = Number(isFullAccessScope(a.scope)) - Number(isFullAccessScope(b.scope));
    if (byNarrow !== 0) return byNarrow;
  }
  if (a.scope.length !== b.scope.length) return a.scope.length - b.scope.length;
  return a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0;
}

/**
 * Chooses the scopes for a profile. readonly targets only read tools, and may pick only
 * read-only scopes: a read tool with no read-only scope in its list stays uncovered. The
 * other profiles target every tool. `covered` and `uncovered` are reported for every
 * requirement, so a readonly token shows its write tools as uncovered.
 *
 * A product's scope policy (policyFields) narrows the choice: a requirement of an optional part is a target only when
 * `include` names the part, and a scope limited by onlyIn is not requested for that requirement by other profiles.
 * Requirements without policy fields resolve exactly as they did before policies existed.
 */
export function resolveScopes(requirements: readonly Requirement[], profile: Profile, include: readonly string[] = []): ScopeResolution {
  const usable = (scope: string): boolean => profile !== 'readonly' || isReadonlyScope(scope);
  const usableFor = (r: Requirement, scope: string): boolean => usable(scope) && allowedByPolicy(r, scope, profile);
  const targets = requirements.filter((r) => (profile !== 'readonly' || r.kind === 'read') && isIncluded(r, include));
  let open = targets.filter((r) => r.scopes.some((scope) => usableFor(r, scope)));
  const chosen: string[] = [];

  // A toolset's preferred scopes first, in their order: each one this profile may use for a target still open is taken,
  // and the targets it covers are closed, as the greedy step closes them. Then the greedy rule covers what is left.
  // Without a preference (all, curated, and products that give none) this loop does nothing, so the result is as before.
  for (const scope of preferredScopes(requirements, profile)) {
    if (!open.some((r) => r.scopes.includes(scope) && usableFor(r, scope))) continue;
    chosen.push(scope);
    open = open.filter((r) => !r.scopes.includes(scope));
  }

  while (open.length > 0) {
    const covers = new Map<string, number>();
    for (const r of open) {
      for (const scope of new Set(r.scopes)) {
        if (usableFor(r, scope)) covers.set(scope, (covers.get(scope) ?? 0) + 1);
      }
    }
    const best = [...covers]
      .map(([scope, n]) => ({ scope, covers: n }))
      .sort((a, b) => comparePreference(a, b, profile))[0];
    if (!best) break;
    chosen.push(best.scope);
    open = open.filter((r) => !r.scopes.includes(best.scope));
  }

  // Sorted, so the result does not depend on the order of the input.
  const scopes = [...new Set(chosen)].sort();
  const covered = coveredTools(requirements, scopes).sort();
  const coveredSet = new Set(covered);
  const uncovered = requirements.map((r) => r.tool).filter((tool) => !coveredSet.has(tool)).sort();
  return { scopes, covered, uncovered };
}

/** True when the product's policy lets this profile request the scope for this requirement. */
function allowedByPolicy(r: Requirement, scope: string, profile: Profile): boolean {
  const only = r.onlyIn?.[scope];
  return only === undefined || only.includes(profile);
}

/** True when the requirement is not part of an optional part, or its part is named. */
function isIncluded(r: Requirement, include: readonly string[]): boolean {
  return r.optional === undefined || include.includes(r.optional);
}

/** A list of held-back tools and the scopes that would cover them. Both sorted. */
export interface HeldBackList {
  tools: string[];
  scopes: string[];
}

/** Tools a profile leaves out because of a product's scope policy, by reason. */
export interface HeldBack {
  /** Per optional part that was not named: its requirements the profile would otherwise target. */
  optional: Record<string, HeldBackList>;
  /** Per profile that would request a scope for them: tools held back for that profile ("full", say). */
  needsProfile: Record<string, HeldBackList>;
  /** Tools whose remaining scopes no profile requests (onlyIn lists none): reachable only with an exact --scopes list. */
  noProfile: HeldBackList;
}

/**
 * What a resolution leaves out on purpose: the target requirements that stay uncovered by `scopes` because of a scope
 * policy (an optional part not named, or a scope this profile may not request). Requirements without policy fields
 * never appear, so for a product without a policy every list is empty.
 */
export function heldBackBy(
  requirements: readonly Requirement[],
  profile: Profile,
  include: readonly string[],
  scopes: readonly string[],
): HeldBack {
  const covered = new Set(coveredTools(requirements, scopes));
  const out: HeldBack = { optional: {}, needsProfile: {}, noProfile: { tools: [], scopes: [] } };
  const add = (list: HeldBackList, tool: string, scopesOf: readonly string[]): void => {
    list.tools.push(tool);
    for (const scope of scopesOf) if (!list.scopes.includes(scope)) list.scopes.push(scope);
  };
  for (const r of requirements) {
    if (covered.has(r.tool)) continue;
    if (profile === 'readonly' && r.kind !== 'read') continue;
    const profileMayUse = (scope: string): boolean => profile !== 'readonly' || isReadonlyScope(scope);
    if (!isIncluded(r, include)) {
      // Counted only when naming the part would let this profile cover it.
      const usable = r.scopes.filter((scope) => profileMayUse(scope) && allowedByPolicy(r, scope, profile));
      if (usable.length > 0) add((out.optional[r.optional as string] ??= { tools: [], scopes: [] }), r.tool, usable);
      continue;
    }
    // Scopes this profile could use if the policy did not limit them.
    const blocked = r.scopes.filter((scope) => profileMayUse(scope) && !allowedByPolicy(r, scope, profile));
    if (blocked.length === 0) continue;
    const next = PROFILES.find((p) => p !== profile && blocked.some((scope) => r.onlyIn?.[scope]?.includes(p)));
    if (next === undefined) add(out.noProfile, r.tool, blocked);
    else add((out.needsProfile[next] ??= { tools: [], scopes: [] }), r.tool, blocked.filter((s) => r.onlyIn?.[s]?.includes(next)));
  }
  for (const list of [...Object.values(out.optional), ...Object.values(out.needsProfile), out.noProfile]) {
    list.tools.sort();
    list.scopes.sort();
  }
  return out;
}

/** True when nothing is held back. */
export function nothingHeldBack(h: HeldBack): boolean {
  return Object.keys(h.optional).length === 0 && Object.keys(h.needsProfile).length === 0 && h.noProfile.tools.length === 0;
}

/**
 * The tools a token holding these scopes can run, by the same rule as runtime
 * gating: a tool with no scopes, or one holding at least one of its scopes.
 */
export function coveredTools(requirements: readonly Requirement[], scopes: readonly string[]): string[] {
  const granted = new Set(scopes);
  return requirements.filter((r) => r.scopes.length === 0 || r.scopes.some((s) => granted.has(s))).map((r) => r.tool);
}

/** Servers of one auth group, in server-map order. `only` narrows them (names must already be validated). */
export function serversOfGroup(reg: Registry, group: AuthGroup, only?: readonly string[]): string[] {
  return reg.servers
    .filter((s) => s.group === group)
    .filter((s) => !only || only.includes(s.name))
    .map((s) => s.name);
}

export interface RequirementOptions {
  /** Receives the notes about the gateway catalog: missing, or lacking an API. Default: stderr. */
  warn?: (line: string) => void;
  /**
   * The toolset the login is for (GSM_TOOLSET or --toolset). Only the tools of that toolset are requirements, and the
   * gateway methods count only when the toolset holds api_call. Absent or all: every tool and gateway method, as before.
   */
  toolset?: Toolset;
}

/**
 * The tool names of one server that a toolset keeps, from the same rule the server applies (selectToolset), with the
 * server's gateway tools added when it has gateway APIs. Undefined for all, and for a toolset that falls back to all.
 */
function toolsetNames(spec: ServerSpec, tools: readonly ToolDef[], toolset: Toolset | undefined, warn: (line: string) => void): Set<string> | undefined {
  if (toolset === undefined || toolset === 'all') return undefined;
  const gateway = (spec.gatewayApis?.length ? GATEWAY_TOOL_NAMES : []).map((name): ToolDef => ({
    name,
    title: name,
    description: '',
    kind: 'read',
    inputSchema: {},
    handler: async () => undefined,
    origin: 'gateway',
  }));
  const selection = selectToolset([...tools, ...gateway], toolset, spec.toolsets);
  if (selection.note !== undefined) {
    warn(`[${spec.name}] ${selection.note.replace(/; showing all tools$/, '')}; every tool counts toward the scopes.`);
    return undefined;
  }
  return new Set(selection.tools.map((tool) => tool.name));
}

/**
 * The requirements of the named servers, from the server map. Each tool is keyed "<server>/<tool>", because
 * discovery servers share the name api_methods. Building the definitions reads the Discovery snapshots and the
 * gateway catalog only: no server starts and no network call is made.
 */
export async function requirementsFor(
  serverNames: readonly string[],
  cfg: RuntimeConfig,
  opts: RequirementOptions = {},
): Promise<Requirement[]> {
  const reg = loadRegistry();
  return requirementsForSpecs(
    serverNames.map((name) => serverByName(reg, name)),
    cfg,
    opts,
  );
}

/**
 * The requirements of the given servers: their curated and generated tools, then one requirement per gateway method.
 * With no catalog, the gateway methods are left out and one note says so. Upload methods are not requirements.
 */
export async function requirementsForSpecs(
  specs: readonly ServerSpec[],
  cfg: RuntimeConfig,
  opts: RequirementOptions = {},
): Promise<Requirement[]> {
  const warn = opts.warn ?? ((line: string) => process.stderr.write(`${line}\n`));
  const out: Requirement[] = [];
  const withoutCatalog: string[] = [];
  for (const spec of specs) {
    // The product's scope policy, when it has one, marks each requirement (policyFields). Without one nothing is added.
    const policy = spec.scopePolicy;
    const tools = await buildServerTools(spec, cfg);
    // The tools of the toolset, when one other than all is asked for. Undefined: every tool counts, as before toolsets.
    const kept = toolsetNames(spec, tools, opts.toolset, warn);
    // The toolset's preferred scopes, only when the toolset is in effect for this server (not all, not a fallback).
    const prefer = kept !== undefined ? preferFields(spec, opts.toolset) : {};
    for (const tool of tools) {
      if (kept !== undefined && !kept.has(tool.name)) continue;
      out.push({
        tool: `${spec.name}/${tool.name}`,
        kind: tool.kind,
        scopes: [...(tool.scopes ?? [])],
        ...policyFields(policy, apiOfMethod(tool.methodId)),
        ...prefer,
      });
    }
    if (!spec.gatewayApis?.length) continue;
    // Gateway methods run through api_call. A toolset without it reaches none of them, so they ask for no scope.
    if (kept !== undefined && !kept.has('api_call')) continue;

    // A spec with pluginRoot reads its plugin folder's catalog.json, as the plugin's own CLI does.
    const gateway = gatewayMethodsOf(spec.gatewayApis, pluginModuleUrl(spec));
    if (!gateway.file) {
      withoutCatalog.push(spec.name);
      continue;
    }
    if (gateway.missingApis.length > 0) {
      warn(`[${spec.name}] not in the API catalog, so their methods are not counted: ${gateway.missingApis.join(', ')}`);
    }
    for (const m of gateway.methods) {
      out.push({ tool: `${spec.name}/${m.id}`, kind: m.kind, scopes: [...m.scopes], gateway: true, ...policyFields(policy, apiOfMethod(m.id)), ...prefer });
    }
  }
  if (withoutCatalog.length > 0) {
    warn(
      `The API catalog (catalog.json) was not found, so the gateway methods of ${withoutCatalog.join(', ')} are not counted and add no scopes. ` +
        'Set GSM_DATA_DIR to the folder that holds catalog.json. In the repo, build it with: node scripts/build-catalog.mjs',
    );
  }
  return out;
}
