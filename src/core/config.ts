import { existsSync, statSync } from 'node:fs';
import { readSecretText } from './secret-files.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIRMATION, isConfirmationMode, type ConfirmationMode } from './policy.js';
import { readToolset, type Toolset } from './toolset.js';
import { DEFAULT_MAX_RESULT_CHARS } from './result-shape.js';
import { optionValue } from './plugin-option.js';

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
  /**
   * The result budget, in characters (GSM_MAX_RESULT_CHARS, default DEFAULT_MAX_RESULT_CHARS): a longer result is cut at
   * whole items, with a truncated object that says how to read on (src/core/result-shape.ts). Protects the model's context.
   */
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
  /**
   * Which tools the server registers, from GSM_TOOLSET: all (default), google or curated (see toolset.ts). An unknown
   * value gives all, with one line on stderr.
   */
  toolset: Toolset;
  /**
   * The MCP server this process runs, set by runServer (src/core/tools.ts) and unset in the CLI. The service-account key
   * asks Google for this server's own scopes only (serviceAccountScopesFor in src/core/auth.ts).
   */
  server?: string;
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
  // The key may be in the OS store (see secret-files.ts). The mode check applies only to a plain file.
  const text = readSecretText({ tokenDir }, file);
  if (text === undefined) return undefined;
  if (process.platform !== 'win32' && existsSync(file)) {
    const mode = statSync(file).mode & 0o777;
    if (mode !== 0o600) {
      process.stderr.write(`[config] ${file} is mode ${mode.toString(8)}; it holds an API key and should be 0600. Run: chmod 600 "${file}".\n`);
    }
  }
  try {
    const raw = JSON.parse(text.replace(/^\uFEFF/, '')) as { apiKey?: unknown };
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
  // The plugin options (GSM_TOKEN_DIR, GSM_CONFIRMATION, GSM_TOOLSET and the admin ones) read as unset when empty or when
  // they hold an unexpanded ${user_config.*} reference (plugin-option.ts), so the default applies.
  const tokenDir = optionValue(env.GSM_TOKEN_DIR) ?? join(homedir(), '.google-services-mcps');

  const maxRaw = Number(env.GSM_MAX_RESULT_CHARS);
  const maxResultChars = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : DEFAULT_MAX_RESULT_CHARS;
  const confirmation = readConfirmation(optionValue(env.GSM_CONFIRMATION));

  return {
    allowWrites: env.GSM_ALLOW_WRITES === 'true',
    tokenDir,
    clientSecretFile: join(tokenDir, 'client_secret.json'),
    adminSubject: optionValue(env.GSM_ADMIN_SUBJECT),
    serviceAccountKeyFile: optionValue(env.GSM_SERVICE_ACCOUNT_KEY_FILE),
    maxResultChars,
    confirmation: confirmation.mode,
    confirmationFromEnv: confirmation.fromEnv,
    hookActive: env.GSM_HOOK_ACTIVE === '1',
    apiKey: env.GSM_API_KEY?.trim() || readApiKeyFile(tokenDir),
    toolset: readToolset(optionValue(env.GSM_TOOLSET)),
  };
}
