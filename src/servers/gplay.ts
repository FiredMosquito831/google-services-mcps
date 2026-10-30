/**
 * Curated Android Management tools of the gplay server. They match the 9 tools of Google's Android Device Management
 * MCP server (androidmanagement.googleapis.com/mcp): get_enterprise, list_enterprises, get_application, get_device,
 * list_devices, get_policy, list_policies, get_web_app and list_web_apps. All are reads (GET).
 *
 * The Android Management API is a gateway API of gplay (its per-method tools would take gplay past the 350 generated
 * tools a server may have), so these call it directly; their request contract is
 * tests/fixtures/discovery/androidmanagement.v1.json. The service-account key asks for the androidmanagement scope since
 * 1.23.1. Google answers only for an enterprise that the service account's Google Cloud project manages (the project
 * that created it).
 *
 * Auth: the service-account key (`gsm setup-service-account`), as the other gplay tools.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { makeCloudCall, type CloudCall } from './cloud-http.js';

const AMAPI = 'https://androidmanagement.googleapis.com/v1';
/** Every Android Management method lists this one scope (Discovery). */
const SCOPES = googleScopes('androidmanagement');

/** One id of a resource name: letters, digits, dash and underscore (an enterprise, device, policy or web app id). */
const ID = /^[A-Za-z0-9_-]+$/;
/** An Android package name, such as com.google.android.gm. */
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

/** enterprises/<id> from an id or the full name. Throws before any request. */
export function enterpriseName(value: string): string {
  const text = value.trim();
  const id = text.startsWith('enterprises/') ? text.slice('enterprises/'.length) : text;
  if (!ID.test(id)) throw new Error(`"${value}" is not an enterprise: use its id, such as LC0123abcd, or enterprises/LC0123abcd.`);
  return `enterprises/${id}`;
}

/** enterprises/<e>/<collection>/<id> from an enterprise and an id, or from the full name. Throws before any request. */
export function childName(enterprise: string | undefined, collection: 'devices' | 'policies' | 'webApps', value: string, what: string): string {
  const text = value.trim();
  if (new RegExp(`^enterprises/[A-Za-z0-9_-]+/${collection}/[A-Za-z0-9_-]+$`).test(text)) return text;
  if (!ID.test(text)) throw new Error(`"${value}" is not a ${what} id or a full name enterprises/<id>/${collection}/<id>.`);
  if (!enterprise) throw new Error(`Give enterprise with the ${what} id, or the full name enterprises/<id>/${collection}/<id>.`);
  return `${enterpriseName(enterprise)}/${collection}/${text}`;
}

const enterprise = z.string().describe('The enterprise: its id, such as LC0123abcd, or enterprises/LC0123abcd. androidmgmt_list_enterprises lists them.');
const pageSize = z.number().int().min(1).optional().describe('Items per page. Google decides the default and the most.');
const pageToken = z.string().optional().describe('next_page_token from the previous call, with the same other arguments.');

const listEnterprisesShape = {
  project_id: z.string().regex(/^[a-z0-9][a-z0-9.:-]*$/, 'Use the project id, such as my-emm-project.').describe('The Google Cloud project that manages the enterprises: the service account\'s project.'),
  view: z.enum(['BASIC']).optional().describe('BASIC: only the name of each enterprise.'),
  page_size: pageSize,
  page_token: pageToken,
};
const enterpriseShape = { enterprise };
const listShape = { enterprise, page_size: pageSize, page_token: pageToken };
const applicationShape = {
  enterprise,
  package_name: z.string().regex(PACKAGE, 'Use a package name such as com.google.android.gm.').describe('The app package name, such as com.google.android.gm.'),
  language_code: z.string().optional().describe('The language of the text, such as en-US. Google\'s default is en-US.'),
};
const childShape = (field: string, what: string, collection: string) => ({
  enterprise: enterprise.optional(),
  [field]: z.string().describe(`The ${what} id, with enterprise, or its full name enterprises/<id>/${collection}/<id>.`),
});
const deviceShape = childShape('device', 'device', 'devices');
const policyShape = childShape('policy', 'policy', 'policies');
const webAppShape = childShape('web_app', 'web app', 'webApps');

export function buildTools(cfg: RuntimeConfig): ToolDef[] {
  // The account is the service account (core/auth.ts); the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('service-account', cfg));
  const get = async (path: string, query?: Record<string, string | number | undefined>) => (await call<Record<string, unknown>>({ url: `${AMAPI}/${path}`, query })).data ?? {};
  const page = (data: Record<string, unknown>, key: string) => ({ [key]: data[key] ?? [], next_page_token: (data.nextPageToken as string | undefined) || undefined });
  const matches = (google: string) => `(matches ${google} in Google's Android Device Management MCP server)`;

  return [
    defineTool({
      name: 'androidmgmt_list_enterprises',
      title: 'List Android Management enterprises',
      description: `List the Android Management enterprises a Google Cloud project manages ${matches('list_enterprises')}. Give the project id of the service account's project. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: listEnterprisesShape,
      async handler(args) {
        const input = z.object(listEnterprisesShape).parse(args);
        return page(await get('enterprises', { projectId: input.project_id, view: input.view, pageSize: input.page_size, pageToken: input.page_token }), 'enterprises');
      },
    }),
    defineTool({
      name: 'androidmgmt_get_enterprise',
      title: 'Get an Android Management enterprise',
      description: `One enterprise: its display name, notification settings, terms and contact info ${matches('get_enterprise')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: enterpriseShape,
      async handler(args) {
        return get(enterpriseName(z.object(enterpriseShape).parse(args).enterprise));
      },
    }),
    defineTool({
      name: 'androidmgmt_get_application',
      title: 'Get an app for an enterprise',
      description: `An app's details for an enterprise: title, permissions, managed configuration and tracks ${matches('get_application')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: applicationShape,
      async handler(args) {
        const input = z.object(applicationShape).parse(args);
        return get(`${enterpriseName(input.enterprise)}/applications/${input.package_name}`, { languageCode: input.language_code });
      },
    }),
    defineTool({
      name: 'androidmgmt_list_devices',
      title: 'List the devices of an enterprise',
      description: `The devices an enterprise manages, a page at a time ${matches('list_devices')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: listShape,
      async handler(args) {
        const input = z.object(listShape).parse(args);
        return page(await get(`${enterpriseName(input.enterprise)}/devices`, { pageSize: input.page_size, pageToken: input.page_token }), 'devices');
      },
    }),
    defineTool({
      name: 'androidmgmt_get_device',
      title: 'Get a device of an enterprise',
      description: `One managed device: its state, policy, compliance, hardware and software ${matches('get_device')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: deviceShape,
      async handler(args) {
        const input = z.object(deviceShape).parse(args) as { enterprise?: string; device: string };
        return get(childName(input.enterprise, 'devices', input.device, 'device'));
      },
    }),
    defineTool({
      name: 'androidmgmt_list_policies',
      title: 'List the policies of an enterprise',
      description: `The policies of an enterprise, a page at a time ${matches('list_policies')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: listShape,
      async handler(args) {
        const input = z.object(listShape).parse(args);
        return page(await get(`${enterpriseName(input.enterprise)}/policies`, { pageSize: input.page_size, pageToken: input.page_token }), 'policies');
      },
    }),
    defineTool({
      name: 'androidmgmt_get_policy',
      title: 'Get a policy of an enterprise',
      description: `One policy: its apps, restrictions and settings ${matches('get_policy')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: policyShape,
      async handler(args) {
        const input = z.object(policyShape).parse(args) as { enterprise?: string; policy: string };
        return get(childName(input.enterprise, 'policies', input.policy, 'policy'));
      },
    }),
    defineTool({
      name: 'androidmgmt_list_web_apps',
      title: 'List the web apps of an enterprise',
      description: `The web apps of an enterprise, a page at a time ${matches('list_web_apps')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: listShape,
      async handler(args) {
        const input = z.object(listShape).parse(args);
        return page(await get(`${enterpriseName(input.enterprise)}/webApps`, { pageSize: input.page_size, pageToken: input.page_token }), 'webApps');
      },
    }),
    defineTool({
      name: 'androidmgmt_get_web_app',
      title: 'Get a web app of an enterprise',
      description: `One web app: its title, start URL, icons and display mode ${matches('get_web_app')}. A read.`,
      kind: 'read',
      scopes: SCOPES,
      inputSchema: webAppShape,
      async handler(args) {
        const input = z.object(webAppShape).parse(args) as { enterprise?: string; web_app: string };
        return get(childName(input.enterprise, 'webApps', input.web_app, 'web app'));
      },
    }),
  ];
}
