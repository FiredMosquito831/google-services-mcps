/**
 * File content from a Google API: media downloads (alt=media), and answers that are not JSON (an image tile, a GeoTIFF,
 * a photo behind a redirect, an exported PDF). The HTTP layer reads such an answer as bytes and hands back a MediaBody;
 * the tools return one part of it that fits the result limit, so a file never reaches the model as text garbage or as
 * an empty object.
 *
 *  - Binary content: { mime_type, size_bytes, offset, bytes_read, next_offset?, data_base64 }. Parts are
 *    base64PartBytes(limit) bytes (a multiple of 3), so the base64 of the parts, joined in order, is the base64 of the file.
 *  - Text content asked for as media (alt=media of a text file, a caption track): the same fields with `text` in place of
 *    data_base64, cut at a character and at what fits the limit with its JSON escapes; next_offset counts bytes.
 *
 * JSON and text answers of every other request are parsed exactly as the HTTP library parses them (fromBytes).
 */
import { base64PartBytes, fitText } from './result-shape.js';

/** Bytes of a file, from `start` (the offset of the first byte, for a range answer) of a file of `total` bytes when known. */
export class MediaBody {
  constructor(
    readonly mimeType: string,
    readonly bytes: Buffer,
    readonly start: number = 0,
    readonly total?: number,
  ) {}
}

/** Content types read as text: text/*, JSON, XML, JavaScript, CSV, YAML and their +json / +xml forms. */
export function isTextual(mimeType: string): boolean {
  const type = mimeType.split(';')[0]!.trim().toLowerCase();
  return /^text\//.test(type) || /[/+](json|xml)$/.test(type) || /\/(javascript|x-javascript|csv|yaml|x-yaml|x-ndjson|ndjson)$/.test(type);
}

const isJsonType = (mimeType: string): boolean => /[/+]json$/.test(mimeType.split(';')[0]!.trim().toLowerCase());

/** Some value as bytes: an ArrayBuffer, a typed array or Buffer, a string. Anything else is not bytes. */
export function asBuffer(data: unknown): Buffer | undefined {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return undefined;
}

/**
 * The value of a body read as bytes. With `media`, always a MediaBody (the caller asked for the file): of the whole file,
 * or, for a range answer (206), from the range's start, of its total when the server gave it. Otherwise as the HTTP
 * library would parse it: no content type, text; JSON, parsed (else text); text/*, text; anything else, a MediaBody.
 * A value that is not bytes (already parsed) is returned as it is.
 */
export function fromBytes(
  data: unknown,
  contentType: string | null | undefined,
  opts: { media?: boolean; range?: { start: number; total?: number } } = {},
): unknown {
  const bytes = asBuffer(data);
  if (bytes === undefined) return data;
  const type = contentType ?? '';
  if (opts.media) {
    const mime = type || 'application/octet-stream';
    return opts.range ? new MediaBody(mime, bytes, opts.range.start, opts.range.total) : new MediaBody(mime, bytes, 0, bytes.length);
  }
  if (!type) return bytes.toString('utf8');
  if (isJsonType(type)) {
    const text = bytes.toString('utf8');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  if (isTextual(type)) return bytes.toString('utf8');
  return new MediaBody(type, bytes, 0, bytes.length);
}

/** The offset and total of a 206 answer's Content-Range ("bytes 100-199/1000"; the total may be "*"). */
export function contentRange(header: string | null | undefined): { start: number; total?: number } | undefined {
  const m = /^bytes\s+(\d+)-\d+\/(\d+|\*)$/i.exec(header?.trim() ?? '');
  if (!m) return undefined;
  return { start: Number(m[1]), ...(m[2] !== '*' ? { total: Number(m[2]) } : {}) };
}

/** The Range header for one part: the bytes from offset, as many as one part holds. */
export function rangeHeader(offset: number, maxResultChars: number): string {
  return `bytes=${offset}-${offset + base64PartBytes(maxResultChars) - 1}`;
}

/** The longest start of bytes that is whole UTF-8 characters (a cut multi-byte character is left for the next part). */
function wholeUtf8(bytes: Buffer): Buffer {
  let end = bytes.length;
  // Step back over continuation bytes (10xxxxxx) to the lead byte of the last character, then keep it only if complete.
  let i = end - 1;
  while (i >= 0 && i > end - 4 && (bytes[i]! & 0xc0) === 0x80) i--;
  if (i >= 0) {
    const lead = bytes[i]!;
    const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
    if (end - i < need) end = i;
  }
  return bytes.subarray(0, end);
}

export interface MediaPartOptions {
  /** The first byte the caller asked for. */
  offset: number;
  /** The result limit (GSM_MAX_RESULT_CHARS). */
  maxResultChars: number;
  /** False when the tool takes no offset: a part that is not the whole file says how to get it whole instead. */
  canContinue: boolean;
}

/** One part of a file as the tools return it (see the file comment). */
export function mediaPart(body: MediaBody, opts: MediaPartOptions): Record<string, unknown> {
  const { offset } = opts;
  const rel = offset - body.start;
  const total = body.total;
  if (rel < 0 || rel > body.bytes.length || (total !== undefined && offset > total)) {
    throw new Error(`offset ${offset} is past the end of the content${total !== undefined ? ` (${total} bytes)` : ''}.`);
  }
  const part = base64PartBytes(opts.maxResultChars);
  const available = body.bytes.subarray(rel, rel + part);
  let shown: Buffer;
  let field: Record<string, string>;
  if (isTextual(body.mimeType)) {
    const text = fitText(wholeUtf8(available).toString('utf8'), Number.MAX_SAFE_INTEGER, opts.maxResultChars - 1000);
    shown = Buffer.from(text, 'utf8');
    field = { text };
  } else {
    shown = available;
    field = { data_base64: available.toString('base64') };
  }
  const end = offset + shown.length;
  const more = total !== undefined ? end < total : rel + shown.length < body.bytes.length || shown.length === part;
  const out: Record<string, unknown> = {
    mime_type: body.mimeType,
    ...(total !== undefined ? { size_bytes: total } : {}),
    offset,
    bytes_read: shown.length,
    ...(more ? { next_offset: end } : {}),
  };
  if (more) {
    out.note = opts.canContinue
      ? `One part of the content. Call again with offset ${end} (and the same arguments) for the next part, until there is no next_offset; join the ${'text' in field ? 'text' : 'data_base64'} parts in order.`
      : `Only the first ${shown.length} bytes fit the result limit, and this tool takes no offset. Ask for a smaller file (a smaller size or resolution), or for a link to the content where the method offers one.`;
  }
  return { ...out, ...field };
}
