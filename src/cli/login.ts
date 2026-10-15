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
import { mkdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import { ADMIN_SCOPES, readClientSecret } from '../core/auth.js';
import { loadConfig } from '../core/config.js';
import { type AuthGroup, type Registry } from '../core/registry.js';
import { PROFILE_TEXT, requirementsFor, resolveScopes, type Profile } from '../core/scopes.js';
import { OAUTH_GROUPS, type CliGroup } from './args.js';
import { tokenFileFor } from './credentials.js';
import { writeAtomic } from './fsutil.js';
import { postureLine } from './posture.js';
import { coverageOf, formatCoverage, selectGroupServers } from './scopes.js';
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
  const requirements = await requirementsFor(servers, cfg);

  let scopes: string[];
  if (req.profile === 'custom') {
    scopes = [...new Set(req.customScopes ?? [])].sort();
    out.log(`Using the ${scopes.length} scope(s) given with --scopes. Nothing else is added.`);
  } else {
    scopes = resolveScopes(requirements, req.profile).scopes;
    out.log(`Profile ${req.profile}: ${PROFILE_TEXT[req.profile]}.`);
  }
  if (scopes.length === 0) throw new Error(`no OAuth scopes resolved for group "${group}"`);

  out.log(`Servers: ${servers.join(', ')}`);
  out.log(`This token runs ${formatCoverage(coverageOf(requirements, scopes))}.`);
  out.log(`Logging in for group "${group}" with ${scopes.length} scope(s):`);
  for (const scope of scopes) out.log(`  ${scope}`);
  if (req.servers && req.servers.length > 0) {
    out.log('Note: --servers stores a token that covers only those servers, and it replaces the group token.');
  }

  const tokens = await loopbackLogin(clientId, clientSecret, scopes, out);
  mkdirSync(cfg.tokenDir, { recursive: true, mode: 0o700 });
  const file = tokenFileFor(group, cfg);
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
  out.log('Save the key with: gsm setup-apikey  (it reads GSM_API_KEY_INPUT or stdin, never an argument)');
}

function printAdminGuidance(out: Output): void {
  out.log('workspace-admin uses a service account with domain-wide delegation. It has no interactive login.');
  out.log('Set it up with: gsm setup-admin --subject <super admin email> --key-file <service account JSON> [--profile readonly|readwrite|full]');
  out.log('That stores the subject and the scope list the server uses. The key file stays where it is.');
  out.log('Or set these environment variables for the gws-admin server (used when setup-admin has not run):');
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

/** Runs the loopback flow and exchanges the code. Exported for the scratch tests only. */
export async function loopbackLogin(clientId: string, clientSecret: string, scopes: string[], out: Output): Promise<Credentials> {
  const state = randomBytes(16).toString('hex');

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
      });
      out.log(`\nOpen this URL to log in if the browser does not open:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const client = new OAuth2Client(clientId, clientSecret, callback.redirectUri);
  const { tokens } = await client.getToken(callback.code);
  return tokens;
}
