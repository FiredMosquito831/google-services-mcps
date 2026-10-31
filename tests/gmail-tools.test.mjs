// Behaviour of the curated Gmail tools (src/servers/gmail.ts): reading (charsets, blank lines, large parts, attachment
// ids), attachments, sending and replying (threading, previews, the size limit, refused paths) and drafts. The HTTP layer
// is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync, ftruncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools } = await import(DIST('servers/gmail.js'));
const { buildMime } = await import(DIST('servers/gmail-mime.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-gmail-tools-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
const files = join(root, 'files');
mkdirSync(tokenDir);
mkdirSync(files);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));

const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const toolsOf = async (c) => new Map((await buildTools(c)).map((t) => [t.name, t]));
const tools = await toolsOf(cfg);
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

// ---------------------------------------------------------------------------
// The stubbed HTTP layer

let calls = [];
let respond = () => ({});

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('latin1');
}

OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = Array.isArray(value) ? value.map(String) : String(value);
  let body = opts.data;
  let upload;
  if (body && typeof body.pipe === 'function') {
    const text = await readStream(body);
    const json = /content-type: application\/json\r\n\r\n([\s\S]*?)\r\n--/.exec(text);
    const media = /content-type: message\/rfc822\r\n\r\n([\s\S]*?)\r\n--[0-9a-f-]+--$/.exec(text);
    body = json ? JSON.parse(json[1]) : undefined;
    upload = media ? media[1] : undefined;
  }
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, query, body, upload };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};

const b64url = (text, encoding = 'utf8') => Buffer.from(text, encoding).toString('base64url');
const rawOf = (call) => (call.upload !== undefined ? call.upload : Buffer.from(call.body.raw, 'base64url').toString('latin1'));
const headerOf = (raw, name) => {
  const head = raw.slice(0, raw.indexOf('\r\n\r\n')).replace(/\r\n[ \t]/g, ' ');
  const line = head.split('\r\n').find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line?.slice(name.length + 1).trim();
};
/** The decoded text of every base64 text/plain part of a raw message. */
const plainTexts = (raw) =>
  [...raw.matchAll(/Content-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)].map((m) =>
    Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );

const ORIGINAL = {
  id: 'orig-1',
  threadId: 'thr-9',
  labelIds: ['INBOX'],
  snippet: 'Can we meet?',
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'From', value: 'Ana <ana@example.com>' },
      { name: 'To', value: 'me@example.com, Bo <bo@example.com>' },
      { name: 'Cc', value: 'cy@example.com' },
      { name: 'Subject', value: 'Meeting' },
      { name: 'Date', value: 'Mon, 2 Nov 2026 10:00:00 +0100' },
      { name: 'Message-ID', value: '<m2@mail.example.com>' },
      { name: 'References', value: '<m1@mail.example.com>' },
      { name: 'Content-Type', value: 'text/plain; charset="utf-8"' },
    ],
    body: { size: 12, data: b64url('Can we meet?\r\nThursday?') },
  },
};

/** Gmail as the tools see it: the original message, the profile, and sends that return an id. */
const gmailFake = (original = ORIGINAL) => (call) => {
  if (call.path.endsWith('/profile')) return { emailAddress: 'me@example.com' };
  if (call.path.endsWith(`/messages/${original.id}`)) return original;
  if (call.path.endsWith('/messages/send')) return { id: 'sent-1', threadId: call.body?.threadId ?? 'new-thread', labelIds: ['SENT'] };
  if (call.path.endsWith('/drafts')) return { id: 'draft-1', message: { id: 'dm-1', threadId: call.body?.message?.threadId ?? 'new-thread' } };
  return {};
};

function fileOf(name, size, fill = 'a') {
  const path = join(files, name);
  writeFileSync(path, Buffer.alloc(size, fill));
  return path;
}

// ---------------------------------------------------------------------------
// Kinds

test('kinds follow classifyMethod for the method each tool changes: send and reply destructive, draft write, reads read', () => {
  const expect = {
    gmail_send: classifyMethod('POST', 'send', 'gmail.users.messages.send'),
    gmail_reply: classifyMethod('POST', 'send', 'gmail.users.messages.send'),
    gmail_send_draft: classifyMethod('POST', 'send', 'gmail.users.drafts.send'),
    gmail_create_draft: classifyMethod('POST', 'create', 'gmail.users.drafts.create'),
    gmail_get_attachment: classifyMethod('GET', 'get', 'gmail.users.messages.attachments.get'),
    gmail_get_message: classifyMethod('GET', 'get', 'gmail.users.messages.get'),
  };
  assert.deepEqual(expect, {
    gmail_send: 'destructive',
    gmail_reply: 'destructive',
    gmail_send_draft: 'destructive',
    gmail_create_draft: 'write',
    gmail_get_attachment: 'read',
    gmail_get_message: 'read',
  });
  for (const [name, kind] of Object.entries(expect)) assert.equal(tools.get(name).kind, kind, name);
  // Only the two sends and the move to Trash work out a preview before the gate.
  assert.deepEqual([...tools.values()].filter((t) => t.prepare).map((t) => t.name).sort(), ['gmail_reply', 'gmail_send', 'gmail_trash']);
  // No scope beyond the 1.2.0 policy: send and reply ride on gmail.modify (or compose, or the full scope).
  const G = (s) => `https://www.googleapis.com/auth/${s}`;
  assert.deepEqual(tools.get('gmail_send').scopes, ['https://mail.google.com/', G('gmail.compose'), G('gmail.modify')]);
  assert.deepEqual(tools.get('gmail_reply').scopes, ['https://mail.google.com/', G('gmail.modify')]);
  assert.deepEqual(tools.get('gmail_get_attachment').scopes, ['https://mail.google.com/', G('gmail.modify'), G('gmail.readonly')]);
});

// ---------------------------------------------------------------------------
// Reading

test('get_message: each part decoded with its charset, blank lines trimmed, a large part fetched by id, attachment ids, snippet and HTML', async () => {
  const message = {
    id: 'msg-7',
    threadId: 'thr-7',
    labelIds: ['INBOX'],
    snippet: 'Příliš',
    payload: {
      mimeType: 'multipart/mixed',
      headers: [{ name: 'Subject', value: 'Charsets' }],
      parts: [
        {
          partId: '0',
          mimeType: 'multipart/alternative',
          parts: [
            {
              partId: '0.0',
              mimeType: 'text/plain',
              headers: [{ name: 'Content-Type', value: 'text/plain; charset="ISO-8859-2"' }],
              body: { size: 20, data: Buffer.concat([Buffer.from('\r\n\r\n \r\n\r\n'), Buffer.from([0x50, 0xf8, 0xed, 0x6c, 0x69, 0xb9]), Buffer.from('\r\n\r\n\r\n\r\nkonec\r\n\r\n')]).toString('base64url') },
            },
            { partId: '0.1', mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=windows-1252' }], body: { size: 900000, attachmentId: 'big-html' } },
          ],
        },
        { partId: '1', mimeType: 'application/pdf', filename: 'invoice.pdf', headers: [], body: { size: 5120, attachmentId: 'att-pdf' } },
      ],
    },
  };
  calls = [];
  respond = (call) => (call.path.endsWith('/attachments/big-html') ? { size: 6, data: Buffer.from([0x3c, 0x62, 0x3e, 0x80, 0x3c, 0x2f, 0x62, 0x3e]).toString('base64url') } : message);
  const out = await tools.get('gmail_get_message').handler({ id: 'msg-7', include_html: true }, ctx);
  assert.equal(out.body, 'Příliš\n\nkonec', 'decoded as ISO-8859-2, leading and trailing blank lines gone, inner run collapsed');
  assert.equal(out.body_source, 'text/plain');
  assert.equal(out.snippet, 'Příliš');
  assert.equal(out.body_html, '<b>€</b>', 'the large HTML part was fetched by its id and decoded as windows-1252');
  assert.deepEqual(out.attachments, [{ filename: 'invoice.pdf', mime_type: 'application/pdf', size: 5120, attachment_id: 'att-pdf', part_id: '1' }]);
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/gmail/v1/users/me/messages/msg-7', '/gmail/v1/users/me/messages/msg-7/attachments/big-html'],
  );

  // Without include_html there is no body_html key; a message with only HTML reads as text.
  respond = () => ({
    id: 'msg-8',
    payload: { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: b64url('<p>\n\nHi&nbsp;there</p>\n\n\n') } },
  });
  const htmlOnly = await tools.get('gmail_get_message').handler({ id: 'msg-8' }, ctx);
  assert.equal('body_html' in htmlOnly, false);
  assert.equal(htmlOnly.body, 'Hi there');
  assert.equal(htmlOnly.body_source, 'text/html');

  // An unknown charset is read as UTF-8 and said so; metadata has the snippet and no body.
  respond = () => ({ id: 'msg-9', snippet: 's', payload: { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=x-unknown' }], body: { data: b64url('ok') } } });
  const odd = await tools.get('gmail_get_message').handler({ id: 'msg-9' }, ctx);
  assert.equal(odd.body, 'ok');
  assert.match(odd.charset_note, /x-unknown is not known here; that text was read as UTF-8/);
  const meta = await tools.get('gmail_get_message').handler({ id: 'msg-9', format: 'metadata' }, ctx);
  assert.equal(meta.snippet, 's');
  assert.equal('body' in meta, false);
});

test('get_attachment: base64 within the result limit; over it, the size and a clear note instead of the data', async () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  calls = [];
  respond = () => ({ size: bytes.length, data: bytes.toString('base64url') });
  const out = await tools.get('gmail_get_attachment').handler({ message_id: 'msg-1', attachment_id: 'att-1' }, ctx);
  assert.deepEqual(out, { message_id: 'msg-1', attachment_id: 'att-1', size_bytes: 9, data_base64: bytes.toString('base64') });
  assert.equal(calls[0].path, '/gmail/v1/users/me/messages/msg-1/attachments/att-1');

  const small = await toolsOf(loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_MAX_RESULT_CHARS: '2000' }));
  respond = () => ({ size: 3000, data: Buffer.alloc(3000, 9).toString('base64url') });
  const over = await small.get('gmail_get_attachment').handler({ message_id: 'msg-1', attachment_id: 'att-1' }, ctx);
  assert.equal(over.data_base64, null);
  assert.equal(over.size_bytes, 3000);
  assert.match(over.note, /3000 bytes, 4000 characters as base64, over this server's result limit of 2000 characters \(GSM_MAX_RESULT_CHARS\)\. Raise GSM_MAX_RESULT_CHARS to at least 5000/);
  assert.match(small.get('gmail_get_attachment').description, /now 2000 characters, so files up to about 750 bytes/);
  assert.match(over.note, /Or read it in parts of 750 bytes: call again with offset 0, then each next_offset \(4 calls\)/);
});

test('get_attachment: offset reads a large attachment in parts of a multiple of 3 bytes, which join into the whole file', async () => {
  const small = await toolsOf(loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_MAX_RESULT_CHARS: '2000' }));
  const bytes = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7) % 256));
  respond = () => ({ size: bytes.length, data: bytes.toString('base64url') });
  const tool = small.get('gmail_get_attachment');
  const parts = [];
  let offset = 0;
  while (offset !== undefined && parts.length < 10) {
    const part = await tool.handler({ message_id: 'msg-1', attachment_id: 'att-1', offset }, ctx);
    assert.equal(part.size_bytes, 2000);
    assert.equal(part.offset, offset);
    assert.ok(JSON.stringify(part).length <= 2000, 'each part fits the result limit');
    parts.push(part);
    offset = part.next_offset;
  }
  assert.deepEqual(parts.map((p) => p.bytes_read), [750, 750, 500]);
  assert.equal(parts.map((p) => p.data_base64).join(''), bytes.toString('base64'));
  assert.equal('next_offset' in parts[2], false, 'the last part has no next_offset');
  // A small attachment read with offset 0 comes in one part.
  respond = () => ({ size: 3, data: Buffer.from([1, 2, 3]).toString('base64url') });
  assert.deepEqual(await tool.handler({ message_id: 'm', attachment_id: 'a', offset: 0 }, ctx), {
    message_id: 'm',
    attachment_id: 'a',
    size_bytes: 3,
    offset: 0,
    bytes_read: 3,
    data_base64: 'AQID',
  });
  await assert.rejects(tool.handler({ message_id: 'm', attachment_id: 'a', offset: 4 }, ctx), /offset 4 is past the end of the file \(3 bytes\)/);
});

// ---------------------------------------------------------------------------
// Sending

test('send: the preview shows recipients, subject, attachment names and sizes and the body start; the handler sends exactly the previewed bytes', async () => {
  const pdf = fileOf('report.pdf', 1234, 'p');
  const send = tools.get('gmail_send');
  calls = [];
  respond = gmailFake();
  const args = { to: ['Ana <ana@example.com>'], cc: ['bo@example.com'], subject: 'Quarterly report', body_text: 'Hi Ana,\nattached.', body_html: '<p>Hi Ana,<br>attached.</p>', attachments: [pdf] };
  const prepared = await send.prepare(args, ctx);
  assert.equal(calls.length, 0, 'a new message needs no read from Google before the approval');
  const p = prepared.preview;
  assert.equal(p.action, 'Sends this email now. Sending cannot be undone.');
  assert.deepEqual(p.to, ['Ana <ana@example.com>']);
  assert.deepEqual(p.cc, ['bo@example.com']);
  assert.equal('bcc' in p, false);
  assert.equal(p.subject, 'Quarterly report');
  // The full, resolved path (a temp folder can be given in its short 8.3 form on Windows).
  assert.deepEqual(p.attachments, [{ name: 'report.pdf', size_bytes: 1234, type: 'application/pdf', path: realpathSync(pdf) }]);
  assert.equal(p.body_excerpt, 'Hi Ana,\nattached.');
  assert.equal(p.message_size_bytes, prepared.bytes);
  assert.match(p.from_account, /default account/);

  const out = await send.handler(args, ctx, prepared);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.path, '/gmail/v1/users/me/messages/send');
  assert.equal(call.body.threadId, undefined, 'a new message names no thread');
  assert.equal(rawOf(call), prepared.raw, 'the bytes sent are the bytes that were previewed');
  assert.match(headerOf(prepared.raw, 'Content-Type'), /^multipart\/mixed; boundary="/);
  assert.match(prepared.raw, /Content-Type: multipart\/alternative; boundary="/);
  assert.match(prepared.raw, /Content-Disposition: attachment; filename="report\.pdf"/);
  assert.deepEqual(plainTexts(prepared.raw), ['Hi Ana,\nattached.']);
  assert.equal(out.message_id, 'sent-1');
  assert.equal(out.sent_with, 'raw field');
  assert.deepEqual(out.attachments, [{ name: 'report.pdf', size_bytes: 1234 }]);
});

test('send: a message over 5 MB goes to the upload endpoint (uploadType=multipart) as message/rfc822', async () => {
  const big = fileOf('big.bin', 6 * 1024 * 1024, 'b');
  calls = [];
  respond = gmailFake();
  const out = await tools.get('gmail_send').handler({ to: ['a@example.com'], subject: 'Big', body_text: 'see attached', attachments: [big] }, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/upload/gmail/v1/users/me/messages/send');
  assert.equal(calls[0].query.uploadType, 'multipart');
  assert.ok(calls[0].upload.startsWith('To: a@example.com\r\nSubject: Big\r\n'), 'the media part is the message itself');
  assert.equal(calls[0].upload.length, out.size_bytes);
  assert.equal(out.sent_with, 'upload endpoint (uploadType=multipart)');
});

test("send: over Gmail's 35 MB limit is refused before any file is read or anything is sent", async () => {
  const path = join(files, 'huge.bin');
  const fd = openSync(path, 'w');
  ftruncateSync(fd, 27 * 1024 * 1024);
  closeSync(fd);
  calls = [];
  respond = gmailFake();
  await assert.rejects(
    tools.get('gmail_send').prepare({ to: ['a@example.com'], subject: 'Too big', body_text: 'x', attachments: [path] }, ctx),
    /over Gmail's limit of 36700160 bytes \(35 MB\)\. Attach less, or share large files through Drive and send the link\. Nothing was sent\./,
  );
  await assert.rejects(tools.get('gmail_send').handler({ to: ['a@example.com'], subject: 'Too big', attachments: [path] }, ctx), /over Gmail's limit/);
  assert.equal(calls.length, 0);
});

test('send: attachments must be full paths to files, never from the token folder; at least one recipient', async () => {
  const send = tools.get('gmail_send');
  writeFileSync(join(tokenDir, 'note.txt'), 'not a secret, but in the token folder');
  calls = [];
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 's', attachments: [join(tokenDir, 'workspace-user.token.json')] }, ctx), /is refused: it is in the folder that holds Google sign-in data/);
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 's', attachments: [join(tokenDir, 'note.txt')] }, ctx), /is refused/);
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 's', attachments: ['relative.txt'] }, ctx), /must be a full path/);
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 's', attachments: [join(files, 'missing.txt')] }, ctx), /was not found/);
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 's', attachments: [files] }, ctx), /is not a file/);
  await assert.rejects(send.prepare({ to: [], subject: 's', body_text: 'x' }, ctx), /needs at least one recipient/);
  await assert.rejects(send.prepare({ to: ['a@example.com'], subject: 'two\nlines' }, ctx), /subject must not contain line breaks/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// Replying

test('reply: same thread (threadId, In-Reply-To, References), "Re: " subject, Reply-To or sender, never this account', async () => {
  const reply = tools.get('gmail_reply');
  calls = [];
  respond = gmailFake();
  const prepared = await reply.prepare({ message_id: 'orig-1', body_text: 'Thursday works.' }, ctx);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ['GET /gmail/v1/users/me/messages/orig-1', 'GET /gmail/v1/users/me/profile'],
  );
  assert.equal(calls[0].query.format, 'metadata', 'headers only, unless the original is quoted');
  const p = prepared.preview;
  assert.deepEqual(p.to, ['Ana <ana@example.com>']);
  assert.equal(p.subject, 'Re: Meeting');
  assert.deepEqual(p.in_reply_to, { message_id: 'orig-1', thread_id: 'thr-9', from: 'Ana <ana@example.com>', subject: 'Meeting', date: 'Mon, 2 Nov 2026 10:00:00 +0100' });
  assert.match(p.threading, /threadId, In-Reply-To and References set/);

  calls = [];
  const out = await reply.handler({ message_id: 'orig-1', body_text: 'Thursday works.' }, ctx, prepared);
  assert.equal(calls.length, 1, 'the prepared reply is sent as it is: no second read');
  const raw = rawOf(calls[0]);
  assert.equal(calls[0].body.threadId, 'thr-9');
  assert.equal(headerOf(raw, 'In-Reply-To'), '<m2@mail.example.com>');
  assert.equal(headerOf(raw, 'References'), '<m1@mail.example.com> <m2@mail.example.com>');
  assert.equal(headerOf(raw, 'Subject'), 'Re: Meeting');
  assert.equal(headerOf(raw, 'To'), 'Ana <ana@example.com>');
  assert.equal(out.in_reply_to, 'orig-1');
  assert.equal(out.thread_id, 'thr-9');

  // Reply-all: the original's To and Cc join, without this account.
  respond = gmailFake();
  const all = await reply.prepare({ message_id: 'orig-1', body_text: 'ok', reply_all: true }, ctx);
  assert.deepEqual(all.preview.to, ['Ana <ana@example.com>', 'Bo <bo@example.com>']);
  assert.deepEqual(all.preview.cc, ['cy@example.com']);
  assert.doesNotMatch(all.raw.slice(0, all.raw.indexOf('\r\n\r\n')), /me@example\.com/);
});

test('reply: quote_original reads the full message and quotes it; an original without Message-ID still threads by thread id', async () => {
  const reply = tools.get('gmail_reply');
  calls = [];
  respond = gmailFake();
  const quoted = await reply.prepare({ message_id: 'orig-1', body_text: 'Yes.', quote_original: true }, ctx);
  assert.equal(calls[0].query.format, 'full');
  assert.deepEqual(plainTexts(quoted.raw), ['Yes.\n\nOn Mon, 2 Nov 2026 10:00:00 +0100, Ana <ana@example.com> wrote:\n> Can we meet?\n> Thursday?']);
  assert.equal(quoted.preview.quotes_original, true);
  assert.equal(quoted.preview.body_excerpt, 'Yes.', 'the excerpt is what the person wrote');

  const bare = { ...ORIGINAL, payload: { ...ORIGINAL.payload, headers: ORIGINAL.payload.headers.filter((h) => h.name !== 'Message-ID') } };
  respond = gmailFake(bare);
  const plan = await reply.prepare({ message_id: 'orig-1', body_text: 'ok' }, ctx);
  assert.equal(plan.threadId, 'thr-9');
  assert.equal(headerOf(plan.raw, 'In-Reply-To'), undefined);
  assert.match(plan.preview.threading, /thread id only: the original has no Message-ID header/);

  // A message from this account to no one else has no one to reply to.
  const lonely = { ...ORIGINAL, payload: { ...ORIGINAL.payload, headers: [{ name: 'From', value: 'me@example.com' }, { name: 'To', value: 'me@example.com' }] } };
  respond = gmailFake(lonely);
  await assert.rejects(reply.prepare({ message_id: 'orig-1', body_text: 'x' }, ctx), /has no one to reply to/);
});

// ---------------------------------------------------------------------------
// Drafts

test('create_draft: the 1.5.0 call shape sends the same message as before; a reply draft threads and defaults its recipients', async () => {
  const draft = tools.get('gmail_create_draft');
  calls = [];
  respond = gmailFake();
  const out = await draft.handler({ to: ['a@example.com'], subject: 'Hi', body: 'Text', cc: ['b@example.com'], bcc: ['c@example.com'] }, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/gmail/v1/users/me/drafts');
  assert.equal(
    rawOf({ body: calls[0].body.message }),
    'To: a@example.com\r\nCc: b@example.com\r\nBcc: c@example.com\r\nSubject: Hi\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\nVGV4dA==\r\n',
  );
  assert.deepEqual(out, { draft_id: 'draft-1', message_id: 'dm-1', thread_id: 'new-thread', to: ['a@example.com'], subject: 'Hi' });

  calls = [];
  respond = gmailFake();
  const reply = await draft.handler({ reply_to_message_id: 'orig-1', body: 'Draft reply', body_html: '<p>Draft reply</p>', attachments: [fileOf('a.txt', 3)] }, ctx);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ['GET /gmail/v1/users/me/messages/orig-1', 'GET /gmail/v1/users/me/profile', 'POST /gmail/v1/users/me/drafts'],
  );
  const sent = calls[2].body.message;
  assert.equal(sent.threadId, 'thr-9');
  const raw = rawOf({ body: sent });
  assert.equal(headerOf(raw, 'In-Reply-To'), '<m2@mail.example.com>');
  assert.equal(headerOf(raw, 'To'), 'Ana <ana@example.com>');
  assert.equal(headerOf(raw, 'Subject'), 'Re: Meeting');
  assert.match(raw, /Content-Type: multipart\/alternative/);
  assert.equal(reply.in_reply_to, 'orig-1');
  assert.deepEqual(reply.attachments, [{ name: 'a.txt', size_bytes: 3 }]);

  await assert.rejects(draft.handler({ subject: 'x', body: 'y' }, ctx), /needs at least one recipient in "to"/);
  await assert.rejects(draft.handler({ to: ['a@example.com'], body: 'y' }, ctx), /needs a subject/);
});

test('the plain builder and buildMime agree with what create_draft sends', () => {
  const raw = buildMime({ to: ['a@example.com'], cc: [], bcc: [], subject: 'Hi', text: 'Text' });
  assert.equal(raw, 'To: a@example.com\r\nSubject: Hi\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\nVGV4dA==\r\n');
});
