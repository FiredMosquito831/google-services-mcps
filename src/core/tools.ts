import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import { loadConfig, verboseOn, type RuntimeConfig } from './config.js';
import {
  AccountChoiceError,
  AuthRequiredError,
  GrantExpiredError,
  UnknownAccountError,
  forgetAdcClients,
  forgetServiceAccountClients,
  forgetUserClients,
  grantedScopes,
  isLoggedIn,
  loginSourceOf,
  removeUserTokens,
  type AuthKind,
} from './auth.js';
import { accountEmailOf, accountNames, listAccounts, otherGroupsWithAccount, setDefaultAccount } from './accounts.js';
import { withAccount } from './account-context.js';
import { revokeGrant, withIdentityScope } from './grant-check.js';
import { createGate, type GateFn } from './approval.js';
import { toolMapFromDefs } from './dump.js';
import { serverHealth } from './health.js';
import { createSignIn, runGsmCommand, type SignInMethod, type SignInProfile } from './inchat-login.js';
import { findGcloud } from './adc.js';
import { apiOfMethod, policyFields, resolveScopes, serverPreferFields, type Requirement } from './scopes.js';
import { fileURLToPath } from 'node:url';
import { loadRegistry, serverByName, type AuthGroup, type ScopePolicy } from './registry.js';
import { invocation, invocationFor, setInvocation } from './invocation.js';
import { selectToolset, type ServerToolsets, type ToolOrigin, type ToolsetSelection } from './toolset.js';
import { settleWithin, TARGET_PREVIEW_KEY, TARGET_READ_TIMEOUT_MS } from './target-preview.js';

/**
 * read        : safe, always registered and never gated.
 * write       : creates or changes data. Registered only when GSM_ALLOW_WRITES=true.
 *               runServer asks the gate before the handler runs.
 * destructive : deletes, disables or sends. Registered like write, and gated like write.
 *               The gate asks the user in every case, even when the hook is active.
 * dynamic     : always registered. The handler calls ctx.gate for each concrete action
 *               (the gateway's api_call). runServer does not gate it beforehand.
 */
export type ActionKind = 'read' | 'write' | 'destructive';
export type ToolKind = ActionKind | 'dynamic';

/** One action a handler wants to run. The gate decides whether it may run, and asks the user when needed. */
export interface GateInput {
  kind: ActionKind;
  /** What the action acts on: the tool name, or the method id for the gateway. */
  target: string;
  /** The API method id, when there is one. Policy rules match it as well as the target. */
  methodId?: string;
  /** The arguments of the action. Secrets are redacted before they are shown or logged. */
  args?: unknown;
}

export interface ToolContext {
  /** Asks for approval of one action. Resolves when it may run; throws DeniedError or ApprovalUnavailableError otherwise. */
  gate(input: GateInput): Promise<void>;
  /** The scopes the stored login holds, read at each access. null when not logged in or unknown. */
  readonly grantedScopes: string[] | null;
  /** True when the stored grant holds at least one of these scopes. An empty list is always true, and so is an unknown grant. */
  hasScope(anyOf: string[]): boolean;
}

/** What a tool's prepare step worked out: the exact action, and what the approval shows of it. */
export interface PreparedAction {
  /** Shown in the approval in place of the raw arguments (and hashed into the audit line). */
  preview: unknown;
}

export interface ToolDef<A extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  inputSchema: A;
  /**
   * OAuth scopes that grant this tool. Any one of them is enough (any-of). A tool
   * with no scope requirement leaves this undefined, and is always registered.
   */
  scopes?: string[];
  /** The API method id, when the tool runs one method. Used by the policy rules and the tool map. */
  methodId?: string;
  /**
   * Runs the action. Throw to report an error to the model. `prepared` is the result of prepare, when the tool has one
   * and runServer ran it; a handler called without it works the action out itself.
   */
  handler(args: z.infer<z.ZodObject<A>>, ctx: ToolContext, prepared?: PreparedAction): Promise<unknown>;
  /**
   * Optional, for a write or destructive tool whose exact effect takes reads to show: the recipients of a reply, the
   * names and sizes of attached files. runServer calls it with the call's account before the gate, shows its preview in
   * the approval in place of the raw arguments, and hands the result to the handler, so the action that runs is the one
   * that was approved. It must change nothing. It never replaces the gate: the gate still runs before the handler.
   */
  prepare?(args: z.infer<z.ZodObject<A>>, ctx: ToolContext): Promise<PreparedAction>;
  /**
   * Optional, for a write tool whose arguments decide whether one call meets the destructive rule (docs/SECURITY.md): it
   * sends a message, invitation or notification to other people, or replaces a whole object. True for such a call, and
   * runServer gates that call as destructive, so it asks even under confirmation destructive-only. It only raises a write
   * to destructive and never lowers a kind. The tool map, the hook and the annotations keep the tool's own kind.
   */
  destructiveWhen?(args: z.infer<z.ZodObject<A>>): boolean;
  /**
   * Optional, for a generated write or destructive tool whose method names one resource that a GET of the same API reads
   * (src/core/target-preview.ts): reads that resource with the call's account and returns a few fields that name it.
   * runServer adds them to the approval's arguments under TARGET_PREVIEW_KEY, when the server's form may be shown for the
   * call. It is a read and changes nothing; the handler and what it sends are not changed. When it returns nothing, fails
   * or is slow, the approval shows the raw arguments, as before.
   */
  describeTarget?(args: z.infer<z.ZodObject<A>>, ctx: ToolContext): Promise<Record<string, string> | undefined>;
  /** Optional metadata: what a destructive action would do, for describe output. The gate does not use it. */
  preview?(args: z.infer<z.ZodObject<A>>): Promise<unknown> | unknown;
  /**
   * Where the tool comes from (curated module, Discovery document or gateway), set where a server's tools are assembled
   * (withOrigin in toolset.ts). The curated toolset reads it. Never shown to the client.
   */
  origin?: ToolOrigin;
  /**
   * The idempotentHint annotation: true when a second call with the same arguments has no further effect on Google's
   * data. Unset, it is true for a read and false otherwise. A hint for the client only; the gate never reads it.
   */
  idempotent?: boolean;
  /**
   * The openWorldHint annotation: false for a tool that reads only local data and sends nothing to Google. Unset, it is
   * true: the tool calls a Google API. A hint for the client only; the gate never reads it.
   */
  openWorld?: boolean;
}

/** The four MCP tool annotation hints (schema 2025-11-25): readOnlyHint, destructiveHint, idempotentHint, openWorldHint. */
export interface ToolHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/**
 * The annotations of a tool from a server's buildTools. readOnlyHint and destructiveHint follow the kind, as before
 * 1.24.3 (a dynamic tool may delete, so it is marked destructive); idempotentHint and openWorldHint come from the tool's
 * declaration, else from its kind (see ToolDef). The kind alone decides what the gate does; these are hints.
 */
export function toolAnnotations(tool: Pick<ToolDef, 'kind' | 'idempotent' | 'openWorld'>): ToolHints {
  return {
    readOnlyHint: tool.kind === 'read',
    destructiveHint: tool.kind === 'destructive' || tool.kind === 'dynamic',
    idempotentHint: tool.idempotent ?? tool.kind === 'read',
    openWorldHint: tool.openWorld ?? true,
  };
}

/**
 * The annotations of the runtime tools runServer adds. Each one manages this machine's sign-in. openWorldHint is true
 * for the three that can send a request to Google: health (with live: true it asks Google whether the login works),
 * auth_login (the sign-in at Google) and account_remove (the revoke at Google). destructiveHint is true where a call can
 * remove or replace what is stored here: a saved client (force), an admin setup (replace), a service account setup
 * (remove), an account.
 */
export const RUNTIME_TOOL_HINTS: Readonly<Record<string, ToolHints>> = {
  health: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  auth_status: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  accounts_list: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  auth_setup_client: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  auth_login: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  account_set_default: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  account_remove: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  auth_setup_admin: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  auth_setup_service_account: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

/** The hints of one runtime tool. A name missing from the table is a programming error, so it throws at start. */
function runtimeHints(name: string): ToolHints {
  const hints = RUNTIME_TOOL_HINTS[name];
  if (!hints) throw new Error(`No annotation hints for the runtime tool ${name}`);
  return { ...hints };
}

/**
 * The kind the gate uses for one call of a write or destructive tool: destructive when the tool is a write whose
 * destructiveWhen says so for these arguments (the account argument already taken out), else the tool's own kind.
 */
export function callKind(tool: Pick<ToolDef, 'kind' | 'destructiveWhen'>, args: Record<string, unknown>): ActionKind {
  if (tool.kind === 'write' && tool.destructiveWhen?.(args as never) === true) return 'destructive';
  return tool.kind as ActionKind;
}

/**
 * False when the server's approval form cannot be shown for a call of this kind: a change while the plugin's hook is
 * active (the hook asks about changes), and the settings that never ask (confirmation off; a change under
 * destructive-only). Used only to skip a target preview read that nobody would see. The gate decides as before.
 */
export function formMayShow(kind: ActionKind, cfg: Pick<RuntimeConfig, 'hookActive' | 'confirmation' | 'confirmationFromEnv'>): boolean {
  if (kind === 'write' && cfg.hookActive) return false;
  if (cfg.confirmationFromEnv && cfg.confirmation === 'off') return false;
  if (cfg.confirmationFromEnv && cfg.confirmation === 'destructive-only' && kind === 'write') return false;
  return true;
}

/** Wraps a tool definition as the model should see it: a typed schema and the same descriptions. */
export function defineTool<A extends ZodRawShape>(def: ToolDef<A>): ToolDef<A> {
  return def;
}

export function asJson(data: unknown, maxChars: number): CallToolResult {
  let text = JSON.stringify(data, null, 2) ?? 'null';
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[truncated: ${text.length - maxChars} more characters. Narrow the query or raise GSM_MAX_RESULT_CHARS.]`;
  }
  return { content: [{ type: 'text', text }] };
}

/** The hint added to a missing-scope error. The admin group is set up with gsm setup-admin, not a login. */
export function scopeHint(group?: string): string {
  if (group === 'workspace-admin') {
    return `The token lacks a scope for this tool. Re-run ${invocation()} setup-admin with a broader profile: ${invocation()} setup-admin --subject <email> --key-file <file> --profile readwrite.`;
  }
  if (group === 'service-account') {
    return `The service account lacks a scope for this tool, or it is not added to the service in use. Check it in Play Console (Users and permissions) or Merchant Center (Users), then set the key up again: ${invocation()} setup-service-account --key-file <file>.`;
  }
  return `The token lacks a scope for this tool. Log in again with a broader profile: ${invocation()} login ${group ?? '<group>'} --profile readwrite.`;
}

/** A 403 that says the token lacks a scope: reason insufficientPermissions, or a message about insufficient scopes. */
function lacksScope(status: unknown, reason: string | undefined, message: string, err: { response?: { data?: unknown } }): boolean {
  if (String(status) !== '403') return false;
  if (reason === 'insufficientPermissions') return true;
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)) return true;
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(JSON.stringify(err.response?.data ?? ''));
}

/**
 * The cause of an error, as " | cause: ..." in verbose mode (GSM_VERBOSE=1) and empty otherwise. A gsm message
 * such as "Not logged in" hides Google's own text, which is kept as the cause for the user who asks for it.
 */
function causeSuffix(err: unknown): string {
  if (!verboseOn()) return '';
  const cause = (err as { cause?: unknown } | null)?.cause;
  const text = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  return text ? ` | cause: ${text}` : '';
}

export function describeError(err: unknown, group?: string): string {
  if (
    err instanceof AuthRequiredError ||
    err instanceof GrantExpiredError ||
    err instanceof UnknownAccountError ||
    err instanceof AccountChoiceError
  ) {
    return err.message + causeSuffix(err);
  }
  // googleapis errors carry status code and a Google-formatted message.
  const e = err as { code?: number; status?: number; message?: string; errors?: Array<{ reason?: string }>; response?: { data?: unknown } };
  const status = e?.code ?? e?.status;
  const reason = e?.errors?.[0]?.reason;
  const base = e?.message ?? String(err);
  const parts = [status ? `HTTP ${status}` : null, reason ? `reason=${reason}` : null, base];
  if (lacksScope(status, reason, base, e ?? {})) parts.push(scopeHint(group));
  return parts.filter(Boolean).join(' | ') + causeSuffix(err);
}

/**
 * Runtime gating. A tool is registered when it has no scopes, when the grant is
 * unknown (null: not logged in), or when the grant holds at least one of its scopes.
 */
export function isGranted(tool: { scopes?: readonly string[] }, granted: readonly string[] | null): boolean {
  if (granted === null || !tool.scopes || tool.scopes.length === 0) return true;
  return tool.scopes.some((scope) => granted.includes(scope));
}

/** The scope policy of a server, from the server map. Undefined when it has none or the map cannot be read. */
function scopePolicyOf(serverName: string): ScopePolicy | undefined {
  try {
    return serverByName(loadRegistry(), serverName).scopePolicy;
  } catch {
    // groupOf reports an unreadable map already.
    return undefined;
  }
}

/** The listed toolsets of a server, from the server map. Undefined when it lists none or the map cannot be read. */
function toolsetsOf(serverName: string): ServerToolsets | undefined {
  try {
    return serverByName(loadRegistry(), serverName).toolsets;
  } catch {
    // groupOf reports an unreadable map already.
    return undefined;
  }
}

/** The toolset part of the health report: only when a toolset other than all was asked for, so the default report is unchanged. */
function toolsetReport(selection: ToolsetSelection<unknown>): Record<string, unknown> | undefined {
  if (selection.requested === 'all') return undefined;
  return {
    requested: selection.requested,
    effective: selection.effective,
    outsideToolset: selection.outside,
    ...(selection.note !== undefined ? { note: selection.note } : {}),
  };
}

/** The auth group of a server, from the server map. Undefined (no scope filtering) when the map cannot be read. */
function groupOf(serverName: string): AuthGroup | undefined {
  try {
    return serverByName(loadRegistry(), serverName).group;
  } catch (err) {
    process.stderr.write(`[${serverName}] tool scopes are not checked: ${(err as Error).message}\n`);
    return undefined;
  }
}

/**
 * Prints the tool map as JSON and exits 0. No transport is connected. Writes are
 * included, so the hook can classify every tool the server could register.
 */
async function dumpTools(buildTools: (cfg: RuntimeConfig) => Promise<ToolDef[]> | ToolDef[], cfg: RuntimeConfig): Promise<void> {
  let text: string;
  try {
    const defined = await buildTools({ ...cfg, allowWrites: true });
    // health and auth_status are added by runServer, not by buildTools. The hook needs them in the map as reads:
    // a tool missing from the map is treated as destructive, and every call to it would ask.
    const runtimeReads = [
      { name: 'health', kind: 'read' as const, title: 'Server health' },
      { name: 'auth_status', kind: 'read' as const, title: 'Sign-in status' },
      // Sign-in tools change local state (a client file, a token, an admin setup), so the hook asks before each call.
      { name: 'auth_setup_client', kind: 'write' as const, title: 'Save the Google OAuth client' },
      { name: 'auth_login', kind: 'write' as const, title: 'Sign in to Google' },
      { name: 'auth_setup_admin', kind: 'write' as const, title: 'Set up the workspace admin account' },
      { name: 'auth_setup_service_account', kind: 'write' as const, title: 'Set up the service account key' },
      { name: 'accounts_list', kind: 'read' as const, title: 'Signed-in accounts' },
      { name: 'account_set_default', kind: 'write' as const, title: 'Set the default account' },
      { name: 'account_remove', kind: 'write' as const, title: 'Remove a signed-in account' },
    ];
    const map = toolMapFromDefs([
      ...defined.map((tool) => ({ name: tool.name, kind: tool.kind, scopes: tool.scopes, title: tool.title, methodId: tool.methodId })),
      ...runtimeReads,
    ]);
    text = `${JSON.stringify({ tools: map }, null, 2)}\n`;
  } catch (err) {
    process.stderr.write(`[dump-tools] ${(err as Error).message}\n`);
    process.exit(1);
  }
  process.stdout.write(text, () => process.exit(0));
}

/**
 * Builds and runs one MCP server. Each server entry supplies its tool list; this
 * function adds the shared behaviour: scope gating at registration, the approval
 * gate before each write or destructive handler, output truncation and error reporting.
 *
 * With --dump-tools in argv, it prints the tool map and exits instead.
 */
export async function runServer(opts: {
  name: string;
  version: string;
  buildTools: (cfg: RuntimeConfig) => Promise<ToolDef[]> | ToolDef[];
}): Promise<void> {
  // The messages of this server name the command that signs in: the plugin's own bin/gsm.mjs, by its full path.
  setInvocation(invocationFor(import.meta.url, process.cwd()));
  // The server's name goes with the config, so a service-account key asks for this server's scopes only (auth.ts).
  const cfg: RuntimeConfig = { ...loadConfig(), server: opts.name };
  if (process.argv.includes('--dump-tools')) {
    await dumpTools(opts.buildTools, cfg);
    return;
  }

  const server = new McpServer({ name: opts.name, version: opts.version });
  // Every tool of the server, then the ones of the chosen toolset (GSM_TOOLSET). With all, `defined` is `built` itself.
  // Everything below registers from `defined`; the tool map (dumpTools above) is built from every tool.
  const built = await opts.buildTools(cfg);
  const selection = selectToolset(built, cfg.toolset, cfg.toolset === 'all' ? undefined : toolsetsOf(opts.name));
  const defined = selection.tools;
  const toolsetNote = selection.note !== undefined ? ` Toolset: ${selection.note}.` : '';

  // The grant is read at registration, and again on each access to ctx, so a new login is seen without a restart.
  const group = groupOf(opts.name);
  const currentGrant = (): string[] | null => (group ? grantedScopes(group, cfg) : null);

  // Before a login, the OAuth groups register only the tools that need no scope. auth_status loads the rest after a login.
  // The service-account group counts as logged in once its key is set up (see loginSourceOf in auth.ts).
  const LOGIN_REQUIRED: ReadonlySet<string> = new Set(['workspace-user', 'searchconsole', 'business', 'developer', 'service-account']);
  const needsLogin = group !== undefined && LOGIN_REQUIRED.has(group);
  const loggedIn = (): boolean => !needsLogin || isLoggedIn(group as AuthKind, cfg);
  const granted = needsLogin && !loggedIn() ? [] : currentGrant();
  const registered = new Set<string>();

  // Only tools the stored grant can run are registered. Writes and destructive tools need GSM_ALLOW_WRITES.
  const registerable = (grant: string[] | null, list: ToolDef[]): ToolDef[] =>
    list.filter((tool) => isGranted(tool, grant) && (tool.kind === 'read' || tool.kind === 'dynamic' || cfg.allowWrites));

  const gate: GateFn = createGate({ server, cfg });
  const ctx: ToolContext = {
    gate,
    get grantedScopes() {
      return currentGrant();
    },
    hasScope: (anyOf) => isGranted({ scopes: anyOf }, currentGrant()),
  };

  // Groups with Google accounts take an optional account argument on every tool. It picks the account the handler uses,
  // and never reaches the handler's own arguments (see the wrapper below and account-context.ts).
  const ACCOUNT_GROUPS: ReadonlySet<string> = new Set(['workspace-user', 'searchconsole', 'business', 'developer', 'cloud']);
  const accountArgument = {
    account: z.string().optional().describe('The Google account to use, by its email address. Omit it for the default account (see accounts_list).'),
  };
  const withAccountArgument = (shape: ZodRawShape): ZodRawShape =>
    group !== undefined && ACCOUNT_GROUPS.has(group) ? { ...shape, ...accountArgument } : shape;

  // Registers tools once each. After the server is connected, the SDK tells the client that the list changed.
  const register = (list: ToolDef[]): void => {
    for (const tool of list) {
      if (registered.has(tool.name)) continue;
      registered.add(tool.name);
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: withAccountArgument(tool.inputSchema),
          annotations: toolAnnotations(tool),
        },
        async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
          try {
            const prepare = tool.prepare;
            if (prepare && (tool.kind === 'write' || tool.kind === 'destructive')) {
              // Prepare (reads only), then the gate with its exact preview, then the handler with the prepared action. All
              // three run with the call's account. If the gate throws, the handler never runs.
              const { account, ...args } = rawArgs;
              const data = await withAccount(typeof account === 'string' ? account : undefined, async () => {
                const prepared = await prepare(args as never, ctx);
                await gate({ kind: callKind(tool, args), target: tool.name, methodId: tool.methodId, args: prepared.preview });
                return tool.handler(args as never, ctx, prepared);
              });
              return asJson(data, cfg.maxResultChars);
            }
            if (tool.kind === 'write' || tool.kind === 'destructive') {
              // The gate runs before the handler. If it throws, the handler never runs. A write whose arguments meet the
              // destructive rule (destructiveWhen) is gated as destructive.
              const { account: callAccount, ...callArgs } = rawArgs;
              const kind = callKind(tool, callArgs);
              // A generated tool may read the resource it acts on first, so the approval names it (target-preview.ts).
              // Only when the form may be shown; without a result the approval shows the raw arguments, as before.
              const describeTarget = tool.describeTarget;
              const fields =
                describeTarget && formMayShow(kind, cfg)
                  ? await settleWithin(
                      withAccount(typeof callAccount === 'string' ? callAccount : undefined, () => describeTarget(callArgs as never, ctx)),
                      TARGET_READ_TIMEOUT_MS,
                    )
                  : undefined;
              const shown = fields ? { [TARGET_PREVIEW_KEY]: fields, ...rawArgs } : rawArgs;
              await gate({ kind, target: tool.name, methodId: tool.methodId, args: shown });
            }
            // The account argument picks the account for this call. It is not passed to the handler, so it never reaches Google.
            const { account, ...args } = rawArgs;
            const data = await withAccount(typeof account === 'string' ? account : undefined, () =>
              tool.handler(args as never, ctx),
            );
            return asJson(data, cfg.maxResultChars);
          } catch (err) {
            return { isError: true, content: [{ type: 'text', text: describeError(err, group) }] };
          }
        },
      );
    }
  };
  register(registerable(granted, defined));

  // Sign-in from the chat, for the groups that use a Google login. The client file, the sign-in and the admin setup run
  // as gsm commands of this plugin, so they do the same work as the terminal commands (see inchat-login.ts).
  const canSignIn = group !== undefined && ACCOUNT_GROUPS.has(group);
  const cliFile = fileURLToPath(new URL('../bin/gsm.mjs', import.meta.url));
  const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });
  // The product's scope rules (config/products.json scopePolicy), when it has them. Undefined for most servers.
  const policy = scopePolicyOf(opts.name);
  const optionalParts = Object.keys(policy?.optional ?? {}).sort();
  // The scopes an ADC login for this server asks for: the scopes its tools need, resolved as the OAuth login resolves them.
  // Only the tools of the toolset count (`defined`), as for the OAuth sign-in (--toolset in the child's argv).
  const adcScopesFor = (profile: SignInProfile, include: readonly string[]): string[] => {
    const prefer = serverPreferFields(opts.name, selection.effective); // the toolset's preferred scopes, as the OAuth login takes them
    const requirements: Requirement[] = defined.map((tool) => ({
      tool: tool.name,
      kind: tool.kind,
      scopes: [...(tool.scopes ?? [])],
      ...policyFields(policy, apiOfMethod(tool.methodId)),
      ...prefer,
    }));
    return withIdentityScope(resolveScopes(requirements, profile, include).scopes);
  };

  // The two ways to sign in, with their costs. auth_login shows them first, so the person chooses before anything starts.
  const signInChoice = (): string => {
    const signedIn = accountNames(group as string, cfg);
    const source = loginSourceOf(group as AuthKind, cfg);
    const lines = [
      `Two ways to sign in to "${group}" (server ${opts.name}). Ask the person which one to use, then call auth_login again with method "oauth" or "adc".`,
      '',
      'oauth: sign in here, with the Desktop OAuth client saved by auth_setup_client.',
      '  + Several accounts can be signed in at once. Each has its own token, and logout revokes it.',
      '  + No terminal and no gcloud CLI.',
      '  - Needs the OAuth client from your own Google Cloud project. An app left in Testing loses its tokens after 7 days.',
      '',
      `adc: Application Default Credentials, signed in through the gcloud CLI${findGcloud() ? '' : ' (gcloud is not installed on this machine)'}.`,
      "  + Google's standard way for local tools. For cloud APIs it needs no client file: gcloud's built-in client is used.",
      '  + For other APIs it uses the same client file as oauth, through gcloud.',
      '  - One login per machine. It cannot hold several accounts, and a new ADC login replaces the old one.',
      '  - gcloud keeps the tokens, so logout here does not remove them. Revoke them with: gcloud auth application-default revoke.',
      '  - Cloud APIs may need a quota project: gcloud auth application-default set-quota-project <project-id>.',
    ];
    if (signedIn !== 'none') lines.push('', `Already signed in here: ${signedIn}. oauth adds an account; adc is used only when no account is signed in here.`);
    if (source) lines.push('', `Currently signed in for "${group}" with ${source === 'adc' ? 'ADC' : 'an OAuth account'}.`);
    return lines.join('\n');
  };

  const signIn = canSignIn
    ? createSignIn({
        cliFile,
        group: group as string,
        server: opts.name,
        cfg,
        adcScopes: adcScopesFor,
        onSignedIn: () => {
          // The sign-in ran in another process. Forget the clients built from the old tokens, and what was read from the
          // OS store, so the next call uses the new login without a restart.
          forgetAdcClients();
          forgetUserClients();
          register(registerable(currentGrant(), defined));
        },
      })
    : undefined;

  if (signIn) {
    server.registerTool(
      'auth_setup_client',
      {
        title: 'Save the Google OAuth client',
        description:
          'Saves the Desktop OAuth client JSON that you downloaded from Google Cloud console (APIs & Services > Credentials). Give the full path of that file. Its secret is copied into the token folder and is never shown.',
        inputSchema: {
          path: z.string().describe('Full path of the Desktop OAuth client JSON file.'),
          force: z.boolean().optional().describe('Replace a client file that is already saved.'),
        },
        annotations: runtimeHints('auth_setup_client'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        const args = ['setup-client', String(rawArgs.path)];
        if (rawArgs.force === true) args.push('--force');
        const res = await runGsmCommand(cliFile, args);
        if (res.code !== 0) return text(`Could not save the OAuth client: ${res.output}`);
        return text(`${res.output.split('\n')[0] ?? 'OAuth client saved.'}\nNext: call auth_login to sign in.`);
      },
    );
    server.registerTool(
      'auth_login',
      {
        title: 'Sign in to Google',
        description:
          'Starts the Google sign-in for this server, in the browser on this machine. Call it without method first: the answer lists the two ways to sign in (oauth or adc) with their pros and cons. Ask the person which one to use, then call again with method. For an account that is already signed in here, pass its email as account, so the scopes it holds for the other servers of this group are kept. When the person approves in the browser, the tools of this server load without a restart.',
        inputSchema: {
          profile: z
            .enum(['readonly', 'readwrite', 'full'])
            .optional()
            .describe(
              'readonly (the default) or readwrite. full asks for the broadest scope of each tool; use it only when the person needs a tool that readwrite holds back (the sign-in answer lists them). Write tools also need writes to be allowed in the plugin settings.',
            ),
          // Only a server whose product has optional parts (config/products.json scopePolicy.optional) takes this argument.
          ...(optionalParts.length > 0
            ? {
                with: z
                  .array(z.enum(optionalParts as [string, ...string[]]))
                  .optional()
                  .describe(
                    `Optional parts of this server to add to the sign-in. They are left out unless named here: ${optionalParts.join(', ')}. Their tools load only when the login holds their scopes.`,
                  ),
              }
            : {}),
          method: z
            .enum(['oauth', 'adc'])
            .optional()
            .describe(
              'oauth: sign in with the saved OAuth client. adc: Application Default Credentials through the gcloud CLI. Leave it out to see the options first.',
            ),
          account: z
            .string()
            .optional()
            .describe(
              'oauth only: the email of the Google account to sign in. Google preselects it, and the scopes that account already holds for the other servers of this group are kept. Without it, the sign-in asks only for this server\'s scopes, and it saves nothing when that would take scopes away from an account already signed in here (auth_status then says to try again with account).',
            ),
        },
        annotations: runtimeHints('auth_login'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        if (rawArgs.method !== 'oauth' && rawArgs.method !== 'adc') return text(signInChoice());
        const method: SignInMethod = rawArgs.method;
        let account: string | undefined;
        if (typeof rawArgs.account === 'string' && rawArgs.account.trim() !== '') {
          account = accountEmailOf(rawArgs.account);
          if (account === undefined) return text('account must be the email address of a Google account, for example name@example.com.');
        }
        const profile: SignInProfile = rawArgs.profile === 'readwrite' || rawArgs.profile === 'full' ? rawArgs.profile : 'readonly';
        const include = Array.isArray(rawArgs.with) ? rawArgs.with.filter((p): p is string => typeof p === 'string' && optionalParts.includes(p)) : [];
        return text(await signIn.start(profile, method, account, include));
      },
    );
    server.registerTool(
      'auth_status',
      {
        title: 'Sign-in status',
        description:
          'Says whether this server is signed in to Google, and what a sign-in in progress is doing. Call it after approving a sign-in: the tools load then, without a restart.',
        annotations: runtimeHints('auth_status'),
      },
      async (): Promise<CallToolResult> => {
        // A sign-in made in a terminal is seen here too: the tokens are read again, not taken from this process's memory.
        forgetUserClients();
        const before = registered.size;
        const signedIn = isLoggedIn(group as AuthKind, cfg);
        if (signedIn) register(registerable(currentGrant(), defined));
        const loaded = registered.size - before;
        const source = loginSourceOf(group as AuthKind, cfg);
        const via = source === 'adc' ? ' with Application Default Credentials' : source === 'oauth' ? ' with an OAuth account' : '';
        const state = signedIn
          ? `Signed in for "${group}"${via}. ${loaded} tool(s) loaded now, ${registered.size} registered in total.`
          : `Not signed in for "${group}". ${registered.size} tool(s) registered in total.`;
        return text(`${state} Accounts: ${accountNames(group as string, cfg)}. ${signIn.describe()}${toolsetNote}`);
      },
    );
  }

  // The service-account group (Google Play, Merchant Center): one key, set up here or with setup-service-account.
  if (group === 'service-account') {
    server.registerTool(
      'auth_setup_service_account',
      {
        title: 'Set up the service account key',
        description:
          'Records the service account JSON key for this server. Give the full path of the key file (from Google Cloud console, IAM & Admin > Service accounts > Keys). Its content is never shown. First add the service account email in Play Console (Users and permissions) or Merchant Center (Users). Call auth_status afterwards. Pass remove: true to forget the stored setup; the key file itself is not deleted.',
        inputSchema: {
          path: z.string().optional().describe('Full path of the service account JSON key file.'),
          remove: z.boolean().optional().describe('Forget the stored setup. The key file is not deleted.'),
        },
        annotations: runtimeHints('auth_setup_service_account'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        if (rawArgs.remove === true) {
          const res = await runGsmCommand(cliFile, ['setup-service-account', '--remove']);
          forgetServiceAccountClients();
          return text(`${res.output}\nRestart this server so its tools are unloaded.`);
        }
        if (typeof rawArgs.path !== 'string' || rawArgs.path.trim() === '') {
          return text('Give the full path of the service account JSON key file (path), or pass remove: true to forget the setup.');
        }
        const res = await runGsmCommand(cliFile, ['setup-service-account', '--key-file', rawArgs.path]);
        if (res.code !== 0) return text(`Could not set up the service account: ${res.output}`);
        forgetServiceAccountClients();
        register(registerable(currentGrant(), defined));
        return text(`${res.output}\nNext: call auth_status to load the tools.`);
      },
    );
    server.registerTool(
      'auth_status',
      {
        title: 'Service account status',
        description:
          'Says whether this server has a service account key set up, and which account it is. After auth_setup_service_account the tools of this server load without a restart.',
        annotations: runtimeHints('auth_status'),
      },
      async (): Promise<CallToolResult> => {
        const before = registered.size;
        const set = isLoggedIn(group, cfg);
        if (set) register(registerable(currentGrant(), defined));
        const loaded = registered.size - before;
        return text(
          set
            ? `Set up for "${group}" with a service account key (${loginSourceOf(group, cfg)}). ${loaded} tool(s) loaded now, ${registered.size} registered in total.${toolsetNote}`
            : `Not set up for "${group}". Call auth_setup_service_account with the full path of the key file.${toolsetNote}`,
        );
      },
    );
  }

  if (signIn) {
    // Accounts: the signed-in accounts of this server's group, and which one is the default.
    server.registerTool(
      'accounts_list',
      {
        title: 'Signed-in accounts',
        description:
          'Lists the Google accounts signed in for this server, which one is the default, and how many scopes each has. Names only: no token is shown.',
        annotations: runtimeHints('accounts_list'),
      },
      async (): Promise<CallToolResult> => {
        const accounts = listAccounts(group as string, cfg);
        const summary = {
          group,
          default: accounts.find((account) => account.default)?.email ?? null,
          accounts: accounts.map((account) => ({
            email: account.email,
            default: account.default,
            scopes: account.scopes.length,
            addedAt: account.addedAt || null,
          })),
        };
        return text(JSON.stringify(summary, null, 2));
      },
    );
    server.registerTool(
      'account_set_default',
      {
        title: 'Set the default account',
        description:
          'Makes one signed-in account the default for this server. A call without an account argument uses the default.',
        inputSchema: { email: z.string().describe('The signed-in account to make the default.') },
        annotations: runtimeHints('account_set_default'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          setDefaultAccount(group as string, String(rawArgs.email), cfg);
          return text(`The default account for ${group} is now ${String(rawArgs.email)}.`);
        } catch (err) {
          return text((err as Error).message);
        }
      },
    );
    server.registerTool(
      'account_remove',
      {
        title: 'Remove a signed-in account',
        description:
          "Removes one account of this server's group from this machine. It is also revoked at Google, unless the same account is signed in here for another group: Google's revocation ends every sign-in of that account with this OAuth client, so then only the local token is removed, and the answer says how to revoke it everywhere. Other accounts are not touched.",
        inputSchema: { email: z.string().describe('The account to remove.') },
        annotations: runtimeHints('account_remove'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        const email = String(rawArgs.email);
        // A revoke at Google would also end this account's sign-in for the other groups, so it runs only when no other
        // group has the account (accounts.json and file names only; no token is read for this).
        const shared = otherGroupsWithAccount(email, group as string, cfg);
        const revoke = shared.length === 0 ? await revokeGrant(group as AuthKind, cfg, {}, email) : undefined;
        if (!removeUserTokens(group as AuthKind, cfg, email)) return text(`No signed-in account "${email}" for ${group}.`);
        if (shared.length > 0) {
          return text(
            `Removed ${email} from ${group} on this machine. Not revoked at Google: ${email} is also signed in here for ${shared.join(', ')}, and Google's revocation would end those sign-ins too. To revoke it everywhere on purpose, run: ${invocation()} logout ${shared[0]} --account ${email} --revoke-all, or use https://myaccount.google.com/permissions.`,
          );
        }
        return text(`Removed ${email} from ${group}. ${revoke?.detail ?? ''}`.trim());
      },
    );
  }

  if (group === 'workspace-admin') {
    server.registerTool(
      'auth_setup_admin',
      {
        title: 'Set up the workspace admin account',
        description:
          'Sets up domain-wide delegation for the admin tools: the super admin email to act as, and the full path of the service account key file. The key file stays where it is; only its path is saved.',
        inputSchema: {
          subject: z.string().describe('The super admin email to act as.'),
          key_file: z.string().describe('Full path of the service account key JSON file.'),
          replace: z.boolean().optional().describe('Keep only the scopes this setup asks for, instead of merging with the stored ones.'),
        },
        annotations: runtimeHints('auth_setup_admin'),
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        const args = ['setup-admin', '--subject', String(rawArgs.subject), '--key-file', String(rawArgs.key_file), '--profile', 'readonly', '--servers', opts.name];
        if (rawArgs.replace === true) args.push('--replace');
        // The server's toolset, as for auth_login. Absent for all, so the argv is the same as before.
        if (cfg.toolset !== 'all') args.push(`--toolset=${cfg.toolset}`);
        const res = await runGsmCommand(cliFile, args);
        return text(res.code === 0 ? res.output : `Could not set up the admin account: ${res.output}`);
      },
    );
  }

  // Every server has a health tool. It is read-only and needs no login. It asks Google only when live is true.
  server.registerTool(
    'health',
    {
      title: 'Server health',
      description:
        'Reports this server: its version, its login state and the account it belongs to (as recorded at login), how many tools are registered, and whether writes are allowed. With live: true it also asks Google whether the login still works. It changes nothing.',
      inputSchema: { live: z.boolean().optional().describe('Ask Google whether the login still works. A network call. Default false.') },
      annotations: runtimeHints('health'),
    },
    async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
      const report = await serverHealth({
        server: opts.name,
        version: opts.version,
        group,
        cfg,
        registered: registered.size,
        hidden: defined.length - registered.size,
        writesAllowed: cfg.allowWrites,
        live: rawArgs.live === true,
        toolset: toolsetReport(selection),
      });
      return asJson(report, cfg.maxResultChars);
    },
  );

  await server.connect(new StdioServerTransport());
  // When the client closes the connection, a sign-in still waiting for the browser is stopped with it.
  process.stdin.once('end', () => signIn?.dispose());
  const hidden = defined.length - registered.size;
  process.stderr.write(
    `[${opts.name}] ready, ${registered.size} tool(s) registered, writes ${cfg.allowWrites ? 'enabled' : 'disabled'}` +
      (needsLogin && !loggedIn() ? `, not signed in: call auth_login (or run ${invocation()} login ${group})` : '') +
      (hidden > 0 ? `, ${hidden} hidden (they need a login, or the stored grant lacks their scopes)` : '') +
      (selection.requested !== 'all'
        ? selection.note !== undefined
          ? `, toolset ${selection.requested}: ${selection.note}`
          : `, toolset ${selection.effective} (${selection.outside} tool(s) outside it)`
        : '') +
      '\n',
  );
}
