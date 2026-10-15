/**
 * `gsm setup-admin`: records the super admin to impersonate and the scope list
 * for the workspace-admin group. The service account key is checked and then
 * referenced by path. It is never copied into the token directory.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../core/config.js';
import { saveAdminScopeFile } from '../core/auth.js';
import type { Registry } from '../core/registry.js';
import { PROFILE_TEXT, requirementsFor, resolveScopes, type Profile } from '../core/scopes.js';
import { coverageOf, formatCoverage, selectGroupServers } from './scopes.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

export interface SetupAdminRequest {
  subject: string;
  keyFile: string;
  profile: Profile;
  servers?: string[];
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
  const requirements = await requirementsFor(servers, cfg);
  const resolution = resolveScopes(requirements, req.profile);

  const file = saveAdminScopeFile(cfg, { subject: req.subject, scopes: resolution.scopes, profile: req.profile, keyFile });

  out.log(`Saved admin setup: ${file} (mode 0600).`);
  out.log(`Subject: ${req.subject}`);
  out.log(`Key file: ${keyFile} (referenced, not copied)`);
  out.log(`Profile ${req.profile}: ${PROFILE_TEXT[req.profile]}.`);
  out.log(`The server for ${servers.join(', ')} runs ${formatCoverage(coverageOf(requirements, resolution.scopes))}.`);
  out.log('Authorize these scopes for the service account client ID under Google Admin console > Security > API controls > Domain-wide delegation:');
  for (const scope of resolution.scopes) out.log(`  ${scope}`);
  out.log('Restart the gws-admin server so it reads the new setup. Write tools also need GSM_ALLOW_WRITES=true.');
  return 0;
}
