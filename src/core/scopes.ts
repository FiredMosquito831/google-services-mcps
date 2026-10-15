/**
 * Scope profiles. A profile is a set of OAuth scopes chosen at login, sized to
 * the tools it has to run. Resolution is a greedy hitting-set over each tool's
 * any-of scope list: a tool is covered when the token holds at least one of its
 * scopes. Tools with no scopes are always covered.
 *
 * resolveScopes is pure. requirementsFor builds the tool definitions of some
 * servers without starting them and makes no network call.
 */
import type { RuntimeConfig } from './config.js';
import { loadRegistry, serverByName, type AuthGroup, type Registry } from './registry.js';
import { buildServerTools } from '../servers/index.js';
import type { ToolKind } from './tools.js';

export const PROFILES = ['readonly', 'readwrite', 'full'] as const;
export type Profile = (typeof PROFILES)[number];

export const PROFILE_TEXT: Record<Profile, string> = {
  readonly: 'read tools only, with read-only scopes; a read tool that offers no read-only scope is left out',
  readwrite: 'read, write and destructive tools, with the narrowest scopes that cover them',
  full: 'every tool, with the broadest commonly listed scope for each method',
};

/** One tool and the scopes that grant it (any one of them). */
export interface Requirement {
  tool: string;
  kind: ToolKind;
  scopes: string[];
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
 */
export function resolveScopes(requirements: readonly Requirement[], profile: Profile): ScopeResolution {
  const usable = (scope: string): boolean => profile !== 'readonly' || isReadonlyScope(scope);
  const targets = requirements.filter((r) => profile !== 'readonly' || r.kind === 'read');
  let open = targets.filter((r) => r.scopes.some(usable));
  const chosen: string[] = [];

  while (open.length > 0) {
    const covers = new Map<string, number>();
    for (const r of open) {
      for (const scope of new Set(r.scopes)) {
        if (usable(scope)) covers.set(scope, (covers.get(scope) ?? 0) + 1);
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

/**
 * The tool requirements of the named servers. Each tool is keyed "<server>/<tool>",
 * because discovery servers share the name api_methods. Building the definitions
 * reads the Discovery snapshots only: no server starts and no network call is made.
 */
export async function requirementsFor(serverNames: readonly string[], cfg: RuntimeConfig): Promise<Requirement[]> {
  const reg = loadRegistry();
  const out: Requirement[] = [];
  for (const name of serverNames) {
    const spec = serverByName(reg, name);
    for (const tool of await buildServerTools(spec, cfg)) {
      out.push({ tool: `${name}/${tool.name}`, kind: tool.kind, scopes: [...(tool.scopes ?? [])] });
    }
  }
  return out;
}
