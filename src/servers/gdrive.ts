/**
 * Curated Drive tools (drive_*) and Sheets tools (sheets_*), served by the gdrive server.
 * Read: search, list recent, get file, read text, download; Sheets get values.
 * Write: create folder, create text file, create file (a blank Google file or an upload); Sheets write values, insert rows.
 * Destructive: trash file (asks for approval first).
 *
 * Auth: OAuth user token from `gsm login workspace-user`. The local-file guard is in local-files.ts (shared with Gmail
 * attachments); the text of Office and OpenDocument files in office-text.ts.
 */
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { drive, type drive_v3 } from '@googleapis/drive';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { checkLocalFile, mimeTypeOf, protectedPaths } from './local-files.js';
import { OFFICE_TYPES, officeText } from './office-text.js';

type Auth = OAuth2Client | JWT;

// The account is chosen per call (see account-context.ts), so the client is not cached here.
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('workspace-user', cfg);
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_PREFIX = 'application/vnd.google-apps.';
const MIME_RE = /^[\w.+-]+\/[\w.+-]+$/;

/** Export targets for Google Workspace files read as text. Sheets have no text/plain export; CSV is the text form. */
const EXPORT_TEXT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

/** Default export types for drive_download: text, as Google's download_file_content defaults to; a drawing as PNG. */
const EXPORT_DEFAULT: Record<string, string> = {
  ...EXPORT_TEXT,
  'application/vnd.google-apps.drawing': 'image/png',
  'application/vnd.google-apps.script': 'application/vnd.google-apps.script+json',
};

/** Blank Google files drive_create_file makes, and the Google type an upload is converted to. */
const GOOGLE_TYPES = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
  folder: FOLDER_MIME,
} as const;

/** The largest Office or OpenDocument file drive_read_text downloads to read: 20 MB (the file is held in memory). */
export const OFFICE_READ_MAX_BYTES = 20 * 1024 * 1024;

/** At most this many pages of 100 comments are read with include_comments. */
const COMMENT_PAGES = 10;

function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

/** Bytes of a media or export answer, whatever form the HTTP layer gave them in. */
function bytesOf(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  throw new Error('Drive returned no file content.');
}

/** base64 text: the standard or the URL-safe alphabet, padding optional, whitespace ignored. */
const BASE64_RE = /^[A-Za-z0-9+/_-]*={0,2}$/;

// ---------- Drive helpers ----------

function driveSummary(f: drive_v3.Schema$File) {
  return {
    id: f.id,
    name: f.name,
    mime_type: f.mimeType,
    modified_time: f.modifiedTime,
    owners: (f.owners ?? []).map((o) => o.emailAddress ?? o.displayName),
    web_view_link: f.webViewLink,
  };
}

/** Recent-file orders, as Google's list_recent_files names them, and the Drive orderBy each one sends. */
const RECENT_ORDER = {
  recency: 'recency desc',
  lastModified: 'modifiedTime desc',
  lastModifiedByMe: 'modifiedByMeTime desc',
  viewedByMe: 'viewedByMeTime desc',
} as const;

// ---------- Sheets (requests on the auth client: this package has no Sheets client library) ----------

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const VALUE_RENDER = { formatted: 'FORMATTED_VALUE', unformatted: 'UNFORMATTED_VALUE', formula: 'FORMULA' } as const;

/** data: values are stored as given (RAW), so "=A1+B1" stays text. formulas: parsed as if typed (USER_ENTERED). */
export const VALUE_INPUT = { data: 'RAW', formulas: 'USER_ENTERED' } as const;

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const spreadsheetId = z.string().min(1).describe('The spreadsheet ID (the file ID in Drive, the long part of its URL).');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const driveApi = async () => drive({ version: 'v3', auth: await authFor(cfg) });
  const sheetsRequest = async <T>(opts: { url: string; method: 'GET' | 'PUT' | 'POST'; params?: Record<string, unknown>; data?: unknown }): Promise<T> => {
    const auth = (await authFor(cfg)) as OAuth2Client;
    return (await auth.request<T>(opts)).data;
  };
  // Room for the JSON around base64 data: the whole answer must fit the result limit, or it would be cut.
  const room = cfg.maxResultChars - 1000;

  /** Comment threads of a file, for drive_read_text with include_comments. Bounded: COMMENT_PAGES pages of 100. */
  async function readComments(api: drive_v3.Drive, fileId: string): Promise<{ comments: Array<Record<string, unknown>>; more: boolean }> {
    const comments: Array<Record<string, unknown>> = [];
    let pageToken: string | undefined;
    for (let page = 0; page < COMMENT_PAGES; page++) {
      const res = await api.comments.list({
        fileId,
        pageSize: 100,
        pageToken,
        // Drive's comment methods need fields.
        fields:
          'nextPageToken, comments(id, author(displayName, emailAddress), content, quotedFileContent(value), resolved, createdTime, deleted, replies(author(displayName, emailAddress), content, createdTime, deleted))',
      });
      for (const c of res.data.comments ?? []) {
        if (c.deleted) continue;
        comments.push({
          id: c.id,
          author: c.author?.emailAddress ?? c.author?.displayName,
          content: c.content,
          ...(c.quotedFileContent?.value ? { quoted_text: c.quotedFileContent.value } : {}),
          resolved: c.resolved ?? false,
          created_time: c.createdTime,
          replies: (c.replies ?? [])
            .filter((r) => !r.deleted)
            .map((r) => ({ author: r.author?.emailAddress ?? r.author?.displayName, content: r.content, created_time: r.createdTime })),
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) return { comments, more: false };
    }
    return { comments, more: true };
  }

  return [
    // ---- read ----
    defineTool({
      name: 'drive_search',
      title: 'Search Drive',
      description:
        "Search Drive files with Drive query syntax (matches search_files in Google's Drive MCP server, which takes its own query dialect: here it is Drive's q, such as \"name contains 'report'\" or \"'<folder id>' in parents\"). Includes shared drives. Returns id, name, mimeType, modifiedTime, owners and webViewLink.",
      kind: 'read',
      scopes: googleScopes('drive', 'drive.metadata', 'drive.metadata.readonly', 'drive.readonly'),
      inputSchema: {
        q: z.string().optional().describe("Drive query, for example \"name contains 'report' and trashed = false\""),
        page_size: z.number().int().min(1).max(100).optional().describe('1 to 100. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ q, page_size, page_token }) {
        const api = await driveApi();
        const res = await api.files.list({
          q,
          pageSize: page_size ?? 20,
          pageToken: page_token,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, owners(displayName, emailAddress), webViewLink)',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });
        return { files: (res.data.files ?? []).map(driveSummary), next_page_token: res.data.nextPageToken ?? undefined };
      },
    }),
    defineTool({
      name: 'drive_list_recent',
      title: 'List recent Drive files',
      description:
        "List the most recent files, newest first (matches list_recent_files in Google's Drive MCP server). order_by: recency (the latest of the file's dates, the default), lastModified (by anyone), lastModifiedByMe or viewedByMe. Folders and trashed files are left out. 10 a page by default.",
      kind: 'read',
      scopes: googleScopes('drive', 'drive.metadata', 'drive.metadata.readonly', 'drive.readonly'),
      inputSchema: {
        order_by: z.enum(['recency', 'lastModified', 'lastModifiedByMe', 'viewedByMe']).optional().describe('Default recency.'),
        page_size: z.number().int().min(1).max(100).optional().describe('1 to 100. Default 10.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ order_by, page_size, page_token }) {
        const api = await driveApi();
        const res = await api.files.list({
          q: `trashed = false and mimeType != '${FOLDER_MIME}'`,
          orderBy: RECENT_ORDER[order_by ?? 'recency'],
          pageSize: page_size ?? 10,
          pageToken: page_token,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, modifiedByMeTime, viewedByMeTime, owners(displayName, emailAddress), webViewLink)',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });
        return {
          order_by: order_by ?? 'recency',
          files: (res.data.files ?? []).map((f) => ({ ...driveSummary(f), modified_by_me_time: f.modifiedByMeTime ?? null, viewed_by_me_time: f.viewedByMeTime ?? null })),
          next_page_token: res.data.nextPageToken ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'drive_get_file',
      title: 'Get Drive file',
      description:
        "Get metadata for one Drive file (matches get_file_metadata in Google's Drive MCP server): name, type, size, description, extension, dates (created, modified, last viewed by you, shared with you), owners, parents, whether it can hold files, and link. Drive's API has no content snippet; read the content with drive_read_text.",
      kind: 'read',
      scopes: googleScopes('drive', 'drive.metadata', 'drive.metadata.readonly', 'drive.readonly'),
      inputSchema: { file_id: z.string() },
      async handler({ file_id }) {
        const api = await driveApi();
        const res = await api.files.get({
          fileId: file_id,
          fields:
            'id, name, mimeType, size, createdTime, modifiedTime, owners(displayName, emailAddress), parents, trashed, webViewLink, description, fileExtension, viewedByMeTime, sharedWithMeTime, capabilities(canAddChildren)',
          supportsAllDrives: true,
        });
        const f = res.data;
        return {
          ...driveSummary(f),
          size: f.size,
          created_time: f.createdTime,
          parents: f.parents,
          trashed: f.trashed,
          // Added in 1.9.0 (Google's get_file_metadata returns these).
          description: f.description ?? null,
          file_extension: f.fileExtension ?? null,
          viewed_by_me_time: f.viewedByMeTime ?? null,
          shared_with_me_time: f.sharedWithMeTime ?? null,
          can_add_children: f.capabilities?.canAddChildren ?? false,
        };
      },
    }),
    defineTool({
      name: 'drive_read_text',
      title: 'Read Drive file as text',
      description:
        `Read the text of a file (matches read_file_content in Google's Drive MCP server): Google Docs and Slides as plain text, Sheets as CSV, text/* files, and Word, Excel and PowerPoint (docx, xlsx, pptx) and OpenDocument (odt, ods, odp) files up to ${OFFICE_READ_MAX_BYTES / 1024 / 1024} MB, whose text is taken from the downloaded file (Drive exports only Google files). PDF and image text is not read: Drive has no public text-extraction call; use drive_download for the bytes. include_comments adds the file's comment threads.`,
      kind: 'read',
      scopes: googleScopes('drive', 'drive.readonly'),
      inputSchema: {
        file_id: z.string(),
        max_chars: z.number().int().min(100).max(200000).optional().describe('Cap on returned characters. Default 20000.'),
        include_comments: z.boolean().optional().describe('Also return the comment threads (author, text, quoted text, replies, resolved). Default false.'),
      },
      async handler({ file_id, max_chars, include_comments }) {
        const api = await driveApi();
        const meta = await api.files.get({ fileId: file_id, fields: 'id, name, mimeType', supportsAllDrives: true });
        const mime = meta.data.mimeType ?? '';
        const exportMime = EXPORT_TEXT[mime];

        let raw: unknown;
        let source: string | undefined;
        if (exportMime) {
          raw = (await api.files.export({ fileId: file_id, mimeType: exportMime }, { responseType: 'text' })).data;
        } else if (mime.startsWith('text/')) {
          raw = (await api.files.get({ fileId: file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' })).data;
        } else if (OFFICE_TYPES[mime]) {
          const sized = await api.files.get({ fileId: file_id, fields: 'size', supportsAllDrives: true });
          const size = Number(sized.data.size ?? 0);
          if (size > OFFICE_READ_MAX_BYTES) {
            throw new Error(
              `"${meta.data.name ?? file_id}" is ${size} bytes, over the ${OFFICE_READ_MAX_BYTES} bytes drive_read_text reads from an Office file. Open it in Drive, or convert it to a Google file there and read that.`,
            );
          }
          const media = await api.files.get({ fileId: file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
          raw = officeText(bytesOf(media.data), mime);
          source = 'text taken from the downloaded file';
        } else {
          throw new Error(
            `Cannot read "${meta.data.name ?? file_id}" as text (mimeType ${mime || 'unknown'}). drive_read_text supports Google Docs, Sheets, Slides, text/* files and Office or OpenDocument files (docx, xlsx, pptx, odt, ods, odp). Use drive_download for the bytes, or drive_get_file for metadata.`,
          );
        }
        if (typeof raw !== 'string') throw new Error('Drive returned no text content for this file.');

        const clipped = clip(raw, max_chars ?? 20000);
        const base = {
          id: meta.data.id,
          name: meta.data.name,
          mime_type: mime,
          text: clipped.text,
          text_total_chars: raw.length,
          truncated: clipped.truncated,
          ...(source ? { text_source: source } : {}),
        };
        if (include_comments !== true) return base;
        const read = await readComments(api, file_id);
        return { ...base, comments: read.comments, ...(read.more ? { comments_note: `Only the first ${COMMENT_PAGES * 100} comment threads were read.` } : {}) };
      },
    }),
    defineTool({
      name: 'drive_download',
      title: 'Download Drive file',
      description: `Download a file's content as base64 (matches download_file_content in Google's Drive MCP server). A Google Docs, Sheets, Slides or Drawings file is exported to export_mime_type (default: text/plain for Docs and Slides, text/csv for Sheets, image/png for Drawings; for example application/pdf or the Office type). The base64 text must fit this server's result limit (GSM_MAX_RESULT_CHARS, now ${cfg.maxResultChars} characters, so files up to about ${Math.floor(((cfg.maxResultChars - 1000) * 3) / 4)} bytes); a larger file returns its size and a note instead, and is not downloaded when Drive reports its size. For readable text, drive_read_text is smaller.`,
      kind: 'read',
      scopes: googleScopes('drive', 'drive.file', 'drive.readonly'),
      inputSchema: {
        file_id: z.string(),
        export_mime_type: z.string().optional().describe('Google files only: the type to export to, for example application/pdf. Ignored for other files.'),
      },
      async handler({ file_id, export_mime_type }) {
        const api = await driveApi();
        const meta = await api.files.get({ fileId: file_id, fields: 'id, name, mimeType, size', supportsAllDrives: true });
        const mime = meta.data.mimeType ?? '';
        const name = meta.data.name ?? file_id;
        const tooLarge = (bytes: number, contentType: string) => ({
          id: meta.data.id,
          name,
          mime_type: contentType,
          size_bytes: bytes,
          data_base64: null,
          note: `The content is ${bytes} bytes, ${Math.ceil(bytes / 3) * 4} characters as base64, over this server's result limit of ${cfg.maxResultChars} characters (GSM_MAX_RESULT_CHARS). Raise GSM_MAX_RESULT_CHARS to at least ${Math.ceil(bytes / 3) * 4 + 1000} to download it here, or open it in Drive.`,
        });
        let data: Buffer;
        let contentType: string;
        if (mime.startsWith(GOOGLE_PREFIX)) {
          contentType = export_mime_type ?? EXPORT_DEFAULT[mime] ?? '';
          if (!contentType) throw new Error(`"${name}" is a ${mime} file, which has no default export. Give export_mime_type, for example application/pdf.`);
          if (!MIME_RE.test(contentType)) throw new Error(`export_mime_type "${contentType}" is not a valid content type.`);
          data = bytesOf((await api.files.export({ fileId: file_id, mimeType: contentType }, { responseType: 'arraybuffer' })).data);
        } else {
          contentType = mime || 'application/octet-stream';
          const reported = Number(meta.data.size ?? NaN);
          if (Number.isFinite(reported) && Math.ceil(reported / 3) * 4 > room) return tooLarge(reported, contentType);
          data = bytesOf((await api.files.get({ fileId: file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })).data);
        }
        const base64 = data.toString('base64');
        if (base64.length > room) return tooLarge(data.length, contentType);
        return { id: meta.data.id, name, mime_type: contentType, size_bytes: data.length, data_base64: base64 };
      },
    }),
    defineTool({
      name: 'sheets_get_values',
      title: 'Read spreadsheet values',
      description:
        "Read a range of a Google Sheet (matches get_values in Google's Sheets MCP server), for example \"Sheet1!A1:D20\" or \"Sheet1\". value_render: formatted (as shown, the default), unformatted (numbers as numbers) or formula (the formulas). Empty trailing rows and columns are left out by Google.",
      kind: 'read',
      scopes: googleScopes('drive', 'drive.file', 'drive.readonly', 'spreadsheets', 'spreadsheets.readonly'),
      inputSchema: {
        spreadsheet_id: spreadsheetId,
        range: z.string().min(1).describe('A1 notation, for example "Sheet1!A1:D20", "Sheet1" or a named range.'),
        value_render: z.enum(['formatted', 'unformatted', 'formula']).optional().describe('Default formatted.'),
      },
      async handler({ spreadsheet_id, range, value_render }) {
        const res = await sheetsRequest<{ range?: string; majorDimension?: string; values?: unknown[][] }>({
          url: `${SHEETS}/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}`,
          method: 'GET',
          params: { valueRenderOption: VALUE_RENDER[value_render ?? 'formatted'] },
        });
        const values = res.values ?? [];
        return { range: res.range, rows: values.length, columns: values.reduce((n, row) => Math.max(n, row.length), 0), values };
      },
    }),

    // ---- write ----
    defineTool({
      name: 'drive_create_folder',
      title: 'Create Drive folder',
      description: 'Create a folder in Drive, optionally inside a parent folder.',
      kind: 'write',
      scopes: googleScopes('drive', 'drive.file'),
      inputSchema: {
        name: z.string().min(1),
        parent_id: z.string().optional().describe('ID of the parent folder. Omit for My Drive root.'),
      },
      async handler({ name, parent_id }) {
        const api = await driveApi();
        const res = await api.files.create({
          requestBody: { name, mimeType: FOLDER_MIME, parents: parent_id ? [parent_id] : undefined },
          fields: 'id, name, mimeType, webViewLink',
          supportsAllDrives: true,
        });
        return { id: res.data.id, name: res.data.name, mime_type: res.data.mimeType, web_view_link: res.data.webViewLink };
      },
    }),
    defineTool({
      name: 'drive_create_text_file',
      title: 'Create Drive text file',
      description: 'Upload a text file to Drive with the given content. Google Workspace types are not created here; use drive_create_folder for folders.',
      kind: 'write',
      scopes: googleScopes('drive', 'drive.file'),
      inputSchema: {
        name: z.string().min(1),
        content: z.string(),
        mime_type: z.string().optional().describe('Content type. Default text/plain.'),
        parent_id: z.string().optional().describe('ID of the parent folder. Omit for My Drive root.'),
      },
      async handler({ name, content, mime_type, parent_id }) {
        const mime = mime_type ?? 'text/plain';
        if (!MIME_RE.test(mime)) throw new Error(`mime_type "${mime}" is not a valid content type.`);
        if (mime.startsWith('application/vnd.google-apps.')) {
          throw new Error('drive_create_text_file cannot create Google Workspace types. Use a regular content type such as text/plain or text/markdown.');
        }
        const api = await driveApi();
        // requestBody plus media makes googleapis send a multipart/related upload.
        const res = await api.files.create({
          requestBody: { name, mimeType: mime, parents: parent_id ? [parent_id] : undefined },
          media: { mimeType: mime, body: content },
          fields: 'id, name, mimeType, webViewLink',
          supportsAllDrives: true,
        });
        return { id: res.data.id, name: res.data.name, mime_type: res.data.mimeType, web_view_link: res.data.webViewLink };
      },
    }),
    defineTool({
      name: 'drive_create_file',
      title: 'Create or upload Drive file',
      description:
        "Create a file in Drive (matches create_file in Google's Drive MCP server): a blank Google Doc, Sheet, Slides or folder (google_type alone), or a file from text_content, base64_content or a local file (local_path, a full path; files in the folder that holds the Google sign-in data are refused). With google_type and content, Drive converts the content to that Google type (for example docx or text to a Doc, xlsx or csv to a Sheet, pptx to Slides); without google_type the file keeps its own type. Google's server converts by default; here conversion is asked for with google_type. One request uploads the content (uploadType=multipart).",
      kind: 'write',
      scopes: googleScopes('drive', 'drive.file'),
      inputSchema: {
        name: z.string().min(1).describe('The file name (title).'),
        google_type: z
          .enum(['document', 'spreadsheet', 'presentation', 'folder'])
          .optional()
          .describe('A blank Google file of this type, or with content: convert the content to this type. folder takes no content.'),
        text_content: z.string().optional().describe('UTF-8 text to upload. One of text_content, base64_content and local_path.'),
        base64_content: z.string().optional().describe('base64 bytes to upload (for binary content).'),
        local_path: z.string().optional().describe('Full path of a local file to upload.'),
        content_mime_type: z
          .string()
          .optional()
          .describe('The type of the content. Default: text/plain for text_content, by extension for local_path; required for base64_content.'),
        parent_id: z.string().optional().describe('ID of the parent folder. Omit for My Drive root.'),
      },
      async handler({ name, google_type, text_content, base64_content, local_path, content_mime_type, parent_id }) {
        const given = [text_content, base64_content, local_path].filter((v) => v !== undefined).length;
        if (given > 1) throw new Error('Give one of text_content, base64_content and local_path, not several.');
        if (given === 0 && google_type === undefined) throw new Error('drive_create_file needs google_type (a blank Google file) or content (text_content, base64_content or local_path).');
        if (given === 1 && google_type === 'folder') throw new Error('A folder takes no content.');
        const parents = parent_id ? [parent_id] : undefined;
        const fields = 'id, name, mimeType, webViewLink, size';
        const api = await driveApi();

        if (given === 0) {
          const res = await api.files.create({ requestBody: { name, mimeType: GOOGLE_TYPES[google_type as keyof typeof GOOGLE_TYPES], parents }, fields, supportsAllDrives: true });
          return { id: res.data.id, name: res.data.name, mime_type: res.data.mimeType, web_view_link: res.data.webViewLink, source: 'blank' };
        }

        let body: string | Readable;
        let contentType: string;
        let bytes: number;
        let source: string;
        if (text_content !== undefined) {
          body = text_content;
          contentType = content_mime_type ?? 'text/plain';
          bytes = Buffer.byteLength(text_content, 'utf8');
          source = 'text_content';
        } else if (base64_content !== undefined) {
          if (!content_mime_type) throw new Error('base64_content needs content_mime_type, for example application/pdf.');
          const compact = base64_content.replace(/\s+/g, '');
          if (!BASE64_RE.test(compact)) throw new Error('base64_content is not base64 text.');
          const buf = Buffer.from(compact, compact.includes('-') || compact.includes('_') ? 'base64url' : 'base64');
          // googleapis takes a string or a stream for the media body, not a Buffer.
          body = Readable.from([buf]);
          contentType = content_mime_type;
          bytes = buf.length;
          source = 'base64_content';
        } else {
          const file = checkLocalFile(local_path as string, protectedPaths(cfg), 'File');
          body = createReadStream(file.path);
          contentType = content_mime_type ?? mimeTypeOf(file.path);
          bytes = file.size;
          source = 'local_path';
        }
        if (!MIME_RE.test(contentType)) throw new Error(`content_mime_type "${contentType}" is not a valid content type.`);
        if (contentType.startsWith(GOOGLE_PREFIX)) throw new Error('content_mime_type is the type of the content you upload, not a Google type. To convert, give google_type.');
        const target = google_type ? GOOGLE_TYPES[google_type] : contentType;
        // requestBody plus media makes googleapis send a multipart/related upload to /upload/drive/v3/files.
        const res = await api.files.create({
          requestBody: { name, mimeType: target, parents },
          media: { mimeType: contentType, body },
          fields,
          supportsAllDrives: true,
        });
        return {
          id: res.data.id,
          name: res.data.name,
          mime_type: res.data.mimeType,
          web_view_link: res.data.webViewLink,
          source,
          uploaded_bytes: bytes,
          ...(google_type ? { converted_from: contentType } : {}),
        };
      },
    }),
    defineTool({
      name: 'sheets_write_values',
      title: 'Write spreadsheet values',
      description:
        "Write values into a range of a Google Sheet (matches update_values and update_formulas in Google's Sheets MCP server). value_input says how they are read, and must be given: data stores them as given (RAW: \"=A1+B1\" stays text, \"1/2\" stays text), formulas parses them as if typed (USER_ENTERED: formulas, numbers and dates). values is a list of rows; null leaves a cell as it is, \"\" empties it. It overwrites the cells of the range.",
      kind: 'write',
      scopes: googleScopes('drive', 'drive.file', 'spreadsheets'),
      inputSchema: {
        spreadsheet_id: spreadsheetId,
        range: z.string().min(1).describe('A1 notation of the top-left cell or the whole range, for example "Sheet1!A1" or "Sheet1!A1:C3".'),
        values: z.array(z.array(cell)).min(1).describe('Rows of cells: strings, numbers, booleans or null.'),
        value_input: z.enum(['data', 'formulas']).describe('data: stored as given (RAW). formulas: parsed as if typed (USER_ENTERED).'),
      },
      async handler({ spreadsheet_id, range, values, value_input }) {
        const option = VALUE_INPUT[value_input];
        const res = await sheetsRequest<{ updatedRange?: string; updatedRows?: number; updatedColumns?: number; updatedCells?: number }>({
          url: `${SHEETS}/${encodeURIComponent(spreadsheet_id)}/values/${encodeURIComponent(range)}`,
          method: 'PUT',
          params: { valueInputOption: option },
          data: { range, majorDimension: 'ROWS', values },
        });
        return {
          value_input,
          value_input_option: option,
          updated_range: res.updatedRange,
          updated_rows: res.updatedRows ?? 0,
          updated_columns: res.updatedColumns ?? 0,
          updated_cells: res.updatedCells ?? 0,
        };
      },
    }),
    defineTool({
      name: 'sheets_insert_rows',
      title: 'Insert spreadsheet rows or columns',
      description:
        "Insert empty rows (or columns) into a sheet at a position (matches insert_dimension in Google's Sheets MCP server). sheet_id is the sheet's numeric id (properties.sheetId from sheets_spreadsheets_get; 0 is often the first sheet). start_index is 0-based and inclusive, end_index exclusive: start 2, end 5 inserts three rows before row 3. Rows below move down.",
      kind: 'write',
      scopes: googleScopes('drive', 'drive.file', 'spreadsheets'),
      inputSchema: {
        spreadsheet_id: spreadsheetId,
        sheet_id: z.number().int().min(0).describe('The numeric sheet id (not its name).'),
        start_index: z.number().int().min(0).describe('0-based index of the first new row or column.'),
        end_index: z.number().int().min(1).describe('0-based index after the last new row or column (exclusive).'),
        dimension: z.enum(['ROWS', 'COLUMNS']).optional().describe('Default ROWS.'),
        inherit_from_before: z.boolean().optional().describe('Take formatting from the row or column before (start_index above 0), else from the one after. Default false.'),
      },
      async handler({ spreadsheet_id, sheet_id, start_index, end_index, dimension, inherit_from_before }) {
        if (end_index <= start_index) throw new Error('end_index must be greater than start_index (it is exclusive).');
        if (inherit_from_before === true && start_index === 0) throw new Error('inherit_from_before needs start_index above 0: there is nothing before the first row or column.');
        const dim = dimension ?? 'ROWS';
        await sheetsRequest<unknown>({
          url: `${SHEETS}/${encodeURIComponent(spreadsheet_id)}:batchUpdate`,
          method: 'POST',
          data: {
            requests: [
              {
                insertDimension: {
                  range: { sheetId: sheet_id, dimension: dim, startIndex: start_index, endIndex: end_index },
                  inheritFromBefore: inherit_from_before === true,
                },
              },
            ],
          },
        });
        return { spreadsheet_id, sheet_id, dimension: dim, inserted: end_index - start_index, start_index, end_index };
      },
    }),

    // ---- destructive (asks for approval before each call) ----
    defineTool({
      name: 'drive_trash_file',
      title: 'Trash Drive file',
      description: 'Move a Drive file to the trash. Never a permanent delete; the file can be restored from trash.',
      kind: 'destructive',
      scopes: googleScopes('drive', 'drive.file', 'drive.metadata'),
      inputSchema: { file_id: z.string() },
      async preview({ file_id }) {
        const api = await driveApi();
        const res = await api.files.get({ fileId: file_id, fields: 'id, name, mimeType, trashed', supportsAllDrives: true });
        return {
          file_id,
          name: res.data.name,
          mime_type: res.data.mimeType,
          already_trashed: res.data.trashed ?? false,
          effect: 'Moves the file to Drive trash. Restorable from trash.',
        };
      },
      async handler({ file_id }) {
        const api = await driveApi();
        const res = await api.files.update({
          fileId: file_id,
          requestBody: { trashed: true },
          fields: 'id, name, trashed',
          supportsAllDrives: true,
        });
        return { id: res.data.id, name: res.data.name, trashed: res.data.trashed };
      },
    }),
  ];
}
