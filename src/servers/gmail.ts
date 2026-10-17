/**
 * Curated Gmail tools (gmail_*), served by the workspace-user server (MCP name "gws-user").
 * Read: search, get message, labels, list drafts. Write: create draft. Destructive: send draft (asks for approval first).
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type ToolDef } from '../core/tools.js';

type Auth = OAuth2Client | JWT;

// The account is chosen per call (see account-context.ts), so the client is not cached here.
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('workspace-user', cfg);
}

const ME = 'me';

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

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const gmailApi = async () => gmail({ version: 'v1', auth: await authFor(cfg) });

  return [
    // ---- read ----
    defineTool({
      name: 'gmail_search',
      title: 'Search Gmail',
      description: 'Search messages with Gmail search syntax. Returns ids, thread ids and From, Subject, Date headers. Use gmail_get_message for the body.',
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
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
      scopes: googleScopes('https://mail.google.com/', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
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
      scopes: googleScopes('https://mail.google.com/', 'gmail.labels', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
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
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify', 'gmail.readonly'),
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

    // ---- write ----
    defineTool({
      name: 'gmail_create_draft',
      title: 'Create Gmail draft',
      description: 'Save a plain text email as a draft. Does not send it; use gmail_send_draft for that.',
      kind: 'write',
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify'),
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

    // ---- destructive (asks for approval before each call) ----
    defineTool({
      name: 'gmail_send_draft',
      title: 'Send Gmail draft',
      description: 'Send an existing draft to its To, Cc and Bcc recipients. Sending cannot be undone.',
      kind: 'destructive',
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify'),
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
  ];
}
