/**
 * Curated tools of the gplay server: the Android Management ones and the build upload.
 *
 * The nine Android Management tools match the tools of Google's Android Device Management MCP server
 * (androidmanagement.googleapis.com/mcp): get_enterprise, list_enterprises, get_application, get_device, list_devices,
 * get_policy, list_policies, get_web_app and list_web_apps. All are reads (GET). The Android Management API is a gateway
 * API of gplay (its per-method tools would take gplay past the 350 generated tools a server may have), so these call it
 * directly; their request contract is tests/fixtures/discovery/androidmanagement.v1.json. The service-account key asks
 * for the androidmanagement scope since 1.23.1. Google answers only for an enterprise that the service account's Google
 * Cloud project manages (the project that created it).
 *
 * androidpub_upload_bundle is the one media upload the per-method tools leave out (Android Publisher v3
 * edits.bundles.upload, src/core/discovery/tools.ts skips every upload method): without it a new build cannot reach a
 * track at all. It uploads a local .aab into an edit, writes the new version code onto a track as a release when asked,
 * and commits the edit only when the call says so. Its contract is tests/fixtures/discovery/androidpublisher.v3.json.
 *
 * Auth: the service-account key (`gsm setup-service-account`), as the other gplay tools.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type PreparedAction, type ToolDef } from '../core/tools.js';
import { checkLocalFile, protectedPaths } from './local-files.js';
import { makeCloudCall, statusOf, type CloudCall } from './cloud-http.js';

const AMAPI = 'https://androidmanagement.googleapis.com/v1';
/** Every Android Management method lists this one scope (Discovery). */
const SCOPES = googleScopes('androidmanagement');
/** Every Android Publisher method lists this one scope (Discovery). */
const PUBLISHER_SCOPES = googleScopes('androidpublisher');
const PUBLISHER = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
/** The upload host of a media-upload method: the same path, under /upload/. */
const PUBLISHER_UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

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
    defineTool({
      name: 'androidpub_upload_bundle',
      title: 'Upload an Android App Bundle and set its release',
      description:
        'Upload an Android App Bundle (.aab) from a local file into a Play edit (Android Publisher v3 edits.bundles.upload, the media upload the per-method tools leave out), optionally put the new version on a track as a release, and commit the edit when told to. Without commit the edit stays open and androidpub_edits_commit finishes it. The bundle_path is a full path, and files in the folder that holds the Google sign-in data are refused. A write: it asks first, and asking for commit makes it a destructive call (a committed release is published), so it asks twice. The approval names the file, its size and SHA-256, the track and its current releases.',
      kind: 'write',
      // Committing the edit publishes the release (the destructive rule).
      destructiveWhen: ({ commit }) => commit === true,
      scopes: PUBLISHER_SCOPES,
      inputSchema: bundleShape,
      async prepare(args) {
        return planBundleUpload(cfg, call, args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as BundleUploadPlan | undefined) ?? (await planBundleUpload(cfg, call, args));
        const pkg = encodeURIComponent(plan.packageName);
        const editId = plan.editId ?? (await call<{ id?: string }>({ url: `${PUBLISHER}/applications/${pkg}/edits`, method: 'POST', body: {} })).data.id;
        if (!editId) throw new Error('Google did not return an edit id.');
        const id = encodeURIComponent(editId);
        const bundle = await call<{ versionCode?: number; sha256?: string }>({
          url: `${PUBLISHER_UPLOAD}/applications/${pkg}/edits/${id}/bundles`,
          method: 'POST',
          query: { uploadType: 'media' },
          headers: { 'Content-Type': 'application/octet-stream' },
          // A stream, so a large bundle is not read into memory.
          body: createReadStream(plan.localPath),
        });
        const versionCode = bundle.data.versionCode;
        if (versionCode === undefined) throw new Error('Google did not return a version code for the uploaded bundle.');
        let release: { track: string; status: string; releases: number } | undefined;
        if (plan.track) {
          const track = plan.track;
          const existing = await readTrack(call, pkg, id, track);
          const current = (existing.track === undefined ? {} : { track: existing.track }) as Record<string, unknown>;
          const releases = [bundleRelease(plan, versionCode), ...(existing.releases ?? []).filter((r) => !(r.versionCodes ?? []).includes(String(versionCode)))];
          await call({
            url: `${PUBLISHER}/applications/${pkg}/edits/${id}/tracks/${encodeURIComponent(track)}`,
            method: 'PUT',
            body: { ...current, track, releases },
          });
          release = { track, status: plan.releaseStatus, releases: releases.length };
        }
        if (plan.commit) await call({ url: `${PUBLISHER}/applications/${pkg}/edits/${id}:commit`, method: 'POST' });
        return {
          package_name: plan.packageName,
          edit_id: editId,
          version_code: versionCode,
          ...(bundle.data.sha256 ? { sha256: bundle.data.sha256 } : {}),
          size_bytes: plan.sizeBytes,
          ...(release ? { track: release.track, release_status: release.status, releases_on_the_track: release.releases } : {}),
          committed: plan.commit,
          ...(plan.commit
            ? {}
            : { note: 'The edit is open. androidpub_edits_commit commits it (a release is then published), and androidpub_edits_delete drops it; Google discards an edit that is never committed.' }),
        };
      },
    }),
  ];
}

const bundleShape = {
  package_name: z.string().regex(PACKAGE, 'Use a package name such as com.example.app.').describe('The app package name, such as com.example.app.'),
  bundle_path: z.string().describe('Full path of the Android App Bundle (.aab) to upload. Files in the folder that holds the Google sign-in data are refused.'),
  edit_id: z.string().optional().describe('An edit to add the bundle to. Default: a new edit, returned as edit_id.'),
  track: z
    .string()
    .optional()
    .describe('Put the new version on this track as a release: internal, alpha, beta, production or a custom track. Without it the bundle is only in the edit.'),
  release_status: z
    .enum(['draft', 'inProgress', 'halted', 'completed'])
    .optional()
    .describe("The release's status on the track (Discovery, TrackRelease.status): draft (not served; the default), inProgress (a staged rollout, with user_fraction), halted, or completed."),
  user_fraction: z.number().min(0).max(1).optional().describe('The share of users that get the release, 0 to 1, when release_status is inProgress.'),
  release_name: z.string().optional().describe("The release's name, such as 1.4.0."),
  release_notes: z
    .array(z.object({ language: z.string(), text: z.string() }))
    .optional()
    .describe('Release notes, one per language, such as [{"language": "en-US", "text": "Fixes the login crash."}].'),
  commit: z.boolean().optional().describe('true commits the edit, which publishes the release (it then asks twice). Default false: the edit stays open, and androidpub_edits_commit finishes it.'),
};

/** The SHA-256 of a file in hex, read in chunks so a large bundle is not held in memory for the hash. */
export function sha256Of(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/**
 * What androidpub_upload_bundle will do, worked out from the arguments and a read of the track: the file (full path,
 * size, SHA-256), the track and its releases, and whether the edit is committed. It changes nothing; the approval shows
 * its preview.
 */
export interface BundleUploadPlan extends PreparedAction {
  packageName: string;
  localPath: string;
  sizeBytes: number;
  sha256: string;
  editId?: string;
  track?: string;
  releaseStatus: 'draft' | 'inProgress' | 'halted' | 'completed';
  userFraction?: number;
  releaseName?: string;
  releaseNotes?: Array<{ language: string; text: string }>;
  commit: boolean;
}

/** The track's releases as the API returns them, or an empty record when the edit has no such track yet. */
async function readTrack(
  call: CloudCall,
  pkg: string,
  editId: string,
  track: string,
): Promise<{ track?: string; releases?: Array<{ versionCodes?: string[]; status?: string }> }> {
  try {
    return (
      await call<{ track?: string; releases?: Array<{ versionCodes?: string[]; status?: string }> }>({
        url: `${PUBLISHER}/applications/${pkg}/edits/${editId}/tracks/${encodeURIComponent(track)}`,
      })
    ).data;
  } catch (err) {
    // A new edit has no tracks yet: Google answers 404 for a track with no release.
    if (statusOf(err) === 404) return {};
    throw err;
  }
}

/** One release for the track body (Discovery, TrackRelease): the new version code, its status and what only some statuses take. */
export function bundleRelease(plan: Pick<BundleUploadPlan, 'releaseStatus' | 'userFraction' | 'releaseName' | 'releaseNotes'>, versionCode: number) {
  return {
    ...(plan.releaseName ? { name: plan.releaseName } : {}),
    versionCodes: [String(versionCode)],
    status: plan.releaseStatus,
    ...(plan.releaseStatus === 'inProgress' && plan.userFraction !== undefined ? { userFraction: plan.userFraction } : {}),
    ...(plan.releaseNotes?.length ? { releaseNotes: plan.releaseNotes.map((n) => ({ language: n.language, text: n.text })) } : {}),
  };
}

/** Reads the bundle from disk (a read only) and works out what the approval shows. */
export async function planBundleUpload(cfg: RuntimeConfig, call: CloudCall, args: z.infer<z.ZodObject<typeof bundleShape>>): Promise<BundleUploadPlan> {
  const status = args.release_status ?? 'draft';
  if (status === 'inProgress' && args.user_fraction === undefined) {
    throw new Error('A staged rollout (release_status inProgress) needs user_fraction, the share of users that get it, between 0 and 1.');
  }
  if (args.user_fraction !== undefined && status !== 'inProgress') {
    throw new Error(`user_fraction applies to a staged rollout only: it is for release_status inProgress, not ${status}.`);
  }
  const file = checkLocalFile(args.bundle_path, protectedPaths(cfg), 'Bundle');
  if (!/\.aab$/i.test(file.path)) throw new Error(`"${args.bundle_path}" is not an Android App Bundle: upload a file that ends in .aab.`);
  const sha256 = await sha256Of(file.path);
  const plan: BundleUploadPlan = {
    packageName: args.package_name,
    localPath: file.path,
    sizeBytes: file.size,
    sha256,
    ...(args.edit_id ? { editId: args.edit_id } : {}),
    ...(args.track ? { track: args.track } : {}),
    releaseStatus: status,
    ...(args.user_fraction !== undefined ? { userFraction: args.user_fraction } : {}),
    ...(args.release_name ? { releaseName: args.release_name } : {}),
    ...(args.release_notes?.length ? { releaseNotes: args.release_notes } : {}),
    commit: args.commit === true,
    preview: {},
  };
  plan.preview = await bundlePreview(call, plan);
  return plan;
}

/** The text the approval shows: the file, the track as it is now, the release to add, and what committing does. */
async function bundlePreview(call: CloudCall, plan: BundleUploadPlan): Promise<Record<string, unknown>> {
  const base = {
    package: plan.packageName,
    ...(plan.editId ? { edit: plan.editId } : { edit: 'a new edit' }),
    bundle: plan.localPath,
    size_bytes: plan.sizeBytes,
    sha256: plan.sha256,
  };
  if (!plan.track) {
    return { ...base, effect: 'Uploads the bundle into the edit. No track, so no release changes. androidpub_edits_commit or androidpub_edits_delete finishes the edit.' };
  }
  const existing = plan.editId ? await readTrack(call, encodeURIComponent(plan.packageName), encodeURIComponent(plan.editId), plan.track) : {};
  const releases = (existing.releases ?? []).map((r) => ({ version_codes: r.versionCodes ?? [], status: r.status }));
  return {
    ...base,
    track: plan.track,
    releases_on_the_track_now: plan.editId ? releases : 'unknown: a new edit starts empty',
    release: {
      ...(plan.releaseName ? { name: plan.releaseName } : {}),
      status: plan.releaseStatus,
      ...(plan.userFraction !== undefined ? { user_fraction: plan.userFraction } : {}),
      ...(plan.releaseNotes?.length ? { release_notes: plan.releaseNotes.length } : {}),
    },
    effect: plan.commit
      ? 'Uploads the bundle, puts it on the track as this release, and commits the edit: the release is published and Play reviews it. It cannot be taken back.'
      : 'Uploads the bundle and puts it on the track as this release, in the open edit. Nothing is published until androidpub_edits_commit.',
  };
}

