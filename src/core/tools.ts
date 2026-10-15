import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import { loadConfig, type RuntimeConfig } from './config.js';
import { AuthRequiredError } from './auth.js';

/**
 * read        : safe, always registered.
 * write       : creates or changes data; registered only when GSM_ALLOW_WRITES=true.
 * destructive : deletes, disables or sends; registered like write, and the call
 *               does nothing unless the caller passes confirm: true. Without it
 *               the tool returns a preview of what would happen.
 */
export type ToolKind = 'read' | 'write' | 'destructive';

export interface ToolDef<A extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  inputSchema: A;
  /** Return the data to send back. Throw to report an error to the model. */
  handler(args: z.infer<z.ZodObject<A>>): Promise<unknown>;
  /** Used only for destructive tools: describes the action when confirm is not set. */
  preview?(args: z.infer<z.ZodObject<A>>): Promise<unknown> | unknown;
}

/** Wraps a tool definition as the model should see it: a typed schema, the same descriptions, and a confirm flag for destructive ones. */
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

export function describeError(err: unknown): string {
  if (err instanceof AuthRequiredError) return err.message;
  // googleapis errors carry status code and a Google-formatted message.
  const e = err as { code?: number; status?: number; message?: string; errors?: Array<{ reason?: string }> };
  const status = e?.code ?? e?.status;
  const reason = e?.errors?.[0]?.reason;
  const base = e?.message ?? String(err);
  return [status ? `HTTP ${status}` : null, reason ? `reason=${reason}` : null, base].filter(Boolean).join(' | ');
}

/**
 * Builds and runs one MCP server. Each server file supplies its tool list;
 * this function adds the shared behaviour: write gating, confirm gating,
 * output truncation and error reporting.
 */
export async function runServer(opts: {
  name: string;
  version: string;
  buildTools: (cfg: RuntimeConfig) => Promise<ToolDef[]> | ToolDef[];
}): Promise<void> {
  const cfg = loadConfig();
  const server = new McpServer({ name: opts.name, version: opts.version });
  const tools = await opts.buildTools(cfg);

  for (const tool of tools) {
    if (tool.kind !== 'read' && !cfg.allowWrites) continue;

    const schema: ZodRawShape = { ...tool.inputSchema };
    if (tool.kind === 'destructive') {
      schema.confirm = z
        .boolean()
        .optional()
        .describe('Must be true to perform this action. Omit or set false to get a preview only.');
    }

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.kind === 'destructive' ? `${tool.description} Destructive: needs confirm=true.` : tool.description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: tool.kind === 'read',
          destructiveHint: tool.kind === 'destructive',
        },
      },
      async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
        try {
          const { confirm, ...args } = rawArgs as Record<string, unknown> & { confirm?: boolean };
          if (tool.kind === 'destructive' && confirm !== true) {
            const preview = tool.preview ? await tool.preview(args as never) : args;
            return asJson({ status: 'preview', message: 'Not performed. Call again with confirm=true to proceed.', action: tool.name, wouldDo: preview }, cfg.maxResultChars);
          }
          const data = await tool.handler(args as never);
          return asJson(data, cfg.maxResultChars);
        } catch (err) {
          return { isError: true, content: [{ type: 'text', text: describeError(err) }] };
        }
      },
    );
  }

  await server.connect(new StdioServerTransport());
  process.stderr.write(`[${opts.name}] ready, ${tools.length} tool(s) defined, writes ${cfg.allowWrites ? 'enabled' : 'disabled'}\n`);
}
