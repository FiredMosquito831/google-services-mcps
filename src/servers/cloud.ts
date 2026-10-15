#!/usr/bin/env node
/**
 * Google Cloud console server (MCP name "gcloud").
 *
 * Covers: projects (search, get, create, delete), enabling and disabling APIs
 * (Service Usage), API keys (list, get, create, delete, reveal key string),
 * IAM policy reads, and long-running operation polling.
 *
 * Auth: OAuth user token from `gsm login cloud`, or Application Default
 * Credentials when no token has been stored.
 */
import { serviceusage } from '@googleapis/serviceusage';
import { cloudresourcemanager } from '@googleapis/cloudresourcemanager';
import { apikeys } from '@googleapis/apikeys';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, getCloudAdcClient, loadUserTokens } from '../core/auth.js';
import { defineTool, runServer, type ToolDef } from '../core/tools.js';

type Auth = OAuth2Client | JWT;

let cachedAuth: Auth | undefined;
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  if (!cachedAuth) {
    cachedAuth = loadUserTokens('cloud', cfg) ? await getAuthClient('cloud', cfg) : await getCloudAdcClient();
  }
  return cachedAuth;
}

/** API keys are scoped by project NUMBER, so IDs are resolved once and cached. */
const projectNumbers = new Map<string, string>();
async function projectNumber(cfg: RuntimeConfig, projectId: string): Promise<string> {
  if (/^\d+$/.test(projectId)) return projectId;
  const cached = projectNumbers.get(projectId);
  if (cached) return cached;
  const rm = cloudresourcemanager({ version: 'v3', auth: await authFor(cfg) });
  const res = await rm.projects.get({ name: `projects/${projectId}` });
  const num = (res.data.name ?? '').replace(/^projects\//, '');
  if (!num) throw new Error(`Could not resolve project number for ${projectId}`);
  projectNumbers.set(projectId, num);
  return num;
}

const projectId = z.string().min(6).max(30).describe('Project ID, for example my-project-123 (not the project number).');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const rm = async () => cloudresourcemanager({ version: 'v3', auth: await authFor(cfg) });
  const su = async () => serviceusage({ version: 'v1', auth: await authFor(cfg) });
  const ak = async () => apikeys({ version: 'v2', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'cloud_projects_search',
      title: 'Search projects',
      description: 'Search Cloud projects visible to the logged-in account. Query uses Resource Manager search syntax.',
      kind: 'read',
      inputSchema: { query: z.string().optional().describe('For example "displayName:Prod" or "parent.type:folder"') },
      async handler({ query }) {
        const res = await (await rm()).projects.search({ query: query ?? '' });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_project_get',
      title: 'Get project',
      description: 'Get one project by project ID.',
      kind: 'read',
      inputSchema: { project_id: projectId },
      async handler({ project_id }) {
        const res = await (await rm()).projects.get({ name: `projects/${project_id}` });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_project_iam_policy',
      title: 'Get project IAM policy',
      description: 'Read the IAM policy (who has which role) on a project.',
      kind: 'read',
      inputSchema: { project_id: projectId },
      async handler({ project_id }) {
        const res = await (await rm()).projects.getIamPolicy({ resource: `projects/${project_id}`, requestBody: {} });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_services_list',
      title: 'List APIs on a project',
      description: 'List Google APIs on a project. By default only enabled ones.',
      kind: 'read',
      inputSchema: {
        project_id: projectId,
        enabled_only: z.boolean().optional().describe('Default true. Set false to list every available service.'),
      },
      async handler({ project_id, enabled_only }) {
        const res = await (await su()).services.list({
          parent: `projects/${project_id}`,
          filter: enabled_only === false ? undefined : 'state:ENABLED',
          pageSize: 200,
        });
        return res.data.services ?? [];
      },
    }),
    defineTool({
      name: 'cloud_operation_get',
      title: 'Get operation status',
      description: 'Poll a long-running operation (project create, API enable/disable). done=true means it finished.',
      kind: 'read',
      inputSchema: { name: z.string().describe('Operation name, for example operations/abc123') },
      async handler({ name }) {
        try {
          return (await (await rm()).operations.get({ name })).data;
        } catch {
          return (await (await su()).operations.get({ name })).data;
        }
      },
    }),
    defineTool({
      name: 'cloud_apikeys_list',
      title: 'List API keys',
      description: 'List API keys in a project (metadata only, not the secret key string).',
      kind: 'read',
      inputSchema: { project_id: projectId },
      async handler({ project_id }) {
        const num = await projectNumber(cfg, project_id);
        const res = await (await ak()).projects.locations.keys.list({ parent: `projects/${num}/locations/global` });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_apikey_get',
      title: 'Get API key',
      description: 'Get API key metadata and restrictions. Key name looks like projects/123/locations/global/keys/UID.',
      kind: 'read',
      inputSchema: { key_name: z.string() },
      async handler({ key_name }) {
        return (await (await ak()).projects.locations.keys.get({ name: key_name })).data;
      },
    }),
    defineTool({
      name: 'cloud_apikey_reveal',
      title: 'Reveal API key string',
      description: 'Return the secret key string of an API key. Treat the output as a credential.',
      kind: 'read',
      inputSchema: { key_name: z.string() },
      async handler({ key_name }) {
        return (await (await ak()).projects.locations.keys.getKeyString({ name: key_name })).data;
      },
    }),

    // ---- write (registered only when GSM_ALLOW_WRITES=true) ----
    defineTool({
      name: 'cloud_project_create',
      title: 'Create project',
      description: 'Create a Cloud project. Returns a long-running operation; poll with cloud_operation_get.',
      kind: 'write',
      inputSchema: {
        project_id: projectId,
        display_name: z.string().min(4).max(30),
        parent: z.string().optional().describe('For example folders/123 or organizations/456. Omit for no parent.'),
      },
      async handler({ project_id, display_name, parent }) {
        const res = await (await rm()).projects.create({
          requestBody: { projectId: project_id, displayName: display_name, parent },
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_service_enable',
      title: 'Enable API',
      description: 'Enable a Google API on a project, for example calendar-json.googleapis.com for Calendar.',
      kind: 'write',
      inputSchema: { project_id: projectId, service: z.string().describe('For example calendar-json.googleapis.com') },
      async handler({ project_id, service }) {
        const res = await (await su()).services.enable({
          name: `projects/${project_id}/services/${service}`,
          requestBody: {},
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_apikey_create',
      title: 'Create API key',
      description: 'Create an API key, optionally restricted to specific API services. Returns a long-running operation.',
      kind: 'write',
      inputSchema: {
        project_id: projectId,
        display_name: z.string(),
        api_targets: z.array(z.string()).optional().describe('Services the key may call, for example ["calendar-json.googleapis.com"]'),
      },
      async handler({ project_id, display_name, api_targets }) {
        const num = await projectNumber(cfg, project_id);
        const res = await (await ak()).projects.locations.keys.create({
          parent: `projects/${num}/locations/global`,
          requestBody: {
            displayName: display_name,
            restrictions: api_targets?.length ? { apiTargets: api_targets.map((service) => ({ service })) } : undefined,
          },
        });
        return res.data;
      },
    }),

    // ---- destructive (needs confirm=true) ----
    defineTool({
      name: 'cloud_project_delete',
      title: 'Delete project',
      description: 'Schedule a project for deletion (recoverable for a limited time). Deletes every resource in it eventually.',
      kind: 'destructive',
      inputSchema: { project_id: projectId },
      preview: ({ project_id }) => ({ project: project_id, effect: 'Project is scheduled for deletion along with its resources.' }),
      async handler({ project_id }) {
        const res = await (await rm()).projects.delete({ name: `projects/${project_id}` });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_service_disable',
      title: 'Disable API',
      description:
        'Disable a Google API on a project. Can delete resources (for example Cloud Run services) and suspend GKE clusters. Check the effects first.',
      kind: 'destructive',
      inputSchema: {
        project_id: projectId,
        service: z.string(),
        disable_dependent_services: z.boolean().optional().describe('Also disable services that depend on this one. Default false.'),
      },
      preview: ({ project_id, service, disable_dependent_services }) => ({
        project: project_id,
        service,
        disableDependentServices: disable_dependent_services ?? false,
        effect: 'Resources of this API may be deleted or suspended. Stored data is kept but still billed.',
      }),
      async handler({ project_id, service, disable_dependent_services }) {
        const res = await (await su()).services.disable({
          name: `projects/${project_id}/services/${service}`,
          requestBody: { disableDependentServices: disable_dependent_services ?? false },
        });
        return res.data;
      },
    }),
    defineTool({
      name: 'cloud_apikey_delete',
      title: 'Delete API key',
      description: 'Delete an API key. It is marked deleted at once and can be restored within 30 days.',
      kind: 'destructive',
      inputSchema: { key_name: z.string() },
      preview: ({ key_name }) => ({ key: key_name, effect: 'Key stops working immediately. Restorable for 30 days.' }),
      async handler({ key_name }) {
        const res = await (await ak()).projects.locations.keys.delete({ name: key_name });
        return res.data;
      },
    }),
  ];
}

await runServer({ name: 'gcloud', version: '0.1.0', buildTools });
