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
import { curatedMutateBody, GOOGLE_ADS_MUTATE_METHOD, resolveDynamicKind } from '../core/dynamic.js';
import type { ToolMapEntry, ToolMapKind } from '../core/dump.js';

const TOOL_MAP_FILE = 'tool-map.json';
/** Written by the build: method id -> read, write, dynamic or destructive, for every gateway method of this plugin. */
const METHOD_KIND_FILE = 'method-kinds.json';
const MANIFEST_FILE = join('.claude-plugin', 'plugin.json');
/** Every plugin tool is named mcp__plugin_<plugin>_<server>__<tool>. */
const PLUGIN_TOOL_PREFIX = 'mcp__plugin_';
/** The curated Google Ads mutate tool. Its tool name ends in this, and it names no method. */
const CURATED_MUTATE_SUFFIX = 'ads_mutate';
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
 * Kind and method of one call of a dynamic tool. Three cases, in this order:
 *  - The curated ads_mutate (no methodId, name ends in ads_mutate): the Google Ads mutate method, decided by the
 *    curated arguments, where validate_only is read as validateOnly (curatedMutateBody). A method key is ignored.
 *  - The gateway's api_call (no methodId, tool_input names a method): the method must be in this plugin's table.
 *    A concrete kind is used as it is, and a dynamic one is decided by tool_input.body.
 *  - A per-method tool (methodId set): decided by tool_input.body, or by tool_input itself when there is no body argument.
 * resolveDynamicKind returns null for a method with no rule, and then the caller asks. So does a dynamic tool that
 * is none of these.
 */
function kindOfDynamicCall(root: string, entry: ToolMapEntry, input: unknown): { kind: ToolMapKind; methodId: string } | null {
  const obj = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  // The curated ads_mutate names no method and its server ignores any method key, so the key is ignored here too.
  // Trusting it would let a key that names a read method pass a real change without a prompt.
  if (entry.methodId === undefined && entry.name.endsWith(CURATED_MUTATE_SUFFIX)) {
    const kind = resolveDynamicKind(GOOGLE_ADS_MUTATE_METHOD, curatedMutateBody(obj));
    return kind === null ? null : { kind, methodId: GOOGLE_ADS_MUTATE_METHOD };
  }

  // The gateway's api_call: the method it names must be in this plugin's table.
  const named = typeof obj.method === 'string' && obj.method.length > 0 ? obj.method : undefined;
  if (entry.methodId === undefined && named !== undefined) {
    const tabled = readMethodKinds(root)?.[named];
    if (typeof tabled !== 'string') return null;
    if (CONCRETE_KINDS.has(tabled)) return { kind: tabled as ToolMapKind, methodId: named };
    if (tabled !== 'dynamic') return null;
    const kind = resolveDynamicKind(named, obj.body);
    return kind === null ? null : { kind, methodId: named };
  }

  // A per-method tool: its fixed method, and the body argument (or the arguments themselves when there is none).
  if (entry.methodId !== undefined) {
    const kind = resolveDynamicKind(entry.methodId, obj.body !== undefined ? obj.body : obj);
    return kind === null ? null : { kind, methodId: entry.methodId };
  }

  return null;
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

/** The "name" of <plugin>/.claude-plugin/plugin.json, or null when the file is missing, unreadable or has no name. */
function manifestName(root: string): string | null {
  const file = join(root, MANIFEST_FILE);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as { name?: unknown } | null;
    return typeof raw?.name === 'string' && raw.name.trim() !== '' ? raw.name : null;
  } catch {
    return null;
  }
}

/**
 * The name prefix of this plugin's own tools. The name comes from plugin.json, not from the folder: Claude Code may
 * run a plugin from a versioned folder. Without a usable manifest, the first tool-map entry gives the prefix of its
 * server (mcp__plugin_<plugin>_<server>__). Returns null when neither source works, so the caller asks.
 */
function ownToolPrefix(root: string): string | null {
  const name = manifestName(root);
  if (name !== null) return `${PLUGIN_TOOL_PREFIX}${name.replace(/[^A-Za-z0-9]/g, '_')}_`;
  try {
    const first = readToolMap(join(root, TOOL_MAP_FILE))?.keys().next().value;
    if (typeof first !== 'string' || !first.startsWith(PLUGIN_TOOL_PREFIX)) return null;
    const cut = first.indexOf('__', PLUGIN_TOOL_PREFIX.length);
    return cut > PLUGIN_TOOL_PREFIX.length ? first.slice(0, cut + 2) : null;
  } catch {
    return null;
  }
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

  // Only this plugin's own tools are checked. A tool of another plugin, or of any other MCP server, prints nothing.
  // When this plugin cannot be identified, every plugin tool is asked about, because any of them could be ours.
  if (!event.tool_name.startsWith(PLUGIN_TOOL_PREFIX)) return;

  const root = pluginRoot();
  const prefix = ownToolPrefix(root);
  if (prefix === null) {
    emit(
      'ask',
      describeAction({
        toolName: event.tool_name,
        risk: 'destructive',
        args: event.tool_input,
        reason: 'This plugin could not be identified (no readable plugin.json and no tool map), so asking to be safe.',
      }),
    );
    return;
  }
  if (!event.tool_name.startsWith(prefix)) return;

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
