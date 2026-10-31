/**
 * The security posture that gsm status and gsm login print for a token: how many scopes it holds, whether
 * every one is read-only, and the confirmation and write settings in this shell's environment. The servers
 * read those settings from their own environment, which the installers may have set, so this is a best view.
 */
import { isViewOnlyScope } from '../core/scopes.js';
import { TOOLSETS } from '../core/toolset.js';
import { confirmationStatus, toolsetStatus, writesEnabled } from './settings.js';

/** One line, for example: "security: 3 granted scope(s), read-only only: no; confirmation: every-change (default); writes: disabled". */
export function postureLine(scopes: readonly string[], env: NodeJS.ProcessEnv): string {
  // Read-only by name, or one of the scopes Google documents as view-only (VIEW_ONLY_SCOPES), as the readonly profile counts them.
  const readOnlyOnly = scopes.length === 0 ? 'no scopes' : scopes.every((scope) => isViewOnlyScope(scope)) ? 'yes' : 'no';
  const confirmation = confirmationStatus(env);
  const mode = !confirmation.known
    ? 'unrecognised GSM_CONFIRMATION value (expected every-change, destructive-only or off)'
    : `${confirmation.mode}${confirmation.set ? '' : ' (default)'}`;
  const writes = writesEnabled(env) ? 'enabled' : 'disabled';
  // The toolset is named only when GSM_TOOLSET is set, so the line is the same as before for the default (all).
  const toolset = toolsetStatus(env);
  const toolsetPart = !toolset.set
    ? ''
    : `; toolset: ${toolset.known ? toolset.toolset.toLowerCase() : `unrecognised GSM_TOOLSET value (expected ${TOOLSETS.join(', ')}; the servers use all)`}`;
  return `security: ${scopes.length} granted scope(s), read-only only: ${readOnlyOnly}; confirmation: ${mode}; writes: ${writes}${toolsetPart}`;
}
