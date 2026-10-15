import { homedir } from 'node:os';
import { join } from 'node:path';

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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  // Fixed default on purpose: the CLI (run from a shell) and the MCP servers
  // (started by Claude Code, which sets CLAUDE_PLUGIN_DATA) must read the same tokens.
  const tokenDir = env.GSM_TOKEN_DIR?.trim() || join(homedir(), '.google-services-mcps');

  const maxRaw = Number(env.GSM_MAX_RESULT_CHARS);
  const maxResultChars = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 50_000;

  return {
    allowWrites: env.GSM_ALLOW_WRITES === 'true',
    tokenDir,
    clientSecretFile: join(tokenDir, 'client_secret.json'),
    adminSubject: env.GSM_ADMIN_SUBJECT?.trim() || undefined,
    serviceAccountKeyFile: env.GSM_SERVICE_ACCOUNT_KEY_FILE?.trim() || undefined,
    maxResultChars,
  };
}
