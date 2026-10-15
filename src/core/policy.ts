/**
 * Consent policy for the Google services MCP suite.
 *
 * decide() is the single place that turns a tool's risk, the user's policy and the
 * confirmation setting into allow / ask / deny. The rest of this file is pure, except
 * loadPolicyFile, which reads <tokenDir>/policy.json and never writes it.
 *
 * This file must not import tools.ts. The tool kind arrives as a plain string union,
 * so the PreToolUse hook can load this module without starting a server.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What a tool does, from the policy's point of view. */
export type Risk = 'read' | 'modify' | 'destructive';

/** The tool kinds as tools.ts names them. Kept as a local union on purpose. */
export type ToolKindName = 'read' | 'write' | 'destructive';

/**
 * every-change     : ask before every change and before every destructive action (default).
 * destructive-only : ask before destructive actions; changes run without asking.
 * off              : nothing asks. Deny rules still apply.
 */
export type ConfirmationMode = 'every-change' | 'destructive-only' | 'off';

export type RuleAction = 'allow' | 'ask' | 'deny';

/**
 * match is either a glob or a regular expression.
 * - Glob: '*' matches any run of characters, '?' matches one character. The whole
 *   tool name or method id must match.
 * - 're:' prefix: the rest is a JavaScript regular expression, tested as written
 *   (unanchored unless the expression anchors itself) against the same strings.
 */
export interface PolicyRule {
  match: string;
  action: RuleAction;
}

export interface Policy {
  confirmation: ConfirmationMode;
  rules: PolicyRule[];
}

export interface DecideInput {
  toolName: string;
  methodId?: string;
  risk: Risk;
  policy: Policy;
  /** Value of CLAUDE_PLUGIN_OPTION_CONFIRMATION. Used when it is a valid mode, otherwise ignored. */
  confirmationEnvOverride?: string;
}

export interface DecideResult {
  decision: RuleAction;
  reason: string;
}

export interface ActionInput {
  toolName: string;
  methodId?: string;
  risk: Risk;
  args: unknown;
  /** Optional line that says why a decision is needed. */
  reason?: string;
}

export const DEFAULT_CONFIRMATION: ConfirmationMode = 'every-change';

const CONFIRMATION_MODES: readonly ConfirmationMode[] = ['every-change', 'destructive-only', 'off'];
const RULE_ACTIONS: readonly RuleAction[] = ['allow', 'ask', 'deny'];
const POLICY_FIELDS: readonly string[] = ['confirmation', 'rules'];
const RULE_FIELDS: readonly string[] = ['match', 'action'];
const SECRET_KEY = /password|passwd|secret|token|api[_-]?key|credential|authorization|cookie|private[_-]?key|client_secret/i;
const STRING_LIMIT = 300;
const DEFAULT_MAX_CHARS = 1200;

/** Maps a tool kind from tools.ts to a risk: read -> read, write -> modify, destructive -> destructive. */
export function riskFromKind(kind: ToolKindName): Risk {
  switch (kind) {
    case 'read':
      return 'read';
    case 'write':
      return 'modify';
    case 'destructive':
      return 'destructive';
    default:
      throw new Error(`unknown tool kind "${String(kind)}"`);
  }
}

export function isConfirmationMode(value: unknown): value is ConfirmationMode {
  return typeof value === 'string' && (CONFIRMATION_MODES as readonly string[]).includes(value);
}

/** Parses a confirmation mode. Surrounding spaces and letter case are ignored. Unknown values throw. */
export function parseConfirmation(value: string): ConfirmationMode {
  const normalised = value.trim().toLowerCase();
  if (isConfirmationMode(normalised)) return normalised;
  throw new Error(`unknown confirmation mode "${value}"; expected one of: ${CONFIRMATION_MODES.join(', ')}`);
}

/** Converts a glob to an anchored regular expression. Every other character is taken literally. */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (const ch of glob) {
    if (ch === '*') source += '[\\s\\S]*';
    else if (ch === '?') source += '[\\s\\S]';
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** True when a rule pattern (glob or 're:' regex) matches the value. */
export function matchesPattern(pattern: string, value: string): boolean {
  if (pattern.startsWith('re:')) return new RegExp(pattern.slice(3)).test(value);
  return globToRegExp(pattern).test(value);
}

/** The override from CLAUDE_PLUGIN_OPTION_CONFIRMATION, or undefined when it is unset or not a valid mode. */
function usableOverride(value: string | undefined): ConfirmationMode | undefined {
  if (value === undefined) return undefined;
  const normalised = value.trim().toLowerCase();
  return isConfirmationMode(normalised) ? normalised : undefined;
}

/** The result when no rule matches. */
function defaultDecision(risk: Risk, mode: ConfirmationMode): DecideResult {
  if (risk === 'read') {
    return { decision: 'allow', reason: 'Read-only action, allowed by default.' };
  }
  if (risk === 'modify') {
    if (mode === 'every-change') {
      return { decision: 'ask', reason: `Changes data. Confirmation mode is "${mode}", so it asks first.` };
    }
    return { decision: 'allow', reason: `Changes data. Confirmation mode is "${mode}", so it runs without asking.` };
  }
  if (mode === 'off') {
    return { decision: 'allow', reason: 'Deletes, disables or sends data. Confirmation mode is "off", so it runs without asking.' };
  }
  return { decision: 'ask', reason: `Deletes, disables or sends data. Confirmation mode is "${mode}", so it asks first.` };
}

/**
 * Decides whether a tool call may run.
 *
 * 1. Rules that match the tool name or the method id are gathered.
 * 2. Any matching deny rule: deny. The first one is named in the reason.
 * 3. Else any matching ask rule: ask.
 * 4. Else any matching allow rule: allow, even where the default would ask. The reason says so.
 * 5. Else the default for the risk and the confirmation mode:
 *    read: allow. modify: ask under every-change, else allow.
 *    destructive: ask under every-change or destructive-only, else allow.
 *
 * The confirmation mode is the env override when that is a valid mode, else the policy's mode.
 */
export function decide(input: DecideInput): DecideResult {
  const { toolName, methodId, risk, policy } = input;
  const matching = policy.rules.filter(
    (rule) => matchesPattern(rule.match, toolName) || (methodId !== undefined && matchesPattern(rule.match, methodId)),
  );

  const denied = matching.find((rule) => rule.action === 'deny');
  if (denied) return { decision: 'deny', reason: `Denied by policy rule "${denied.match}".` };

  const asked = matching.find((rule) => rule.action === 'ask');
  if (asked) return { decision: 'ask', reason: `Policy rule "${asked.match}" asks for confirmation.` };

  const mode = usableOverride(input.confirmationEnvOverride) ?? policy.confirmation;
  const fallback = defaultDecision(risk, mode);

  const allowed = matching.find((rule) => rule.action === 'allow');
  if (allowed) {
    if (fallback.decision === 'ask') {
      return {
        decision: 'allow',
        reason: `Allowed without asking by policy rule "${allowed.match}". The default for this ${risk} action would ask, and the rule overrides that.`,
      };
    }
    return { decision: 'allow', reason: `Allowed by policy rule "${allowed.match}".` };
  }
  return fallback;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function plainObject(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} must be a string`);
  return value;
}

function rejectUnknownFields(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`unknown field "${key}" in ${where}; allowed fields: ${allowed.join(', ')}`);
    }
  }
}

function parseRule(item: unknown, index: number): PolicyRule {
  const where = `rules[${index}]`;
  const obj = plainObject(item, `${where} must be an object`);
  rejectUnknownFields(obj, RULE_FIELDS, where);
  const match = requireString(obj.match, `${where}.match`);
  if (match.length === 0) throw new Error(`${where}.match must not be empty`);
  const action = obj.action;
  if (typeof action !== 'string' || !(RULE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`${where}.action must be one of: ${RULE_ACTIONS.join(', ')}`);
  }
  if (match.startsWith('re:')) {
    const body = match.slice(3);
    if (body === '') throw new Error(`${where}.match is an empty regular expression`);
    try {
      new RegExp(body);
    } catch (err) {
      throw new Error(`${where}.match is not a valid regular expression: ${messageOf(err)}`);
    }
  }
  return { match, action: action as RuleAction };
}

function parsePolicy(raw: unknown): Policy {
  const obj = plainObject(raw, 'the top level must be a JSON object');
  rejectUnknownFields(obj, POLICY_FIELDS, 'the top level');
  const confirmation =
    obj.confirmation === undefined ? DEFAULT_CONFIRMATION : parseConfirmation(requireString(obj.confirmation, '"confirmation"'));
  if (obj.rules !== undefined && !Array.isArray(obj.rules)) throw new Error('"rules" must be an array');
  const rawRules: unknown[] = (obj.rules as unknown[] | undefined) ?? [];
  return { confirmation, rules: rawRules.map((item, index) => parseRule(item, index)) };
}

/**
 * Reads <tokenDir>/policy.json. A missing file means the defaults. Invalid JSON, unknown
 * fields and bad values throw an error that names the file. The file is never created.
 */
export function loadPolicyFile(tokenDir: string): Policy {
  const file = join(tokenDir, 'policy.json');
  if (!existsSync(file)) return { confirmation: DEFAULT_CONFIRMATION, rules: [] };

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read policy file ${file}: ${messageOf(err)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    throw new Error(`Invalid policy file ${file}: not valid JSON (${messageOf(err)})`);
  }

  try {
    return parsePolicy(raw);
  } catch (err) {
    throw new Error(`Invalid policy file ${file}: ${messageOf(err)}`);
  }
}

/** Replaces secret values, cuts long strings, and returns a JSON-safe copy. The input is not changed. */
function scrub(value: unknown, seen: WeakSet<object>, stringLimit: number): unknown {
  if (typeof value === 'string') {
    return value.length > stringLimit ? `${value.slice(0, stringLimit)}...` : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';

  seen.add(value);
  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((item) => scrub(item, seen, stringLimit));
  } else {
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      record[key] = SECRET_KEY.test(key) ? '[redacted]' : scrub(item, seen, stringLimit);
    }
    out = record;
  }
  seen.delete(value);
  return out;
}

/**
 * Pretty JSON for showing a user what a tool call would send. Every key that looks like
 * a secret is replaced by "[redacted]" at any depth. Strings over 300 characters are cut
 * with "...". The whole text is cut to maxChars, and the note says how many characters were dropped.
 */
export function redactArgs(value: unknown, maxChars = DEFAULT_MAX_CHARS, stringLimit = STRING_LIMIT): string {
  const text = JSON.stringify(scrub(value, new WeakSet<object>(), stringLimit), null, 2) ?? 'null';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [${text.length - maxChars} more characters not shown]`;
}

/**
 * A short, plain-English description for the user. The first line is
 * "About to <verb> Google data: <toolName>". Then come the reason (if any), the
 * method id (if any) and the redacted arguments. The text says the action is proposed
 * and has not run yet.
 */
export function describeAction(input: ActionInput): string {
  const verb = input.risk === 'read' ? 'read' : input.risk === 'destructive' ? 'permanently change or delete' : 'change';
  const lines: string[] = [`About to ${verb} Google data: ${input.toolName}`];
  if (input.reason) lines.push(`Why: ${input.reason}`);
  lines.push(
    input.risk === 'destructive'
      ? 'This may be irreversible. It is a proposed action and has not run yet; nothing has changed.'
      : 'It is a proposed action and has not run yet; nothing has changed.',
  );
  if (input.methodId) lines.push(`Method: ${input.methodId}`);
  // Approval text shows more of each string than logs do, so the person can read an email body before approving it.
  lines.push('Arguments:', input.args === undefined ? '(none)' : redactArgs(input.args, APPROVAL_MAX_CHARS, APPROVAL_STRING_LIMIT));
  if (input.risk !== 'read') lines.push('', confirmationFooter());
  return lines.join('\n');
}

/** Largest approval text shown to the user, and the longest string shown in full inside it. */
export const APPROVAL_MAX_CHARS = 2000;
export const APPROVAL_STRING_LIMIT = 1500;

/**
 * Shown under every approval prompt, so the user always knows the check can be turned off.
 * The setting name matches the plugin option that controls it.
 */
export function confirmationFooter(): string {
  return "You can turn these confirmations off or limit them in the plugin settings: set 'confirmation' to 'destructive-only' (ask only before deleting or sending) or 'off' (no prompts; policy rules still apply).";
}
