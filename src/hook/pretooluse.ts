#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook for one plugin of the Google services MCP suite.
 *
 * Runs as <plugin>/bin/gsm-hook.mjs once the bundle is built. It reads the hook event
 * from stdin and prints a permission decision only when the user must be asked or a
 * deny rule applies. Otherwise it prints nothing, so Claude Code runs its normal flow.
 * It never prints "allow", because that would bypass the user's own permission rules.
 *
 * Output (exit 0): {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"|"deny","permissionDecisionReason":"..."}}
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, describeAction, loadPolicyFile, riskFromKind, type Policy } from '../core/policy.js';
import { resolveDynamicKind } from '../core/dynamic.js';
import type { ToolMapEntry, ToolMapKind } from '../core/dump.js';

const TOOL_MAP_FILE = 'tool-map.json';
/** Written by the build: method id -> read, write, dynamic or destructive, for every gateway method of this plugin. */
const METHOD_KIND_FILE = 'method-kinds.json';
const DEFAULT_TOKEN_DIR_NAME = '.google-services-mcps';
const KINDS: ReadonlySet<string> = new Set(['read', 'write', 'destructive', 'dynamic']);
const CONCRETE_KINDS: ReadonlySet<string> = new Set(['read', 'write', 'destructive']);

/** The method-kinds table of this plugin, or null when the file does not exist. */
function readMethodKinds(root: string): Record<string, unknown> | null {
  const file = join(root, METHOD_KIND_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as Record<string, unknown>;
}

/**
 * Kind and method of one call of a dynamic tool.
 *  - A per-method tool names its method in the tool map (entry.methodId). Its kind is decided by the body.
 *  - The gateway's api_call names its method in tool_input.method. The method must be in this plugin's table:
 *    a concrete kind is used as it is, and a dynamic one is decided by the body.
 * The body is tool_input.body in both cases. resolveDynamicKind returns null for a method with no rule, and then
 * the caller asks. A method missing from the table, or with no method at all, returns null too.
 */
function kindOfDynamicCall(root: string, entry: ToolMapEntry, input: unknown): { kind: ToolMapKind; methodId: string } | null {
  const obj = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const named = typeof obj.method === 'string' && obj.method.length > 0 ? obj.method : undefined;
  const methodId = entry.methodId ?? named;
  if (methodId === undefined) return null;

  if (entry.methodId === undefined) {
    const tabled = readMethodKinds(root)?.[methodId];
    if (typeof tabled !== 'string') return null;
    if (CONCRETE_KINDS.has(tabled)) return { kind: tabled as ToolMapKind, methodId };
    if (tabled !== 'dynamic') return null;
  }

  const kind = resolveDynamicKind(methodId, obj.body);
  return kind === null ? null : { kind, methodId };
}

type HookDecision = 'ask' | 'deny';

interface HookEvent {
  tool_name: string;
  tool_input?: unknown;
}

function emit(decision: HookDecision, reason: string): void {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The bundle sits at <plugin>/bin/gsm-hook.mjs, so the plugin root is one folder up from bin. */
function pluginRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function tokenDirectory(): string {
  const fromEnv = process.env.GSM_TOKEN_DIR;
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), DEFAULT_TOKEN_DIR_NAME);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The event, or null when the input is not JSON with a string tool_name. */
function parseEvent(text: string): HookEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  if (typeof (value as { tool_name?: unknown }).tool_name !== 'string') return null;
  return value as HookEvent;
}

function toEntry(item: unknown, file: string): ToolMapEntry {
  const bad = (): never => {
    throw new Error(`${file} has a malformed entry`);
  };
  if (item === null || typeof item !== 'object') return bad();
  const e = item as Record<string, unknown>;
  if (typeof e.name !== 'string' || e.name.length === 0) return bad();
  if (typeof e.kind !== 'string' || !KINDS.has(e.kind)) return bad();
  if (e.scopes !== undefined && (!Array.isArray(e.scopes) || e.scopes.some((s) => typeof s !== 'string'))) return bad();
  if (e.methodId !== undefined && typeof e.methodId !== 'string') return bad();
  if (e.title !== undefined && typeof e.title !== 'string') return bad();
  return item as ToolMapEntry;
}

/** The plugin's tool map keyed by exact tool name, or null when the file does not exist. Malformed files throw. */
function readToolMap(file: string): Map<string, ToolMapEntry> | null {
  if (!existsSync(file)) return null;
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!Array.isArray(raw)) throw new Error(`${file} must hold a JSON array`);
  const map = new Map<string, ToolMapEntry>();
  for (const item of raw as unknown[]) {
    const entry = toEntry(item, file);
    if (map.has(entry.name)) throw new Error(`${file} lists ${entry.name} twice`);
    map.set(entry.name, entry);
  }
  return map;
}

function check(event: HookEvent, root: string): void {
  const toolName = event.tool_name;
  const map = readToolMap(join(root, TOOL_MAP_FILE));
  const policy: Policy = loadPolicyFile(tokenDirectory());
  const entry = map?.get(toolName);

  if (!entry) {
    // Unknown tool, or no tool map at all. Never auto-allowed: allow rules are ignored,
    // while deny and ask rules still apply. The confirmation mode is forced to every-change.
    const outcome = decide({
      toolName,
      risk: 'destructive',
      policy: { confirmation: 'every-change', rules: policy.rules.filter((rule) => rule.action !== 'allow') },
    });
    const decision: HookDecision = outcome.decision === 'deny' ? 'deny' : 'ask';
    const reason =
      outcome.decision === 'deny'
        ? outcome.reason
        : map
          ? 'Unknown tool, asking to be safe.'
          : 'Tool map not found in this plugin, asking to be safe.';
    emit(decision, describeAction({ toolName, risk: 'destructive', args: event.tool_input, reason }));
    return;
  }

  // A dynamic tool is classified per call: the gateway's api_call from the method it names, a per-method
  // tool from its fixed method and body (see kindOfDynamicCall).
  let kind: ToolMapKind;
  let methodId = entry.methodId;
  if (entry.kind === 'dynamic') {
    const resolved = kindOfDynamicCall(root, entry, event.tool_input);
    if (!resolved) {
      emit(
        'ask',
        describeAction({
          toolName,
          risk: 'destructive',
          args: event.tool_input,
          reason: 'The method of this call is missing, is not known to this plugin, or has no dynamic rule, so asking to be safe.',
        }),
      );
      return;
    }
    kind = resolved.kind;
    methodId = resolved.methodId;
  } else {
    kind = entry.kind;
  }

  const risk = riskFromKind(kind);
  const outcome = decide({
    toolName,
    methodId,
    risk,
    policy,
    confirmationEnvOverride: process.env.CLAUDE_PLUGIN_OPTION_CONFIRMATION,
  });
  if (outcome.decision === 'allow') return;
  emit(outcome.decision, describeAction({ toolName, methodId, risk, args: event.tool_input, reason: outcome.reason }));
}

async function run(): Promise<void> {
  const event = parseEvent(await readStdin());
  if (!event) return;

  // Plugin MCP tools are named mcp__plugin_<plugin>_<server>__<tool>. The plugin's own hooks.json
  // matcher already limits what reaches this program, so only the prefix is checked here. The folder
  // name is not used: Claude Code may run a plugin from a versioned cache folder.
  if (!event.tool_name.startsWith('mcp__plugin_')) return;

  const root = pluginRoot();
  try {
    check(event, root);
  } catch (err) {
    emit(
      'ask',
      describeAction({
        toolName: event.tool_name,
        risk: 'destructive',
        args: event.tool_input,
        reason: `Could not check this action, so asking to be safe. ${messageOf(err)}`,
      }),
    );
  }
}

process.exitCode = 0;
run().catch(() => {
  // Input could not be read, so no tool was identified and there is nothing to decide.
  process.exitCode = 0;
});
