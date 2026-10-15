/**
 * The read, write or destructive kind of one catalog method, for `gsm methods`.
 *
 * In the repo the compiled classifyMethod is used: dist/core/discovery/methods.js, next to dist/cli. A plugin
 * bundle has no such file, so the same rules are kept here as a fallback. A test checks that both give the
 * same kind for every method of the catalog, so the copy cannot drift without a failing test.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ToolKind } from '../core/tools.js';

export type KindClassifier = (
  httpMethod: string,
  methodName: string,
  fullId: string,
  overrides: Readonly<Record<string, ToolKind>>,
) => ToolKind;

export interface LoadedClassifier {
  /** Where the rules came from, shown in the output. */
  source: 'core' | 'built-in';
  classify: KindClassifier;
}

/** Read-only POST methods recognised by name prefix. Same as READ_POST_PREFIXES in core/discovery/methods.ts. */
export const FALLBACK_READ_POST_PREFIXES = [
  'get',
  'list',
  'search',
  'batchGet',
  'lookup',
  'check',
  'validate',
  'inspect',
  'fetch',
  'download',
  'describe',
  'preview',
  'analyze',
  'detect',
  'evaluate',
];

/** Read-only POST methods recognised by exact name. Same as READ_POST_EXACT in core/discovery/methods.ts. */
export const FALLBACK_READ_POST_EXACT = [
  // Chrome UX Report: public performance data, read only.
  'queryRecord',
  'queryHistoryRecord',
  'getIamPolicy',
  'testIamPermissions',
  'runReport',
  'runRealtimeReport',
  'runPivotReport',
  'batchRunReports',
  'runAccessReport',
  'queryAuditLogs',
];

/** Destructive method names. Same as DESTRUCTIVE_NAMES in core/discovery/methods.ts. */
export const FALLBACK_DESTRUCTIVE_NAMES = [
  'delete',
  'remove',
  'trash',
  'empty',
  'cancel',
  'stop',
  'disable',
  'revoke',
  'reset',
  'deactivate',
  'suspend',
  'deprovision',
  'purge',
  'terminate',
  'destroy',
  'clear',
  'unsubscribe',
  'send',
  'sendDraft',
  'batchDelete',
  'batchRemove',
  'close',
  'archive',
  'move-to-trash',
];

/** Credential words in the method name. Same as CREDENTIAL_NAME in core/discovery/methods.ts. */
const FALLBACK_CREDENTIAL_NAME = /token|credential|secret|password|authoriz|key/i;

const normalizeName = (s: string): string => s.replace(/[-_]/g, '').toLowerCase();
const DESTRUCTIVE_SET = new Set(FALLBACK_DESTRUCTIVE_NAMES.map(normalizeName));

/** Same as patternMatches in core/discovery/methods.ts: "*" stands for one or more characters of the method id. */
function patternMatches(pattern: string, fullId: string): boolean {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.+');
  return new RegExp(`^${body}$`).test(fullId);
}

/** The verb and name rules, the same as classifyMethod in core/discovery/methods.ts. */
export const fallbackClassify: KindClassifier = (httpMethod, methodName, fullId, overrides) => {
  const exact = overrides[fullId];
  const pattern = Object.entries(overrides).find(([key]) => key.includes('*') && patternMatches(key, fullId));
  const override = exact ?? pattern?.[1];
  if (override) return override;
  const http = httpMethod.toUpperCase();
  if (http === 'DELETE') return 'destructive';
  if (DESTRUCTIVE_SET.has(normalizeName(methodName))) return 'destructive';
  if (http !== 'GET' && FALLBACK_CREDENTIAL_NAME.test(methodName)) return 'write';
  if (http === 'GET') return 'read';
  if (http === 'POST') {
    if (FALLBACK_READ_POST_EXACT.includes(methodName)) return 'read';
    if (FALLBACK_READ_POST_PREFIXES.some((prefix) => methodName.startsWith(prefix))) return 'read';
  }
  return 'write';
};

/**
 * The compiled classifyMethod when dist/core/discovery/methods.js is beside this CLI, else the built-in copy.
 * The import is dynamic, so a plugin bundle without the file still runs.
 */
export async function loadClassifier(fromUrl: string): Promise<LoadedClassifier> {
  const coreUrl = new URL('../core/discovery/methods.js', fromUrl);
  if (coreUrl.protocol === 'file:' && existsSync(fileURLToPath(coreUrl))) {
    try {
      const mod = (await import(coreUrl.href)) as { classifyMethod?: KindClassifier };
      if (typeof mod.classifyMethod === 'function') return { source: 'core', classify: mod.classifyMethod };
    } catch {
      // Fall through to the built-in rules.
    }
  }
  return { source: 'built-in', classify: fallbackClassify };
}
