/**
 * Readable names for the generated per-method tools (2.0.0).
 *
 * The old rule joined the API prefix, the resource chain and the method name and, when that did not fit the budget,
 * cut characters off the longest words and appended a hash of the method id (`assignToolNames` in methods.ts). Names
 * like `gmail_users_settin_send_as_smime_i_list` or `drivelabel_labe_revi_permi_batch_52b2` came out of it.
 *
 * This module builds the same information in a fixed order, and takes the first form that fits:
 *
 *   1. the name as it is today (minimal change: a name that fits keeps its spelling);
 *   2. container words out: `projects`, `locations`, `customers`, `users`, and version segments (`v1`, `v1beta1`);
 *   3. common words shortened: `configurations` -> `configs`, `accounts` -> `accts`, `permissions` -> `perms`, and
 *      the rest of SHORTENINGS;
 *   4. a resource that repeats the API prefix out (`cloudbilling.billingAccounts` -> `billing`);
 *   5. the longest resource reduced to its head word (`managedFolders` -> `folders`), unless the head word alone is a
 *      general noun (`smimeInfo` keeps `smime`: GENERIC_HEADS);
 *   6. the API prefix shortened (only when it is longer than 8 characters, and only after 1-5 were not enough);
 *   7. resources dropped from the left, keeping the last ones;
 *   8. the method's own words reduced to the last two, then to the last one;
 *   9. the longest words cut, never below 3 characters (the old clipping);
 *  10. a numeric suffix, only when two versions of one API name the same method (the method id is identical).
 *
 * Every candidate stays within the budget, so a generated tool name is never longer than the room Claude Code
 * leaves. Two methods whose first form collides: the one that reached that form with the fewest reductions keeps it
 * and the other takes its first form no other method of the group can produce, so the words that tell them apart
 * stay. The result is unique per server and matches ^[a-z0-9_]+$.
 *
 * The rename is recorded per server (registerRenames), so the build can write each plugin's tool-aliases.json: the
 * old names keep working for one release (see core/tool-aliases.ts).
 */
import type { MethodRecord } from './methods.js';
import { fitSegments, shortApiName, snakeCase } from './methods.js';

/** Words that only say where a resource lives; dropped when the name does not fit. */
const CONTAINERS: ReadonlySet<string> = new Set(['projects', 'locations', 'customers', 'users']);

/** Version-like resource segments: cloudasset names a resource `v1`. */
const VERSIONLIKE = /^v\d+([a-z][a-z0-9]*)?$/;

/**
 * Common words and their short forms, used only when the name does not fit as it is. Every entry keeps the word
 * recognisable; a word that is not listed is never cut here.
 */
const SHORTENINGS: Readonly<Record<string, string>> = {
  accounts: 'accts',
  account: 'acct',
  administrators: 'admins',
  administrator: 'admin',
  advertisers: 'advs',
  advertiser: 'advs',
  assigned: 'asgn',
  audiences: 'auds',
  audience: 'aud',
  channels: 'chans',
  channel: 'chan',
  collections: 'colls',
  collection: 'coll',
  configurations: 'configs',
  configuration: 'config',
  containers: 'ctrs',
  container: 'ctr',
  conversion: 'conv',
  conversions: 'convs',
  descriptors: 'descs',
  descriptor: 'desc',
  dimensions: 'dims',
  dimension: 'dim',
  documents: 'docs',
  document: 'doc',
  environments: 'envs',
  environment: 'env',
  executions: 'execs',
  execution: 'exec',
  experiments: 'exps',
  experiment: 'exp',
  inventories: 'invs',
  inventory: 'inv',
  metadata: 'meta',
  notification: 'notif',
  notifications: 'notifs',
  operations: 'ops',
  operation: 'op',
  options: 'opts',
  option: 'opt',
  organizations: 'orgs',
  organization: 'org',
  permissions: 'perms',
  permission: 'perm',
  properties: 'props',
  recommendations: 'recs',
  recommendation: 'rec',
  repositories: 'repos',
  repository: 'repo',
  revisions: 'revs',
  revision: 'rev',
  subscriptions: 'subs',
  subscription: 'sub',
  targeting: 'tgt',
  templates: 'tmpls',
  template: 'tmpl',
  versions: 'vers',
  version: 'ver',
  workspaces: 'ws',
  workspace: 'ws',
};

/**
 * Head words that carry almost no meaning on their own. A resource is not reduced to one of them: `smimeInfo`
 * keeps `smime` rather than becoming `info`, which would read like every other "...Info" resource of the API.
 */
const GENERIC_HEADS: ReadonlySet<string> = new Set([
  'info', 'data', 'config', 'configs', 'setting', 'settings', 'state', 'status', 'type', 'types',
  'name', 'names', 'value', 'values', 'item', 'items', 'entry', 'entries', 'object', 'objects',
  'resource', 'resources', 'detail', 'details', 'list', 'lists', 'map', 'maps',
]);

/** The parts of a method that the name is built from. */
type NamePart = Pick<MethodRecord, 'apiName' | 'resource' | 'methodName' | 'fullId'>;

/** One renamed tool: the name it had, and the name it has now. */
export interface ToolRename {
  from: string;
  to: string;
}

const join = (segments: readonly string[]): string =>
  segments.join('_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

const wordsOf = (segment: string): string[] => segment.split('_').filter((w) => w.length > 0);

const shortenSegment = (segment: string): string => wordsOf(segment).map((w) => SHORTENINGS[w] ?? w).join('_');

/** The segments of a method before any reduction: the API prefix, the resource chain and the method name. */
function baseSegments(method: NamePart): { prefix: string; resources: string[]; methodWords: string } {
  return {
    prefix: shortApiName(method.apiName),
    resources: method.resource.map(snakeCase).filter((s) => s.length > 0),
    methodWords: snakeCase(method.methodName),
  };
}

const repeatsPrefix = (segment: string, prefix: string): boolean => {
  const first = wordsOf(segment)[0] ?? '';
  return first === prefix || first === prefix.replace(/s$/, '');
};

interface Stage {
  key: string;
  res: string[];
  mw: string;
}

/** The reduction stages 1-4 and 7-8 as (resources, method words), most informative first. */
function stages(method: NamePart): { prefix: string; list: Stage[]; headsEnd: number } {
  const { prefix, resources, methodWords } = baseSegments(method);
  const list: Stage[] = [];
  const push = (res: readonly string[], mw: string): void => {
    const key = `${res.join('|')}/${mw}`;
    if (!list.some((s) => s.key === key)) list.push({ key, res: [...res], mw });
  };

  let res = [...resources];
  let mw = methodWords;
  push(res, mw); // 1. as it is
  res = res.filter((s) => !VERSIONLIKE.test(s) && !wordsOf(s).every((w) => CONTAINERS.has(w)));
  push(res, mw); // 2. containers out
  res = res.map(shortenSegment);
  mw = shortenSegment(mw);
  push(res, mw); // 3. words shortened
  res = res.filter((s) => !repeatsPrefix(s, prefix));
  push(res, mw); // 4. a resource that repeats the prefix out
  for (;;) {
    // 5. the longest resource reduced to its head word, one at a time
    let idx = -1;
    for (let i = 0; i < res.length; i++) {
      const parts = wordsOf(res[i]!);
      if (parts.length < 2) continue;
      const head = parts[parts.length - 1]!;
      // A word that says almost nothing on its own is not kept as the whole resource: "smimeInfo" keeps "smime",
      // "sendAs" keeps "send_as" (a two-letter head such as "as" would read like nothing).
      if (GENERIC_HEADS.has(head) || head.length < 3) continue;
      const longest = idx < 0 ? 0 : wordsOf(res[idx]!).length;
      if (idx < 0 || parts.length > longest || (parts.length === longest && res[i]!.length > res[idx]!.length)) idx = i;
    }
    if (idx < 0) break;
    const next = [...res];
    next[idx] = shortenSegment(wordsOf(res[idx]!).slice(-1)[0]!);
    res = next.map(shortenSegment);
    push(res, mw);
  }
  const headsEnd = list.length;
  const resVariants = list.map((s) => s.res);
  for (let drop = 1; drop < res.length; drop++) push(res.slice(drop), mw); // 7. resources dropped from the left
  push([], mw); // and finally no resource at all: the prefix and the method, when another tool holds every longer form
  // 8. the method's words reduced to their last two, with every resource chain. Never to one word: a method called
  // "asyncBatchAnnotate" next to "annotate" would take the same word, and a write would read like the read beside it.
  const mwWords = wordsOf(mw);
  if (mwWords.length > 2) for (const variant of resVariants) push(variant, mwWords.slice(-2).join('_'));
  return { prefix, list, headsEnd };
}

/**
 * Candidate names for one method, most informative first. Every candidate is complete: the caller takes the first
 * one that fits the budget.
 */
export function readableNameCandidates(method: NamePart): string[] {
  const { prefix, list, headsEnd } = stages(method);
  const out: string[] = [];
  const add = (name: string): void => {
    if (name.length > 0 && !out.includes(name)) out.push(name);
  };
  const between = (cut: number): boolean => cut >= 1 && cut <= prefix.length;
  // A prefix of 9 characters or fewer stays whole while the resources can carry the reduction: "googleads" is the
  // product's name, and "googlead" would read like a typo. Only a Discovery prefix already clipped to 10
  // ("displayvid", "discoverye") is shortened, and only after the resource chain has given way.
  const mild = prefix.length > 9 ? [prefix.length, 9] : [prefix.length];
  const deep = prefix.length > 9 ? [8, 6, 5, 4, 3] : [6, 5, 4, 3].filter((c) => c < prefix.length);
  const head = list.slice(0, headsEnd);
  const reduced = list.slice(headsEnd);
  for (const stage of head) for (const cut of mild.filter(between)) add(join([prefix.slice(0, cut), ...stage.res, stage.mw]));
  for (const stage of reduced) for (const cut of [...mild, ...deep].filter(between)) add(join([prefix.slice(0, cut), ...stage.res, stage.mw]));
  for (const stage of head) for (const cut of deep.filter(between)) add(join([prefix.slice(0, cut), ...stage.res, stage.mw]));
  return out;
}

/** The clipped form of a candidate: the longest words cut, never below 3 characters. */
function clippedName(candidate: string, budget: number): string | null {
  const clipped = fitSegments(wordsOf(candidate), budget);
  return clipped.fits ? clipped.name : null;
}

/**
 * The most informative candidate that fits the budget: as it is, else clipped, else with leading words dropped
 * (a budget too small for the words at their 3-character floor). Null when even one word is too long.
 */
function squeezedName(candidates: readonly string[], budget: number): string | null {
  for (const candidate of candidates) {
    if (candidate.length <= budget) return candidate;
  }
  for (const candidate of candidates) {
    const clipped = clippedName(candidate, budget);
    if (clipped !== null) return clipped;
  }
  const words = wordsOf(candidates[candidates.length - 1] ?? '');
  for (let from = 1; from < words.length; from += 1) {
    const clipped = clippedName(words.slice(from).join('_'), budget);
    if (clipped !== null) return clipped;
  }
  return null;
}

/** The name of one method on its own: the most informative candidate that fits, else the squeezed one. */
export function readableNameFor(method: NamePart, budget: number): string {
  const name = squeezedName(readableNameCandidates(method), budget);
  if (name !== null) return name;
  throw new Error(`no readable name fits ${budget} characters for ${method.fullId}`);
}

/** A total order over methods by API, version and id: the order the old naming used, so suffixes stay put. */
function compareMethods(a: NamePart & { apiVersion?: string }, b: NamePart & { apiVersion?: string }): number {
  const ka = `${a.apiName}|${a.apiVersion ?? ''}|${a.fullId}`;
  const kb = `${b.apiName}|${b.apiVersion ?? ''}|${b.fullId}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Names for a server's methods, in the same order as the input, unique within it, each at most `budget` characters.
 * `reserved` names are treated as taken (the curated tools of the server and its list tool). The result never repeats.
 */
export function assignReadableToolNames(
  methods: ReadonlyArray<NamePart>,
  reserved: readonly string[] = [],
  budget: number,
): string[] {
  const candidatesOf = methods.map((m) => readableNameCandidates(m));
  const preferred = candidatesOf.map((c, i) => {
    const name = squeezedName(c, budget);
    if (name !== null) return name;
    throw new Error(`no readable name fits ${budget} characters for ${methods[i]!.fullId}`);
  });

  const counts = new Map<string, number>();
  for (const name of preferred) counts.set(name, (counts.get(name) ?? 0) + 1);
  const taken = new Set<string>(reserved);
  const names: Array<string | undefined> = new Array(methods.length).fill(undefined);
  const usedOrPlanned = (name: string): boolean => taken.has(name) || names.includes(name);
  const numbered = (base: string): string => {
    // The suffix counts against the budget, and grows with the number. A budget too small for the clipped words
    // (words are never cut below 3 characters) also gives way: the leading words go.
    for (let n = 2; ; n += 1) {
      const suffix = `_${n}`;
      for (let from = 0; from < wordsOf(base).length; from += 1) {
        const words = wordsOf(base).slice(from);
        const stem = fitSegments(words, budget - suffix.length).name;
        const name = `${stem}${suffix}`;
        if (name.length > budget || stem.length === 0) continue;
        if (!usedOrPlanned(name)) return name;
        break;
      }
    }
  };

  // The groups of methods whose preferred name is the same, in the order the caller gave them.
  const groups = new Map<string, number[]>();
  preferred.forEach((name, i) => {
    if ((counts.get(name) ?? 0) < 2) return;
    const group = groups.get(name) ?? [];
    group.push(i);
    groups.set(name, group);
  });

  for (const [name, members] of groups) {
    // The method that reached this name with the fewest reductions keeps it; the others look for a name of their own.
    const rank = (i: number): number => candidatesOf[i]!.indexOf(name);
    const order = members
      .slice()
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          methods[a]!.resource.length - methods[b]!.resource.length ||
          // The same order as the old naming used, so a method's suffix does not move between the two rules.
          compareMethods(methods[a]!, methods[b]!),
      );
    order.forEach((i, position) => {
      if (position === 0) {
        names[i] = name;
        return;
      }
      // A name no other member of the group can produce keeps the words that tell the methods apart.
      const others = new Set<string>();
      for (const j of members) if (j !== i) for (const c of candidatesOf[j]!) others.add(c);
      const free = (candidate: string): boolean => !usedOrPlanned(candidate) && !others.has(candidate);
      const fresh = candidatesOf[i]!.find((c) => c.length <= budget && free(c));
      if (fresh !== undefined) {
        names[i] = fresh;
        return;
      }
      for (const c of candidatesOf[i]!) {
        const clipped = clippedName(c, budget);
        if (clipped !== null && free(clipped)) {
          names[i] = clipped;
          return;
        }
      }
      // Two versions of one API name the same method: no candidate tells them apart, so a number does.
      names[i] = numbered(name);
    });
  }

  preferred.forEach((name, i) => {
    if (names[i] !== undefined) return;
    if (!usedOrPlanned(name)) {
      names[i] = name;
      return;
    }
    // The preferred name is taken (a curated tool of the server, or a name assigned earlier): another readable form
    // reads better than a number, so it is taken when one is free.
    const fresh = candidatesOf[i]!.find((c) => c.length <= budget && !usedOrPlanned(c));
    if (fresh !== undefined) {
      names[i] = fresh;
      return;
    }
    for (const candidate of candidatesOf[i]!) {
      const clipped = clippedName(candidate, budget);
      if (clipped !== null && !usedOrPlanned(clipped)) {
        names[i] = clipped;
        return;
      }
    }
    names[i] = numbered(name);
  });
  return names as string[];
}

/** Renames per server, filled while a server's tools are generated (see tools.ts and dump.ts). */
const renamesByServer = new Map<string, ToolRename[]>();

/** Records the renames of one server, sorted by the old name. Called by the generator; replaces an earlier run. */
export function registerRenames(server: string, renames: readonly ToolRename[]): void {
  renamesByServer.set(server, [...renames].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)));
}

/** The renames of one server (empty when nothing was renamed or the server was never generated in this process). */
export function renamesForServer(server: string): ToolRename[] {
  return renamesByServer.get(server) ?? [];
}
