/**
 * `gsm doctor`: a read-only health check of the plugin folders and of the credentials they need.
 *
 * It prints one PASS or FAIL line per check and returns 1 when any check FAILs. It never prints a secret
 * (no token, API key or client secret value), and it never creates a folder or a file.
 *
 * Which folders: with --plugin <id>, that product. Without it, every product of the layout: each plugin
 * folder of the repo (plugins/<id>), or the one plugin folder the CLI runs from.
 */
import { accessSync, constants as fsConstants, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Registry } from '../core/registry.js';
import { loadConfig } from '../core/config.js';
import { aclExtras } from '../core/acl.js';
import { adminScopeFileFor } from '../core/auth.js';
import { OAUTH_GROUPS } from './args.js';
import { apiKeyFileFor, apiKeyState } from './credentials.js';
import type { InstallRoots } from './paths.js';
import { pluginFolderFor, productIds } from './products.js';
import type { Output } from './report.js';
import { UsageError } from './types.js';

/** The Ads developer token. Read from this environment variable, and only its presence is checked. */
export const ADS_TOKEN_ENV = 'GSM_ADS_DEVELOPER_TOKEN';
/** The business product that needs the Ads developer token. */
export const ADS_PRODUCT = 'gads';
/** Longest tool name that Claude Code accepts for an MCP tool. */
export const MAX_TOOL_NAME_LENGTH = 64;

interface RequiredPath {
  path: string;
  kind: 'file' | 'dir';
  /** The file must also parse as JSON. */
  json: boolean;
}

/** What a plugin folder must contain. */
export const REQUIRED_PATHS: readonly RequiredPath[] = [
  { path: '.claude-plugin/plugin.json', kind: 'file', json: true },
  { path: '.mcp.json', kind: 'file', json: true },
  { path: 'bin/gsm.mjs', kind: 'file', json: false },
  { path: 'bin/gsm-hook.mjs', kind: 'file', json: false },
  { path: 'hooks/hooks.json', kind: 'file', json: true },
  { path: 'tool-map.json', kind: 'file', json: true },
  { path: 'servers.json', kind: 'file', json: true },
  { path: 'scopes.json', kind: 'file', json: true },
  { path: 'skills', kind: 'dir', json: false },
];

export interface DoctorRequest {
  roots: InstallRoots;
  registry: Registry;
  /** --plugin: one product id. Undefined checks every product of the layout. */
  pluginId?: string;
  /** --token-dir. Undefined uses GSM_TOKEN_DIR, or the default token directory. */
  tokenDir?: string;
  env: NodeJS.ProcessEnv;
}

/** Counts and prints the checks. */
class Tally {
  passed = 0;
  failed = 0;
  constructor(private readonly out: Output) {}

  check(ok: boolean, text: string): void {
    if (ok) this.passed += 1;
    else this.failed += 1;
    this.out.log(`${ok ? 'PASS' : 'FAIL'} ${text}`);
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isWritableFolder(path: string): boolean {
  try {
    accessSync(path, fsConstants.W_OK);
    return isDirectory(path);
  } catch {
    return false;
  }
}

type JsonRead = { ok: true; value: unknown } | { ok: false };

/** Parses a JSON file. The parser message is not used, because it can quote part of the file. */
function readJson(file: string): JsonRead {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) as unknown };
  } catch {
    return { ok: false };
  }
}

/** The plugin's hooks: PreToolUse must have an entry with the matcher ^mcp__plugin_<id>_ that runs bin/gsm-hook.mjs. */
function checkHooks(tally: Tally, id: string, hooks: unknown): void {
  const matcher = `^mcp__plugin_${id}_`;
  const pre = isObject(hooks) && isObject(hooks.hooks) ? hooks.hooks.PreToolUse : undefined;
  const entries: unknown[] = Array.isArray(pre) ? pre : [];
  const entry = entries.find((e) => isObject(e) && e.matcher === matcher);
  if (!isObject(entry)) {
    tally.check(false, `${id}: hooks/hooks.json has no PreToolUse entry with matcher ${matcher}`);
    return;
  }
  const commands = Array.isArray(entry.hooks) ? entry.hooks : [];
  const runsHook = commands.some(
    (h) =>
      isObject(h) &&
      [h.command, ...(Array.isArray(h.args) ? h.args : [])].some((a) => typeof a === 'string' && a.endsWith('bin/gsm-hook.mjs')),
  );
  tally.check(runsHook, runsHook
    ? `${id}: hooks/hooks.json matches ${matcher} and runs bin/gsm-hook.mjs`
    : `${id}: hooks/hooks.json matcher ${matcher} does not run bin/gsm-hook.mjs`);
}

/** Every server in .mcp.json needs servers/<name>.mjs. */
function checkMcpServers(tally: Tally, id: string, folder: string, mcp: unknown): void {
  const servers = isObject(mcp) && isObject(mcp.mcpServers) ? Object.keys(mcp.mcpServers) : [];
  if (servers.length === 0) {
    tally.check(false, `${id}: .mcp.json lists no servers`);
    return;
  }
  const missing = servers.filter((name) => !existsSync(join(folder, 'servers', `${name}.mjs`)));
  tally.check(missing.length === 0, missing.length === 0
    ? `${id}: every server in .mcp.json (${servers.join(', ')}) has a file under servers/`
    : `${id}: no file under servers/ for ${missing.map((n) => `${n}.mjs`).join(', ')}`);
}

/** Tool names carry the plugin prefix and are at most 64 characters. */
function checkToolNames(tally: Tally, id: string, toolMap: unknown): void {
  if (!Array.isArray(toolMap)) {
    tally.check(false, `${id}: tool-map.json does not hold a list of tools`);
    return;
  }
  const prefix = `mcp__plugin_${id}_`;
  const names = toolMap.map((entry) => (isObject(entry) && typeof entry.name === 'string' ? entry.name : ''));
  if (names.length === 0) {
    tally.check(false, `${id}: tool-map.json lists no tools`);
    return;
  }
  const bad = names.filter((n) => !n.startsWith(prefix) || n.length > MAX_TOOL_NAME_LENGTH);
  tally.check(bad.length === 0, bad.length === 0
    ? `${id}: tool-map.json has ${names.length} tools, all named ${prefix}* and at most ${MAX_TOOL_NAME_LENGTH} characters`
    : `${id}: ${bad.length} tool name(s) lack the prefix ${prefix} or are longer than ${MAX_TOOL_NAME_LENGTH} characters, for example ${bad.slice(0, 3).join(', ')}`);
}

/** The required files of one plugin folder, then the content checks that need them. */
function checkPluginFolder(tally: Tally, id: string, folder: string): void {
  const missing: string[] = [];
  const invalid: string[] = [];
  const parsed = new Map<string, unknown>();
  for (const req of REQUIRED_PATHS) {
    const full = join(folder, req.path);
    if (req.kind === 'dir') {
      if (!isDirectory(full)) missing.push(`${req.path} (${full})`);
      continue;
    }
    if (!existsSync(full)) {
      missing.push(`${req.path} (${full})`);
      continue;
    }
    if (req.json) {
      const read = readJson(full);
      if (read.ok) parsed.set(req.path, read.value);
      else invalid.push(req.path);
    }
  }
  if (missing.length === 0 && invalid.length === 0) {
    tally.check(true, `${id}: plugin folder has the ${REQUIRED_PATHS.length} required files`);
  } else {
    for (const m of missing) tally.check(false, `${id}: missing ${m}`);
    for (const path of invalid) tally.check(false, `${id}: ${path} is not valid JSON`);
  }

  if (parsed.has('hooks/hooks.json')) checkHooks(tally, id, parsed.get('hooks/hooks.json'));
  if (parsed.has('.mcp.json')) checkMcpServers(tally, id, folder, parsed.get('.mcp.json'));
  if (parsed.has('tool-map.json')) checkToolNames(tally, id, parsed.get('tool-map.json'));
}

/** Token directory: it exists, or it does not yet and a folder above it can be written to. Nothing is created. */
/**
 * On Windows the token folder must be limited to you, SYSTEM and Administrators (core/acl.ts). The modes do not apply
 * there. Other systems use the 0700 and 0600 modes, and this check is skipped.
 */
function checkFolderAccess(tally: Tally, dir: string): void {
  try {
    const acl = aclExtras(dir);
    if (!acl.supported) return;
    if (acl.extra.length === 0) {
      tally.check(true, 'token folder is limited to you, SYSTEM and Administrators');
    } else {
      tally.check(
        false,
        `token folder can also be read by ${acl.extra.join(', ')}. Limit it: icacls "${dir}" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F". New files then inherit that list. Existing files keep their entries: log in again so the token files are rewritten.`,
      );
    }
  } catch (err) {
    tally.check(false, `could not read the token folder's access list: ${(err as Error).message.split('\n')[0]}`);
  }
}

function checkTokenDir(tally: Tally, dir: string): void {
  if (isDirectory(dir)) {
    tally.check(true, `token directory exists: ${dir}`);
    checkFolderAccess(tally, dir);
    return;
  }
  if (existsSync(dir)) {
    tally.check(false, `token directory ${dir} exists but is not a folder`);
    return;
  }
  let probe = dir;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  if (isWritableFolder(probe)) {
    tally.check(true, `token directory ${dir} does not exist yet, and it can be created`);
  } else {
    tally.check(false, `token directory ${dir} cannot be created: ${probe} is not a writable folder`);
  }
}

const list = (ids: readonly string[]): string => {
  const shown = ids.slice(0, 5).join(', ');
  return ids.length > 5 ? `${shown} and ${ids.length - 5} more` : shown;
};

export function runDoctor(req: DoctorRequest, out: Output): number {
  const ids = productIds(req.registry);
  if (req.pluginId !== undefined && !ids.includes(req.pluginId)) {
    throw new UsageError(`unknown plugin id "${req.pluginId}". Valid plugin ids: ${ids.join(', ')}`);
  }
  const selected = req.pluginId !== undefined ? [req.pluginId] : ids;
  const tally = new Tally(out);
  const tokenDir = req.tokenDir ?? loadConfig(req.env).tokenDir;
  out.log(
    `doctor: ${req.roots.layout === 'repo' ? 'repo checkout' : 'plugin folder'} ${req.roots.root}, ` +
      `${selected.length} product(s), token directory ${tokenDir}`,
  );
  if (selected.length === 0) tally.check(false, 'no products are listed in the product map');

  // A product is active when it is named explicitly or its plugin folder exists (it is installed here).
  const active: string[] = [];
  for (const id of selected) {
    const folder = pluginFolderFor(req.roots, id);
    checkPluginFolder(tally, id, folder);
    if (req.pluginId !== undefined || isDirectory(folder)) active.push(id);
  }

  checkTokenDir(tally, tokenDir);
  const groupOf = (id: string): string | undefined => req.registry.servers.find((s) => s.plugin === id)?.group;

  const oauthIds = active.filter((id) => (OAUTH_GROUPS as readonly string[]).includes(groupOf(id) ?? ''));
  if (oauthIds.length > 0) {
    const file = join(tokenDir, 'client_secret.json');
    const exists = existsSync(file);
    tally.check(exists, exists
      ? `OAuth client file exists: ${file} (needed by ${list(oauthIds)})`
      : `OAuth client file missing: ${file} (needed by ${list(oauthIds)}). Run: node gsm.mjs setup-client <client_secret.json>`);
  }

  const keyIds = active.filter((id) => groupOf(id) === 'apikey');
  if (keyIds.length > 0) {
    const file = apiKeyFileFor({ tokenDir });
    const state = apiKeyState(file);
    // The key itself is never read into a message: only its state is reported.
    if (state === 'saved') tally.check(true, `API key file holds a key: ${file} (needed by ${list(keyIds)})`);
    else if (state === 'missing') tally.check(false, `API key file missing: ${file} (needed by ${list(keyIds)}). Run: node gsm.mjs setup-apikey`);
    else tally.check(false, `API key file is unreadable or holds no key: ${file}. Run: node gsm.mjs setup-apikey --force`);
  }

  // Google Ads no longer needs a developer token: access belongs to the Cloud project of the OAuth client, and the
  // header is optional. So this is an information line only. It is never a FAIL, and the value is never printed.
  if (active.includes(ADS_PRODUCT)) {
    const set = (req.env[ADS_TOKEN_ENV] ?? '').trim() !== '';
    out.log(`INFO ${ADS_TOKEN_ENV} is ${set ? 'set' : 'not set'} (optional for ${ADS_PRODUCT}). Google Ads access is granted to the Cloud project of your OAuth client; the developer token is no longer required.`);
  }

  // workspace-admin needs its setup before any call: the file setup-admin writes, or both environment variables.
  const adminIds = active.filter((id) => groupOf(id) === 'workspace-admin');
  if (adminIds.length > 0) {
    const file = adminScopeFileFor({ tokenDir });
    const fromEnv = (req.env.GSM_ADMIN_SUBJECT ?? '').trim() !== '' && (req.env.GSM_SERVICE_ACCOUNT_KEY_FILE ?? '').trim() !== '';
    const stored = existsSync(file);
    tally.check(stored || fromEnv, stored || fromEnv
      ? `workspace-admin is set up (needed by ${list(adminIds)}): ${stored ? file : 'GSM_ADMIN_SUBJECT and GSM_SERVICE_ACCOUNT_KEY_FILE are set'}`
      : `workspace-admin is not set up (needed by ${list(adminIds)}): no ${file}, and GSM_ADMIN_SUBJECT and GSM_SERVICE_ACCOUNT_KEY_FILE are not both set. Run: node gsm.mjs setup-admin --subject <email> --key-file <file>`);
  }

  out.log(`doctor: ${tally.passed} passed, ${tally.failed} failed`);
  return tally.failed > 0 ? 1 : 0;
}
