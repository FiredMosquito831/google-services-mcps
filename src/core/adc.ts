import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ensureTokenDir } from './acl.js';
import type { RuntimeConfig } from './config.js';

/**
 * Application Default Credentials (ADC) as one way to sign in. ADC is one file on this machine, written by
 * `gcloud auth application-default login`. This module reads only the file's type, its quota project and a hash of its
 * refresh token. It never returns or shows the token, and it never writes to the file.
 *
 * ADC holds one login, and that login has the scopes it asked for:
 * - gcloud's built-in client grants GCLOUD_DEFAULT_SCOPES (cloud scopes only);
 * - `--client-id-file` with our own client grants any scopes a group needs. The in-chat ADC sign-in does this for every
 *   group except cloud.
 * When the suite makes the login, it records the group, the scopes and a hash of the refresh token in adc.scopes.json
 * (token folder). A login made by hand has no record, and is taken as gcloud's built-in cloud login. A record whose hash
 * no longer matches the file is ignored, because the file was replaced.
 */

/** The scopes of gcloud's built-in ADC login, when no scopes are passed. */
export const GCLOUD_DEFAULT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/sqlservice.login',
];

/** A service account key used as ADC covers the cloud scope only. */
const SERVICE_ACCOUNT_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

export interface AdcRecord {
  group: string;
  scopes: string[];
  /** SHA-256 of the refresh token the login produced. Not the token. */
  fingerprint: string;
  savedAt: string;
}

export interface AdcGrant {
  group: string;
  scopes: string[];
  quotaProject?: string;
}

export interface AdcState {
  file: string;
  present: boolean;
  /** authorized_user (a person's login), service_account (a key file), or another type the suite does not use. */
  type?: string;
  quotaProject?: string;
  /** SHA-256 of the refresh token in the file. Not the token. */
  fingerprint?: string;
  /** The group this login covers and its scopes. Undefined when the file holds no usable login. */
  group?: string;
  scopes?: string[];
  /** True when the scopes come from a record the suite wrote for this login. */
  recorded: boolean;
}

/** Where google-auth-library looks for ADC: GOOGLE_APPLICATION_CREDENTIALS first, else gcloud's default file. */
export function adcFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (fromEnv) return fromEnv;
  const base =
    process.platform === 'win32'
      ? env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
      : env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'gcloud', 'application_default_credentials.json');
}

export function fingerprintOf(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

export function adcRecordFile(cfg: Pick<RuntimeConfig, 'tokenDir'>): string {
  return join(cfg.tokenDir, 'adc.scopes.json');
}

/** The record of the last ADC login the suite made, or null when there is none or it is not valid. */
export function readAdcRecord(cfg: Pick<RuntimeConfig, 'tokenDir'>): AdcRecord | null {
  const file = adcRecordFile(cfg);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AdcRecord>;
    if (typeof raw.group !== 'string' || typeof raw.fingerprint !== 'string' || !Array.isArray(raw.scopes)) return null;
    return {
      group: raw.group,
      scopes: raw.scopes.filter((s): s is string => typeof s === 'string'),
      fingerprint: raw.fingerprint,
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    };
  } catch {
    return null;
  }
}

/** Writes the record with mode 0600. The record holds a hash and scope names, never a token. */
export function saveAdcRecord(cfg: Pick<RuntimeConfig, 'tokenDir'>, record: Omit<AdcRecord, 'savedAt'>): void {
  ensureTokenDir(cfg.tokenDir);
  const file = adcRecordFile(cfg);
  const full: AdcRecord = { ...record, savedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(full, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows ignores POSIX modes; the directory ACL is the protection there.
  }
}

/**
 * Reads the ADC file's type, quota project and refresh-token hash, and works out which group its login covers. The
 * refresh token is read into memory to compute the hash, and is never returned.
 */
export function readAdcState(cfg: Pick<RuntimeConfig, 'tokenDir'>, env: NodeJS.ProcessEnv = process.env): AdcState {
  const file = adcFilePath(env);
  if (!existsSync(file)) return { file, present: false, recorded: false };
  let raw: { type?: unknown; quota_project_id?: unknown; refresh_token?: unknown };
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as typeof raw;
  } catch {
    return { file, present: false, recorded: false };
  }
  const type = typeof raw.type === 'string' ? raw.type : undefined;
  const quotaProject = typeof raw.quota_project_id === 'string' && raw.quota_project_id !== '' ? raw.quota_project_id : undefined;
  const fingerprint = typeof raw.refresh_token === 'string' ? fingerprintOf(raw.refresh_token) : undefined;
  const base: AdcState = { file, present: true, type, quotaProject, fingerprint, recorded: false };

  if (type === 'authorized_user') {
    const record = readAdcRecord(cfg);
    if (record && fingerprint !== undefined && record.fingerprint === fingerprint) {
      return { ...base, group: record.group, scopes: record.scopes, recorded: true };
    }
    return { ...base, group: 'cloud', scopes: [...GCLOUD_DEFAULT_SCOPES] };
  }
  if (type === 'service_account') {
    return { ...base, group: 'cloud', scopes: [...SERVICE_ACCOUNT_SCOPES] };
  }
  return base;
}

/** The ADC login a group can use, or null when the ADC file holds no login for that group. */
export function adcGrantFor(group: string, cfg: Pick<RuntimeConfig, 'tokenDir'>, env: NodeJS.ProcessEnv = process.env): AdcGrant | null {
  const state = readAdcState(cfg, env);
  if (!state.present || state.group !== group || !state.scopes) return null;
  return { group, scopes: state.scopes, quotaProject: state.quotaProject };
}

/**
 * Finds the gcloud CLI: the PATH, then the usual install folders of the Google Cloud SDK. Returns the path to run, or
 * undefined when it is not installed.
 */
export function findGcloud(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const names = process.platform === 'win32' ? ['gcloud.cmd', 'gcloud.exe'] : ['gcloud'];
  const dirs = (env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const base of [env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']]) {
    if (base) dirs.push(join(base, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'));
  }
  dirs.push(join(homedir(), 'google-cloud-sdk', 'bin'));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}
