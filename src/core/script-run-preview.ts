/**
 * The approval-only preview for Apps Script's `scripts.run` (OD03).
 *
 * The run request carries a deployment ID, but Google's read APIs require the script project's Drive ID in {scriptId},
 * and Google does not document that one can stand in for the other. So the preview reads only when the caller passes an
 * explicit, preview-only `previewProjectId`. It uses documented GETs, never puts the deployment ID into {scriptId},
 * never reads source text, and never throws or blocks: a failed or slow read shows an explicit `version not read` marker
 * and the gate still decides. The run tool stays destructive and its HTTP request is unchanged.
 *
 * This module is pure: the caller (src/core/discovery/tools.ts) supplies a reader that sends the GET through the call's
 * authorized client and redacts credentials from a content response before any field is picked here.
 */
import { clipText } from './discovery/schema.js';

/** The key that holds the read fields in the approval's arguments. It says the fields were read, and are not sent. */
export const RUN_PREVIEW_KEY = 'run version (read from Google now, not sent)';
/** The one shared deadline for all preview reads. A late read is ignored; it never delays the approval. */
export const RUN_PREVIEW_TIMEOUT_MS = 5000;
/** At most this many scalar fields are shown, and each value is cut to this many characters. */
export const RUN_PREVIEW_MAX_FIELDS = 6;
export const RUN_PREVIEW_VALUE_CHARS = 120;
/** The marker used when no project id was supplied or a read could not be resolved. */
export const RUN_PREVIEW_NOT_READ = 'version not read';
/** Google's wording for devMode, from the scripts.run reference. */
export const DEV_MODE_MEANING =
  'devMode=true: if you own the script, Google runs the most recently saved version rather than the version deployed for use with the Apps Script API; devMode=false: the deployed version runs.';

/** The three documented GETs; `content` is HEAD unless it carries a versionNumber query. */
export type RunPreviewReadKind = 'deployment' | 'version' | 'content';
export type RunPreviewReader = (kind: RunPreviewReadKind, url: string) => Promise<unknown>;

export interface RunPreviewInput {
  /** The run's scriptId argument: a DEPLOYMENT id, used only after /deployments/. */
  deploymentId: string;
  /** The script project's Drive ID, or absent/empty when the caller gave no documented id for the reads. */
  previewProjectId?: unknown;
  /** The function named in the run's body. */
  functionName?: unknown;
  /** The run's devMode, defaulting to false as Google documents. */
  devMode?: unknown;
  /** The Discovery document's root URL; the normal server uses Google's script host. */
  rootUrl?: string;
}

type Attempt = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/** One scalar, clipped and always a string: no nested objects, tokens or source text can reach the approval. */
const scalar = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : (clipText(text, RUN_PREVIEW_VALUE_CHARS) ?? undefined);
};

const attempt = async (read: RunPreviewReader, kind: RunPreviewReadKind, url: string): Promise<Attempt> => {
  try {
    return { ok: true, value: await read(kind, url) };
  } catch {
    return { ok: false };
  }
};

/** The file whose functionSet contains the requested function, and its documented last-modified time. */
function fileForFunction(content: unknown, functionName: string | undefined): Record<string, unknown> | undefined {
  const files = asRecord(content)?.files;
  if (!Array.isArray(files) || functionName === undefined) return undefined;
  for (const item of files) {
    const file = asRecord(item);
    const values = asRecord(file?.functionSet)?.values;
    if (!Array.isArray(values)) continue;
    if (values.some((entry) => asRecord(entry)?.name === functionName)) return file;
  }
  return undefined;
}

/**
 * The fields the approval may show. Returns only the labelled preview object; the caller adds the original run
 * arguments and the devMode meaning. Every read is bounded by the caller's single `settleWithin` deadline.
 */
export async function readScriptRunPreview(input: RunPreviewInput, read: RunPreviewReader): Promise<Record<string, string>> {
  const projectId = typeof input.previewProjectId === 'string' ? input.previewProjectId.trim() : '';
  if (projectId === '') return { warning: `${RUN_PREVIEW_NOT_READ}: no project script id supplied` };

  const deploymentId = typeof input.deploymentId === 'string' ? input.deploymentId.trim() : '';
  if (deploymentId === '') return { warning: `${RUN_PREVIEW_NOT_READ}: no deployment id supplied` };

  const rawFunctionName = typeof input.functionName === 'string' && input.functionName.trim() !== '' ? input.functionName.trim() : undefined;
  const functionName = rawFunctionName === undefined ? undefined : (clipText(rawFunctionName, RUN_PREVIEW_VALUE_CHARS) ?? undefined);
  const devMode = input.devMode === true;
  const base = (input.rootUrl ?? 'https://script.googleapis.com/').replace(/\/+$/, '');
  // {scriptId} is always the project Drive ID. The run's deployment id appears only in the /deployments/ segment.
  const project = (suffix: string): string => `${base}/v1/projects/${encodeURIComponent(projectId)}/${suffix}`;

  let failed = false;
  const deploymentResult = await attempt(read, 'deployment', project(`deployments/${encodeURIComponent(deploymentId)}`));
  if (!deploymentResult.ok) failed = true;
  const deployment = asRecord(deploymentResult.ok ? deploymentResult.value : undefined);
  const versionNumber = scalar(asRecord(deployment?.deploymentConfig), 'versionNumber');
  const deploymentTime = scalar(deployment, 'updateTime');

  let version: Record<string, unknown> | undefined;
  let content: Record<string, unknown> | undefined;
  let contentRead = false;
  if (devMode) {
    // No versionNumber query: Google returns HEAD, which is what devMode=true runs for an owner.
    const result = await attempt(read, 'content', project('content'));
    contentRead = result.ok;
    if (result.ok) content = asRecord(fileForFunction(result.value, functionName));
    else failed = true;
  } else if (versionNumber === undefined) {
    // Without the deployment's version number a getContent query cannot name the code that will run. A HEAD read would
    // mislead the approver, so issue no content read and degrade to the explicit warning.
    failed = true;
  } else {
    // The version the deployment points at, plus the function list of that exact version. Never read `source`.
    const [versionResult, contentResult] = await Promise.all([
      attempt(read, 'version', project(`versions/${encodeURIComponent(versionNumber)}`)),
      attempt(read, 'content', project(`content?versionNumber=${encodeURIComponent(versionNumber)}`)),
    ]);
    if (versionResult.ok) version = asRecord(versionResult.value);
    else failed = true;
    contentRead = contentResult.ok;
    if (contentResult.ok) content = asRecord(fileForFunction(contentResult.value, functionName));
    else failed = true;
  }

  const contentTimeKey = devMode ? 'HEAD file updateTime' : 'deployed file updateTime';
  const contentTime = scalar(content, 'updateTime');
  const versionTime = scalar(version, 'createTime');
  const governingTime = devMode ? contentTime : (versionTime ?? deploymentTime);

  // Display priority. The warning comes first so it survives the field cap; the entry point and the time that governs
  // the run follow. A second time is shown only when it differs.
  const candidates: Array<[string, string | undefined]> = [
    ['warning', failed ? `${RUN_PREVIEW_NOT_READ}: one or more read-only Google lookups failed, lacked scope or were too slow` : undefined],
    ...(functionName === undefined ? [] : [['entry point', functionName] as [string, string]]),
    ['entry point in code', contentRead ? (content === undefined ? 'not found' : 'found') : undefined],
    ...(devMode || versionNumber === undefined ? [] : [['deployment version', versionNumber] as [string, string]]),
    ['version createTime', devMode ? undefined : versionTime],
    [contentTimeKey, devMode ? contentTime : undefined],
    ['deployment updateTime', deploymentTime],
  ];
  if (governingTime === undefined && !failed) {
    candidates[0] = ['warning', `${RUN_PREVIEW_NOT_READ}: Google did not return a modification time for the code that will run`];
  }
  if (!failed && contentRead && content === undefined && functionName !== undefined) {
    candidates[0] = ['warning', `${RUN_PREVIEW_NOT_READ}: the requested function was not found in the code read`];
  }

  const fields = fieldsOf(candidates, governingTime, contentTimeKey, devMode);
  return Object.keys(fields).length === 0
    ? { warning: `${RUN_PREVIEW_NOT_READ}: no version or modification time was returned` }
    : fields;
}

/** Picks at most the capped number of non-empty fields, suppressing a second timestamp that equals the governing one. */
function fieldsOf(
  candidates: ReadonlyArray<readonly [string, string | undefined]>,
  governingTime?: string,
  contentTimeKey?: string,
  devMode = false,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of candidates) {
    if (Object.keys(fields).length >= RUN_PREVIEW_MAX_FIELDS) break;
    if (value === undefined) continue;
    if (governingTime !== undefined && key === 'deployment updateTime' && value === governingTime) continue;
    if (governingTime !== undefined && key === contentTimeKey && !devMode && value === governingTime) continue;
    fields[key] = value;
  }
  return fields;
}
