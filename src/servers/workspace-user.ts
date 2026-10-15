#!/usr/bin/env node
/**
 * Google Workspace user-data server (MCP name "gws-user").
 *
 * Covers: Gmail (search, read, labels, drafts, create draft, send draft),
 * Drive (search, metadata, read text, create folder and text file, trash),
 * and Calendar (list calendars and events, read event, free/busy, create,
 * update, delete). Discovery-generated tools are appended at the end.
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import { drive, type drive_v3 } from '@googleapis/drive';
import { calendar, type calendar_v3 } from '@googleapis/calendar';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient } from '../core/auth.js';
import { defineTool, runServer, type ToolDef } from '../core/tools.js';
import { discoveryToolsFor } from '../core/discovery/tools.js';

type Auth = OAuth2Client | JWT;

let cachedAuth: Auth | undefined;
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  if (!cachedAuth) cachedAuth = await getAuthClient('workspace-user', cfg);
  return cachedAuth;
}

const ME = 'me';
const PRIMARY = 'primary';
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MIME_RE = /^[\w.+-]+\/[\w.+-]+$/;

/** Export targets for Google Workspace files read as text. Sheets have no text/plain export; CSV is the text form. */
const EXPORT_TEXT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

const rfc3339 = (field: string) =>
  z
    .string()
    .regex(RFC3339_RE, `${field} must be RFC 3339 with an offset, for example 2026-10-13T09:00:00+02:00 or 2026-10-13T07:00:00Z`);

// ---------- Gmail helpers ----------

const METADATA_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

function headerValue(msg: gmail_v1.Schema$Message | undefined, name: string): string | undefined {
  const target = name.toLowerCase();
  return msg?.payload?.headers?.find((h) => h.name?.toLowerCase() === target)?.value ?? undefined;
}

interface CollectedParts {
  plain: string[];
  html: string[];
  attachments: Array<{ filename: string; mime_type: string | null; size: number | null }>;
}

function decodeBody(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

/** Walks the MIME tree once, keeping decoded text parts and attachment names only. */
function collectParts(part: gmail_v1.Schema$MessagePart | undefined, out: CollectedParts = { plain: [], html: [], attachments: [] }): CollectedParts {
  if (!part) return out;
  if (part.filename) {
    out.attachments.push({ filename: part.filename, mime_type: part.mimeType ?? null, size: part.body?.size ?? null });
  } else if (part.mimeType === 'text/plain' && part.body?.data) {
    out.plain.push(decodeBody(part.body.data));
  } else if (part.mimeType === 'text/html' && part.body?.data) {
    out.html.push(decodeBody(part.body.data));
  }
  for (const child of part.parts ?? []) collectParts(child, out);
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function pickBody(parts: CollectedParts): { text: string; source: 'text/plain' | 'text/html' | 'none' } {
  if (parts.plain.length) return { text: parts.plain.join('\n'), source: 'text/plain' };
  if (parts.html.length) return { text: htmlToText(parts.html.join('\n')), source: 'text/html' };
  return { text: '', source: 'none' };
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function singleLine(value: string, field: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${field} must not contain line breaks.`);
  return value.trim();
}

function addresses(list: string[] | undefined, field: string): string[] {
  return (list ?? []).map((raw) => {
    const value = singleLine(raw, field);
    const addr = value.match(/<([^>]+)>/)?.[1] ?? value;
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(addr)) throw new Error(`${field} has an invalid email address: "${value}".`);
    return value;
  });
}

/** RFC 2047 encoded-word, split so each word stays under 75 characters and never splits a UTF-8 character. */
function encodeSubject(text: string): string {
  if (!/[^\x20-\x7e]/.test(text)) return text;
  const words: Buffer[] = [];
  let current = Buffer.alloc(0);
  for (const ch of text) {
    const bytes = Buffer.from(ch, 'utf8');
    if (current.length + bytes.length > 45) {
      words.push(current);
      current = Buffer.alloc(0);
    }
    current = Buffer.concat([current, bytes]);
  }
  if (current.length) words.push(current);
  return words.map((w) => `=?UTF-8?B?${w.toString('base64')}?=`).join(' ');
}

/** Builds an RFC 2822 text/plain message and returns it base64url-encoded, as users.drafts.create expects. */
function buildRawMessage(p: { to: string[]; cc: string[]; bcc: string[]; subject: string; body: string }): string {
  const headers = [`To: ${p.to.join(', ')}`];
  if (p.cc.length) headers.push(`Cc: ${p.cc.join(', ')}`);
  if (p.bcc.length) headers.push(`Bcc: ${p.bcc.join(', ')}`);
  headers.push(
    `Subject: ${encodeSubject(p.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  );
  const body = Buffer.from(p.body, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

function messageSummary(msg: gmail_v1.Schema$Message) {
  return {
    id: msg.id,
    thread_id: msg.threadId,
    from: headerValue(msg, 'From'),
    subject: headerValue(msg, 'Subject'),
    date: headerValue(msg, 'Date'),
  };
}

function ids(items: Array<{ id?: string | null }> | undefined): string[] {
  return (items ?? []).map((i) => i.id).filter((id): id is string => Boolean(id));
}

/** Runs fn over items in fixed-size groups so large result pages do not fan out into one burst of API calls. */
async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
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

// ---------- Calendar helpers ----------

function eventSummary(e: calendar_v3.Schema$Event) {
  return {
    id: e.id,
    summary: e.summary,
    status: e.status,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
    html_link: e.htmlLink,
  };
}

/** A date (YYYY-MM-DD) makes an all-day time; an RFC 3339 string with an offset makes a timed one. */
function eventTime(value: string, timeZone: string | undefined, field: string): calendar_v3.Schema$EventDateTime {
  if (DATE_RE.test(value)) return { date: value };
  if (RFC3339_RE.test(value)) return { dateTime: value, timeZone };
  throw new Error(`${field} must be YYYY-MM-DD (all-day) or RFC 3339 with an offset, got "${value}".`);
}

function checkSameKind(start: string, end: string): void {
  if (DATE_RE.test(start) !== DATE_RE.test(end)) {
    throw new Error('start and end must both be dates (all-day) or both be RFC 3339 date-times.');
  }
}

const calendarId = z.string().optional().describe('Calendar ID. Default "primary".');
const eventId = z.string().describe('Event ID, as returned by calendar_list_events.');
const sendUpdates = z
  .enum(['all', 'externalOnly', 'none'])
  .optional()
  .describe('Who gets invitation or change emails: all, externalOnly, or none. Default none.');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const gmailApi = async () => gmail({ version: 'v1', auth: await authFor(cfg) });
  const driveApi = async () => drive({ version: 'v3', auth: await authFor(cfg) });
  const calendarApi = async () => calendar({ version: 'v3', auth: await authFor(cfg) });

  return [
    // ---- read: Gmail ----
    defineTool({
      name: 'gmail_search',
      title: 'Search Gmail',
      description: 'Search messages with Gmail search syntax. Returns ids, thread ids and From, Subject, Date headers. Use gmail_get_message for the body.',
      kind: 'read',
      inputSchema: {
        q: z.string().optional().describe('Gmail search, for example "from:anna@example.com has:attachment newer_than:7d"'),
        max_results: z.number().int().min(1).max(100).optional().describe('1 to 100. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ q, max_results, page_token }) {
        const api = await gmailApi();
        const list = await api.users.messages.list({ userId: ME, q, maxResults: max_results ?? 20, pageToken: page_token });
        const messages = await inChunks(ids(list.data.messages), 10, async (id) => {
          const res = await api.users.messages.get({ userId: ME, id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
          return messageSummary(res.data);
        });
        return {
          messages,
          next_page_token: list.data.nextPageToken ?? undefined,
          result_size_estimate: list.data.resultSizeEstimate ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'gmail_get_message',
      title: 'Get Gmail message',
      description: 'Read one message. format "full" adds the decoded text body (plain text preferred, else stripped HTML) and attachment names.',
      kind: 'read',
      inputSchema: {
        id: z.string().describe('Message ID from gmail_search'),
        format: z.enum(['metadata', 'full']).optional().describe('metadata: headers only. full: headers, body and attachment names. Default full.'),
        max_body_chars: z.number().int().min(100).max(50000).optional().describe('Cap on body length in characters. Default 8000.'),
      },
      async handler({ id, format, max_body_chars }) {
        const fmt = format ?? 'full';
        const api = await gmailApi();
        const res = await api.users.messages.get({
          userId: ME,
          id,
          format: fmt,
          metadataHeaders: fmt === 'metadata' ? METADATA_HEADERS : undefined,
        });
        const msg = res.data;
        const base = {
          id: msg.id,
          thread_id: msg.threadId,
          label_ids: msg.labelIds ?? [],
          from: headerValue(msg, 'From'),
          to: headerValue(msg, 'To'),
          cc: headerValue(msg, 'Cc'),
          subject: headerValue(msg, 'Subject'),
          date: headerValue(msg, 'Date'),
        };
        if (fmt === 'metadata') return base;

        const parts = collectParts(msg.payload);
        const picked = pickBody(parts);
        const clipped = clip(picked.text, max_body_chars ?? 8000);
        return {
          ...base,
          body: clipped.text,
          body_source: picked.source,
          body_total_chars: picked.text.length,
          body_truncated: clipped.truncated,
          attachments: parts.attachments,
        };
      },
    }),
    defineTool({
      name: 'gmail_list_labels',
      title: 'List Gmail labels',
      description: 'List Gmail labels (system and user) with their ids and types.',
      kind: 'read',
      inputSchema: {},
      async handler() {
        const api = await gmailApi();
        const res = await api.users.labels.list({ userId: ME });
        return (res.data.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type }));
      },
    }),
    defineTool({
      name: 'gmail_list_drafts',
      title: 'List Gmail drafts',
      description: 'List drafts with their ids and To, Subject, Date headers. Use gmail_send_draft with a draft_id to send one.',
      kind: 'read',
      inputSchema: {
        max_results: z.number().int().min(1).max(100).optional().describe('1 to 100. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ max_results, page_token }) {
        const api = await gmailApi();
        const list = await api.users.drafts.list({ userId: ME, maxResults: max_results ?? 20, pageToken: page_token });
        const drafts = await inChunks(ids(list.data.drafts), 10, async (id) => {
          const res = await api.users.drafts.get({ userId: ME, id, format: 'metadata' });
          const msg = res.data.message;
          return {
            draft_id: res.data.id,
            message_id: msg?.id,
            thread_id: msg?.threadId,
            to: headerValue(msg, 'To'),
            subject: headerValue(msg, 'Subject'),
            date: headerValue(msg, 'Date'),
          };
        });
        return { drafts, next_page_token: list.data.nextPageToken ?? undefined };
      },
    }),

    // ---- read: Drive ----
    defineTool({
      name: 'drive_search',
      title: 'Search Drive',
      description: 'Search Drive files with Drive query syntax. Includes shared drives. Returns id, name, mimeType, modifiedTime, owners and webViewLink.',
      kind: 'read',
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

    // ---- read: Calendar ----
    defineTool({
      name: 'calendar_list_calendars',
      title: 'List calendars',
      description: 'List calendars in the account list, with id, summary, primary flag and access role.',
      kind: 'read',
      inputSchema: {},
      async handler() {
        const api = await calendarApi();
        const res = await api.calendarList.list({ maxResults: 250 });
        return (res.data.items ?? []).map((c) => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary ?? false,
          access_role: c.accessRole,
          time_zone: c.timeZone,
        }));
      },
    }),
    defineTool({
      name: 'calendar_list_events',
      title: 'List calendar events',
      description: 'List events in a time range, earliest first. Recurring events are expanded into instances by default.',
      kind: 'read',
      inputSchema: {
        calendar_id: calendarId,
        time_min: rfc3339('time_min').optional().describe('Start of range, RFC 3339. Default: now.'),
        time_max: rfc3339('time_max').optional().describe('End of range, RFC 3339. Default: no end.'),
        q: z.string().optional().describe('Free-text search over events'),
        max_results: z.number().int().min(1).max(250).optional().describe('1 to 250. Default 50.'),
        single_events: z.boolean().optional().describe('Expand recurring events into instances. Default true.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
      },
      async handler({ calendar_id, time_min, time_max, q, max_results, single_events, page_token }) {
        const api = await calendarApi();
        const expand = single_events ?? true;
        const res = await api.events.list({
          calendarId: calendar_id ?? PRIMARY,
          timeMin: time_min ?? new Date().toISOString(),
          timeMax: time_max,
          q,
          maxResults: max_results ?? 50,
          singleEvents: expand,
          // startTime ordering is only allowed when recurring events are expanded.
          orderBy: expand ? 'startTime' : undefined,
          pageToken: page_token,
        });
        return {
          events: (res.data.items ?? []).map(eventSummary),
          time_zone: res.data.timeZone,
          next_page_token: res.data.nextPageToken ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'calendar_get_event',
      title: 'Get calendar event',
      description: 'Read one event with description, organizer, attendees and response status.',
      kind: 'read',
      inputSchema: { calendar_id: calendarId, event_id: eventId },
      async handler({ calendar_id, event_id }) {
        const api = await calendarApi();
        const res = await api.events.get({ calendarId: calendar_id ?? PRIMARY, eventId: event_id });
        const e = res.data;
        return {
          ...eventSummary(e),
          description: e.description,
          organizer: e.organizer?.email,
          attendees: (e.attendees ?? []).slice(0, 100).map((a) => ({
            email: a.email,
            response_status: a.responseStatus,
            optional: a.optional ?? false,
            organizer: a.organizer ?? false,
          })),
          attendees_total: e.attendees?.length ?? 0,
          hangout_link: e.hangoutLink,
          recurrence: e.recurrence,
        };
      },
    }),
    defineTool({
      name: 'calendar_freebusy',
      title: 'Check free/busy',
      description: 'Return busy periods for one or more calendars in a time range. Event titles are not included.',
      kind: 'read',
      inputSchema: {
        time_min: rfc3339('time_min'),
        time_max: rfc3339('time_max'),
        calendar_ids: z.array(z.string()).optional().describe('Calendar IDs. Default ["primary"].'),
      },
      async handler({ time_min, time_max, calendar_ids }) {
        const api = await calendarApi();
        const items = (calendar_ids?.length ? calendar_ids : [PRIMARY]).map((id) => ({ id }));
        const res = await api.freebusy.query({ requestBody: { timeMin: time_min, timeMax: time_max, items } });
        const calendars = Object.fromEntries(
          Object.entries(res.data.calendars ?? {}).map(([id, c]) => [
            id,
            {
              busy: (c.busy ?? []).map((b) => ({ start: b.start, end: b.end })),
              errors: (c.errors ?? []).map((e) => e.reason ?? 'unknown'),
            },
          ]),
        );
        return { time_min, time_max, calendars };
      },
    }),

    // ---- write (registered only when GSM_ALLOW_WRITES=true) ----
    defineTool({
      name: 'gmail_create_draft',
      title: 'Create Gmail draft',
      description: 'Save a plain text email as a draft. Does not send it; use gmail_send_draft for that.',
      kind: 'write',
      inputSchema: {
        to: z.array(z.string()).describe('Recipient addresses. At least one.'),
        subject: z.string(),
        body: z.string().describe('Plain text body'),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      },
      async handler({ to, subject, body, cc, bcc }) {
        if (!to.length) throw new Error('gmail_create_draft needs at least one recipient in "to".');
        const api = await gmailApi();
        const raw = buildRawMessage({
          to: addresses(to, 'to'),
          cc: addresses(cc, 'cc'),
          bcc: addresses(bcc, 'bcc'),
          subject: singleLine(subject, 'subject'),
          body,
        });
        const res = await api.users.drafts.create({ userId: ME, requestBody: { message: { raw } } });
        return { draft_id: res.data.id, message_id: res.data.message?.id, thread_id: res.data.message?.threadId, to, subject };
      },
    }),
    defineTool({
      name: 'drive_create_folder',
      title: 'Create Drive folder',
      description: 'Create a folder in Drive, optionally inside a parent folder.',
      kind: 'write',
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
      name: 'calendar_create_event',
      title: 'Create calendar event',
      description:
        'Create an event. start and end are RFC 3339 date-times with an offset, or YYYY-MM-DD for an all-day event. Invitations go out only if send_updates says so.',
      kind: 'write',
      inputSchema: {
        calendar_id: calendarId,
        summary: z.string(),
        start: z.string().describe('RFC 3339 date-time with offset, or YYYY-MM-DD for all-day'),
        end: z.string().describe('RFC 3339 date-time with offset, or YYYY-MM-DD for all-day (end date is exclusive for all-day)'),
        time_zone: z.string().optional().describe('IANA time zone, for example Europe/Berlin'),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional().describe('Guest email addresses'),
        send_updates: sendUpdates,
      },
      async handler({ calendar_id, summary, start, end, time_zone, description, location, attendees, send_updates }) {
        checkSameKind(start, end);
        const api = await calendarApi();
        const res = await api.events.insert({
          calendarId: calendar_id ?? PRIMARY,
          sendUpdates: send_updates ?? 'none',
          requestBody: {
            summary,
            description,
            location,
            start: eventTime(start, time_zone, 'start'),
            end: eventTime(end, time_zone, 'end'),
            attendees: attendees?.length ? attendees.map((email) => ({ email })) : undefined,
          },
        });
        return eventSummary(res.data);
      },
    }),
    defineTool({
      name: 'calendar_update_event',
      title: 'Update calendar event',
      description:
        'Change only the fields given (events.patch). attendees, if given, replaces the whole guest list. Invitations go out only if send_updates says so.',
      kind: 'write',
      inputSchema: {
        calendar_id: calendarId,
        event_id: eventId,
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional().describe('RFC 3339 date-time with offset, or YYYY-MM-DD'),
        end: z.string().optional().describe('RFC 3339 date-time with offset, or YYYY-MM-DD'),
        time_zone: z.string().optional(),
        attendees: z.array(z.string()).optional().describe('Full guest email list; replaces the existing one'),
        send_updates: sendUpdates,
      },
      async handler({ calendar_id, event_id, summary, description, location, start, end, time_zone, attendees, send_updates }) {
        if (start !== undefined && end !== undefined) checkSameKind(start, end);
        const patch: calendar_v3.Schema$Event = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (start !== undefined) patch.start = eventTime(start, time_zone, 'start');
        if (end !== undefined) patch.end = eventTime(end, time_zone, 'end');
        if (attendees !== undefined) patch.attendees = attendees.map((email) => ({ email }));
        if (!Object.keys(patch).length) {
          throw new Error('calendar_update_event has nothing to change. Pass at least one of summary, description, location, start, end, attendees.');
        }
        const api = await calendarApi();
        const res = await api.events.patch({
          calendarId: calendar_id ?? PRIMARY,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
          requestBody: patch,
        });
        return eventSummary(res.data);
      },
    }),

    // ---- destructive (needs confirm=true). Previews read the item but change nothing. ----
    defineTool({
      name: 'gmail_send_draft',
      title: 'Send Gmail draft',
      description: 'Send an existing draft to its To, Cc and Bcc recipients. Sending cannot be undone.',
      kind: 'destructive',
      inputSchema: { draft_id: z.string() },
      async preview({ draft_id }) {
        const api = await gmailApi();
        const res = await api.users.drafts.get({ userId: ME, id: draft_id, format: 'full' });
        const msg = res.data.message;
        const body = pickBody(collectParts(msg?.payload)).text;
        return {
          draft_id,
          to: headerValue(msg, 'To') ?? null,
          cc: headerValue(msg, 'Cc') ?? null,
          bcc: headerValue(msg, 'Bcc') ?? null,
          subject: headerValue(msg, 'Subject') ?? '',
          body_preview: body.slice(0, 200),
          effect: 'Sends this draft now. This cannot be undone.',
        };
      },
      async handler({ draft_id }) {
        if (!draft_id) throw new Error('gmail_send_draft needs a draft_id.');
        const api = await gmailApi();
        const res = await api.users.drafts.send({ userId: ME, requestBody: { id: draft_id } });
        return { message_id: res.data.id, thread_id: res.data.threadId, label_ids: res.data.labelIds ?? [] };
      },
    }),
    defineTool({
      name: 'drive_trash_file',
      title: 'Trash Drive file',
      description: 'Move a Drive file to the trash. Never a permanent delete; the file can be restored from trash.',
      kind: 'destructive',
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
    defineTool({
      name: 'calendar_delete_event',
      title: 'Delete calendar event',
      description: 'Delete an event from a calendar. Guests are notified only if send_updates says so.',
      kind: 'destructive',
      inputSchema: { calendar_id: calendarId, event_id: eventId, send_updates: sendUpdates },
      async preview({ calendar_id, event_id, send_updates }) {
        const api = await calendarApi();
        const res = await api.events.get({ calendarId: calendar_id ?? PRIMARY, eventId: event_id });
        return {
          event_id,
          summary: res.data.summary,
          start: res.data.start?.dateTime ?? res.data.start?.date,
          send_updates: send_updates ?? 'none',
          effect: 'Deletes the event from this calendar.',
        };
      },
      async handler({ calendar_id, event_id, send_updates }) {
        const api = await calendarApi();
        await api.events.delete({
          calendarId: calendar_id ?? PRIMARY,
          eventId: event_id,
          sendUpdates: send_updates ?? 'none',
        });
        return { deleted: true, event_id };
      },
    }),
  ];
}

await runServer({
  name: 'gws-user',
  version: '0.1.0',
  buildTools: async (cfg) => [...(await buildTools(cfg)), ...(await discoveryToolsFor('gws-user', cfg))],
});
