import { existsSync } from 'node:fs';
import { isLoggedIn, loadUserTokens, readAdminScopeFile, type AuthKind } from './auth.js';
import type { RuntimeConfig } from './config.js';
import { checkGrant, type GrantState } from './grant-check.js';
import { invocation } from './invocation.js';

/**
 * Health of a server: what it runs with, and whether its login works. The offline view reads the token file and the
 * setup files only. The live view asks Google, and runs only when the caller asks for it (`live: true` in the tool,
 * `--check` in the CLI). Nothing here changes a file or a Google account.
 */

export type LoginKind = 'oauth' | 'oauth-or-adc' | 'api-key' | 'service-account';

export interface LoginHealth {
  kind: LoginKind;
  loggedIn: boolean;
  /** The account the login belongs to, as recorded at login. Undefined when none was recorded. */
  account?: string;
  detail: string;
  /** The tool that moves a server that is not signed in forward. Undefined when signed in. */
  next?: string;
}

export interface LiveHealth {
  state: GrantState | 'not-applicable';
  detail: string;
  account?: string;
  expiresInSeconds?: number;
  missingScopes: string[];
}

/** The next tool for a server without a Google sign-in: save the client first if it is missing, then sign in. */
function nextSignIn(cfg: RuntimeConfig): string {
  return existsSync(cfg.clientSecretFile) ? 'auth_login' : 'auth_setup_client';
}

/** The account recorded in a group's token file at login. */
export function storedAccount(group: AuthKind, cfg: RuntimeConfig): string | undefined {
  try {
    const tokens = loadUserTokens(group, cfg) as { account?: unknown } | null;
    return typeof tokens?.account === 'string' ? tokens.account : undefined;
  } catch {
    return undefined;
  }
}

/** The offline login state of a group. Never calls Google. */
export function loginHealth(group: string, cfg: RuntimeConfig): LoginHealth {
  if (group === 'apikey') {
    const set = Boolean(cfg.apiKey);
    return {
      kind: 'api-key',
      loggedIn: set,
      detail: set ? 'API key set' : `no API key: run ${invocation()} setup-apikey`,
      // A key is never sent through the chat, so there is no tool to set it.
      next: set ? undefined : 'set GSM_API_KEY, or run setup-apikey in a terminal',
    };
  }
  if (group === 'workspace-admin') {
    const stored = readAdminScopeFile(cfg);
    const configured = Boolean((stored?.keyFile ?? cfg.serviceAccountKeyFile) && (stored?.subject ?? cfg.adminSubject));
    return {
      kind: 'service-account',
      loggedIn: configured,
      detail: configured ? 'service account set up' : `not set up: run ${invocation()} setup-admin`,
      next: configured ? undefined : 'auth_setup_admin',
    };
  }
  if (group === 'cloud') {
    const oauth = isLoggedIn('cloud', cfg);
    return {
      kind: 'oauth-or-adc',
      loggedIn: oauth,
      account: oauth ? storedAccount('cloud', cfg) : undefined,
      next: oauth ? undefined : nextSignIn(cfg),
      detail: oauth
        ? 'OAuth login'
        : `no OAuth login: run ${invocation()} login cloud, or use Application Default Credentials`,
    };
  }
  const loggedIn = isLoggedIn(group as AuthKind, cfg);
  return {
    kind: 'oauth',
    loggedIn,
    account: loggedIn ? storedAccount(group as AuthKind, cfg) : undefined,
    next: loggedIn ? undefined : nextSignIn(cfg),
    detail: loggedIn ? 'logged in' : `not logged in: run ${invocation()} login ${group}`,
  };
}

/** Asks Google about a group's login. Makes network calls, so it runs only when asked. */
export async function liveHealth(group: string, cfg: RuntimeConfig): Promise<LiveHealth> {
  if (group === 'apikey' || group === 'workspace-admin') {
    return { state: 'not-applicable', detail: 'nothing to ask Google about for this group', missingScopes: [] };
  }
  const check = await checkGrant(group as AuthKind, cfg);
  return {
    state: check.state,
    detail: check.detail,
    account: check.account,
    expiresInSeconds: check.expiresInSeconds,
    missingScopes: check.missingScopes,
  };
}

export interface ServerHealthInput {
  server: string;
  version: string;
  group: string | undefined;
  cfg: RuntimeConfig;
  /** Tools registered right now. */
  registered: number;
  /** Tools defined but not registered: they need a login, a scope, or GSM_ALLOW_WRITES. */
  hidden: number;
  writesAllowed: boolean;
  live: boolean;
}

/** The report of one server. The JSON it returns is what the health tool and `gsm health --json` show. */
export async function serverHealth(input: ServerHealthInput): Promise<Record<string, unknown>> {
  const login = input.group ? loginHealth(input.group, input.cfg) : null;
  const report: Record<string, unknown> = {
    server: input.server,
    version: input.version,
    group: input.group ?? null,
    tools: { registered: input.registered, hidden: input.hidden, writesAllowed: input.writesAllowed },
    login,
  };
  if (input.live && input.group) {
    report.live = await liveHealth(input.group, input.cfg);
  } else {
    report.live = 'not checked (ask with live: true)';
  }
  return report;
}
