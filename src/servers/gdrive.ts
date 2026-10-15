/**
 * Curated Drive tools (drive_*), served by the workspace-user server (MCP name "gws-user").
 * Read: search, get file, read text. Write: create folder, create text file. Destructive: trash file (asks for approval first).
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { drive, type drive_v3 } from '@googleapis/drive';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';

type Auth = OAuth2Client | JWT;

let cachedAuth: Auth | undefined;
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  if (!cachedAuth) cachedAuth = await getAuthClient('workspace-user', cfg);
  return cachedAuth;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MIME_RE = /^[\w.+-]+\/[\w.+-]+$/;

/** Export targets for Google Workspace files read as text. Sheets have no text/plain export; CSV is the text form. */
const EXPORT_TEXT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

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

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const driveApi = async () => drive({ version: 'v3', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'drive_search',
      title: 'Search Drive',
      description: 'Search Drive files with Drive query syntax. Includes shared drives. Returns id, name, mimeType, modifiedTime, owners and webViewLink.',
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
      name: 'drive_get_file',
      title: 'Get Drive file',
      description: 'Get metadata for one Drive file: name, type, size, dates, owners, parents and link.',
      kind: 'read',
      scopes: googleScopes('drive', 'drive.metadata', 'drive.metadata.readonly', 'drive.readonly'),
      inputSchema: { file_id: z.string() },
      async handler({ file_id }) {
        const api = await driveApi();
        const res = await api.files.get({
          fileId: file_id,
          fields: 'id, name, mimeType, size, createdTime, modifiedTime, owners(displayName, emailAddress), parents, trashed, webViewLink',
          supportsAllDrives: true,
        });
        const f = res.data;
        return {
          ...driveSummary(f),
          size: f.size,
          created_time: f.createdTime,
          parents: f.parents,
          trashed: f.trashed,
        };
      },
    }),
    defineTool({
      name: 'drive_read_text',
      title: 'Read Drive file as text',
      description:
        'Read the text of a Google Doc (plain text), Slides (plain text), Sheets (CSV) or text/* file. Other types return an error.',
      kind: 'read',
      scopes: googleScopes('drive', 'drive.readonly'),
      inputSchema: {
        file_id: z.string(),
        max_chars: z.number().int().min(100).max(200000).optional().describe('Cap on returned characters. Default 20000.'),
      },
      async handler({ file_id, max_chars }) {
        const api = await driveApi();
        const meta = await api.files.get({ fileId: file_id, fields: 'id, name, mimeType', supportsAllDrives: true });
        const mime = meta.data.mimeType ?? '';
        const exportMime = EXPORT_TEXT[mime];

        let raw: unknown;
        if (exportMime) {
          raw = (await api.files.export({ fileId: file_id, mimeType: exportMime }, { responseType: 'text' })).data;
        } else if (mime.startsWith('text/')) {
          raw = (await api.files.get({ fileId: file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' })).data;
        } else {
          throw new Error(
            `Cannot read "${meta.data.name ?? file_id}" as text (mimeType ${mime || 'unknown'}). drive_read_text supports Google Docs, Sheets, Slides and text/* files. Use drive_get_file for metadata.`,
          );
        }
        if (typeof raw !== 'string') throw new Error('Drive returned no text content for this file.');

        const clipped = clip(raw, max_chars ?? 20000);
        return {
          id: meta.data.id,
          name: meta.data.name,
          mime_type: mime,
          text: clipped.text,
          text_total_chars: raw.length,
          truncated: clipped.truncated,
        };
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
