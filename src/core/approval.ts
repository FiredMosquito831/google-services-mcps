/**
 * The approval gate. Every write and destructive action passes through the gate
 * before it runs. The gate decides with decide() (policy.ts), and asks the user through
 * an MCP elicitation when the decision and the setup require it. Each gated action
 * adds one line to <tokenDir>/audit.log, which holds no argument values.
 *
 * Decision table, as implemented:
 *   read                                    -> not gated (runServer and the gateway skip it)
 *   write or destructive, GSM_ALLOW_WRITES  -> deny: writes are turned off
 *   not "true"
 *   policy file cannot be read              -> ask, with the error in the reason
 *   decide() = allow                        -> run
 *   decide() = deny                         -> DeniedError with the reason
 *   decide() = ask, modify, hookActive     -> run: the PreToolUse hook already asked
 *   decide() = ask, destructive            -> elicit, even when the hook is active
 *   decide() = ask, modify, not hookActive -> elicit
 *   elicit, client has no elicitation       -> ApprovalUnavailableError
 *   elicit, accept with approve === true    -> run
 *   elicit, anything else                   -> DeniedError
 *
 * The gate never reads or writes argument values to the audit log. It only stores a
 * 16-character SHA-256 of the arguments.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RuntimeConfig } from './config.js';
import { decide, describeAction, loadPolicyFile, riskFromKind, type Policy, type Risk } from './policy.js';
import type { GateInput } from './tools.js';

export type GateFn = (input: GateInput) => Promise<void>;

/** The action was refused by the policy, by the setting, or by the user. Nothing was changed. */
export class DeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeniedError';
  }
}

/** The client cannot be asked, so the action was not run. */
export class ApprovalUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      "This client cannot ask for confirmation, so the action was not run. Use Claude Code, or set confirmation to 'off' in the plugin settings if you accept running actions without prompts." +
        (detail ? ` Detail: ${detail}` : ''),
    );
    this.name = 'ApprovalUnavailableError';
  }
}

export interface GateOptions {
  server: McpServer;
  cfg: Pick<RuntimeConfig, 'tokenDir' | 'confirmation' | 'confirmationFromEnv' | 'hookActive' | 'allowWrites'>;
}

/** What the audit line records for a gated action. */
type Outcome = 'allowed' | 'approved' | 'declined' | 'denied' | 'unavailable' | 'hook';

interface PolicyState {
  policy?: Policy;
  error?: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A cheap fingerprint of the policy file, so an edit is seen without reading the file on every call. */
function stampOf(file: string): string {
  try {
    const st = statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return 'absent';
  }
}

/** Loads <tokenDir>/policy.json on first use, and again when the file changes. A load error is kept and reported. */
function policyReader(tokenDir: string): () => PolicyState {
  const file = join(tokenDir, 'policy.json');
  let stamp: string | undefined;
  let state: PolicyState = {};
  return () => {
    const next = stampOf(file);
    if (next !== stamp) {
      stamp = next;
      try {
        state = { policy: loadPolicyFile(tokenDir) };
      } catch (err) {
        state = { error: messageOf(err) };
      }
    }
    return state;
  };
}

function digestOf(args: unknown): string {
  const text = JSON.stringify(args === undefined ? null : args) ?? 'null';
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Appends one JSON line to <tokenDir>/audit.log. The line has the time, tool, method id,
 * risk, decision, outcome and a 16-character digest of the arguments. A write failure is
 * reported on stderr and never blocks the action.
 */
function writeAudit(
  tokenDir: string,
  entry: { tool: string; methodId?: string; risk: Risk; decision: string; outcome: Outcome; args: unknown },
): void {
  try {
    mkdirSync(tokenDir, { recursive: true });
    const { args, ...rest } = entry;
    const line = JSON.stringify({ time: new Date().toISOString(), ...rest, argsSha256: digestOf(args) }) + '\n';
    appendFileSync(join(tokenDir, 'audit.log'), line, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    process.stderr.write(`[audit] could not write ${join(tokenDir, 'audit.log')}: ${messageOf(err)}\n`);
  }
}

/** The form the user answers in the client. One boolean, so accepting is an explicit yes. */
const APPROVAL_FORM = {
  type: 'object' as const,
  properties: {
    approve: {
      type: 'boolean' as const,
      title: 'Approve this action?',
      description: 'Accept to run it, decline to cancel.',
    },
  },
  required: ['approve'],
};

/**
 * Builds the gate for one server. Reads are never gated, so the gate is called only for
 * write and destructive actions; read calls that reach it are allowed without a record.
 */
export function createGate(opts: GateOptions): GateFn {
  const { server, cfg } = opts;
  const readPolicy = policyReader(cfg.tokenDir);

  return async (input) => {
    if (input.kind === 'read') return;
    const risk = riskFromKind(input.kind);
    const audit = (decision: string, outcome: Outcome): void =>
      writeAudit(cfg.tokenDir, { tool: input.target, methodId: input.methodId, risk, decision, outcome, args: input.args });

    if (!cfg.allowWrites) {
      audit('deny', 'denied');
      throw new DeniedError(
        `Writes are turned off for this server (GSM_ALLOW_WRITES is not "true"), so ${input.target} was not run. Nothing was changed.`,
      );
    }

    const loaded = readPolicy();
    const verdict = loaded.policy
      ? decide({
          toolName: input.target,
          methodId: input.methodId,
          risk,
          policy: loaded.policy,
          // The environment setting overrides the policy only when it is set to a valid mode.
          confirmationEnvOverride: cfg.confirmationFromEnv ? cfg.confirmation : undefined,
        })
      : { decision: 'ask' as const, reason: `The policy file could not be read, so asking to be safe. ${loaded.error ?? ''}`.trim() };

    if (verdict.decision === 'allow') {
      audit('allow', 'allowed');
      return;
    }
    if (verdict.decision === 'deny') {
      audit('deny', 'denied');
      throw new DeniedError(`${verdict.reason} Nothing was changed.`);
    }

    // decision: ask. A change is left to the hook when the hook is active. Destructive actions always ask here.
    if (risk === 'modify' && cfg.hookActive) {
      audit('ask', 'hook');
      return;
    }

    if (!server.server.getClientCapabilities()?.elicitation) {
      audit('ask', 'unavailable');
      throw new ApprovalUnavailableError();
    }

    let answer;
    try {
      answer = await server.server.elicitInput({
        message: describeAction({
          toolName: input.target,
          methodId: input.methodId,
          risk,
          args: input.args,
          reason: verdict.reason,
        }),
        requestedSchema: APPROVAL_FORM,
      });
    } catch (err) {
      audit('ask', 'unavailable');
      throw new ApprovalUnavailableError(messageOf(err));
    }

    if (answer.action === 'accept' && answer.content?.approve === true) {
      audit('ask', 'approved');
      return;
    }
    audit('ask', 'declined');
    throw new DeniedError('You declined this action. Nothing was changed.');
  };
}
