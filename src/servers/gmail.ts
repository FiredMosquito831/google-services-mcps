/**
 * Curated Gmail tools (gmail_*), served by the gmail server.
 * Read: search, search threads, get message, get thread, get attachment, labels, list drafts.
 * Write: create draft, label, unlabel, untrash.
 * Destructive (they ask first): send draft, send, reply (sending cannot be undone), trash.
 *
 * Auth: OAuth user token from `gsm login workspace-user`. The MIME and decoding rules are in gmail-mime.ts.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import type { JWT, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { requestedAccount } from '../core/account-context.js';
import { defineTool, type PreparedAction, type ToolDef } from '../core/tools.js';
import { checkLocalFile, mimeTypeOf, protectedPaths } from './local-files.js';
import {
  GMAIL_JSON_RAW_MAX_BYTES,
  GMAIL_MAX_MESSAGE_BYTES,
  base64LinesLength,
  buildMime,
  charsetOf,
  checkAddress,
  decodeText,
  escapeHtml,
  htmlToText,
  quoteHtml,
  quoteText,
  replyRecipients,
  replyReferences,
  replySubject,
  singleLine,
  tidyText,
  type MimeAttachment,
} from './gmail-mime.js';

type Auth = OAuth2Client | JWT;
type Gmail = gmail_v1.Gmail;

// The account is chosen per call (see account-context.ts), so the client is not cached here.
async function authFor(cfg: RuntimeConfig): Promise<Auth> {
  return getAuthClient('workspace-user', cfg);
}

const ME = 'me';

// ---------- Gmail helpers ----------

const METADATA_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

function headerValue(msg: gmail_v1.Schema$Message | undefined, name: string): string | undefined {
  return partHeader(msg?.payload, name);
}

function partHeader(part: gmail_v1.Schema$MessagePart | undefined, name: string): string | undefined {
  const target = name.toLowerCase();
  return part?.headers?.find((h) => h.name?.toLowerCase() === target)?.value ?? undefined;
}

interface AttachmentInfo {
  filename: string;
  mime_type: string | null;
  size: number | null;
  /** The id gmail_get_attachment takes. Null when Gmail sent the content inline (small parts). */
  attachment_id: string | null;
  part_id: string | null;
}

/** A text part of a message: its bytes inline (data), or only an id when Gmail keeps a large part apart. */
interface TextRef {
  html: boolean;
  charset: string | undefined;
  data?: string;
  attachmentId?: string;
}

/** Walks the MIME tree once: text parts (with their charset) and attachments (parts with a file name). */
function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: { texts: TextRef[]; attachments: AttachmentInfo[] } = { texts: [], attachments: [] },
): { texts: TextRef[]; attachments: AttachmentInfo[] } {
  if (!part) return out;
  const isText = part.mimeType === 'text/plain' || part.mimeType === 'text/html';
  if (part.filename) {
    out.attachments.push({
      filename: part.filename,
      mime_type: part.mimeType ?? null,
      size: part.body?.size ?? null,
      attachment_id: part.body?.attachmentId ?? null,
      part_id: part.partId ?? null,
    });
  } else if (isText && (part.body?.data || part.body?.attachmentId)) {
    out.texts.push({
      html: part.mimeType === 'text/html',
      charset: charsetOf(partHeader(part, 'Content-Type')),
      data: part.body?.data ?? undefined,
      attachmentId: part.body?.data ? undefined : (part.body?.attachmentId ?? undefined),
    });
  }
  for (const child of part.parts ?? []) walkParts(child, out);
  return out;
}

interface Bodies {
  plain: string[];
  html: string[];
  /** Charsets TextDecoder did not know; those parts were read as UTF-8. */
  unknownCharsets: string[];
}

/**
 * Decodes the text parts with their charsets. A part Gmail sent only as an attachment id (a large body) is fetched with
 * users.messages.attachments.get when `fetchPart` is given, and skipped otherwise.
 */
async function decodeBodies(texts: TextRef[], fetchPart?: (attachmentId: string) => Promise<string | undefined>): Promise<Bodies> {
  const out: Bodies = { plain: [], html: [], unknownCharsets: [] };
  for (const ref of texts) {
    const data = ref.data ?? (ref.attachmentId && fetchPart ? await fetchPart(ref.attachmentId) : undefined);
    if (!data) continue;
    const decoded = decodeText(Buffer.from(data, 'base64url'), ref.charset);
    if (decoded.fallback && ref.charset) out.unknownCharsets.push(ref.charset);
    (ref.html ? out.html : out.plain).push(decoded.text);
  }
  return out;
}

/** The text to read: plain text when there is some, else the HTML as text. Tidied (see tidyText). */
function pickBody(bodies: Bodies): { text: string; source: 'text/plain' | 'text/html' | 'none' } {
  if (bodies.plain.length) return { text: tidyText(bodies.plain.join('\n')), source: 'text/plain' };
  if (bodies.html.length) return { text: tidyText(htmlToText(bodies.html.join('\n'))), source: 'text/html' };
  return { text: '', source: 'none' };
}

function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function addresses(list: string[] | undefined, field: string): string[] {
  return (list ?? []).map((raw) => checkAddress(raw, field));
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

// ---------- attachments from local files ----------

interface LocalFile extends MimeAttachment {
  path: string;
}

/**
 * Reads local files to attach. Each path must be a full path to a regular file outside the protected folders
 * (checkLocalFile in local-files.ts, shared with the Drive upload). The sizes are checked before any file is read: with
 * the message around them, the encoded total must stay within Gmail's 35 MB limit.
 */
function readLocalFiles(paths: string[] | undefined, cfg: RuntimeConfig, otherBytes: number): LocalFile[] {
  if (!paths?.length) return [];
  const blocked = protectedPaths(cfg);
  const found = paths.map((given) => checkLocalFile(given, blocked, 'Attachment'));
  const estimate = otherBytes + found.reduce((sum, f) => sum + base64LinesLength(f.size) + 300, 0);
  if (estimate > GMAIL_MAX_MESSAGE_BYTES) {
    throw new Error(
      `The message would be about ${estimate} bytes once encoded, over Gmail's limit of ${GMAIL_MAX_MESSAGE_BYTES} bytes (35 MB). Attach less, or share large files through Drive and send the link. Nothing was sent.`,
    );
  }
  return found.map((f) => ({
    path: f.path,
    filename: basename(f.path),
    mimeType: mimeTypeOf(f.path),
    data: readFileSync(f.path),
  }));
}

// ---------- labels and threads ----------

/** Labels this server never adds (gmail_label) or removes (gmail_unlabel): moving mail to or from Trash, and to Spam. */
const NOT_ADDED: Record<string, string> = {
  TRASH: 'TRASH is not added here: use gmail_trash, which asks first and shows what moves to Trash.',
  SPAM: 'SPAM is not added here: marking mail as spam is left to Gmail (or the generated gmail_users_messages_modify and gmail_users_threads_modify tools, which ask first).',
};
const NOT_REMOVED: Record<string, string> = {
  TRASH: 'TRASH is not removed here: use gmail_untrash.',
};

/** One of thread_id and message_id, never both. */
function target(args: { thread_id?: string; message_id?: string }, tool: string): { kind: 'thread' | 'message'; id: string } {
  const thread = args.thread_id?.trim();
  const message = args.message_id?.trim();
  if ((thread ? 1 : 0) + (message ? 1 : 0) !== 1) throw new Error(`${tool} needs thread_id or message_id (one of them).`);
  return thread ? { kind: 'thread', id: thread } : { kind: 'message', id: message as string };
}

/**
 * Label ids for labels given by id or by name: an exact id, then an exact name, then a name (or id) in any case.
 * A label that matches nothing throws and names gmail_list_labels.
 */
async function resolveLabels(api: Gmail, given: string[]): Promise<Array<{ id: string; name: string }>> {
  const res = await api.users.labels.list({ userId: ME });
  const labels = (res.data.labels ?? []).filter((l): l is gmail_v1.Schema$Label & { id: string } => Boolean(l.id));
  return given.map((raw) => {
    const value = raw.trim();
    const lower = value.toLowerCase();
    const found =
      labels.find((l) => l.id === value) ??
      labels.find((l) => l.name === value) ??
      labels.find((l) => (l.name ?? '').toLowerCase() === lower) ??
      labels.find((l) => l.id.toLowerCase() === lower);
    if (!found) throw new Error(`No label "${value}". Use gmail_list_labels to see the label ids and names.`);
    return { id: found.id, name: found.name ?? found.id };
  });
}

const THREAD_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date'];

/** One message of a thread as a search result shows it. */
function messageLine(m: gmail_v1.Schema$Message) {
  return {
    id: m.id,
    from: headerValue(m, 'From'),
    to: headerValue(m, 'To'),
    cc: headerValue(m, 'Cc'),
    date: headerValue(m, 'Date'),
    subject: headerValue(m, 'Subject'),
    snippet: m.snippet ?? undefined,
    label_ids: m.labelIds ?? [],
  };
}

/** A thread in one line: its subject, who started it, the last sender and date, and every label on it. */
function threadLine(t: gmail_v1.Schema$Thread) {
  const messages = t.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1];
  return {
    id: t.id,
    message_count: messages.length,
    subject: headerValue(first, 'Subject'),
    first_from: headerValue(first, 'From'),
    last_from: headerValue(last, 'From'),
    last_date: headerValue(last, 'Date'),
    snippet: last?.snippet ?? t.snippet ?? undefined,
    label_ids: [...new Set(messages.flatMap((m) => m.labelIds ?? []))],
  };
}

/** What gmail_trash moves to Trash, read before the approval. */
interface TrashPlan extends PreparedAction {
  target: { kind: 'thread' | 'message'; id: string };
  count?: number;
}

// ---------- outgoing messages ----------

/** The message headers a reply needs from the original. */
const REPLY_HEADERS = ['From', 'To', 'Cc', 'Reply-To', 'Subject', 'Date', 'Message-ID', 'References', 'In-Reply-To'];

interface Original {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  subject?: string;
  date?: string;
  messageId?: string;
  references?: string;
  inReplyTo?: string;
  text?: string;
  html?: string;
}

/** The message a reply answers: its headers, and its bodies when they are quoted. */
async function readOriginal(api: Gmail, id: string, withBody: boolean): Promise<Original> {
  const res = await api.users.messages.get(
    withBody ? { userId: ME, id, format: 'full' } : { userId: ME, id, format: 'metadata', metadataHeaders: REPLY_HEADERS },
  );
  const msg = res.data;
  const original: Original = {
    id: msg.id ?? id,
    threadId: msg.threadId ?? undefined,
    from: headerValue(msg, 'From'),
    to: headerValue(msg, 'To'),
    cc: headerValue(msg, 'Cc'),
    replyTo: headerValue(msg, 'Reply-To'),
    subject: headerValue(msg, 'Subject'),
    date: headerValue(msg, 'Date'),
    messageId: headerValue(msg, 'Message-ID'),
    references: headerValue(msg, 'References'),
    inReplyTo: headerValue(msg, 'In-Reply-To'),
  };
  if (withBody) {
    const bodies = await decodeBodies(walkParts(msg.payload).texts, (attachmentId) => fetchPartData(api, original.id, attachmentId));
    original.text = pickBody(bodies).text;
    original.html = bodies.html.length ? bodies.html.join('\n') : undefined;
  }
  return original;
}

async function fetchPartData(api: Gmail, messageId: string, attachmentId: string): Promise<string | undefined> {
  const res = await api.users.messages.attachments.get({ userId: ME, messageId, id: attachmentId });
  return res.data.data ?? undefined;
}

/**
 * The readable content of one message fetched with format "full": the body (plain text, else the HTML as text), the
 * HTML body when asked, a note for an unknown charset, and the attachments with their ids. Shared by gmail_get_message
 * and gmail_get_thread.
 */
async function readMessage(api: Gmail, msg: gmail_v1.Schema$Message, max: number, includeHtml: boolean) {
  const walked = walkParts(msg.payload);
  const bodies = await decodeBodies(walked.texts, (attachmentId) => fetchPartData(api, msg.id ?? '', attachmentId));
  const picked = pickBody(bodies);
  const clipped = clip(picked.text, max);
  const html = includeHtml && bodies.html.length ? bodies.html.join('\n') : undefined;
  const htmlClipped = html !== undefined ? clip(html, max) : undefined;
  return {
    body: clipped.text,
    body_source: picked.source,
    body_total_chars: picked.text.length,
    body_truncated: clipped.truncated,
    ...(includeHtml
      ? htmlClipped
        ? { body_html: htmlClipped.text, body_html_total_chars: html?.length, body_html_truncated: htmlClipped.truncated }
        : { body_html: null }
      : {}),
    ...(bodies.unknownCharsets.length
      ? { charset_note: `Charset ${[...new Set(bodies.unknownCharsets)].join(', ')} is not known here; that text was read as UTF-8.` }
      : {}),
    attachments: walked.attachments,
  };
}

/** The address of the signed-in account, to keep it out of a reply's recipients. */
async function myAddress(api: Gmail): Promise<string | undefined> {
  const res = await api.users.getProfile({ userId: ME });
  return res.data.emailAddress ?? undefined;
}

interface Composed {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text?: string;
  html?: string;
  files: LocalFile[];
  reply?: Original;
  quoted: boolean;
}

/** The outgoing message as bytes, how it goes to Gmail, and what the approval shows. */
interface OutgoingPlan extends PreparedAction {
  raw: string;
  bytes: number;
  threadId?: string;
  upload: boolean;
  composed: Composed;
}

/** Adds the quoted original under the reply text, in the parts the reply has. */
function withQuote(c: Composed): { text?: string; html?: string } {
  if (!c.quoted || !c.reply) return { text: c.text, html: c.html };
  const o = c.reply;
  const text = c.text !== undefined || c.html === undefined ? `${c.text ?? ''}\n\n${quoteText(o.text ?? '', o.from, o.date)}` : undefined;
  const html = c.html !== undefined ? `${c.html}<br><br>${quoteHtml(o.html ?? escapeHtml(o.text ?? '').replace(/\n/g, '<br>'), o.from, o.date)}` : undefined;
  return { text, html };
}

/** Builds the message once. The same bytes are shown (size) and sent. */
function planOutgoing(c: Composed, action: string): OutgoingPlan {
  const bodies = withQuote(c);
  const raw = buildMime({
    to: c.to,
    cc: c.cc,
    bcc: c.bcc,
    subject: c.subject,
    text: bodies.text,
    html: bodies.html,
    attachments: c.files,
    inReplyTo: c.reply?.messageId,
    references: c.reply ? replyReferences(c.reply) : undefined,
  });
  const bytes = Buffer.byteLength(raw, 'latin1');
  if (bytes > GMAIL_MAX_MESSAGE_BYTES) {
    throw new Error(`The message is ${bytes} bytes once encoded, over Gmail's limit of ${GMAIL_MAX_MESSAGE_BYTES} bytes (35 MB). Nothing was sent.`);
  }
  const excerptSource = c.text ?? (c.html !== undefined ? htmlToText(c.html) : '');
  const preview = {
    action,
    from_account: requestedAccount() ?? 'the default account of this server (accounts_list shows it)',
    to: c.to,
    ...(c.cc.length ? { cc: c.cc } : {}),
    ...(c.bcc.length ? { bcc: c.bcc } : {}),
    subject: c.subject,
    ...(c.reply
      ? {
          in_reply_to: {
            message_id: c.reply.id,
            thread_id: c.reply.threadId ?? null,
            from: c.reply.from ?? null,
            subject: c.reply.subject ?? null,
            date: c.reply.date ?? null,
          },
          threading: c.reply.messageId ? 'same thread (threadId, In-Reply-To and References set)' : 'same thread by thread id only: the original has no Message-ID header',
        }
      : {}),
    attachments: c.files.map((f) => ({ name: f.filename, size_bytes: f.data.length, type: f.mimeType, path: f.path })),
    message_size_bytes: bytes,
    ...(c.html !== undefined ? { html_body_chars: c.html.length } : {}),
    ...(c.quoted ? { quotes_original: true } : {}),
    body_excerpt: excerptSource.length > 600 ? `${excerptSource.slice(0, 600)}... (${excerptSource.length} characters in all)` : excerptSource,
  };
  return { preview, raw, bytes, threadId: c.reply?.threadId, upload: bytes > GMAIL_JSON_RAW_MAX_BYTES, composed: c };
}

/** Bytes of the message around the attachments, for the size check made before the files are read. */
function textBytes(c: { text?: string; html?: string; subject?: string }): number {
  return base64LinesLength(Buffer.byteLength(c.text ?? '', 'utf8')) + base64LinesLength(Buffer.byteLength(c.html ?? '', 'utf8')) + 4096;
}

/** The outgoing message on the wire: the JSON raw field, or the upload endpoint for a large one (uploadType=multipart). */
function messageRequest(plan: OutgoingPlan): { requestBody: gmail_v1.Schema$Message; media?: { mimeType: string; body: string } } {
  if (!plan.upload) return { requestBody: { raw: Buffer.from(plan.raw, 'latin1').toString('base64url'), ...(plan.threadId ? { threadId: plan.threadId } : {}) } };
  return { requestBody: plan.threadId ? { threadId: plan.threadId } : {}, media: { mimeType: 'message/rfc822', body: plan.raw } };
}

const SEND_ACTION = 'Sends this email now. Sending cannot be undone.';

const fileList = z
  .array(z.string())
  .optional()
  .describe("Full paths of local files to attach. The whole message may be up to 35 MB once encoded (Gmail's limit). Files in the folder that holds the Google sign-in data are refused.");

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const gmailApi = async (): Promise<Gmail> => gmail({ version: 'v1', auth: await authFor(cfg) });

  /** A new message (gmail_send). */
  async function planSend(args: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body_text?: string; body_html?: string; attachments?: string[] }): Promise<OutgoingPlan> {
    const to = addresses(args.to, 'to');
    const cc = addresses(args.cc, 'cc');
    const bcc = addresses(args.bcc, 'bcc');
    if (!to.length && !cc.length && !bcc.length) throw new Error('gmail_send needs at least one recipient in to, cc or bcc.');
    const subject = singleLine(args.subject, 'subject');
    const files = readLocalFiles(args.attachments, cfg, textBytes({ text: args.body_text, html: args.body_html }));
    return planOutgoing({ to, cc, bcc, subject, text: args.body_text, html: args.body_html, files, quoted: false }, SEND_ACTION);
  }

  /** A reply to one message (gmail_reply): its recipients, subject and threading come from the original. */
  async function planReply(args: { message_id: string; body_text?: string; body_html?: string; reply_all?: boolean; quote_original?: boolean; attachments?: string[] }): Promise<OutgoingPlan> {
    const api = await gmailApi();
    const quoted = args.quote_original === true;
    const original = await readOriginal(api, args.message_id, quoted);
    const me = await myAddress(api);
    const recipients = replyRecipients(original, me, args.reply_all === true);
    if (!recipients.to.length && !recipients.cc.length) {
      throw new Error(`Message ${args.message_id} has no one to reply to (its sender and recipients are only this account). Use gmail_send with the recipients.`);
    }
    const files = readLocalFiles(args.attachments, cfg, textBytes({ text: args.body_text, html: args.body_html }));
    return planOutgoing(
      { to: recipients.to, cc: recipients.cc, bcc: [], subject: replySubject(original.subject), text: args.body_text, html: args.body_html, files, reply: original, quoted },
      SEND_ACTION,
    );
  }

  /** gmail_label and gmail_unlabel: resolve the labels, refuse Trash and Spam moves, then one modify request. */
  async function changeLabels(args: { thread_id?: string; message_id?: string; labels: string[] }, mode: 'add' | 'remove') {
    const tool = mode === 'add' ? 'gmail_label' : 'gmail_unlabel';
    const t = target(args, tool);
    if (!args.labels.length) throw new Error(`${tool} needs at least one label.`);
    const api = await gmailApi();
    const labels = await resolveLabels(api, args.labels);
    const refused = mode === 'add' ? NOT_ADDED : NOT_REMOVED;
    for (const l of labels) {
      const reason = refused[l.id];
      if (reason) throw new Error(`${reason} Nothing was changed.`);
    }
    const labelIds = [...new Set(labels.map((l) => l.id))];
    const requestBody = mode === 'add' ? { addLabelIds: labelIds } : { removeLabelIds: labelIds };
    const done = mode === 'add' ? { added: labels } : { removed: labels };
    if (t.kind === 'thread') {
      await api.users.threads.modify({ userId: ME, id: t.id, requestBody });
      return { thread_id: t.id, ...done };
    }
    const res = await api.users.messages.modify({ userId: ME, id: t.id, requestBody });
    return { message_id: t.id, ...done, label_ids: res.data.labelIds ?? [] };
  }

  /** gmail_trash: what moves to Trash, read before the approval. */
  async function planTrash(args: { thread_id?: string; message_id?: string }): Promise<TrashPlan> {
    const t = target(args, 'gmail_trash');
    const api = await gmailApi();
    const from_account = requestedAccount() ?? 'the default account of this server (accounts_list shows it)';
    const after = 'Gmail deletes mail in Trash for good after 30 days; gmail_untrash brings it back before then.';
    if (t.kind === 'thread') {
      const res = await api.users.threads.get({ userId: ME, id: t.id, format: 'metadata', metadataHeaders: THREAD_HEADERS });
      const line = threadLine(res.data);
      return {
        target: t,
        count: line.message_count,
        preview: {
          action: `Moves this thread (${line.message_count} messages) to Trash. ${after}`,
          from_account,
          thread_id: t.id,
          subject: line.subject ?? null,
          first_from: line.first_from ?? null,
          last_from: line.last_from ?? null,
          last_date: line.last_date ?? null,
          snippet: line.snippet ?? null,
        },
      };
    }
    const res = await api.users.messages.get({ userId: ME, id: t.id, format: 'metadata', metadataHeaders: THREAD_HEADERS });
    return {
      target: t,
      preview: {
        action: `Moves this message to Trash. ${after}`,
        from_account,
        message_id: t.id,
        thread_id: res.data.threadId ?? null,
        from: headerValue(res.data, 'From') ?? null,
        subject: headerValue(res.data, 'Subject') ?? null,
        date: headerValue(res.data, 'Date') ?? null,
        snippet: res.data.snippet ?? null,
      },
    };
  }

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
      description:
        "Read one message (matches get_message in Google's Gmail MCP server). format \"full\" adds the snippet, the decoded body (plain text, else the HTML as text; each part decoded with its own charset, blank lines at the start and end removed) and attachment metadata with attachment_id. include_html adds the HTML body. Use gmail_get_attachment with an attachment_id to download a file.",
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        id: z.string().describe('Message ID from gmail_search'),
        format: z.enum(['metadata', 'full']).optional().describe('metadata: headers and snippet only. full: also the body and attachments. Default full.'),
        max_body_chars: z.number().int().min(100).max(50000).optional().describe('Cap on body length in characters (and on body_html). Default 8000.'),
        include_html: z.boolean().optional().describe('full only: also return the HTML body as body_html, when the message has one. Default false.'),
      },
      async handler({ id, format, max_body_chars, include_html }) {
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
          snippet: msg.snippet ?? undefined,
        };
        if (fmt === 'metadata') return base;

        return { ...base, ...(await readMessage(api, msg, max_body_chars ?? 8000, include_html === true)) };
      },
    }),
    defineTool({
      name: 'gmail_get_attachment',
      title: 'Get Gmail attachment',
      description: `Download one attachment of a message as base64 (data_base64). Take message_id and attachment_id from gmail_get_message. The base64 text must fit this server's result limit (GSM_MAX_RESULT_CHARS, now ${cfg.maxResultChars} characters, so files up to about ${Math.floor(((cfg.maxResultChars - 1000) * 3) / 4)} bytes); a larger file returns its size and a note instead of the data.`,
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        message_id: z.string().describe('The message that holds the attachment (gmail_get_message id).'),
        attachment_id: z.string().describe('attachment_id from the attachments list of gmail_get_message.'),
      },
      async handler({ message_id, attachment_id }) {
        const api = await gmailApi();
        const res = await api.users.messages.attachments.get({ userId: ME, messageId: message_id, id: attachment_id });
        const bytes = Buffer.from(res.data.data ?? '', 'base64url');
        const data = bytes.toString('base64');
        // Room for the JSON around the data: the whole answer must fit the result limit, or it would be cut.
        const room = cfg.maxResultChars - 1000;
        if (data.length > room) {
          return {
            message_id,
            attachment_id,
            size_bytes: bytes.length,
            data_base64: null,
            note: `The attachment is ${bytes.length} bytes, ${data.length} characters as base64, over this server's result limit of ${cfg.maxResultChars} characters (GSM_MAX_RESULT_CHARS). Raise GSM_MAX_RESULT_CHARS to at least ${data.length + 1000} to download it here, or open it in Gmail.`,
          };
        }
        return { message_id, attachment_id, size_bytes: bytes.length, data_base64: data };
      },
    }),
    defineTool({
      name: 'gmail_search_threads',
      title: 'Search Gmail threads',
      description:
        "Search conversations with Gmail search syntax (matches search_threads in Google's Gmail MCP server). Returns threads, each with its messages summarised: from, to, cc, date, subject, snippet and labels (view \"detailed\", the default), or one line per thread (view \"concise\"). Bodies are not returned: use gmail_get_thread with a thread id. Spam and Trash are left out unless include_trash is true. A thread matches when one of its messages matches.",
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        query: z.string().optional().describe('Gmail search, for example "from:anna@example.com newer_than:7d". Omit it for every thread.'),
        page_size: z.number().int().min(1).max(50).optional().describe('Threads per page, 1 to 50. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
        include_trash: z.boolean().optional().describe("Also search Trash and Spam (Gmail's includeSpamTrash). Default false."),
        view: z.enum(['detailed', 'concise']).optional().describe('detailed (default): each message of each thread. concise: one line per thread.'),
      },
      async handler({ query, page_size, page_token, include_trash, view }) {
        const api = await gmailApi();
        const list = await api.users.threads.list({ userId: ME, q: query, maxResults: page_size ?? 20, pageToken: page_token, includeSpamTrash: include_trash === true });
        const threads = await inChunks(ids(list.data.threads), 10, async (id) => {
          const res = await api.users.threads.get({ userId: ME, id, format: 'metadata', metadataHeaders: THREAD_HEADERS });
          if (view === 'concise') return threadLine(res.data);
          const messages = res.data.messages ?? [];
          return { id: res.data.id, message_count: messages.length, messages: messages.map(messageLine) };
        });
        return {
          threads,
          next_page_token: list.data.nextPageToken ?? undefined,
          result_size_estimate: list.data.resultSizeEstimate ?? undefined,
        };
      },
    }),
    defineTool({
      name: 'gmail_get_thread',
      title: 'Get Gmail thread',
      description:
        "Read a whole conversation (matches get_thread in Google's Gmail MCP server): every message, oldest first, decoded as gmail_get_message does (each part in its own charset, blank lines at the start and end removed, attachment ids). view \"concise\" returns the headers and snippet of each message without bodies. Find thread ids with gmail_search_threads.",
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        thread_id: z.string().describe('Thread ID from gmail_search_threads or gmail_search.'),
        view: z.enum(['detailed', 'concise']).optional().describe('detailed (default): bodies and attachments. concise: headers and snippets only.'),
        max_body_chars: z.number().int().min(100).max(50000).optional().describe('Cap on each message body in characters. Default 4000.'),
        include_html: z.boolean().optional().describe('detailed only: also return each HTML body as body_html. Default false.'),
      },
      async handler({ thread_id, view, max_body_chars, include_html }) {
        const api = await gmailApi();
        const concise = view === 'concise';
        const res = await api.users.threads.get(
          concise ? { userId: ME, id: thread_id, format: 'metadata', metadataHeaders: THREAD_HEADERS } : { userId: ME, id: thread_id, format: 'full' },
        );
        const messages = res.data.messages ?? [];
        const max = max_body_chars ?? 4000;
        const out: Array<Record<string, unknown>> = [];
        for (const m of messages) {
          out.push(concise ? messageLine(m) : { ...messageLine(m), ...(await readMessage(api, m, max, include_html === true)) });
        }
        return { id: res.data.id, message_count: messages.length, messages: out };
      },
    }),
    defineTool({
      name: 'gmail_list_labels',
      title: 'List Gmail labels',
      description:
        "List Gmail labels (system and user) with their ids and types (matches list_labels in Google's Gmail MCP server, which lists user labels only: pass user_only). System label ids: INBOX, SENT, DRAFT, SPAM, TRASH, STARRED, UNREAD, IMPORTANT, CHAT and CATEGORY_*. Use the ids or names with gmail_label and gmail_unlabel. Without page_size the answer is the whole list; with it, a page and next_page_token.",
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.labels', 'gmail.metadata', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        user_only: z.boolean().optional().describe('Only the labels the user made (type "user"). Default false: system and user labels.'),
        page_size: z.number().int().min(1).max(500).optional().describe('Labels per page. Gmail returns every label at once; this server pages them.'),
        page_token: z.string().optional().describe('next_page_token from the previous call (with page_size).'),
      },
      async handler({ user_only, page_size, page_token }) {
        const api = await gmailApi();
        const res = await api.users.labels.list({ userId: ME });
        const all = (res.data.labels ?? []).filter((l) => !user_only || l.type === 'user').map((l) => ({ id: l.id, name: l.name, type: l.type }));
        // Without paging the answer is the plain list, as before 1.7.0.
        if (page_size === undefined && page_token === undefined) return all;
        const start = page_token === undefined ? 0 : Number(page_token);
        if (!Number.isInteger(start) || start < 0) throw new Error('page_token must be a next_page_token from an earlier gmail_list_labels call.');
        const size = page_size ?? all.length;
        const end = start + size;
        return { labels: all.slice(start, end), next_page_token: end < all.length ? String(end) : undefined };
      },
    }),
    defineTool({
      name: 'gmail_list_drafts',
      title: 'List Gmail drafts',
      description:
        "List drafts with their ids and To, Subject, Date headers (matches list_drafts in Google's Gmail MCP server). query filters them with Gmail search syntax. Use gmail_send_draft with a draft_id to send one.",
      kind: 'read',
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify', 'gmail.readonly'),
      inputSchema: {
        max_results: z.number().int().min(1).max(100).optional().describe('1 to 100. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call'),
        query: z.string().optional().describe('Gmail search, for example "subject:invoice to:anna@example.com".'),
      },
      async handler({ max_results, page_token, query }) {
        const api = await gmailApi();
        const list = await api.users.drafts.list({ userId: ME, maxResults: max_results ?? 20, pageToken: page_token, q: query });
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
      description:
        "Save an email as a draft (matches create_draft in Google's Gmail MCP server). Plain text, HTML or both, and attachments from local files. With reply_to_message_id the draft is a reply in that message's thread (threadId, In-Reply-To and References set; to defaults to the sender, subject to \"Re: \" and the original subject). Does not send it; use gmail_send_draft for that.",
      kind: 'write',
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify'),
      inputSchema: {
        to: z.array(z.string()).optional().describe('Recipient addresses. At least one, unless reply_to_message_id is given (then the default is who a reply goes to).'),
        subject: z.string().optional().describe('Required unless reply_to_message_id is given (then the default is "Re: " and the original subject).'),
        body: z.string().optional().describe('Plain text body'),
        body_html: z.string().optional().describe('HTML body. With body, the draft has both (multipart/alternative).'),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        reply_to_message_id: z.string().optional().describe('Make the draft a reply to this message (an id from gmail_search or gmail_get_message). Reading it needs a gmail.modify or full login.'),
        quote_original: z.boolean().optional().describe('With reply_to_message_id: quote the original message under the body. Default false.'),
        attachments: fileList,
      },
      async handler({ to, subject, body, body_html, cc, bcc, reply_to_message_id, quote_original, attachments }) {
        const api = await gmailApi();
        let original: Original | undefined;
        let recipients = addresses(to, 'to');
        if (reply_to_message_id) {
          original = await readOriginal(api, reply_to_message_id, quote_original === true);
          if (!recipients.length) recipients = replyRecipients(original, await myAddress(api), false).to;
        }
        if (!recipients.length) throw new Error('gmail_create_draft needs at least one recipient in "to".');
        if (subject === undefined && !original) throw new Error('gmail_create_draft needs a subject.');
        const files = readLocalFiles(attachments, cfg, textBytes({ text: body, html: body_html }));
        const plan = planOutgoing(
          {
            to: recipients,
            cc: addresses(cc, 'cc'),
            bcc: addresses(bcc, 'bcc'),
            subject: subject !== undefined ? singleLine(subject, 'subject') : replySubject(original?.subject),
            // A draft with neither body has an empty plain text body, as before.
            text: body ?? (body_html === undefined ? '' : undefined),
            html: body_html,
            files,
            reply: original,
            quoted: quote_original === true && original !== undefined,
          },
          'Saves this email as a draft. Nothing is sent.',
        );
        const req = messageRequest(plan);
        const res = await api.users.drafts.create({ userId: ME, requestBody: { message: req.requestBody }, ...(req.media ? { media: req.media } : {}) });
        return {
          draft_id: res.data.id,
          message_id: res.data.message?.id,
          thread_id: res.data.message?.threadId,
          to: recipients,
          subject: plan.composed.subject,
          ...(original ? { in_reply_to: original.id } : {}),
          ...(files.length ? { attachments: files.map((f) => ({ name: f.filename, size_bytes: f.data.length })) } : {}),
        };
      },
    }),

    defineTool({
      name: 'gmail_label',
      title: 'Add Gmail labels',
      description:
        "Add labels to a whole thread (thread_id) or to one message (message_id) (matches label_thread and label_message in Google's Gmail MCP server). Labels by id or by name; names are looked up in the label list, in any case. System labels: INBOX, STARRED, UNREAD, IMPORTANT and the CATEGORY_* ids. Moving to Trash or Spam is not done here: use gmail_trash. Find label ids and names with gmail_list_labels.",
      kind: 'write',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify'),
      inputSchema: {
        thread_id: z.string().optional().describe('The thread to label (all its messages). Give this or message_id.'),
        message_id: z.string().optional().describe('The message to label. Give this or thread_id.'),
        labels: z.array(z.string()).describe('Label ids or names, for example ["STARRED", "Invoices"].'),
      },
      async handler(args) {
        return changeLabels(args, 'add');
      },
    }),
    defineTool({
      name: 'gmail_unlabel',
      title: 'Remove Gmail labels',
      description:
        "Remove labels from a whole thread (thread_id) or from one message (message_id) (matches unlabel_thread and unlabel_message in Google's Gmail MCP server). Labels by id or by name. Removing INBOX archives; removing UNREAD marks as read; removing SPAM marks as not spam. Taking mail out of Trash is gmail_untrash.",
      kind: 'write',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify'),
      inputSchema: {
        thread_id: z.string().optional().describe('The thread to change (all its messages). Give this or message_id.'),
        message_id: z.string().optional().describe('The message to change. Give this or thread_id.'),
        labels: z.array(z.string()).describe('Label ids or names, for example ["INBOX", "UNREAD"].'),
      },
      async handler(args) {
        return changeLabels(args, 'remove');
      },
    }),
    defineTool({
      name: 'gmail_untrash',
      title: 'Restore from Gmail Trash',
      description: 'Take a thread (thread_id) or one message (message_id) out of Trash. It goes back to the labels it had.',
      kind: 'write',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify'),
      inputSchema: {
        thread_id: z.string().optional().describe('The thread to restore. Give this or message_id.'),
        message_id: z.string().optional().describe('The message to restore. Give this or thread_id.'),
      },
      async handler(args) {
        const t = target(args, 'gmail_untrash');
        const api = await gmailApi();
        if (t.kind === 'thread') {
          const res = await api.users.threads.untrash({ userId: ME, id: t.id });
          return { thread_id: res.data.id ?? t.id, restored: true };
        }
        const res = await api.users.messages.untrash({ userId: ME, id: t.id });
        return { message_id: res.data.id ?? t.id, thread_id: res.data.threadId, label_ids: res.data.labelIds ?? [], restored: true };
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
        const body = pickBody(await decodeBodies(walkParts(msg?.payload).texts)).text;
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
      name: 'gmail_send',
      title: 'Send Gmail message',
      description:
        "Send a new email now: plain text, HTML or both, with attachments from local files. Sending cannot be undone, so it asks first and the approval shows the recipients, subject, attachment names and sizes and the start of the body. Google's Gmail MCP server has no send tool; its create_draft is gmail_create_draft here. To answer a message in its thread, use gmail_reply.",
      kind: 'destructive',
      scopes: googleScopes('https://mail.google.com/', 'gmail.compose', 'gmail.modify'),
      inputSchema: {
        to: z.array(z.string()).describe('Recipients: "a@example.com" or "Name <a@example.com>".'),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        subject: z.string(),
        body_text: z.string().optional().describe('Plain text body.'),
        body_html: z.string().optional().describe('HTML body. With body_text, the message has both (multipart/alternative).'),
        attachments: fileList,
      },
      async prepare(args) {
        return planSend(args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as OutgoingPlan | undefined) ?? (await planSend(args));
        const api = await gmailApi();
        const req = messageRequest(plan);
        const res = await api.users.messages.send({ userId: ME, requestBody: req.requestBody, ...(req.media ? { media: req.media } : {}) });
        return sentResult(res.data, plan);
      },
    }),
    defineTool({
      name: 'gmail_reply',
      title: 'Reply to a Gmail message',
      description:
        "Reply now to one message, in its thread: to its sender (Reply-To when set), or with reply_all also to its To and Cc, never to this account. Subject \"Re: \" plus the original; threadId, In-Reply-To and References are set so Gmail and other mail programs keep the thread. Optionally quotes the original. Sending cannot be undone, so it asks first and the approval shows the recipients and subject. Google's Gmail MCP server has no send tool; to review before sending, use gmail_create_draft with reply_to_message_id.",
      kind: 'destructive',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify'),
      inputSchema: {
        message_id: z.string().describe('The message to answer (an id from gmail_search or gmail_get_message).'),
        body_text: z.string().optional().describe('Plain text reply.'),
        body_html: z.string().optional().describe('HTML reply. With body_text, the reply has both.'),
        reply_all: z.boolean().optional().describe("Also reply to the original's To and Cc. Default false."),
        quote_original: z.boolean().optional().describe('Quote the original message under the reply. Default false.'),
        attachments: fileList,
      },
      async prepare(args) {
        return planReply(args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as OutgoingPlan | undefined) ?? (await planReply(args));
        const api = await gmailApi();
        const req = messageRequest(plan);
        const res = await api.users.messages.send({ userId: ME, requestBody: req.requestBody, ...(req.media ? { media: req.media } : {}) });
        return { ...sentResult(res.data, plan), in_reply_to: plan.composed.reply?.id };
      },
    }),
    defineTool({
      name: 'gmail_trash',
      title: 'Move to Gmail Trash',
      description:
        'Move a thread (thread_id) or one message (message_id) to Trash. Gmail deletes mail in Trash for good after 30 days; gmail_untrash brings it back before then. It asks first, and the approval shows the subject, the senders and the number of messages.',
      kind: 'destructive',
      scopes: googleScopes('https://mail.google.com/', 'gmail.modify'),
      inputSchema: {
        thread_id: z.string().optional().describe('The thread to move to Trash (all its messages). Give this or message_id.'),
        message_id: z.string().optional().describe('The message to move to Trash. Give this or thread_id.'),
      },
      async prepare(args) {
        return planTrash(args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as TrashPlan | undefined) ?? (await planTrash(args));
        const api = await gmailApi();
        if (plan.target.kind === 'thread') {
          const res = await api.users.threads.trash({ userId: ME, id: plan.target.id });
          return { thread_id: res.data.id ?? plan.target.id, trashed: true, messages: plan.count };
        }
        const res = await api.users.messages.trash({ userId: ME, id: plan.target.id });
        return { message_id: res.data.id ?? plan.target.id, thread_id: res.data.threadId, trashed: true };
      },
    }),
  ];
}

function sentResult(msg: gmail_v1.Schema$Message, plan: OutgoingPlan) {
  const c = plan.composed;
  return {
    message_id: msg.id,
    thread_id: msg.threadId,
    label_ids: msg.labelIds ?? [],
    to: c.to,
    ...(c.cc.length ? { cc: c.cc } : {}),
    ...(c.bcc.length ? { bcc: c.bcc } : {}),
    subject: c.subject,
    ...(c.files.length ? { attachments: c.files.map((f) => ({ name: f.filename, size_bytes: f.data.length })) } : {}),
    size_bytes: plan.bytes,
    sent_with: plan.upload ? 'upload endpoint (uploadType=multipart)' : 'raw field',
  };
}
