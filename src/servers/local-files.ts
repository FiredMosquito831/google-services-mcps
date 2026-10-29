/**
 * Local files a tool sends to Google (Gmail attachments, Drive uploads): the guard that keeps Google sign-in data on this
 * machine, and the content type of a file by its extension. Shared by gmail.ts and gdrive.ts.
 */
import { realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative } from 'node:path';
import type { RuntimeConfig } from '../core/config.js';
import { adcFilePath } from '../core/adc.js';

/** Common types by file extension. Anything else is application/octet-stream. */
export const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.ics': 'text/calendar',
  '.eml': 'message/rfc822',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** The content type of a local file by its extension, application/octet-stream when unknown. */
export function mimeTypeOf(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

const sameOrInside = (file: string, folder: string): boolean => {
  const rel = relative(folder, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const realOrSame = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/**
 * Folders and files a local file may never come from: the token folder (tokens, the OAuth client, the API key), the
 * gcloud folder with the ADC file, and the service account key files this server knows of. A mail or an upload must not
 * carry a credential out, even when the person approves without reading the path.
 */
export function protectedPaths(cfg: RuntimeConfig): string[] {
  const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const list = [cfg.tokenDir, dirname(adcFilePath({ ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '' })), cfg.clientSecretFile];
  if (adc) list.push(adc);
  if (cfg.serviceAccountKeyFile) list.push(cfg.serviceAccountKeyFile);
  return list.map(realOrSame);
}

/**
 * A local file to send: a full path to a regular file outside the protected paths (`blocked`, from protectedPaths). Returns
 * its real path and size. `noun` starts each message ("Attachment", "File").
 */
export function checkLocalFile(given: string, blocked: readonly string[], noun: string): { path: string; size: number } {
  if (!isAbsolute(given)) throw new Error(`${noun} "${given}" must be a full path.`);
  let real: string;
  try {
    real = realpathSync(given);
  } catch {
    throw new Error(`${noun} "${given}" was not found.`);
  }
  if (!statSync(real).isFile()) throw new Error(`${noun} "${given}" is not a file.`);
  const lower = process.platform === 'win32' ? (p: string) => p.toLowerCase() : (p: string) => p;
  if (blocked.some((p) => sameOrInside(lower(real), lower(p)))) {
    throw new Error(`${noun} "${given}" is refused: it is in the folder that holds Google sign-in data (tokens, client secrets or keys).`);
  }
  return { path: real, size: statSync(real).size };
}
