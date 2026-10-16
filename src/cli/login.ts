/**
 * Interactive OAuth login ("installed app", loopback redirect) for one auth group.
 *
 * This is the CLI's own copy of core's loginInteractive. It differs in two ways:
 *  - the scopes come from a profile (core/scopes.ts) or an explicit --scopes list,
 *    never from a fixed list;
 *  - the redirect port is read while the server is still listening. Core reads
 *    server.address() after server.close(), which returns null and throws, so the
 *    login never completes. Core is not changed here; see the report.
 * The token file name (<group>.token.json, mode 0600) matches what core reads.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library';
import { ensureTokenDir } from '../core/acl.js';
import { ADMIN_SCOPES, readClientSecret } from '../core/auth.js';
import { loadConfig } from '../core/config.js';
import { serverByName, type AuthGroup, type Registry } from '../core/registry.js';
import { PROFILE_TEXT, requirementsForSpecs, resolveScopes, type Profile } from '../core/scopes.js';
import { OAUTH_GROUPS, type CliGroup } from './args.js';
import { readStoredToken, tokenFileFor } from './credentials.js';
import { writeAtomic } from './fsutil.js';
import { mergeScopes, describeMerge } from './merge.js';
import { postureLine } from './posture.js';
import { coverageOf, formatCoverage, gatewayReachLine, hasGatewayApis, selectGroupServers } from './scopes.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

const LOGIN_TIMEOUT_MS = 5 * 60_000;

export interface LoginRequest {
  group: CliGroup;
  servers?: string[];
  clientSecretFile?: string;
  /** readonly, readwrite or full. "custom" means exactly customScopes. */
  profile: Profile | 'custom';
  customScopes?: string[];
  /** --no-browser: print the login URL only, and do not open the browser. */
  noBrowser?: boolean;
  /** --replace: keep only the requested scopes and drop the stored ones. Default: merge with the stored scopes. */
  replace?: boolean;
}

/** The scopes stored in the group's token file. An unreadable file is noted on stderr and counts as nothing stored. */
function storedLoginScopes(file: string, out: Output): string[] {
  const { token, error } = readStoredToken(file);
  if (error) {
    out.warn(`note: ${file} is unreadable (${error}); its stored scopes are not merged.`);
    return [];
  }
  return typeof token?.scope === 'string' ? token.scope.split(' ').filter(Boolean) : [];
}

/** `loadRegistry` is passed as a function so that workspace-admin guidance needs no registry. */
export async function runLogin(req: LoginRequest, loadRegistryFn: () => Registry, out: Output): Promise<number> {
  if (req.group === 'workspace-admin') {
    printAdminGuidance(out);
    return 0;
  }
  if (req.group === 'apikey') {
    printApiKeyAlias(out);
    return 0;
  }
  if (!(OAUTH_GROUPS as readonly string[]).includes(req.group)) {
    throw new UsageError(`group "${req.group}" has no interactive login`);
  }
  const group = req.group as AuthGroup;
  const registry = loadRegistryFn();

  const cfg = loadConfig();
  const secretCfg = {
    ...cfg,
    clientSecretFile: req.clientSecretFile ? resolve(req.clientSecretFile) : cfg.clientSecretFile,
  };
  const { clientId, clientSecret } = readClientSecret(secretCfg);

  // --servers narrows the group; every name must belong to it (checked with the same message as before).
  const servers = selectGroupServers(registry, group, req.servers && req.servers.length > 0 ? req.servers : undefined);
  const requirements = await requirementsForSpecs(
    servers.map((name) => serverByName(registry, name)),
    cfg,
    { warn: (line) => out.warn(line) },
  );

  let requested: string[];
  if (req.profile === 'custom') {
    requested = [...new Set(req.customScopes ?? [])].sort();
    out.log(`Requesting the ${requested.length} scope(s) given with --scopes. Nothing else is requested by this login.`);
  } else {
    requested = resolveScopes(requirements, req.profile).scopes;
    out.log(`Profile ${req.profile}: ${PROFILE_TEXT[req.profile]}.`);
  }

  // The rule for stored scopes (merge by default, --replace drops them) is in merge.ts; login and setup-admin share it.
  const file = tokenFileFor(group, cfg);
  const replace = req.replace === true;
  const merge = mergeScopes({ requested, stored: storedLoginScopes(file, out), replace });
  const scopes = merge.scopes;
  if (scopes.length === 0) throw new Error(`no OAuth scopes resolved for group "${group}"`);

  out.log(`Servers: ${servers.join(', ')}`);
  out.log(`This token runs ${formatCoverage(coverageOf(requirements, scopes))}.`);
  if (hasGatewayApis(registry, servers)) out.log(gatewayReachLine(requirements, scopes, req.profile));
  const mergeLine = describeMerge(merge, replace);
  if (mergeLine) out.log(mergeLine);
  out.log(`Logging in for group "${group}" with ${scopes.length} scope(s):`);
  for (const scope of scopes) out.log(`  ${scope}`);
  if (req.servers && req.servers.length > 0) {
    out.log(
      replace
        ? 'Note: --servers with --replace stores a token that covers only those servers.'
        : 'Note: --servers requests only those servers. The scopes stored for the group for other servers are kept (merge).',
    );
  }

  const tokens = await loopbackLogin(clientId, clientSecret, scopes, out, { openBrowser: req.noBrowser !== true });
  ensureTokenDir(cfg.tokenDir);
  writeAtomic(file, JSON.stringify(tokens, null, 2) + '\n', 0o600);
  out.log(`Saved token: ${file} (mode 0600)`);
  out.log(`Granted scopes: ${tokens.scope ?? '(not reported by Google)'}`);
  const granted = (tokens.scope ?? '').split(' ').filter(Boolean);
  out.log(postureLine(granted.length > 0 ? granted : scopes, process.env));
  return 0;
}

/** `gsm login apikey` does no login. The API key is saved by setup-apikey. */
function printApiKeyAlias(out: Output): void {
  out.log('apikey: no login is needed. The products in this group read a saved API key instead.');
  out.log('Save the key with: node gsm.mjs setup-apikey  (it reads GSM_API_KEY_INPUT or stdin, never an argument)');
}

function printAdminGuidance(out: Output): void {
  out.log('workspace-admin uses a service account with domain-wide delegation. It has no interactive login.');
  out.log('Set it up with: node gsm.mjs setup-admin --subject <super admin email> --key-file <service account JSON> [--profile readonly|readwrite|full]');
  out.log('That stores the subject and the scope list the server uses. The key file stays where it is.');
  out.log('Or set these environment variables for the gadmin server (used when setup-admin has not run):');
  out.log('  GSM_SERVICE_ACCOUNT_KEY_FILE  path to the service account JSON key');
  out.log('  GSM_ADMIN_SUBJECT             super admin email to impersonate');
  out.log('In the Google Admin console, under API controls > Domain-wide delegation, authorize the service account client ID for:');
  for (const scope of ADMIN_SCOPES) out.log(`  ${scope}`);
}

/** Opens the auth URL in the browser (best effort; the URL is always printed). */
function openBrowser(url: string): void {
  const [program, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(program, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => {
      // No browser available. The printed URL is the fallback.
    });
    child.unref();
  } catch {
    // Same fallback as above.
  }
}

/**
 * Runs the loopback flow and exchanges the code. With openBrowser false (--no-browser) the URL is printed and the
 * browser is not opened. The default opens it, as before. Exported for the tests.
 */
export async function loopbackLogin(
  clientId: string,
  clientSecret: string,
  scopes: string[],
  out: Output,
  options: { openBrowser?: boolean } = {},
): Promise<Credentials> {
  const shouldOpen = options.openBrowser !== false;
  const state = randomBytes(16).toString('hex');
  // PKCE (RFC 7636). The verifier stays in this process; only its S256 challenge goes into the browser URL.
  const pkce = await new OAuth2Client(clientId, clientSecret).generateCodeVerifierAsync();

  const callback = await new Promise<{ redirectUri: string; code: string }>((resolveCallback, rejectCallback) => {
    let settled = false;
    let redirectUri = '';
    let timer: NodeJS.Timeout | undefined;
    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      action();
    };

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const returnedState = url.searchParams.get('state');
      const returnedCode = url.searchParams.get('code');
      const ok = !error && returnedState === state && Boolean(returnedCode);
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        ok
          ? '<p>Logged in. You can close this tab and return to the terminal.</p>'
          : '<p>Login failed or was cancelled. You can close this tab.</p>',
      );
      server.close();
      server.closeIdleConnections();
      settle(() => {
        if (ok && returnedCode) resolveCallback({ redirectUri, code: returnedCode });
        else rejectCallback(new Error(error ? `OAuth error: ${error}` : 'OAuth state mismatch or missing code'));
      });
    });

    server.once('error', (err) => settle(() => rejectCallback(err)));
    timer = setTimeout(() => {
      server.close();
      settle(() => rejectCallback(new Error('Login timed out after 5 minutes')));
    }, LOGIN_TIMEOUT_MS);

    server.listen(0, '127.0.0.1', () => {
      // Read the port while the server is still listening (see the header comment).
      const port = (server.address() as AddressInfo).port;
      redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const authClient = new OAuth2Client(clientId, clientSecret, redirectUri);
      const authUrl = authClient.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
        state,
        include_granted_scopes: true,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: pkce.codeChallenge,
      });
      if (shouldOpen) {
        out.log(`\nOpen this URL to log in if the browser does not open:\n${authUrl}\n`);
        openBrowser(authUrl);
      } else {
        out.log(`\nOpen this URL in a browser to log in (--no-browser: the browser is not opened):\n${authUrl}\n`);
      }
    });
  });

  const client = new OAuth2Client(clientId, clientSecret, callback.redirectUri);
  const { tokens } = await client.getToken({ code: callback.code, codeVerifier: pkce.codeVerifier });
  return tokens;
}
