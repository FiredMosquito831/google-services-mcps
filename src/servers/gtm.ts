/**
 * Curated Tag Manager tools of the gtm server.
 *
 *   gtm_publish_version  destructive  accounts.containers.versions.publish. The generated tool of the same method is a
 *                                     plain write whose approval shows one path, and under confirmation
 *                                     "destructive-only" it ran with no prompt at all (adversarial review of gtm, F1).
 *                                     This one reads the container, the version and the live version first and puts what
 *                                     changes into the approval: the container's name and public id (GTM-XXXX), the
 *                                     version's name and notes, which tags, triggers and variables are added, changed or
 *                                     removed against what is live now, and any Custom HTML or custom JavaScript tag.
 *
 * Auth: the OAuth user token of the business group, with the scopes of each call (tagmanager.publish for the publish,
 * tagmanager.readonly or tagmanager.edit.containers for the reads). A login that holds only tagmanager.publish can still
 * publish: the approval then says which reads it could not make instead of failing the call.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { makeCloudCall, statusOf, type CloudCall } from './cloud-http.js';
import { defineTool, type ToolDef } from '../core/tools.js';

const GTM = 'https://tagmanager.googleapis.com/tagmanager/v2';

/** The scope of versions.publish, the one scope this tool needs to run. */
const PUBLISH_SCOPES = googleScopes('tagmanager.publish');

/** A container's API path: accounts/{account}/containers/{container}. */
const CONTAINER_PATH = /^accounts\/[^/]+\/containers\/[^/]+$/;
/** A version's API path: accounts/{account}/containers/{container}/versions/{version}. */
const VERSION_PATH = /^accounts\/[^/]+\/containers\/[^/]+\/versions\/[^/]+$/;

/** One entity of a container version, as much of it as the diff reads. */
interface Entity {
  [key: string]: unknown;
}

/** The parts of a container version this tool reads. */
export interface ContainerVersion {
  name?: string;
  path?: string;
  containerVersionId?: string;
  container?: { path?: string; publicId?: string };
  description?: string;
  fingerprint?: string;
  tag?: Entity[];
  trigger?: Entity[];
  variable?: Entity[];
  folder?: Entity[];
}

/** The entity lists a version holds, with the field that names each entry. */
const ENTITIES = [
  { key: 'tag', id: 'tagId', label: 'tag' },
  { key: 'trigger', id: 'triggerId', label: 'trigger' },
  { key: 'variable', id: 'variableId', label: 'variable' },
] as const;

/** Fields that change without the entity changing; a diff ignores them. */
const VOLATILE = new Set(['path', 'fingerprint', 'tagManagerUrl', 'accountId', 'containerId', 'workspaceId', 'containerVersionId']);

/** A stable text of an entity, ignoring the fields that carry no meaning for a diff. Its keys are sorted. */
export function stableEntity(entity: Entity | undefined): string {
  if (!entity) return '';
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        if (VOLATILE.has(key)) continue;
        out[key] = clean((value as Record<string, unknown>)[key]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(clean(entity));
}

/** The id of one entity: tagId, triggerId or variableId. */
const idOf = (entity: Entity, field: string): string | undefined => {
  const id = entity[field];
  return typeof id === 'string' && id !== '' ? id : undefined;
};

/** A name for the approval: the entity's `name`, else its id. */
const nameOf = (entity: Entity, field: string): string => {
  const name = entity.name;
  if (typeof name === 'string' && name !== '') return name;
  return idOf(entity, field) ?? '(unnamed)';
};

/** One entity list of a version, by id. */
function entityMap(version: ContainerVersion | undefined, key: 'tag' | 'trigger' | 'variable', field: string): Map<string, Entity> {
  const out = new Map<string, Entity>();
  for (const entity of version?.[key] ?? []) {
    const id = idOf(entity, field);
    if (id) out.set(id, entity);
  }
  return out;
}

export interface VersionDiff {
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
  changed: Record<string, string[]>;
  counts: Record<string, number>;
}

/**
 * What publishing `version` changes, against `live`: the entries whose ids are only on one side (added, removed) and
 * the ones present in both whose content differs (changed). Each list holds the entries' names.
 */
export function diffVersions(version: ContainerVersion | undefined, live: ContainerVersion | undefined): VersionDiff {
  const diff: VersionDiff = { added: {}, removed: {}, changed: {}, counts: {} };
  for (const { key, id, label } of ENTITIES) {
    const next = entityMap(version, key, id);
    const now = entityMap(live, key, id);
    diff.added[label] = [...next].filter(([eid]) => !now.has(eid)).map(([, e]) => nameOf(e, id));
    diff.removed[label] = [...now].filter(([eid]) => !next.has(eid)).map(([, e]) => nameOf(e, id));
    diff.changed[label] = [...next]
      .filter(([eid, e]) => now.has(eid) && stableEntity(e) !== stableEntity(now.get(eid)))
      .map(([, e]) => nameOf(e, id));
    diff.counts[label] = next.size;
  }
  return diff;
}

/**
 * The tags and variables that carry code of their own, which is where a publish can change what a page executes: a
 * Custom HTML tag (type `html`) and a Custom JavaScript variable (type `jsm`), with the name of each.
 */
export function customCode(version: ContainerVersion | undefined): Array<{ kind: string; name: string }> {
  const out: Array<{ kind: string; name: string }> = [];
  for (const tag of version?.tag ?? []) {
    if (tag.type === 'html') out.push({ kind: 'custom HTML tag', name: nameOf(tag, 'tagId') });
  }
  for (const variable of version?.variable ?? []) {
    if (variable.type === 'jsm') out.push({ kind: 'custom JavaScript variable', name: nameOf(variable, 'variableId') });
  }
  return out;
}

/** A container path from the argument: the API path itself or accounts/{a}/containers/{c}. */
export function containerPathOf(container: string): string {
  const path = container.trim().replace(/^\/+|\/+$/g, '');
  if (!CONTAINER_PATH.test(path)) {
    throw new Error(`"${container}" is not a container path: use accounts/{account}/containers/{container}, as tagmgr_accounts_containers_list returns it.`);
  }
  return path;
}

/** A version path from the container path and a version id or a full version path. */
export function versionPathOf(containerPath: string, version: string): string {
  const value = version.trim().replace(/^\/+|\/+$/g, '');
  if (VERSION_PATH.test(value)) {
    if (!value.startsWith(`${containerPath}/versions/`)) throw new Error(`"${value}" is not a version of ${containerPath}.`);
    return value;
  }
  if (!/^\d+$/.test(value)) throw new Error(`"${version}" is not a version id or a version path: use the containerVersionId, such as 7, or accounts/{account}/containers/{container}/versions/7.`);
  return `${containerPath}/versions/${value}`;
}

const publishShape = {
  container: z.string().trim().min(1).describe('The container, as accounts/{account}/containers/{container}: tagmgr_accounts_containers_list returns it.'),
  version: z.string().trim().min(1).describe('The version to publish: its containerVersionId (such as 7, from tagmgr_accts_ctrs_ver_headers_list) or its full path.'),
  fingerprint: z
    .string()
    .optional()
    .describe('The version\'s fingerprint, when you read it: Google refuses the publish if the version changed since. Default: the fingerprint read while the approval was made.'),
};

type PublishInput = z.infer<z.ZodObject<typeof publishShape>>;

/** What the approval shows, and what the handler publishes: the exact request, worked out before the gate. */
export interface PublishPlan {
  action: string;
  container_path: string;
  version_path: string;
  publish_request: { method: 'POST'; path: string; fingerprint?: string };
  container?: { name?: string; public_id?: string };
  version?: { container_version_id?: string; name?: string; description?: string };
  live?: { container_version_id?: string; name?: string };
  changes?: VersionDiff;
  custom_code?: Array<{ kind: string; name: string }>;
  /** The reads that failed, so a caller whose login holds only tagmanager.publish knows what the approval could not show. */
  unread?: string[];
}

export function buildTools(cfg: RuntimeConfig): ToolDef[] {
  const call: CloudCall = makeCloudCall(() => getAuthClient('business', cfg));

  /** Reads what the approval shows. Every read is best effort: a failure is reported, not thrown. */
  async function planPublish(args: PublishInput): Promise<PublishPlan> {
    const containerPath = containerPathOf(args.container);
    const versionPath = versionPathOf(containerPath, args.version);
    const unread: string[] = [];
    const read = async <T>(url: string, what: string): Promise<T | undefined> => {
      try {
        return (await call<T>({ url, method: 'GET' })).data;
      } catch (err) {
        const status = statusOf(err);
        unread.push(`${what}: ${status === undefined ? '' : `HTTP ${status}: `}${err instanceof Error ? err.message : String(err)}`.trim());
        return undefined;
      }
    };
    const container = await read<{ name?: string; publicId?: string; path?: string }>(`${GTM}/${containerPath}`, 'the container');
    const version = await read<ContainerVersion>(`${GTM}/${versionPath}`, 'the version');
    const live = await read<ContainerVersion>(`${GTM}/${containerPath}/versions:live`, 'the live version');
    const plan: PublishPlan = {
      action: 'publish this version: it becomes the version that every page and app loading this container runs',
      container_path: containerPath,
      version_path: versionPath,
      publish_request: { method: 'POST', path: `${versionPath}:publish`, ...(args.fingerprint ? { fingerprint: args.fingerprint } : version?.fingerprint ? { fingerprint: version.fingerprint } : {}) },
      ...(container ? { container: { ...(container.name ? { name: container.name } : {}), ...(container.publicId ? { public_id: container.publicId } : {}) } } : {}),
      ...(version
        ? {
            version: {
              ...(version.containerVersionId ? { container_version_id: version.containerVersionId } : {}),
              ...(version.name ? { name: version.name } : {}),
              ...(version.description ? { description: version.description } : {}),
            },
          }
        : {}),
      ...(live ? { live: { ...(live.containerVersionId ? { container_version_id: live.containerVersionId } : {}), ...(live.name ? { name: live.name } : {}) } } : {}),
      ...(version && live ? { changes: diffVersions(version, live) } : {}),
      ...(version ? { custom_code: customCode(version) } : {}),
      ...(unread.length ? { unread } : {}),
    };
    return plan;
  }

  return [
    defineTool({
      name: 'gtm_publish_version',
      title: 'Publish a Tag Manager version',
      description:
        "Publish a container version: from then on it is the one every page or app that loads the container runs. Before asking, this reads the container, the version and what is live now, and the approval names the container (with its GTM-XXXX id), the version and its notes, which tags, triggers and variables are added, changed or removed, and any Custom HTML or custom JavaScript it carries. Takes the container path and the version's id or path; the fingerprint that Google checks comes from the version. Tag Manager API accounts.containers.versions.publish. Destructive: it asks twice.",
      // Publishing is in the destructive rule (docs/SECURITY.md, (e) publish or deploy): it asks twice.
      kind: 'destructive',
      scopes: PUBLISH_SCOPES,
      inputSchema: publishShape,
      async prepare(args) {
        return { preview: await planPublish(args) };
      },
      async handler(args, _ctx, prepared) {
        const plan = ((prepared?.preview as PublishPlan | undefined) ?? (await planPublish(args))) as PublishPlan;
        const res = await call<ContainerVersion>({
          url: `${GTM}/${plan.publish_request.path}`,
          method: 'POST',
          query: plan.publish_request.fingerprint ? { fingerprint: plan.publish_request.fingerprint } : undefined,
        });
        const published = res.data ?? {};
        return {
          published: true,
          container: plan.container ?? { path: plan.container_path },
          version: {
            container_version_id: published.containerVersionId ?? plan.version?.container_version_id,
            name: published.name ?? plan.version?.name,
            path: published.path ?? plan.version_path,
          },
          ...(plan.changes ? { changes: plan.changes } : {}),
          note: 'This version is now the one every page or app loading the container runs. The version it replaced is still in the version list.',
        };
      },
    }),
  ];
}
