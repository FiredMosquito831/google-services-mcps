/**
 * Curated Cloud Storage object tools of the gcloud server: read an object's content as text or as base64, and write a
 * text object or a local file. They match read_text, read_object and write_text of Google's Cloud Storage MCP server.
 * The generated storage_objects_get returns metadata only, and the generator skips upload methods, so these tools call
 * the JSON API directly (alt=media for content, the upload endpoint with uploadType=media for a write).
 *
 * gcs_write_text is a write: the gate asks first, and its prepare step shows the bucket, object, size and whether an
 * existing object may be replaced. It never replaces an object unless overwrite is true (ifGenerationMatch=0 otherwise).
 * A call with overwrite true may replace a whole object, so it is gated as destructive (destructiveWhen; the destructive
 * rule, docs/SECURITY.md).
 * A local file goes through the shared guard (local-files.ts), so files of the Google sign-in data are refused.
 */
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { googleScopes } from '../core/auth.js';
import { defineTool, type PreparedAction, type ToolDef } from '../core/tools.js';
import { bytesOf, statusOf, type CloudCall } from './cloud-http.js';
import { checkLocalFile, mimeTypeOf, protectedPaths } from './local-files.js';

const STORAGE = 'https://storage.googleapis.com/storage/v1';
const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1';

const READ_SCOPES = googleScopes('devstorage.read_only', 'cloud-platform.read-only', 'devstorage.read_write', 'devstorage.full_control', 'cloud-platform');
const WRITE_SCOPES = googleScopes('devstorage.read_write', 'devstorage.full_control', 'cloud-platform');

/** The default byte cap of one read: 8 MiB. */
export const GCS_READ_DEFAULT_BYTES = 8 * 1024 * 1024;
/** The largest byte cap a read may ask for: 64 MiB (the bytes are held in memory). */
export const GCS_READ_MAX_BYTES = 64 * 1024 * 1024;

/** Bucket names: 3 to 222 characters of lowercase letters, digits, dots, dashes and underscores. */
const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

const bucket = z.string().regex(BUCKET_RE, 'bucket is a bucket name, for example my-bucket (without gs://).').describe('The bucket name, without gs://.');
const objectName = z.string().min(1).describe('The object name (its path in the bucket), for example reports/2026/q3.csv.');

/** An object name Cloud Storage accepts: 1 to 1024 bytes of UTF-8, no carriage return or line feed, not . or .. */
export function checkObjectName(name: string): void {
  if (Buffer.byteLength(name, 'utf8') > 1024) throw new Error('object is longer than 1024 bytes, the Cloud Storage limit.');
  if (/[\r\n]/.test(name)) throw new Error('object may not contain a carriage return or a line feed.');
  if (name === '.' || name === '..') throw new Error('object may not be "." or "..".');
  if (name.startsWith('.well-known/acme-challenge/')) throw new Error('object may not start with .well-known/acme-challenge/.');
}

const objectUrl = (b: string, o: string) => `${STORAGE}/b/${encodeURIComponent(b)}/o/${encodeURIComponent(o)}`;

interface ObjectMeta {
  name?: string;
  bucket?: string;
  size?: string;
  contentType?: string;
  contentEncoding?: string;
  generation?: string;
  updated?: string;
  md5Hash?: string;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-ndjson|x-yaml|yaml|csv|sql|x-sh|graphql)|[^;]*\+(json|xml))/i;

/** True when the content type names text, or the bytes have no NUL in their first 8 KiB. */
export function looksLikeText(contentType: string | undefined, bytes: Buffer): boolean {
  if (contentType && TEXT_TYPES.test(contentType)) return true;
  return !bytes.subarray(0, 8192).includes(0);
}

/** The charset of a content type, when TextDecoder knows it; utf-8 otherwise. */
export function charsetOf(contentType: string | undefined): string {
  const m = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType ?? '');
  if (!m) return 'utf-8';
  try {
    return new TextDecoder(m[1]).encoding;
  } catch {
    return 'utf-8';
  }
}

/** For UTF-8 cut at `end`: the end moved back to a character boundary, so no character is split (at most 3 bytes). */
export function utf8Boundary(bytes: Buffer, end: number): number {
  let cut = end;
  // Continuation bytes are 10xxxxxx. Move back over them, then before the lead byte if its sequence is not complete.
  let back = 0;
  while (back < 3 && cut - back - 1 >= 0 && (bytes[cut - back - 1]! & 0xc0) === 0x80) back++;
  const lead = bytes[cut - back - 1];
  if (lead === undefined) return cut;
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  if (need > back + 1) cut -= back + 1;
  return cut;
}

/** What gcs_write_text will do: worked out before the approval, shown in it, and handed to the handler. */
export interface GcsWritePlan extends PreparedAction {
  bucket: string;
  object: string;
  contentType: string;
  bytes: number;
  overwrite: boolean;
  source: 'text' | 'local_path';
  text?: string;
  localPath?: string;
}

export function planGcsWrite(
  cfg: RuntimeConfig,
  args: { bucket: string; object: string; text?: string; local_path?: string; content_type?: string; overwrite?: boolean },
): GcsWritePlan {
  checkObjectName(args.object);
  if (args.text !== undefined && args.local_path !== undefined) throw new Error('Give text or local_path, not both.');
  if (args.text === undefined && args.local_path === undefined) throw new Error('gcs_write_text needs text or local_path.');
  if (args.content_type !== undefined && !/^[\w.+-]+\/[\w.+-]+(\s*;.*)?$/.test(args.content_type)) throw new Error(`content_type "${args.content_type}" is not a content type.`);
  const overwrite = args.overwrite === true;
  let plan: Omit<GcsWritePlan, 'preview'>;
  if (args.text !== undefined) {
    plan = {
      bucket: args.bucket,
      object: args.object,
      contentType: args.content_type ?? 'text/plain; charset=utf-8',
      bytes: Buffer.byteLength(args.text, 'utf8'),
      overwrite,
      source: 'text',
      text: args.text,
    };
  } else {
    const file = checkLocalFile(args.local_path as string, protectedPaths(cfg), 'File');
    plan = { bucket: args.bucket, object: args.object, contentType: args.content_type ?? mimeTypeOf(file.path), bytes: file.size, overwrite, source: 'local_path', localPath: file.path };
  }
  return {
    ...plan,
    preview: {
      destination: `gs://${plan.bucket}/${plan.object}`,
      bytes: plan.bytes,
      content_type: plan.contentType,
      source: plan.source === 'text' ? 'text' : `local file ${plan.localPath}`,
      ...(plan.text !== undefined ? { text_start: plan.text.slice(0, 200) } : {}),
      overwrite,
      effect: overwrite
        ? 'Writes the object. An existing object with this name is replaced (its old content is kept only if the bucket keeps versions).'
        : 'Writes the object only if no object with this name exists; otherwise nothing is written.',
    },
  };
}

export function storageTools(cfg: RuntimeConfig, call: CloudCall): ToolDef[] {
  // Room for the JSON around the content: the whole answer must fit the result limit, or it would be cut.
  const room = Math.max(1, cfg.maxResultChars - 1000);

  /** The object's metadata, then the asked part of its content (Range), pinned to the generation the metadata names. */
  async function readPart(args: { bucket: string; object: string; generation?: string; read_offset?: number; max_bytes?: number }, limit: number) {
    checkObjectName(args.object);
    const meta = (await call<ObjectMeta>({
      url: objectUrl(args.bucket, args.object),
      query: { generation: args.generation, fields: 'name,bucket,size,contentType,contentEncoding,generation,updated' },
    })).data;
    const size = Number(meta.size ?? 0);
    const offset = args.read_offset ?? 0;
    if (offset > size) throw new Error(`read_offset ${offset} is past the end of the object (${size} bytes).`);
    const length = Math.min(limit, size - offset);
    let bytes: Buffer = Buffer.alloc(0);
    if (length > 0) {
      const ranged = offset > 0 || length < size;
      const res = await call<unknown>({
        url: objectUrl(args.bucket, args.object),
        query: { alt: 'media', generation: meta.generation ?? args.generation },
        ...(ranged ? { headers: { Range: `bytes=${offset}-${offset + length - 1}` } } : {}),
        responseType: 'arraybuffer',
      });
      bytes = bytesOf(res.data);
      // A server that ignores Range (a compressed object served decompressed) sends more: keep the asked part only.
      if (bytes.length > length) bytes = res.status === 206 ? bytes.subarray(0, length) : bytes.subarray(offset, offset + length);
    }
    return { meta, size, offset, bytes };
  }

  const readArgs = {
    bucket,
    object: objectName,
    generation: z.string().regex(/^\d+$/).optional().describe('A specific generation (version) of the object. Default: the live one.'),
    read_offset: z.number().int().min(0).optional().describe('Start reading at this byte. Default 0; next_offset from the previous answer continues.'),
    max_bytes: z
      .number()
      .int()
      .min(1)
      .max(GCS_READ_MAX_BYTES)
      .optional()
      .describe(`Read at most this many bytes (default ${GCS_READ_DEFAULT_BYTES}, 8 MiB; at most ${GCS_READ_MAX_BYTES}). The answer must also fit the result limit (GSM_MAX_RESULT_CHARS).`),
  };

  return [
    defineTool({
      name: 'gcs_read_text',
      title: 'Read a Cloud Storage object as text',
      description: `Read the content of a Cloud Storage object as text (matches read_text and read_object in Google's Cloud Storage MCP server). It reads at most max_bytes (default 8 MiB) and at most what fits this server's result limit (GSM_MAX_RESULT_CHARS, now ${cfg.maxResultChars} characters); next_offset continues a longer object. The text is decoded with the charset of the object's content type (UTF-8 by default). A binary object is refused; use gcs_read_object for its bytes. storage_objects_get returns the metadata only.`,
      kind: 'read',
      scopes: READ_SCOPES,
      inputSchema: readArgs,
      async handler(args) {
        const { meta, size, offset, bytes } = await readPart(args, Math.min(args.max_bytes ?? GCS_READ_DEFAULT_BYTES, room));
        if (!looksLikeText(meta.contentType, bytes)) {
          throw new Error(`gs://${args.bucket}/${args.object} looks binary (content type ${meta.contentType ?? 'unknown'}). Use gcs_read_object to get its bytes as base64.`);
        }
        const charset = charsetOf(meta.contentType);
        const more = offset + bytes.length < size;
        const end = more && charset === 'utf-8' ? utf8Boundary(bytes, bytes.length) : bytes.length;
        const text = new TextDecoder(charset).decode(bytes.subarray(0, end));
        return {
          bucket: args.bucket,
          object: args.object,
          generation: meta.generation,
          content_type: meta.contentType,
          size_bytes: size,
          offset,
          bytes_read: end,
          ...(offset + end < size ? { next_offset: offset + end } : {}),
          text,
        };
      },
    }),
    defineTool({
      name: 'gcs_read_object',
      title: 'Read a Cloud Storage object as base64',
      description: `Read the bytes of a Cloud Storage object as base64 (matches read_object in Google's Cloud Storage MCP server). It reads at most max_bytes (default 8 MiB) and at most what fits this server's result limit as base64 (GSM_MAX_RESULT_CHARS, now ${cfg.maxResultChars} characters, so about ${Math.floor(room / 4) * 3} bytes a call); next_offset continues a larger object. For text, gcs_read_text is smaller.`,
      kind: 'read',
      scopes: READ_SCOPES,
      inputSchema: readArgs,
      async handler(args) {
        const fit = Math.max(3, Math.floor(room / 4) * 3);
        const { meta, size, offset, bytes } = await readPart(args, Math.min(args.max_bytes ?? GCS_READ_DEFAULT_BYTES, fit));
        return {
          bucket: args.bucket,
          object: args.object,
          generation: meta.generation,
          content_type: meta.contentType,
          size_bytes: size,
          offset,
          bytes_read: bytes.length,
          ...(offset + bytes.length < size ? { next_offset: offset + bytes.length } : {}),
          data_base64: bytes.toString('base64'),
        };
      },
    }),
    defineTool({
      name: 'gcs_write_text',
      title: 'Write a Cloud Storage object',
      description:
        "Write a Cloud Storage object from text or a local file (matches write_text in Google's Cloud Storage MCP server). Unlike Google's write_text it does not replace an existing object unless overwrite is true: by default the write is made only if no object of that name exists (ifGenerationMatch=0), and an existing one is reported, not changed. local_path is a full path; files in the folder that holds the Google sign-in data are refused. content_type defaults to text/plain; charset=utf-8 for text, by extension for a file. It asks first, and the approval shows the destination, the size and whether an object may be replaced; with overwrite true it asks as a destructive action. One request (uploadType=media).",
      kind: 'write',
      // overwrite true may replace a whole object: whole-content replacement (the destructive rule).
      destructiveWhen: ({ overwrite }) => overwrite === true,
      scopes: WRITE_SCOPES,
      inputSchema: {
        bucket,
        object: objectName,
        text: z.string().optional().describe('The text to write (UTF-8). Give this or local_path.'),
        local_path: z.string().optional().describe('Full path of a local file to upload. Give this or text.'),
        content_type: z.string().optional().describe('The content type of the object, for example text/csv or application/json.'),
        overwrite: z.boolean().optional().describe('Replace an existing object with this name. Default false: an existing object is left as it is.'),
      },
      async prepare(args) {
        return planGcsWrite(cfg, args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as GcsWritePlan | undefined) ?? planGcsWrite(cfg, args);
        try {
          const res = await call<ObjectMeta>({
            url: `${UPLOAD}/b/${encodeURIComponent(plan.bucket)}/o`,
            method: 'POST',
            query: { uploadType: 'media', name: plan.object, ...(plan.overwrite ? {} : { ifGenerationMatch: 0 }) },
            headers: { 'Content-Type': plan.contentType },
            // googleapis-style bodies: a string, or a stream for a file (the file is not read into memory).
            body: plan.source === 'text' ? (plan.text as string) : createReadStream(plan.localPath as string),
          });
          return {
            destination: `gs://${plan.bucket}/${plan.object}`,
            generation: res.data.generation,
            size_bytes: Number(res.data.size ?? plan.bytes),
            content_type: res.data.contentType ?? plan.contentType,
            ...(res.data.md5Hash ? { md5_hash: res.data.md5Hash } : {}),
            overwrite: plan.overwrite,
          };
        } catch (err) {
          if (!plan.overwrite && statusOf(err) === 412) {
            throw new Error(`gs://${plan.bucket}/${plan.object} already exists, so nothing was written. Pass overwrite: true to replace it.`);
          }
          throw err;
        }
      },
    }),
  ];
}
