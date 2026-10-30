/**
 * Curated Google Chat tools (chat_*) of the gchat server. They match the tools of Google's Chat MCP server
 * (developers.google.com/workspace/chat/api/reference/mcp/tools_list): find a conversation by name or by participants,
 * read and search messages in Markdown with trimmed fields, list the members of a conversation, send a message, and mark
 * a conversation read or unread. The generated chat_* tools stay as they are; these take plain arguments and return
 * short answers.
 *
 * Reads never ask. chat_send_message, chat_mark_read and chat_mark_unread are writes, so the gate asks first;
 * chat_send_message's prepare step reads the conversation's name, so the approval shows where the message goes and the
 * start of its text. The Chat API has no client library in this package, so the calls go through the account's auth
 * client (cloud-http.ts), as the gcloud curated tools do.
 *
 * Auth: OAuth user token from `gsm login workspace-user`.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { defineTool, type PreparedAction, type ToolDef } from '../core/tools.js';
import { makeCloudCall, statusOf, type CloudCall } from './cloud-http.js';

const CHAT = 'https://chat.googleapis.com/v1';

const SPACES_READ = googleScopes('chat.spaces', 'chat.spaces.readonly');
const MESSAGES_READ = googleScopes('chat.messages', 'chat.messages.readonly');
const MEMBERS_READ = googleScopes('chat.memberships', 'chat.memberships.readonly');
const MESSAGES_CREATE = googleScopes('chat.messages', 'chat.messages.create');
const READ_STATE = googleScopes('chat.users.readstate');

/** Default and largest number of characters of one message's text in an answer. Longer text is cut and marked. */
export const CHAT_TEXT_DEFAULT_CHARS = 2000;
export const CHAT_TEXT_MAX_CHARS = 20000;
/** Google's limit for one message: 32,000 bytes of text or cards (Chat API, "Send a message"). */
export const CHAT_MESSAGE_MAX_BYTES = 32000;
/** How much of the text the approval of chat_send_message shows. */
export const CHAT_PREVIEW_CHARS = 500;
/** Conversations one chat_mark_read call takes, as Google's mark_as_read does. Each is one request. */
export const CHAT_MARK_READ_MAX = 10;
/** Google's limit for a message search query (SearchMessagesRequest.filter). */
export const CHAT_SEARCH_FILTER_MAX = 1000;

const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
const SPACE_RE = /^spaces\/[A-Za-z0-9_-]+$/;
const THREAD_RE = /^(spaces\/[A-Za-z0-9_-]+)\/threads\/[A-Za-z0-9_.-]+$/;
const EMAIL_RE = /^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/;

const rfc3339 = (field: string) =>
  z.string().regex(RFC3339_RE, `${field} must be RFC 3339 with an offset, for example 2026-10-30T09:00:00+01:00 or 2026-10-30T08:00:00Z`);

/** A conversation id: spaces/{space}. A bare id (AAAA...) is taken as spaces/AAAA... */
export function spaceNameOf(value: string, field = 'conversation_id'): string {
  const v = value.trim();
  const name = v.startsWith('spaces/') ? v : `spaces/${v}`;
  if (!SPACE_RE.test(name)) throw new Error(`${field} must be a conversation id such as spaces/AAAAxxxx (from chat_search_conversations), got "${value}".`);
  return name;
}

/** A thread id: spaces/{space}/threads/{thread}, in the given conversation when one is given. */
export function threadNameOf(value: string, space?: string): string {
  const v = value.trim();
  const m = THREAD_RE.exec(v);
  if (!m) throw new Error(`thread_id must be a thread id such as spaces/AAAAxxxx/threads/BBBBxxxx (the thread_id of a message), got "${value}".`);
  if (space !== undefined && m[1] !== space) throw new Error(`thread_id ${v} is not in conversation ${space}.`);
  return v;
}

const emailOf = (value: string): string => {
  const v = value.trim().replace(/^users\//, '');
  if (!EMAIL_RE.test(v)) throw new Error(`"${value}" is not an email address.`);
  return v;
};

// ---------- Answers ----------

interface ChatUser {
  name?: string;
  displayName?: string;
  email?: string;
  type?: string;
}
interface ChatSpace {
  name?: string;
  displayName?: string;
  spaceType?: string;
  type?: string;
  spaceUri?: string;
  lastActiveTime?: string;
  membershipCount?: { joinedDirectHumanUserCount?: number; joinedGroupCount?: number };
}
interface ChatMessage {
  name?: string;
  text?: string;
  formattedText?: string;
  createTime?: string;
  lastUpdateTime?: string;
  deleteTime?: string;
  sender?: ChatUser;
  thread?: { name?: string };
  threadReply?: boolean;
  space?: ChatSpace;
  privateMessageViewer?: ChatUser;
  attachment?: Array<{ name?: string; contentName?: string; contentType?: string; driveDataRef?: { driveFileId?: string } }>;
}

export type TextFormat = 'markdown' | 'chat';

const userOf = (u: ChatUser | undefined) =>
  u ? { id: u.name, display_name: u.displayName, ...(u.email ? { email: u.email } : {}), type: u.type } : undefined;

/** The conversation id of a message or thread name (spaces/{space}/...). */
export const spaceOfName = (name: string | undefined): string | undefined => /^spaces\/[^/]+/.exec(name ?? '')?.[0];

/**
 * One message, short: who, when, the thread, and its text in Markdown (formattedText, asked for with
 * MARKUP_SYNTAX_MARKDOWN) or as written (text), cut at maxChars.
 */
export function messageSummary(m: ChatMessage, format: TextFormat, maxChars: number) {
  const raw = (format === 'markdown' ? (m.formattedText ?? m.text) : m.text) ?? '';
  const cut = raw.length > maxChars;
  const files = (m.attachment ?? []).map((a) => ({ name: a.contentName, content_type: a.contentType, ...(a.driveDataRef?.driveFileId ? { drive_file_id: a.driveDataRef.driveFileId } : {}) }));
  return {
    id: m.name,
    conversation_id: spaceOfName(m.name),
    ...(m.space?.displayName ? { conversation_name: m.space.displayName } : {}),
    thread_id: m.thread?.name,
    ...(m.threadReply ? { thread_reply: true } : {}),
    sender: userOf(m.sender),
    create_time: m.createTime,
    ...(m.lastUpdateTime ? { last_update_time: m.lastUpdateTime } : {}),
    text: cut ? raw.slice(0, maxChars) : raw,
    ...(cut ? { text_truncated: true, text_chars: raw.length } : {}),
    ...(files.length ? { attachments: files } : {}),
  };
}

export function conversationSummary(s: ChatSpace) {
  return {
    id: s.name,
    display_name: s.displayName ?? null,
    type: s.spaceType ?? s.type,
    ...(s.spaceUri ? { uri: s.spaceUri } : {}),
    ...(s.lastActiveTime ? { last_active_time: s.lastActiveTime } : {}),
  };
}

/** Messages only one user can see (sent privately by a Chat app) are left out, as Google's list_messages does. */
const notPrivate = (m: ChatMessage): boolean => !m.privateMessageViewer;

// ---------- Search filters ----------

export interface MessageSearch {
  query?: string;
  conversation_ids?: string[];
  senders?: string[];
  mentions_me?: boolean;
  unread_only?: boolean;
  has_link?: boolean;
  has_attachment?: boolean;
  start_time?: string;
  end_time?: string;
  space_types?: Array<'SPACE' | 'GROUP_CHAT' | 'DIRECT_MESSAGE'>;
  filter?: string;
}

/**
 * The SearchMessagesRequest filter of a search: the words, then each condition, joined by AND. Values of one field are
 * joined by OR in parentheses, the only operator the API takes between them. Refused before any request: no condition
 * at all (the API requires a filter), and a filter longer than Google's 1,000 characters.
 */
export function searchFilter(s: MessageSearch): string {
  const parts: string[] = [];
  const anyOf = (list: string[]): string => (list.length === 1 ? (list[0] as string) : `(${list.join(' OR ')})`);
  if (s.query?.trim()) parts.push(s.query.trim());
  if (s.conversation_ids?.length) parts.push(anyOf(s.conversation_ids.map((id) => `space.name = "${spaceNameOf(id, 'conversation_ids')}"`)));
  if (s.senders?.length) parts.push(anyOf(s.senders.map((e) => `sender.name = "users/${emailOf(e)}"`)));
  if (s.space_types?.length) parts.push(anyOf(s.space_types.map((t) => `space.space_type = "${t}"`)));
  if (s.mentions_me) parts.push('annotations.user_mentions.user.name:users/me');
  if (s.has_link) parts.push('has_link()');
  if (s.has_attachment) parts.push('attachment:*');
  if (s.unread_only) parts.push('is_unread()');
  if (s.start_time) parts.push(`create_time >= "${s.start_time}"`);
  if (s.end_time) parts.push(`create_time < "${s.end_time}"`);
  if (s.filter?.trim()) parts.push(s.filter.trim());
  if (!parts.length) {
    throw new Error('chat_search_messages needs something to search for: query, or at least one of conversation_ids, senders, mentions_me, unread_only, has_link, has_attachment, start_time, end_time, space_types, filter. To read the latest messages of one conversation, use chat_list_messages.');
  }
  const filter = parts.join(' AND ');
  if (filter.length > CHAT_SEARCH_FILTER_MAX) throw new Error(`The search is ${filter.length} characters long; Google takes at most ${CHAT_SEARCH_FILTER_MAX}. Use fewer words or conditions.`);
  return filter;
}

/** The filter of spaces.messages.list: a time window and one thread (create_time and thread.name, joined by AND). */
export function listFilter(startTime: string | undefined, endTime: string | undefined, thread: string | undefined): string | undefined {
  const parts: string[] = [];
  if (startTime) parts.push(`create_time > "${startTime}"`);
  if (endTime) parts.push(`create_time < "${endTime}"`);
  if (thread) parts.push(`thread.name = ${thread}`);
  return parts.length ? parts.join(' AND ') : undefined;
}

// ---------- Send ----------

interface SendPlan extends PreparedAction {
  space: string;
  thread?: string;
  text: string;
  format: TextFormat;
}

const excerpt = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text);

const format = z
  .enum(['markdown', 'chat'])
  .optional()
  .describe("markdown (the default): text is standard Markdown (bold **x**, italic *x*, links [x](url), lists, code); tables are not supported. chat: Chat's own syntax (*bold*, _italic_), sent as is.");
const maxChars = z
  .number()
  .int()
  .min(1)
  .max(CHAT_TEXT_MAX_CHARS)
  .optional()
  .describe(`Characters of each message's text to return, 1 to ${CHAT_TEXT_MAX_CHARS}. Default ${CHAT_TEXT_DEFAULT_CHARS}; longer text is cut and marked text_truncated.`);
const conversationId = z.string().describe('The conversation id, spaces/{space} (from chat_search_conversations).');

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  // The account is chosen per call (see account-context.ts), so the client is not cached here.
  const call: CloudCall = makeCloudCall(() => getAuthClient('workspace-user', cfg));

  const planSend = async (args: { conversation_id: string; text: string; thread_id?: string; format?: TextFormat }): Promise<SendPlan> => {
    const space = spaceNameOf(args.conversation_id);
    const thread = args.thread_id !== undefined ? threadNameOf(args.thread_id, space) : undefined;
    if (!args.text.trim()) throw new Error('text is empty; there is nothing to send.');
    const bytes = Buffer.byteLength(args.text, 'utf8');
    if (bytes > CHAT_MESSAGE_MAX_BYTES) throw new Error(`text is ${bytes} bytes; Google Chat takes at most ${CHAT_MESSAGE_MAX_BYTES} bytes in one message. Shorten it or send it in parts.`);
    // The conversation's name, for the approval. A sign-in without a spaces scope cannot read it; the id is shown then.
    let space_info: ChatSpace | undefined;
    try {
      space_info = (await call<ChatSpace>({ url: `${CHAT}/${space}` })).data;
    } catch {
      space_info = undefined;
    }
    const fmt = args.format ?? 'markdown';
    return {
      space,
      thread,
      text: args.text,
      format: fmt,
      preview: {
        conversation_id: space,
        conversation: space_info?.displayName ?? (space_info?.spaceType === 'DIRECT_MESSAGE' ? 'a direct message' : '(name not readable with this sign-in)'),
        ...(space_info?.spaceType ? { type: space_info.spaceType } : {}),
        ...(thread ? { thread_id: thread } : { thread: 'a new thread' }),
        format: fmt,
        text_chars: args.text.length,
        text: excerpt(args.text, CHAT_PREVIEW_CHARS),
        effect: 'Posts this message in the conversation as you. It cannot be unsent from here.',
      },
    };
  };

  return [
    // ---- read ----
    defineTool({
      name: 'chat_search_conversations',
      title: 'Find Chat conversations',
      description:
        "Find Google Chat conversations (named spaces, direct messages and group chats) by name or by participants, to get their ids (matches search_conversations in Google's Chat MCP server). It searches conversation names and members, not message text: use chat_search_messages for that. One participant: your direct message with that person. Several: the group chats of exactly you and them. query alone: conversations whose name contains it (case-insensitive). Both: by participants, then by name. Neither: every conversation you are in. Only conversations you are a member of are found. An empty list with next_page_token does not mean there are no more: ask whether to continue. Group chats by participants need the chat.memberships (or .readonly) scope, which chat_list_members also uses. Then read with chat_list_messages, or post with chat_send_message.",
      kind: 'read',
      scopes: SPACES_READ,
      inputSchema: {
        query: z.string().optional().describe('Text the conversation name contains (case-insensitive).'),
        participants: z.array(z.string()).optional().describe('Email addresses of the other people in the conversation (not yours).'),
        page_size: z.number().int().min(1).max(1000).optional().describe('Conversations per page, 1 to 1000 (group chats: Google answers at most 30). Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same query and participants.'),
      },
      async handler({ query, participants, page_size, page_token }) {
        const people = [...new Set((participants ?? []).map(emailOf))];
        const needle = query?.trim().toLowerCase();
        const byName = (s: ChatSpace) => !needle || (s.displayName ?? '').toLowerCase().includes(needle);
        const size = page_size ?? 20;
        if (people.length === 1) {
          try {
            const res = await call<ChatSpace>({ url: `${CHAT}/spaces:findDirectMessage`, query: { name: `users/${people[0]}` } });
            const found = [res.data].filter(byName);
            return { conversations: found.map(conversationSummary), searched: 'direct message' };
          } catch (err) {
            if (statusOf(err) === 404) return { conversations: [], searched: 'direct message', note: `You have no direct message with ${people[0]}.` };
            throw err;
          }
        }
        if (people.length > 1) {
          const url = new URL(`${CHAT}/spaces:findGroupChats`);
          for (const p of people) url.searchParams.append('users', `users/${p}`);
          const res = await call<{ spaces?: ChatSpace[]; nextPageToken?: string }>({
            url: url.toString(),
            query: { spaceView: 'SPACE_VIEW_EXPANDED', pageSize: Math.min(size, 30), pageToken: page_token },
          });
          return { conversations: (res.data.spaces ?? []).filter(byName).map(conversationSummary), searched: 'group chats', next_page_token: res.data.nextPageToken || undefined };
        }
        const res = await call<{ spaces?: ChatSpace[]; nextPageToken?: string }>({ url: `${CHAT}/spaces`, query: { pageSize: size, pageToken: page_token } });
        const spaces = res.data.spaces ?? [];
        const kept = spaces.filter(byName);
        return {
          conversations: kept.map(conversationSummary),
          searched: needle ? `names of ${spaces.length} conversation(s) on this page` : 'all your conversations',
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'chat_list_messages',
      title: 'List Chat messages',
      description:
        "Read the messages of one Google Chat conversation (a space, direct message or group chat), newest first by default, in Markdown (matches list_messages in Google's Chat MCP server). Narrow by thread_id and by a time window (start_time, end_time). Each message has its id, thread, sender, time and text, cut at max_chars; messages that only one person can see are left out. next_page_token gives older (or, with order oldest, newer) messages. To find messages by words or sender across conversations, use chat_search_messages.",
      kind: 'read',
      scopes: MESSAGES_READ,
      inputSchema: {
        conversation_id: conversationId,
        thread_id: z.string().optional().describe('Only this thread, spaces/{space}/threads/{thread} (the thread_id of a message).'),
        start_time: rfc3339('start_time').optional().describe('Only messages created after this time, RFC 3339.'),
        end_time: rfc3339('end_time').optional().describe('Only messages created before this time, RFC 3339.'),
        page_size: z.number().int().min(1).max(1000).optional().describe('Messages per page, 1 to 1000. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
        order: z.enum(['newest', 'oldest']).optional().describe('newest first (the default) or oldest first.'),
        format,
        max_chars: maxChars,
      },
      async handler({ conversation_id, thread_id, start_time, end_time, page_size, page_token, order, format: fmt, max_chars }) {
        const space = spaceNameOf(conversation_id);
        const thread = thread_id !== undefined ? threadNameOf(thread_id, space) : undefined;
        if (start_time && end_time && !(Date.parse(end_time) > Date.parse(start_time))) throw new Error('end_time must be after start_time.');
        const textFormat = fmt ?? 'markdown';
        const res = await call<{ messages?: ChatMessage[]; nextPageToken?: string }>({
          url: `${CHAT}/${space}/messages`,
          query: {
            pageSize: page_size ?? 20,
            pageToken: page_token,
            filter: listFilter(start_time, end_time, thread),
            orderBy: order === 'oldest' ? 'create_time asc' : 'create_time desc',
            ...(textFormat === 'markdown' ? { markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' } : {}),
          },
        });
        const all = res.data.messages ?? [];
        const shown = all.filter(notPrivate);
        return {
          conversation_id: space,
          messages: shown.map((m) => messageSummary(m, textFormat, max_chars ?? CHAT_TEXT_DEFAULT_CHARS)),
          ...(shown.length < all.length ? { private_messages_left_out: all.length - shown.length } : {}),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'chat_search_messages',
      title: 'Search Chat messages',
      description:
        "Search Google Chat messages by words and filters, across every conversation you are in or only some, newest first, in Markdown (matches search_messages in Google's Chat MCP server). Give query (words; quote a phrase), and narrow with conversation_ids, senders (email addresses), mentions_me, unread_only, has_link, has_attachment, start_time / end_time and space_types; several values of one filter match any of them. filter takes extra conditions in the API's syntax and is joined with AND. Use chat_list_messages to read one conversation in order, and chat_search_conversations to find a conversation by name. unread_only needs the chat.users.readstate (or .readonly) scope; space_types needs a spaces scope.",
      kind: 'read',
      scopes: MESSAGES_READ,
      inputSchema: {
        query: z.string().optional().describe('Words to find. Every word must match; "a phrase" in double quotes matches the phrase.'),
        conversation_ids: z.array(z.string()).optional().describe('Only these conversations (spaces/{space}).'),
        senders: z.array(z.string()).optional().describe('Only messages from these people, by email address.'),
        mentions_me: z.boolean().optional().describe('Only messages that @mention you.'),
        unread_only: z.boolean().optional().describe('Only messages you have not read.'),
        has_link: z.boolean().optional().describe('Only messages with a link.'),
        has_attachment: z.boolean().optional().describe('Only messages with an attachment.'),
        start_time: rfc3339('start_time').optional().describe('Only messages created at or after this time, RFC 3339.'),
        end_time: rfc3339('end_time').optional().describe('Only messages created before this time, RFC 3339.'),
        space_types: z.array(z.enum(['SPACE', 'GROUP_CHAT', 'DIRECT_MESSAGE'])).optional().describe('Only these kinds of conversation.'),
        filter: z.string().optional().describe('Extra conditions in the Chat API search syntax, for example space.display_name:Project. Joined with AND.'),
        page_size: z.number().int().min(1).max(100).optional().describe('Results per page, 1 to 100. Default 25.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
        format,
        max_chars: maxChars,
      },
      async handler(args) {
        if (args.start_time && args.end_time && !(Date.parse(args.end_time) > Date.parse(args.start_time))) throw new Error('end_time must be after start_time.');
        const filter = searchFilter(args);
        const textFormat = args.format ?? 'markdown';
        const res = await call<{ results?: Array<{ message?: ChatMessage }>; nextPageToken?: string }>({
          url: `${CHAT}/spaces/-/messages:search`,
          method: 'POST',
          body: {
            filter,
            pageSize: args.page_size ?? 25,
            ...(args.page_token ? { pageToken: args.page_token } : {}),
            orderBy: 'create_time desc',
            ...(textFormat === 'markdown' ? { markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' } : {}),
          },
        });
        const messages = (res.data.results ?? []).map((r) => r.message).filter((m): m is ChatMessage => !!m && notPrivate(m));
        return {
          filter,
          messages: messages.map((m) => messageSummary(m, textFormat, args.max_chars ?? CHAT_TEXT_DEFAULT_CHARS)),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),
    defineTool({
      name: 'chat_list_members',
      title: 'List Chat members',
      description:
        "List the members of a Google Chat conversation: people (with email when Google shows it), Chat apps and, if asked, Google Groups and invited people, with role and state (matches list_memberships in Google's Chat MCP server). Joined members only by default.",
      kind: 'read',
      scopes: MEMBERS_READ,
      inputSchema: {
        conversation_id: conversationId,
        include_invited: z.boolean().optional().describe('Also list people who are invited but have not joined. Default false.'),
        include_groups: z.boolean().optional().describe('Also list Google Groups that are members. Default false.'),
        managers_only: z.boolean().optional().describe('Only the space managers. Default false.'),
        page_size: z.number().int().min(1).max(1000).optional().describe('Members per page, 1 to 1000. Default 20.'),
        page_token: z.string().optional().describe('next_page_token from the previous call, with the same other arguments.'),
      },
      async handler({ conversation_id, include_invited, include_groups, managers_only, page_size, page_token }) {
        const space = spaceNameOf(conversation_id);
        const res = await call<{
          memberships?: Array<{ name?: string; state?: string; role?: string; member?: ChatUser; groupMember?: { name?: string }; createTime?: string }>;
          nextPageToken?: string;
        }>({
          url: `${CHAT}/${space}/members`,
          query: {
            pageSize: page_size ?? 20,
            pageToken: page_token,
            ...(include_invited ? { showInvited: true } : {}),
            ...(include_groups ? { showGroups: true } : {}),
            ...(managers_only ? { filter: 'role = "ROLE_MANAGER"' } : {}),
          },
        });
        return {
          conversation_id: space,
          members: (res.data.memberships ?? []).map((m) => ({
            ...(m.member ? userOf(m.member) : { group: m.groupMember?.name }),
            role: m.role,
            state: m.state,
            ...(m.createTime ? { joined: m.createTime } : {}),
          })),
          next_page_token: res.data.nextPageToken || undefined,
        };
      },
    }),

    // ---- write ----
    defineTool({
      name: 'chat_send_message',
      title: 'Send a Chat message',
      description:
        "Post a message as you in a Google Chat conversation, in Markdown, as a new thread or as a reply in thread_id (matches send_message in Google's Chat MCP server; cards and citations, which only Chat apps can post, are not offered). Find the conversation id with chat_search_conversations. It asks first; the approval shows the conversation's name and the start of the text. A reply fails rather than starting a new thread when the thread cannot be answered. At most 32,000 bytes.",
      kind: 'write',
      scopes: MESSAGES_CREATE,
      inputSchema: {
        conversation_id: conversationId,
        text: z.string().describe('The message. Standard Markdown by default (tables are not supported); see format.'),
        thread_id: z.string().optional().describe('Reply in this thread, spaces/{space}/threads/{thread} (the thread_id of a message). Default: a new thread.'),
        format,
      },
      async prepare(args) {
        return planSend(args);
      },
      async handler(args, _ctx, prepared) {
        const plan = (prepared as SendPlan | undefined) ?? (await planSend(args));
        const res = await call<ChatMessage>({
          url: `${CHAT}/${plan.space}/messages`,
          method: 'POST',
          query: plan.thread ? { messageReplyOption: 'REPLY_MESSAGE_OR_FAIL' } : {},
          body: {
            text: plan.text,
            ...(plan.format === 'markdown' ? { markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' } : {}),
            ...(plan.thread ? { thread: { name: plan.thread } } : {}),
          },
        });
        return { sent: true, ...messageSummary(res.data, 'chat', CHAT_PREVIEW_CHARS) };
      },
    }),
    defineTool({
      name: 'chat_mark_read',
      title: 'Mark Chat conversations read',
      description: `Mark up to ${CHAT_MARK_READ_MAX} Google Chat conversations as read for you, up to their latest message (matches mark_as_read in Google's Chat MCP server). Each conversation is one request, and one that fails does not stop the others: failed lists them with Google's reason. Threads cannot be marked read: the Chat API has no public method for a thread's read state. It asks first.`,
      kind: 'write',
      // Google's mark_as_read is marked idempotent.
      idempotent: true,
      scopes: READ_STATE,
      inputSchema: {
        conversation_ids: z.array(z.string()).min(1).max(CHAT_MARK_READ_MAX).describe(`The conversations to mark read (spaces/{space}), 1 to ${CHAT_MARK_READ_MAX}.`),
      },
      async handler({ conversation_ids }) {
        const spaces = [...new Set(conversation_ids.map((id) => spaceNameOf(id, 'conversation_ids')))];
        if (spaces.length > CHAT_MARK_READ_MAX) throw new Error(`At most ${CHAT_MARK_READ_MAX} conversations per call.`);
        // A read time after the latest message marks the space read; Chat sets it to that message's time.
        const now = new Date().toISOString();
        const marked: Array<{ conversation_id: string; last_read_time?: string }> = [];
        const failed: Array<{ conversation_id: string; error: string }> = [];
        for (const space of spaces) {
          try {
            const res = await call<{ lastReadTime?: string }>({
              url: `${CHAT}/users/me/${space}/spaceReadState`,
              method: 'PATCH',
              query: { updateMask: 'last_read_time' },
              body: { lastReadTime: now },
            });
            marked.push({ conversation_id: space, last_read_time: res.data.lastReadTime });
          } catch (err) {
            failed.push({ conversation_id: space, error: (err as Error).message });
          }
        }
        if (!marked.length) throw new Error(`No conversation was marked read: ${failed.map((f) => `${f.conversation_id}: ${f.error}`).join('; ')}`);
        return { marked_read: marked, ...(failed.length ? { failed } : {}) };
      },
    }),
    defineTool({
      name: 'chat_mark_unread',
      title: 'Mark a Chat conversation unread',
      description:
        "Mark one Google Chat conversation as unread for you from last_read_time on: the messages after that time show as unread (matches mark_as_unread in Google's Chat MCP server). A time at or after your current read point changes nothing in Chat. Threads cannot be marked unread: the Chat API has no public method for it. It asks first.",
      kind: 'write',
      // Google's mark_as_unread is marked idempotent.
      idempotent: true,
      scopes: READ_STATE,
      inputSchema: {
        conversation_id: conversationId,
        last_read_time: rfc3339('last_read_time').describe('Messages after this time show as unread, RFC 3339 (for example the create_time of the first message to mark unread, minus a second).'),
      },
      async handler({ conversation_id, last_read_time }) {
        const space = spaceNameOf(conversation_id);
        const res = await call<{ lastReadTime?: string }>({
          url: `${CHAT}/users/me/${space}/spaceReadState`,
          method: 'PATCH',
          query: { updateMask: 'last_read_time' },
          body: { lastReadTime: last_read_time },
        });
        return { conversation_id: space, last_read_time: res.data.lastReadTime ?? last_read_time };
      },
    }),
  ];
}
