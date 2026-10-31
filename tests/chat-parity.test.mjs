// The Google Chat parity tools (1.12.0): chat_search_conversations, chat_list_messages, chat_search_messages,
// chat_list_members, chat_send_message, chat_mark_read and chat_mark_unread. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const chat = await import(DIST('servers/gchat.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-chat-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await chat.buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);
/** The arguments as the MCP layer checks them (the tool's zod schema). */
const parse = (name, args) => z.object(tools.get(name).inputSchema).safeParse(args);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = key in query ? [].concat(query[key], value) : value;
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const G = (s) => `https://www.googleapis.com/auth/${s}`;

const msg = (id, text, extra = {}) => ({
  name: `spaces/AAA/messages/${id}`,
  text,
  formattedText: `**${text}**`,
  createTime: '2026-10-30T09:00:00Z',
  sender: { name: 'users/111', displayName: 'Ana', email: 'ana@example.com', type: 'HUMAN' },
  thread: { name: 'spaces/AAA/threads/t1' },
  ...extra,
});

// ---------------------------------------------------------------------------
// Kinds and scopes

test('kinds follow classifyMethod: four reads; send is destructive; the read-state changes are writes; no confirm argument', () => {
  for (const name of ['chat_search_conversations', 'chat_list_messages', 'chat_search_messages', 'chat_list_members']) assert.equal(tools.get(name).kind, 'read', name);
  // Sending to other people is destructive since 1.26.3 (the destructive rule): the curated tool and the generated
  // messages.create, through its entry in config/tool-kinds.json.
  const kinds = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(REPO, 'config', 'tool-kinds.json'), 'utf8'))).filter(([k]) => k !== 'notes'));
  assert.equal(tools.get('chat_send_message').kind, classifyMethod('POST', 'create', 'chat.spaces.messages.create', kinds));
  assert.equal(tools.get('chat_send_message').kind, 'destructive');
  assert.equal(tools.get('chat_mark_read').kind, classifyMethod('PATCH', 'updateSpaceReadState', 'chat.users.spaces.updateSpaceReadState'));
  assert.equal(tools.get('chat_mark_unread').kind, 'write');
  // POST messages:search is a read for classifyMethod too (the generated chat_spaces_messages_search is a read).
  assert.equal(classifyMethod('POST', 'search', 'chat.spaces.messages.search'), 'read');
  assert.deepEqual(tools.get('chat_send_message').scopes, [G('chat.messages'), G('chat.messages.create')]);
  assert.deepEqual(tools.get('chat_list_members').scopes, [G('chat.memberships'), G('chat.memberships.readonly')], 'no Chat app scope (chat.bot, chat.import)');
  assert.deepEqual(tools.get('chat_mark_read').scopes, [G('chat.users.readstate')]);
  assert.equal(typeof tools.get('chat_send_message').prepare, 'function', 'the approval shows the conversation and the text');
  for (const t of tools.values()) {
    assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
    assert.match(t.description, /Google's Chat MCP server/, `${t.name} names the official tool it matches`);
  }
});

// ---------------------------------------------------------------------------
// chat_search_conversations

test('search_conversations: a name filters spaces.list case-insensitively; neither lists every conversation', async () => {
  reset(() => ({ spaces: [{ name: 'spaces/A', displayName: 'Project Apollo', spaceType: 'SPACE', spaceUri: 'https://chat.google.com/room/A' }, { name: 'spaces/B', displayName: 'Lunch', spaceType: 'SPACE' }], nextPageToken: 'n2' }));
  const res = await run('chat_search_conversations', { query: 'apollo' });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['GET', '/v1/spaces']]);
  assert.equal(calls[0].query.pageSize, '20');
  assert.deepEqual(res.conversations, [{ id: 'spaces/A', display_name: 'Project Apollo', type: 'SPACE', uri: 'https://chat.google.com/room/A' }]);
  assert.equal(res.next_page_token, 'n2', 'an empty or short page still says there is more');
  reset(() => ({ spaces: [{ name: 'spaces/A', displayName: 'x' }] }));
  const all = await run('chat_search_conversations', { page_size: 500, page_token: 'p' });
  assert.equal(all.conversations.length, 1);
  assert.deepEqual([calls[0].query.pageSize, calls[0].query.pageToken], ['500', 'p']);
  assert.equal(all.next_page_token, undefined);
});

test('search_conversations: one participant finds the direct message (404: none); several find group chats (at most 30 a page)', async () => {
  reset(() => ({ name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' }));
  const dm = await run('chat_search_conversations', { participants: ['Bo@example.com'] });
  assert.deepEqual(calls.map((c) => [c.path, c.query.name]), [['/v1/spaces:findDirectMessage', 'users/Bo@example.com']]);
  assert.deepEqual(dm.conversations, [{ id: 'spaces/DM1', display_name: null, type: 'DIRECT_MESSAGE' }]);

  reset(() => {
    const err = new Error('Not found');
    err.response = { status: 404, data: { error: { code: 404, message: 'Not found' } } };
    throw err;
  });
  const none = await run('chat_search_conversations', { participants: ['zed@example.com'] });
  assert.deepEqual(none.conversations, []);
  assert.match(none.note, /no direct message with zed@example\.com/);

  reset(() => ({ spaces: [{ name: 'spaces/G1', displayName: 'Trip', spaceType: 'GROUP_CHAT' }, { name: 'spaces/G2', spaceType: 'GROUP_CHAT' }] }));
  const group = await run('chat_search_conversations', { participants: ['a@example.com', 'b@example.com', 'a@example.com'], query: 'trip', page_size: 100 });
  assert.equal(calls[0].path, '/v1/spaces:findGroupChats');
  assert.deepEqual(calls[0].query.users, ['users/a@example.com', 'users/b@example.com'], 'each participant once');
  assert.equal(calls[0].query.spaceView, 'SPACE_VIEW_EXPANDED');
  assert.equal(calls[0].query.pageSize, '30', 'Google answers at most 30 group chats a page');
  assert.deepEqual(group.conversations.map((c) => c.id), ['spaces/G1'], 'then filtered by name');

  reset();
  await assert.rejects(run('chat_search_conversations', { participants: ['not an email'] }), /is not an email address/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// chat_list_messages

test('list_messages: newest first in Markdown, a time window and a thread as the filter, private messages left out', async () => {
  reset(() => ({ messages: [msg('m1', 'hello'), msg('m2', 'only me', { privateMessageViewer: { name: 'users/111' } })], nextPageToken: 'older' }));
  const res = await run('chat_list_messages', {
    conversation_id: 'AAA',
    thread_id: 'spaces/AAA/threads/t1',
    start_time: '2026-10-29T00:00:00Z',
    end_time: '2026-10-30T00:00:00+01:00',
  });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['GET', '/v1/spaces/AAA/messages']]);
  assert.deepEqual(calls[0].query, {
    pageSize: '20',
    filter: 'create_time > "2026-10-29T00:00:00Z" AND create_time < "2026-10-30T00:00:00+01:00" AND thread.name = spaces/AAA/threads/t1',
    orderBy: 'create_time desc',
    markupSyntax: 'MARKUP_SYNTAX_MARKDOWN',
  });
  assert.equal(res.conversation_id, 'spaces/AAA');
  assert.deepEqual(res.messages, [
    {
      id: 'spaces/AAA/messages/m1',
      conversation_id: 'spaces/AAA',
      thread_id: 'spaces/AAA/threads/t1',
      sender: { id: 'users/111', display_name: 'Ana', email: 'ana@example.com', type: 'HUMAN' },
      create_time: '2026-10-30T09:00:00Z',
      text: '**hello**',
    },
  ]);
  assert.equal(res.private_messages_left_out, 1);
  assert.equal(res.next_page_token, 'older');

  reset(() => ({ messages: [msg('m1', 'hello')] }));
  const plain = await run('chat_list_messages', { conversation_id: 'spaces/AAA', order: 'oldest', format: 'chat', page_size: 1000 });
  assert.deepEqual(calls[0].query, { pageSize: '1000', orderBy: 'create_time asc' }, 'no filter and no markup without them');
  assert.equal(plain.messages[0].text, 'hello');
});

test('list_messages: the text is cut at max_chars (default 2000) and marked; bad ids and windows are refused before any request', async () => {
  const long = 'x'.repeat(chat.CHAT_TEXT_DEFAULT_CHARS + 5);
  reset(() => ({ messages: [msg('m1', long, { formattedText: undefined, attachment: [{ contentName: 'a.pdf', contentType: 'application/pdf', driveDataRef: { driveFileId: 'f1' } }] })] }));
  const res = await run('chat_list_messages', { conversation_id: 'spaces/AAA' });
  assert.equal(res.messages[0].text.length, chat.CHAT_TEXT_DEFAULT_CHARS);
  assert.equal(res.messages[0].text_truncated, true);
  assert.equal(res.messages[0].text_chars, long.length);
  assert.deepEqual(res.messages[0].attachments, [{ name: 'a.pdf', content_type: 'application/pdf', drive_file_id: 'f1' }]);
  const short = await run('chat_list_messages', { conversation_id: 'spaces/AAA', max_chars: 10 });
  assert.equal(short.messages[0].text.length, 10);
  assert.equal(parse('chat_list_messages', { conversation_id: 'spaces/AAA', max_chars: chat.CHAT_TEXT_MAX_CHARS + 1 }).success, false);
  assert.equal(parse('chat_list_messages', { conversation_id: 'spaces/AAA', page_size: 1001 }).success, false);

  reset();
  await assert.rejects(run('chat_list_messages', { conversation_id: 'spaces/A/B' }), /conversation id such as spaces\/AAAAxxxx/);
  await assert.rejects(run('chat_list_messages', { conversation_id: 'spaces/AAA', thread_id: 'spaces/BBB/threads/t1' }), /is not in conversation spaces\/AAA/);
  await assert.rejects(run('chat_list_messages', { conversation_id: 'spaces/AAA', start_time: '2026-10-30T00:00:00Z', end_time: '2026-10-29T00:00:00Z' }), /end_time must be after start_time/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// chat_search_messages

test('searchFilter: words, then each condition joined by AND; several values of one field in parentheses with OR', () => {
  assert.equal(
    chat.searchFilter({
      query: ' "quarterly report" budget ',
      conversation_ids: ['spaces/A', 'B'],
      senders: ['ana@example.com'],
      space_types: ['SPACE', 'GROUP_CHAT'],
      mentions_me: true,
      has_link: true,
      has_attachment: true,
      unread_only: true,
      start_time: '2026-10-01T00:00:00Z',
      end_time: '2026-10-30T00:00:00Z',
      filter: 'space.display_name:Project',
    }),
    '"quarterly report" budget AND (space.name = "spaces/A" OR space.name = "spaces/B") AND sender.name = "users/ana@example.com" AND (space.space_type = "SPACE" OR space.space_type = "GROUP_CHAT") AND annotations.user_mentions.user.name:users/me AND has_link() AND attachment:* AND is_unread() AND create_time >= "2026-10-01T00:00:00Z" AND create_time < "2026-10-30T00:00:00Z" AND space.display_name:Project',
  );
  assert.equal(chat.searchFilter({ senders: ['a@example.com', 'users/b@example.com'] }), '(sender.name = "users/a@example.com" OR sender.name = "users/b@example.com")');
  assert.throws(() => chat.searchFilter({}), /needs something to search for/);
  assert.throws(() => chat.searchFilter({ query: '   ' }), /needs something to search for/);
  assert.throws(() => chat.searchFilter({ query: 'x'.repeat(chat.CHAT_SEARCH_FILTER_MAX + 1) }), /Google takes at most 1000/);
  assert.equal(chat.searchFilter({ query: 'x'.repeat(chat.CHAT_SEARCH_FILTER_MAX) }).length, 1000);
  assert.throws(() => chat.searchFilter({ senders: ['bad"quote@example.com'] }), /not an email address/);
});

test('search_messages: one POST to spaces/-/messages:search, newest first in Markdown; nothing to search for is refused first', async () => {
  reset(() => ({ results: [{ message: msg('m1', 'budget', { space: { name: 'spaces/AAA', displayName: 'Finance' } }) }, { message: msg('m2', 'x', { privateMessageViewer: { name: 'users/1' } }) }], nextPageToken: 'n' }));
  const res = await run('chat_search_messages', { query: 'budget', page_size: 50, page_token: 'p1' });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['POST', '/v1/spaces/-/messages:search']]);
  assert.deepEqual(calls[0].body, { filter: 'budget', pageSize: 50, pageToken: 'p1', orderBy: 'create_time desc', markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' });
  assert.equal(res.filter, 'budget');
  assert.deepEqual(res.messages.map((m) => [m.id, m.conversation_name, m.text]), [['spaces/AAA/messages/m1', 'Finance', '**budget**']]);
  assert.equal(res.next_page_token, 'n');
  reset(() => ({}));
  await run('chat_search_messages', { mentions_me: true, format: 'chat' });
  assert.deepEqual(calls[0].body, { filter: 'annotations.user_mentions.user.name:users/me', pageSize: 25, orderBy: 'create_time desc' });
  reset();
  await assert.rejects(run('chat_search_messages', {}), /needs something to search for/);
  assert.equal(calls.length, 0);
  assert.equal(parse('chat_search_messages', { query: 'x', page_size: 101 }).success, false);
});

// ---------------------------------------------------------------------------
// chat_list_members

test('list_members: joined members by default; invited, groups and managers on request; short entries', async () => {
  reset(() => ({ memberships: [{ name: 'spaces/AAA/members/1', state: 'JOINED', role: 'ROLE_MANAGER', createTime: '2026-01-01T00:00:00Z', member: { name: 'users/1', displayName: 'Ana', email: 'ana@example.com', type: 'HUMAN' } }, { state: 'JOINED', role: 'ROLE_MEMBER', groupMember: { name: 'groups/g1' } }] }));
  const res = await run('chat_list_members', { conversation_id: 'spaces/AAA' });
  assert.deepEqual(calls.map((c) => [c.path, c.query]), [['/v1/spaces/AAA/members', { pageSize: '20' }]]);
  assert.deepEqual(res.members, [
    { id: 'users/1', display_name: 'Ana', email: 'ana@example.com', type: 'HUMAN', role: 'ROLE_MANAGER', state: 'JOINED', joined: '2026-01-01T00:00:00Z' },
    { group: 'groups/g1', role: 'ROLE_MEMBER', state: 'JOINED' },
  ]);
  reset(() => ({}));
  await run('chat_list_members', { conversation_id: 'spaces/AAA', include_invited: true, include_groups: true, managers_only: true, page_size: 5, page_token: 'p' });
  assert.deepEqual(calls[0].query, { pageSize: '5', pageToken: 'p', showInvited: 'true', showGroups: 'true', filter: 'role = "ROLE_MANAGER"' });
});

// ---------------------------------------------------------------------------
// chat_send_message

test('send_message: prepare reads the conversation name; the approval shows it and the start of the text; Markdown by default', async () => {
  const text = `Release notes: ${'y'.repeat(700)}`;
  reset((call) => (call.method === 'GET' ? { name: 'spaces/AAA', displayName: 'Team', spaceType: 'SPACE' } : { name: 'spaces/AAA/messages/new', text, thread: { name: 'spaces/AAA/threads/n' }, createTime: '2026-10-30T10:00:00Z' }));
  const tool = tools.get('chat_send_message');
  const prepared = await tool.prepare({ conversation_id: 'spaces/AAA', text }, ctx);
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['GET', '/v1/spaces/AAA']], 'prepare only reads');
  assert.equal(prepared.preview.conversation, 'Team');
  assert.equal(prepared.preview.thread, 'a new thread');
  // Since 1.27.0 the approval shows up to CHAT_APPROVAL_TEXT_CHARS (1,500), so these 715 characters are shown whole.
  assert.equal(prepared.preview.text, text);
  assert.equal(prepared.preview.text_chars, text.length);
  const res = await tool.handler({ conversation_id: 'spaces/AAA', text }, ctx, prepared);
  assert.deepEqual(calls.slice(1).map((c) => [c.method, c.path, c.query]), [['POST', '/v1/spaces/AAA/messages', {}]]);
  assert.deepEqual(calls[1].body, { text, markupSyntax: 'MARKUP_SYNTAX_MARKDOWN' });
  assert.equal(res.sent, true);
  assert.equal(res.id, 'spaces/AAA/messages/new');
  assert.equal(res.text_truncated, true);
});

test('send_message: a reply goes in its thread or fails (REPLY_MESSAGE_OR_FAIL); chat format sends no markup; the name may be unreadable', async () => {
  reset((call) => {
    if (call.method === 'GET') {
      const err = new Error('forbidden');
      err.response = { status: 403, data: { error: { code: 403, message: 'Request had insufficient authentication scopes.' } } };
      throw err;
    }
    return { name: 'spaces/AAA/messages/r1', thread: { name: 'spaces/AAA/threads/t1' } };
  });
  const tool = tools.get('chat_send_message');
  const args = { conversation_id: 'spaces/AAA', text: '*hi*', thread_id: 'spaces/AAA/threads/t1', format: 'chat' };
  const prepared = await tool.prepare(args, ctx);
  assert.equal(prepared.preview.conversation, '(name not readable with this sign-in)');
  assert.equal(prepared.preview.thread_id, 'spaces/AAA/threads/t1');
  await tool.handler(args, ctx, prepared);
  const post = calls.find((c) => c.method === 'POST');
  assert.deepEqual(post.query, { messageReplyOption: 'REPLY_MESSAGE_OR_FAIL' });
  assert.deepEqual(post.body, { text: '*hi*', thread: { name: 'spaces/AAA/threads/t1' } });
  // Without a prepared plan (a direct handler call), the handler works the plan out itself.
  reset(() => ({ name: 'spaces/AAA', displayName: 'Team' }));
  await tool.handler({ conversation_id: 'spaces/AAA', text: 'plain' }, ctx);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
});

test('send_message: empty text, over 32,000 bytes, and a thread of another conversation are refused before any request', async () => {
  const tool = tools.get('chat_send_message');
  reset();
  await assert.rejects(tool.prepare({ conversation_id: 'spaces/AAA', text: '  ' }, ctx), /text is empty/);
  await assert.rejects(tool.prepare({ conversation_id: 'spaces/AAA', text: 'é'.repeat(16001) }, ctx), /32002 bytes; Google Chat takes at most 32000/);
  await assert.rejects(tool.prepare({ conversation_id: 'spaces/AAA', text: 'x', thread_id: 'spaces/BBB/threads/t' }, ctx), /not in conversation spaces\/AAA/);
  assert.equal(calls.length, 0);
  reset(() => ({}));
  await tool.prepare({ conversation_id: 'spaces/AAA', text: 'x'.repeat(chat.CHAT_MESSAGE_MAX_BYTES) }, ctx);
  assert.equal(calls.length, 1, 'exactly 32,000 bytes is allowed');
});

// ---------------------------------------------------------------------------
// chat_mark_read and chat_mark_unread

test('mark_read: one PATCH of the read state per conversation; one failure does not stop the others; all failing is an error', async () => {
  reset((call) => {
    if (call.path.includes('/BAD/')) {
      const err = new Error('nope');
      err.response = { status: 404, data: { error: { code: 404, message: 'Space not found' } } };
      throw err;
    }
    return { lastReadTime: '2026-10-30T09:00:00Z' };
  });
  const res = await run('chat_mark_read', { conversation_ids: ['spaces/AAA', 'BAD', 'spaces/AAA'] });
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.query.updateMask]), [
    ['PATCH', '/v1/users/me/spaces/AAA/spaceReadState', 'last_read_time'],
    ['PATCH', '/v1/users/me/spaces/BAD/spaceReadState', 'last_read_time'],
  ]);
  assert.ok(!Number.isNaN(Date.parse(calls[0].body.lastReadTime)), 'a read time of now');
  assert.deepEqual(res.marked_read, [{ conversation_id: 'spaces/AAA', last_read_time: '2026-10-30T09:00:00Z' }]);
  assert.deepEqual(res.failed, [{ conversation_id: 'spaces/BAD', error: 'Space not found' }]);
  await assert.rejects(run('chat_mark_read', { conversation_ids: ['BAD'] }), /No conversation was marked read: spaces\/BAD: Space not found/);
  // At most 10 a call, as Google's mark_as_read.
  const ids = (n) => Array.from({ length: n }, (_, i) => `spaces/S${i}`);
  assert.equal(parse('chat_mark_read', { conversation_ids: ids(chat.CHAT_MARK_READ_MAX) }).success, true);
  assert.equal(parse('chat_mark_read', { conversation_ids: ids(chat.CHAT_MARK_READ_MAX + 1) }).success, false);
  assert.equal(parse('chat_mark_read', { conversation_ids: [] }).success, false);
  assert.equal('thread_ids' in tools.get('chat_mark_read').inputSchema, false, 'no public method for a thread read state');
});

test('mark_unread: one PATCH with the given read time', async () => {
  reset((call) => ({ lastReadTime: call.body.lastReadTime }));
  const res = await run('chat_mark_unread', { conversation_id: 'spaces/AAA', last_read_time: '2026-10-29T08:59:59Z' });
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.query, c.body]), [['PATCH', '/v1/users/me/spaces/AAA/spaceReadState', { updateMask: 'last_read_time' }, { lastReadTime: '2026-10-29T08:59:59Z' }]]);
  assert.deepEqual(res, { conversation_id: 'spaces/AAA', last_read_time: '2026-10-29T08:59:59Z' });
  assert.equal(parse('chat_mark_unread', { conversation_id: 'spaces/AAA', last_read_time: 'yesterday' }).success, false);
});
