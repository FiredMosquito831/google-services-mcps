import { statSync } from 'node:fs';
import type { AgentId, RunResult, Runner } from './types.js';

/**
 * What an install needs on this machine, and how gsm can install it. gsm installs a missing requirement only when it is
 * asked to (the --install-missing flag, or a yes in the guided flow). A requirement with no install command here (a
 * system package on Linux, for example) is shown with the command to run by hand.
 */
export type RequirementId = 'claude' | 'codex' | 'opencode' | 'git';

export interface PlannedInstall {
  /** The command as it would be typed, for display. */
  display: string;
  command: string;
  args: readonly string[];
}

export interface Requirement {
  id: RequirementId;
  title: string;
  /** Why the install needs it, in one short sentence. */
  why: string;
  present: boolean;
  /** The command gsm runs to install it, or null when it can only be installed by hand. */
  install: PlannedInstall | null;
  /** How to install it by hand. */
  manual: string;
}

export interface RequirementsEnv {
  run: Runner;
  platform: NodeJS.Platform;
  cwd: string;
}

/**
 * Runs a program as a terminal would. On Windows the npm commands and most CLIs are .cmd or .ps1 shims, which Node cannot
 * start directly, so they run through cmd.exe. Elsewhere the program runs directly, with no shell.
 */
export function runProgram(env: RequirementsEnv, command: string, args: readonly string[]): Promise<RunResult> {
  if (env.platform === 'win32') return env.run('cmd.exe', ['/d', '/c', command, ...args], env.cwd);
  return env.run(command, [...args], env.cwd);
}

/** True when the program starts and exits with 0 (for example "claude --version"). */
async function available(env: RequirementsEnv, command: string, args: readonly string[] = ['--version']): Promise<boolean> {
  try {
    return (await runProgram(env, command, args)).code === 0;
  } catch {
    return false;
  }
}

function planned(command: string, args: readonly string[]): PlannedInstall {
  return { display: [command, ...args].join(' '), command, args };
}

/** The npm package that provides each agent's command. */
export const NPM_PACKAGE: Record<Exclude<AgentId, 'agy'>, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  opencode: 'opencode-ai',
};

const TITLE: Record<RequirementId, string> = {
  claude: 'Claude Code (the claude command)',
  codex: 'Codex (the codex command)',
  opencode: 'OpenCode (the opencode command)',
  git: 'git',
};

const WHY: Record<RequirementId, string> = {
  claude: 'the plugins run inside Claude Code, and gsm uses its claude command to add the marketplace and install them',
  codex: 'Codex starts the servers that gsm writes into its config',
  opencode: 'OpenCode starts the servers that gsm writes into its config',
  git: 'the Claude Code marketplace is fetched from GitHub with git',
};

/** How to install git by hand on this platform. */
export function gitManual(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'winget install --id Git.Git -e --source winget, or the installer from https://git-scm.com/downloads/win';
  if (platform === 'darwin') return 'brew install git, or xcode-select --install';
  return 'your package manager, for example: sudo apt-get install -y git (Debian, Ubuntu) or sudo dnf install -y git (Fedora)';
}

/** The command gsm runs to install git on this platform, or null when there is none it runs (Linux needs sudo: by hand). */
async function gitInstall(env: RequirementsEnv): Promise<PlannedInstall | null> {
  if (env.platform === 'win32' && (await available(env, 'winget', ['--version']))) {
    return planned('winget', ['install', '--id', 'Git.Git', '-e', '--source', 'winget']);
  }
  if (env.platform === 'darwin' && (await available(env, 'brew', ['--version']))) {
    return planned('brew', ['install', 'git']);
  }
  return null;
}

/**
 * The requirements of an install for these agents. Only the ones the install needs are returned. `needGit` is true when
 * the Claude Code marketplace is fetched from GitHub (not from a folder on this machine).
 */
export async function checkRequirements(env: RequirementsEnv, agents: readonly AgentId[], needGit: boolean): Promise<Requirement[]> {
  const requirements: Requirement[] = [];
  const npmAvailable = await available(env, 'npm', ['--version']);
  for (const agent of agents) {
    // agy has its own installer, and its config folder is checked by the install itself.
    if (agent === 'agy') continue;
    const pkg = NPM_PACKAGE[agent];
    const present = await available(env, agent);
    requirements.push({
      id: agent,
      title: TITLE[agent],
      why: WHY[agent],
      present,
      install: npmAvailable ? planned('npm', ['install', '-g', pkg]) : null,
      manual: `npm install -g ${pkg}${agent === 'claude' ? ' (or the native installer, see https://code.claude.com/docs/en/setup)' : ''}`,
    });
  }
  if (needGit) {
    const present = await available(env, 'git');
    requirements.push({
      id: 'git',
      title: TITLE.git,
      why: WHY.git,
      present,
      install: present ? null : await gitInstall(env),
      manual: gitManual(env.platform),
    });
  }
  return requirements;
}

/** The requirements that are not present. */
export function missingOf(requirements: readonly Requirement[]): Requirement[] {
  return requirements.filter((r) => !r.present);
}

/** One block of text per missing requirement: what it is, why, and the command to install it. */
export function describeMissing(missing: readonly Requirement[]): string[] {
  const lines: string[] = [];
  for (const req of missing) {
    lines.push(`- ${req.title} is not installed. It is needed because ${req.why}.`);
    lines.push(req.install ? `    install: ${req.install.display}` : `    install by hand: ${req.manual}`);
  }
  return lines;
}

/** Runs one planned install. Returns the exit code, and prints nothing: the caller decides what to show. */
export async function runPlannedInstall(env: RequirementsEnv, install: PlannedInstall): Promise<number> {
  const result = await runProgram(env, install.command, install.args);
  return result.code;
}

/**
 * Whether the Claude Code marketplace is fetched from GitHub. A folder on this machine (a git checkout, or a folder given
 * with --marketplace) needs no git. Anything else (owner/repo, a URL, or the default GitHub source) does.
 */
export function marketplaceNeedsGit(marketplace: string | undefined, checkout: string | undefined): boolean {
  if (marketplace !== undefined) return !isDirectory(marketplace);
  return checkout === undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
