import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIRMATION, isConfirmationMode, type ConfirmationMode } from './policy.js';

/**
 * Runtime settings, read from environment variables. The plugin manifest and
 * the installers set these; nothing secret is ever written into config files.
 */
export interface RuntimeConfig {
  /** Write tools (create/update/send) are registered only when true. Default false. */
  allowWrites: boolean;
  /** Directory holding OAuth tokens and the OAuth client file (mode 0600 files). */
  tokenDir: string;
  /** Path to the OAuth "Desktop app" client JSON downloaded from Google Cloud console. */
  clientSecretFile: string;
  /** Workspace super admin to impersonate (domain-wide delegation). Admin server only. */
  adminSubject?: string;
  /** Service account key file used for domain-wide delegation. Admin server only. */
  serviceAccountKeyFile?: string;
  /** Hard cap on tool output size, in characters, to protect the model's context. */
  maxResultChars: number;
  /** Consent mode from GSM_CONFIRMATION: every-change (default), destructive-only or off. */
  confirmation: ConfirmationMode;
  /**
   * True when GSM_CONFIRMATION holds a valid mode. Only then does it override the
   * policy file's confirmation, as the plugin option does in the hook.
   */
  confirmationFromEnv: boolean;
  /** True when this plugin's PreToolUse hook asks before changes (GSM_HOOK_ACTIVE=1). */
  hookActive: boolean;
  /** API key for the apikey group: GSM_API_KEY, else the apiKey field of <tokenDir>/apikey.json. Never logged. */
  apiKey?: string;
}

function readConfirmation(value: string | undefined): { mode: ConfirmationMode; fromEnv: boolean } {
  if (value === undefined || value.trim() === '') return { mode: DEFAULT_CONFIRMATION, fromEnv: false };
  const normalised = value.trim().toLowerCase();
  if (isConfirmationMode(normalised)) return { mode: normalised, fromEnv: true };
  process.stderr.write(
    `[config] GSM_CONFIRMATION "${value}" is not a mode (every-change, destructive-only, off); using ${DEFAULT_CONFIRMATION}.\n`,
  );
  return { mode: DEFAULT_CONFIRMATION, fromEnv: false };
}

/** Reads <tokenDir>/apikey.json. Warns when the file is not mode 0600 on POSIX. An unreadable file gives no key. */
function readApiKeyFile(tokenDir: string): string | undefined {
  const file = join(tokenDir, 'apikey.json');
  if (!existsSync(file)) return undefined;
  if (process.platform !== 'win32') {
    const mode = statSync(file).mode & 0o777;
    if (mode !== 0o600) {
      process.stderr.write(`[config] ${file} is mode ${mode.toString(8)}; it holds an API key and should be 0600. Run: chmod 600 "${file}".\n`);
    }
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as { apiKey?: unknown };
    return typeof raw.apiKey === 'string' && raw.apiKey.trim() !== '' ? raw.apiKey.trim() : undefined;
  } catch {
    // The message names the file, never its contents.
    process.stderr.write(`[config] ${file} is not valid JSON, so no API key was read.\n`);
    return undefined;
  }
}

/**
 * True when GSM_VERBOSE is 1. Only then are notices that are normally silent written to stderr, and the cause of
 * an error shown to the user.
 */
export function verboseOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GSM_VERBOSE === '1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  // Fixed default on purpose: the CLI (run from a shell) and the MCP servers
  // (started by Claude Code, which sets CLAUDE_PLUGIN_DATA) must read the same tokens.
  const tokenDir = env.GSM_TOKEN_DIR?.trim() || join(homedir(), '.google-services-mcps');

  const maxRaw = Number(env.GSM_MAX_RESULT_CHARS);
  const maxResultChars = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 50_000;
  const confirmation = readConfirmation(env.GSM_CONFIRMATION);

  return {
    allowWrites: env.GSM_ALLOW_WRITES === 'true',
    tokenDir,
    clientSecretFile: join(tokenDir, 'client_secret.json'),
    adminSubject: env.GSM_ADMIN_SUBJECT?.trim() || undefined,
    serviceAccountKeyFile: env.GSM_SERVICE_ACCOUNT_KEY_FILE?.trim() || undefined,
    maxResultChars,
    confirmation: confirmation.mode,
    confirmationFromEnv: confirmation.fromEnv,
    hookActive: env.GSM_HOOK_ACTIVE === '1',
    apiKey: env.GSM_API_KEY?.trim() || readApiKeyFile(tokenDir),
  };
}
