// The Gmail parity tools (1.7.0): gmail_search_threads, gmail_get_thread, gmail_label, gmail_unlabel, gmail_trash,
// gmail_untrash, and the new options of gmail_list_labels and gmail_list_drafts. The HTTP layer is stubbed
// (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools } = await import(DIST('servers/gmail.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-gmail-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = Array.isArray(value) ? value.map(String) : String(value);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body: opts.data };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};

const b64url = (text) => Buffer.from(text, 'utf8').toString('base64url');
const hdrs = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const msg = (id, headers, extra = {}) => ({ id, threadId: 'thr-1', labelIds: ['INBOX'], snippet: `snippet ${id}`, payload: { mimeType: 'text/plain', headers: hdrs(headers), body: { data: b64url(`\r\n\r\nBody of ${id}\r\n\r\n`) } }, ...extra });

const THREAD = {
  id: 'thr-1',
  historyId: '9',
  messages: [
    msg('m1', { From: 'Ana <ana@example.com>', To: 'me@example.com', Subject: 'Plan', Date: 'Mon, 2 Nov 2026 10:00:00 +0100' }),
    msg('m2', { From: 'me@example.com', To: 'Ana <ana@example.com>', Cc: 'bo@example.com', Subject: 'Re: Plan', Date: 'Mon, 2 Nov 2026 11:00:00 +0100' }, { labelIds: ['SENT'] }),
  ],
};
const LABELS = {
  labels: [
    { id: 'INBOX', name: 'INBOX', type: 'system' },
    { id: 'TRASH', name: 'TRASH', type: 'system' },
    { id: 'SPAM', name: 'SPAM', type: 'system' },
    { id: 'STARRED', name: 'STARRED', type: 'system' },
    { id: 'Label_1', name: 'Invoices', type: 'user' },
    { id: 'Label_2', name: 'Work/Clients', type: 'user' },
    { id: 'Label_3', name: 'Archive 2025', type: 'user' },
  ],
};

const gmailFake = (call) => {
  if (call.path.endsWith('/labels')) return LABELS;
  if (call.path.endsWith('/threads')) return { threads: [{ id: 'thr-1' }, { id: 'thr-2' }], nextPageToken: 'next', resultSizeEstimate: 2 };
  if (/\/threads\/thr-\d$/.test(call.path)) return { ...THREAD, id: call.path.split('/').pop() };
  if (/\/messages\/m\d$/.test(call.path)) return THREAD.messages[0];
  if (call.path.endsWith('/modify') || call.path.endsWith('/trash') || call.path.endsWith('/untrash')) return { id: 'x', labelIds: ['INBOX'] };
  if (call.path.endsWith('/drafts')) return { drafts: [] };
  return {};
};

test('kinds follow classifyMethod: label and unlabel (modify) write, trash destructive, untrash write, reads read', () => {
  const expect = {
    gmail_search_threads: classifyMethod('GET', 'list', 'gmail.users.threads.list'),
    gmail_get_thread: classifyMethod('GET', 'get', 'gmail.users.threads.get'),
    gmail_label: classifyMethod('POST', 'modify', 'gmail.users.threads.modify'),
    gmail_unlabel: classifyMethod('POST', 'modify', 'gmail.users.messages.modify'),
    gmail_trash: classifyMethod('POST', 'trash', 'gmail.users.threads.trash'),
    gmail_untrash: classifyMethod('POST', 'untrash', 'gmail.users.threads.untrash'),
  };
  assert.deepEqual(expect, { gmail_search_threads: 'read', gmail_get_thread: 'read', gmail_label: 'write', gmail_unlabel: 'write', gmail_trash: 'destructive', gmail_untrash: 'write' });
  for (const [name, kind] of Object.entries(expect)) assert.equal(tools.get(name).kind, kind, name);
  for (const name of ['gmail_search_threads', 'gmail_get_thread', 'gmail_label', 'gmail_unlabel']) {
    assert.match(tools.get(name).description, /Google's Gmail MCP server/, `${name} names the official tool it matches`);
  }
});

test('search_threads: thread-level results with each message summarised; page size 10 by default, at most 50; trash on request', async () => {
  calls = [];
  respond = gmailFake;
  const out = await tools.get('gmail_search_threads').handler({ query: 'from:ana' }, ctx);
  assert.equal(calls[0].path, '/gmail/v1/users/me/threads');
  // 10 since 1.29.0 (GMAIL_PAGE_DEFAULT; before 20): each thread found costs a further threads.get.
  assert.deepEqual({ q: calls[0].query.q, maxResults: calls[0].query.maxResults, includeSpamTrash: calls[0].query.includeSpamTrash }, { q: 'from:ana', maxResults: '10', includeSpamTrash: 'false' });
  assert.equal(calls[1].query.format, 'metadata');
  assert.equal(out.threads.length, 2);
  assert.equal(out.next_page_token, 'next');
  assert.equal(out.result_size_estimate, 2);
  const [t] = out.threads;
  assert.equal(t.id, 'thr-1');
  assert.equal(t.message_count, 2);
  assert.deepEqual(t.messages[1], {
    id: 'm2',
    from: 'me@example.com',
    to: 'Ana <ana@example.com>',
    cc: 'bo@example.com',
    date: 'Mon, 2 Nov 2026 11:00:00 +0100',
    subject: 'Re: Plan',
    snippet: 'snippet m2',
    label_ids: ['SENT'],
  });

  calls = [];
  const concise = await tools.get('gmail_search_threads').handler({ query: 'x', page_size: 50, include_trash: true, view: 'concise', page_token: 'p2' }, ctx);
  assert.deepEqual({ maxResults: calls[0].query.maxResults, includeSpamTrash: calls[0].query.includeSpamTrash, pageToken: calls[0].query.pageToken }, { maxResults: '50', includeSpamTrash: 'true', pageToken: 'p2' });
  assert.deepEqual(concise.threads[0], {
    id: 'thr-1',
    message_count: 2,
    subject: 'Plan',
    first_from: 'Ana <ana@example.com>',
    last_from: 'me@example.com',
    last_date: 'Mon, 2 Nov 2026 11:00:00 +0100',
    snippet: 'snippet m2',
    label_ids: ['INBOX', 'SENT'],
  });
  const schema = tools.get('gmail_search_threads').inputSchema;
  assert.equal(schema.page_size.safeParse(51).success, false, 'page_size is at most 50');
});

test('get_thread: every message decoded as gmail_get_message does; concise leaves the bodies out', async () => {
  calls = [];
  respond = gmailFake;
  const out = await tools.get('gmail_get_thread').handler({ thread_id: 'thr-1' }, ctx);
  assert.equal(calls[0].path, '/gmail/v1/users/me/threads/thr-1');
  assert.equal(calls[0].query.format, 'full');
  assert.equal(out.id, 'thr-1');
  assert.equal(out.message_count, 2);
  assert.equal(out.messages[0].body, 'Body of m1', 'blank lines trimmed');
  assert.equal(out.messages[0].from, 'Ana <ana@example.com>');
  assert.deepEqual(out.messages[0].attachments, []);
  const concise = await tools.get('gmail_get_thread').handler({ thread_id: 'thr-1', view: 'concise' }, ctx);
  assert.equal(calls.at(-1).query.format, 'metadata');
  assert.equal('body' in concise.messages[0], false);
  assert.equal(concise.messages[1].snippet, 'snippet m2');
});

test('label: names resolve to ids (case-insensitive), ids pass through; thread or message, exactly one', async () => {
  calls = [];
  respond = gmailFake;
  const out = await tools.get('gmail_label').handler({ thread_id: 'thr-1', labels: ['invoices', 'Label_2', 'STARRED'] }, ctx);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /gmail/v1/users/me/labels', 'POST /gmail/v1/users/me/threads/thr-1/modify']);
  assert.deepEqual(calls[1].body, { addLabelIds: ['Label_1', 'Label_2', 'STARRED'] });
  assert.deepEqual(out.added, [{ id: 'Label_1', name: 'Invoices' }, { id: 'Label_2', name: 'Work/Clients' }, { id: 'STARRED', name: 'STARRED' }]);

  calls = [];
  await tools.get('gmail_unlabel').handler({ message_id: 'm1', labels: ['INBOX', 'archive 2025'] }, ctx);
  assert.equal(calls[1].path, '/gmail/v1/users/me/messages/m1/modify');
  assert.deepEqual(calls[1].body, { removeLabelIds: ['INBOX', 'Label_3'] });

  calls = [];
  await assert.rejects(tools.get('gmail_label').handler({ thread_id: 'thr-1', labels: ['Nope'] }, ctx), /No label "Nope"\. Use gmail_list_labels/);
  await assert.rejects(tools.get('gmail_label').handler({ labels: ['INBOX'] }, ctx), /needs thread_id or message_id \(one of them\)/);
  await assert.rejects(tools.get('gmail_label').handler({ thread_id: 't', message_id: 'm', labels: ['INBOX'] }, ctx), /needs thread_id or message_id \(one of them\)/);
  await assert.rejects(tools.get('gmail_label').handler({ thread_id: 't', labels: [] }, ctx), /at least one label/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'nothing was changed');
});

test('label: Trash and Spam are refused (use gmail_trash); unlabel refuses TRASH (use gmail_untrash), nothing is sent', async () => {
  calls = [];
  respond = gmailFake;
  await assert.rejects(tools.get('gmail_label').handler({ thread_id: 'thr-1', labels: ['Invoices', 'trash'] }, ctx), /TRASH is not added here: use gmail_trash/);
  await assert.rejects(tools.get('gmail_label').handler({ message_id: 'm1', labels: ['SPAM'] }, ctx), /SPAM is not added here/);
  await assert.rejects(tools.get('gmail_unlabel').handler({ message_id: 'm1', labels: ['TRASH'] }, ctx), /TRASH is not removed here: use gmail_untrash/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  // Removing SPAM (not spam) is allowed.
  calls = [];
  await tools.get('gmail_unlabel').handler({ message_id: 'm1', labels: ['SPAM'] }, ctx);
  assert.deepEqual(calls.at(-1).body, { removeLabelIds: ['SPAM'] });
});

test('trash: the approval shows what moves to Trash (prepare reads it); untrash restores; thread or message', async () => {
  calls = [];
  respond = gmailFake;
  const trash = tools.get('gmail_trash');
  const prepared = await trash.prepare({ thread_id: 'thr-1' }, ctx);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /gmail/v1/users/me/threads/thr-1']);
  assert.match(prepared.preview.action, /Moves this thread \(2 messages\) to Trash/);
  assert.equal(prepared.preview.subject, 'Plan');
  calls = [];
  await trash.handler({ thread_id: 'thr-1' }, ctx, prepared);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /gmail/v1/users/me/threads/thr-1/trash']);
  calls = [];
  await trash.handler({ message_id: 'm1' }, ctx);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /gmail/v1/users/me/messages/m1', 'POST /gmail/v1/users/me/messages/m1/trash']);
  calls = [];
  await tools.get('gmail_untrash').handler({ message_id: 'm1' }, ctx);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['POST /gmail/v1/users/me/messages/m1/untrash']);
  await assert.rejects(trash.prepare({}, ctx), /needs thread_id or message_id \(one of them\)/);
});

test('list_labels: unchanged without options; user_only keeps user labels; page_size pages them', async () => {
  respond = gmailFake;
  const plain = await tools.get('gmail_list_labels').handler({}, ctx);
  assert.deepEqual(plain, LABELS.labels.map((l) => ({ id: l.id, name: l.name, type: l.type })), 'the 1.6.0 answer');
  const user = await tools.get('gmail_list_labels').handler({ user_only: true }, ctx);
  assert.deepEqual(user.map((l) => l.id), ['Label_1', 'Label_2', 'Label_3']);
  const page1 = await tools.get('gmail_list_labels').handler({ page_size: 2 }, ctx);
  assert.deepEqual(page1.labels.map((l) => l.id), ['INBOX', 'TRASH']);
  assert.equal(page1.next_page_token, '2');
  const last = await tools.get('gmail_list_labels').handler({ page_size: 5, page_token: page1.next_page_token }, ctx);
  assert.deepEqual(last.labels.map((l) => l.id), ['SPAM', 'STARRED', 'Label_1', 'Label_2', 'Label_3']);
  assert.equal(last.next_page_token, undefined);
  await assert.rejects(tools.get('gmail_list_labels').handler({ page_token: 'abc' }, ctx), /page_token/);
});

test('list_drafts: query is passed to Gmail as q', async () => {
  calls = [];
  respond = gmailFake;
  await tools.get('gmail_list_drafts').handler({ query: 'subject:plan' }, ctx);
  assert.equal(calls[0].query.q, 'subject:plan');
});
