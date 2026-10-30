/**
 * `gsm setup-admin`: records the super admin to impersonate and the scope list
 * for the workspace-admin group. The service account key is checked and then
 * referenced by path. It is never copied into the token directory.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminScopeFileFor, readAdminScopeFile, saveAdminScopeFile } from '../core/auth.js';
import { loadConfig, type RuntimeConfig } from '../core/config.js';
import { serverByName, type Registry } from '../core/registry.js';
import { PROFILE_TEXT, requirementsForSpecs, resolveScopes, type Profile } from '../core/scopes.js';
import { TOOLSET_TEXT, type Toolset } from '../core/toolset.js';
import { describeMerge, mergeScopes } from './merge.js';
import { coverageOf, formatCoverage, selectGroupServers } from './scopes.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export interface SetupAdminRequest {
  subject: string;
  keyFile: string;
  profile: Profile;
  servers?: string[];
  /** --replace: keep only the requested scopes and drop the stored ones. Default: merge with the stored scopes. */
  replace?: boolean;
  /** --toolset: only the tools of this toolset count toward the scopes. Absent: GSM_TOOLSET, else all. */
  toolset?: Toolset;
}

/** The scopes of the stored admin setup. An unreadable setup file is noted on stderr and counts as nothing stored. */
function storedAdminScopes(cfg: RuntimeConfig, out: Output): string[] {
  if (!existsSync(adminScopeFileFor(cfg))) return [];
  const record = readAdminScopeFile(cfg);
  if (!record) {
    out.warn(`note: ${adminScopeFileFor(cfg)} is unreadable; its stored scopes are not merged.`);
    return [];
  }
  return record.scopes;
}

/** Checks that the file is a service account key: JSON with a client_email. Never prints the file content. */
export function checkServiceAccountKey(file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`key file not found: ${file}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new UsageError(`${file} is not valid JSON. Use the service account JSON key from Google Cloud console.`);
  }
  const email = typeof parsed === 'object' && parsed !== null ? (parsed as { client_email?: unknown }).client_email : undefined;
  if (typeof email !== 'string' || email.trim() === '') {
    throw new UsageError(`${file} is not a service account key: it has no client_email.`);
  }
}

export async function runSetupAdmin(req: SetupAdminRequest, reg: Registry, out: Output): Promise<number> {
  const keyFile = resolve(req.keyFile);
  checkServiceAccountKey(keyFile);

  const cfg = loadConfig();
  const servers = selectGroupServers(reg, 'workspace-admin', req.servers);
  const toolset = req.toolset ?? cfg.toolset;
  // The specs of this CLI's registry, as gsm login and gsm scopes take them: in the repository layout each one is built
  // from its plugin folder (withPluginFolders in products.ts), so the npm package counts what the gadmin plugin counts.
  const requirements = await requirementsForSpecs(
    servers.map((name) => serverByName(reg, name)),
    cfg,
    toolset !== 'all' ? { toolset } : {},
  );
  if (toolset !== 'all') out.log(`Toolset ${toolset}: only the tools of this toolset count toward the scopes (${TOOLSET_TEXT[toolset]}).`);
  const resolution = resolveScopes(requirements, req.profile);
  const replace = req.replace === true;
  const merge = mergeScopes({ requested: resolution.scopes, stored: storedAdminScopes(cfg, out), replace });
  const mergeLine = describeMerge(merge, replace);
  if (mergeLine) out.log(mergeLine);

  const file = saveAdminScopeFile(cfg, { subject: req.subject, scopes: merge.scopes, profile: req.profile, keyFile });

  out.log(`Saved admin setup: ${file} (mode 0600).`);
  out.log(`Subject: ${req.subject}`);
  out.log(`Key file: ${keyFile} (referenced, not copied)`);
  out.log(`Profile ${req.profile}: ${PROFILE_TEXT[req.profile]}.`);
  out.log(`The server for ${servers.join(', ')} runs ${formatCoverage(coverageOf(requirements, merge.scopes))}.`);
  out.log('Authorize these scopes for the service account client ID under Google Admin console > Security > API controls > Domain-wide delegation:');
  for (const scope of merge.scopes) out.log(`  ${scope}`);
  out.log('Restart the gadmin server so it reads the new setup. Write tools also need GSM_ALLOW_WRITES=true.');
  return 0;
}
