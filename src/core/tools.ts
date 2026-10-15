import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import { loadConfig, type RuntimeConfig } from './config.js';
import { AuthRequiredError, grantedScopes } from './auth.js';
import { createGate, type GateFn } from './approval.js';
import { toolMapFromDefs } from './dump.js';
import { loadRegistry, serverByName, type AuthGroup } from './registry.js';

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
  /** Runs the action. Throw to report an error to the model. */
  handler(args: z.infer<z.ZodObject<A>>, ctx: ToolContext): Promise<unknown>;
  /** Optional metadata: what a destructive action would do, for describe output. The gate does not use it. */
  preview?(args: z.infer<z.ZodObject<A>>): Promise<unknown> | unknown;
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
    return 'The token lacks a scope for this tool. Re-run gsm setup-admin with a broader profile: gsm setup-admin --subject <email> --key-file <file> --profile readwrite.';
  }
  return `The token lacks a scope for this tool. Log in again with a broader profile: gsm login ${group ?? '<group>'} --profile readwrite.`;
}

/** A 403 that says the token lacks a scope: reason insufficientPermissions, or a message about insufficient scopes. */
function lacksScope(status: unknown, reason: string | undefined, message: string, err: { response?: { data?: unknown } }): boolean {
  if (String(status) !== '403') return false;
  if (reason === 'insufficientPermissions') return true;
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message)) return true;
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(JSON.stringify(err.response?.data ?? ''));
}

export function describeError(err: unknown, group?: string): string {
  if (err instanceof AuthRequiredError) return err.message;
  // googleapis errors carry status code and a Google-formatted message.
  const e = err as { code?: number; status?: number; message?: string; errors?: Array<{ reason?: string }>; response?: { data?: unknown } };
  const status = e?.code ?? e?.status;
  const reason = e?.errors?.[0]?.reason;
  const base = e?.message ?? String(err);
  const parts = [status ? `HTTP ${status}` : null, reason ? `reason=${reason}` : null, base];
  if (lacksScope(status, reason, base, e ?? {})) parts.push(scopeHint(group));
  return parts.filter(Boolean).join(' | ');
}

/**
 * Runtime gating. A tool is registered when it has no scopes, when the grant is
 * unknown (null: not logged in), or when the grant holds at least one of its scopes.
 */
export function isGranted(tool: { scopes?: readonly string[] }, granted: readonly string[] | null): boolean {
  if (granted === null || !tool.scopes || tool.scopes.length === 0) return true;
  return tool.scopes.some((scope) => granted.includes(scope));
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
    const map = toolMapFromDefs(
      defined.map((tool) => ({ name: tool.name, kind: tool.kind, scopes: tool.scopes, title: tool.title, methodId: tool.methodId })),
    );
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
  const cfg = loadConfig();
  if (process.argv.includes('--dump-tools')) {
    await dumpTools(opts.buildTools, cfg);
    return;
  }

  const server = new McpServer({ name: opts.name, version: opts.version });
  const defined = await opts.buildTools(cfg);

  // The grant is read at registration, and again on each access to ctx, so a new login is seen without a restart.
  const group = groupOf(opts.name);
  const currentGrant = (): string[] | null => (group ? grantedScopes(group, cfg) : null);
  const granted = currentGrant();

  // Only tools the stored grant can run are registered. Writes and destructive tools need GSM_ALLOW_WRITES.
  const tools = defined.filter(
    (tool) => isGranted(tool, granted) && (tool.kind === 'read' || tool.kind === 'dynamic' || cfg.allowWrites),
  );

  const gate: GateFn = createGate({ server, cfg });
  const ctx: ToolContext = {
    gate,
    get grantedScopes() {
      return currentGrant();
    },
    hasScope: (anyOf) => isGranted({ scopes: anyOf }, currentGrant()),
  };

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.kind === 'read',
          destructiveHint: tool.kind === 'destructive' || tool.kind === 'dynamic',
        },
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          if (tool.kind === 'write' || tool.kind === 'destructive') {
            // The gate runs before the handler. If it throws, the handler never runs.
            await gate({ kind: tool.kind, target: tool.name, methodId: tool.methodId, args: rawArgs });
          }
          const data = await tool.handler(rawArgs as never, ctx);
          return asJson(data, cfg.maxResultChars);
        } catch (err) {
          return { isError: true, content: [{ type: 'text', text: describeError(err, group) }] };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
  const hidden = defined.length - defined.filter((tool) => isGranted(tool, granted)).length;
  process.stderr.write(
    `[${opts.name}] ready, ${tools.length} tool(s) registered, writes ${cfg.allowWrites ? 'enabled' : 'disabled'}` +
      (hidden > 0 ? `, ${hidden} hidden because the stored grant lacks their scopes` : '') +
      '\n',
  );
}
