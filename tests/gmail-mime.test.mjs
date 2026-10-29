// The MIME, threading and decoding rules of the curated Gmail tools (src/servers/gmail-mime.ts). Pure functions: no
// network and no files. Run after compiling (npm test does).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const mime = await import(dist('servers/gmail-mime.js'));
const {
  buildMime,
  encodeHeaderText,
  foldHeader,
  splitAddresses,
  replySubject,
  replyReferences,
  replyRecipients,
  decodeText,
  charsetOf,
  tidyText,
  base64Lines,
  base64LinesLength,
  quoteText,
  checkAddress,
  GMAIL_MAX_MESSAGE_BYTES,
  GMAIL_JSON_RAW_MAX_BYTES,
} = mime;

/** The 1.5.0 builder of gmail_create_draft, copied as it was, so the plain layout can be compared byte for byte. */
function oldRaw(p) {
  const encodeSubject = (text) => {
    if (!/[^\x20-\x7e]/.test(text)) return text;
    const words = [];
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
  };
  const headers = [`To: ${p.to.join(', ')}`];
  if (p.cc.length) headers.push(`Cc: ${p.cc.join(', ')}`);
  if (p.bcc.length) headers.push(`Bcc: ${p.bcc.join(', ')}`);
  headers.push(`Subject: ${encodeSubject(p.subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64');
  const body = Buffer.from(p.body, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/** Splits a MIME entity into its headers (lower-case names, unfolded) and its body. */
function parseEntity(text) {
  const at = text.indexOf('\r\n\r\n');
  const head = text.slice(0, at).replace(/\r\n[ \t]/g, ' ');
  const headers = {};
  for (const line of head.split('\r\n')) {
    const i = line.indexOf(':');
    headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body: text.slice(at + 4) };
}

/** The parts of a multipart body, by its boundary. Checks the closing delimiter is there. */
function partsOf(entity) {
  const boundary = /boundary="([^"]+)"/.exec(entity.headers['content-type'])[1];
  assert.ok(entity.body.includes(`--${boundary}--\r\n`), 'the closing delimiter is present');
  const inner = entity.body.slice(0, entity.body.indexOf(`--${boundary}--`));
  return inner
    .split(`--${boundary}\r\n`)
    .filter((s) => s.length)
    .map((s) => parseEntity(s));
}

const decode64 = (body) => Buffer.from(body.replace(/\r\n/g, ''), 'base64');
const fixedBoundaries = () => {
  let n = 0;
  return () => `=_test_${++n}`;
};

test('a plain text message has the same bytes as the 1.5.0 draft builder', () => {
  for (const p of [
    { to: ['a@example.com'], cc: [], bcc: [], subject: 'Hi', body: 'Text' },
    { to: ['a@example.com', 'B <b@example.com>'], cc: ['c@example.com'], bcc: ['d@example.com'], subject: 'Ünïcödé', body: 'Zeile 1\nZeile 2 – ✓' },
    { to: ['a@example.com'], cc: [], bcc: [], subject: '', body: '' },
  ]) {
    assert.equal(buildMime({ to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, text: p.body }), oldRaw(p));
  }
});

test('headers: RFC 2047 words for non-ASCII, folded lines under 79 characters, 7-bit only, no Date, From or Message-ID', () => {
  const subject = 'Привет, это длинная тема письма, которая точно не поместится в одну строку заголовка';
  const raw = buildMime({ to: ['Ana Müller <ana@example.com>'], subject, text: 'x' });
  assert.match(raw, /^[\x00-\x7f]*$/, 'every byte is 7-bit');
  const headLines = raw.slice(0, raw.indexOf('\r\n\r\n')).split('\r\n');
  for (const line of headLines) assert.ok(line.length <= 78, `header line under 79: ${line}`);
  const { headers } = parseEntity(raw);
  assert.equal(headers.date, undefined);
  assert.equal(headers.from, undefined);
  assert.equal(headers['message-id'], undefined);
  assert.equal(headers['mime-version'], '1.0');
  // Unfolded, adjacent encoded words decode to the subject.
  const words = headers.subject.split(' ');
  const decoded = Buffer.concat(words.map((w) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(w)[1], 'base64'))).toString('utf8');
  assert.equal(decoded, subject);
  for (const w of words) assert.ok(w.length <= 75, 'each encoded word is at most 75 characters');
  assert.match(headers.to, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <ana@example\.com>$/, 'a non-ASCII display name is encoded, the address kept');
  assert.equal(encodeHeaderText('plain'), 'plain');
});

test('text and HTML go in multipart/alternative; attachments make it multipart/mixed with base64 in 76-character lines', () => {
  const pdf = Buffer.alloc(1000, 7);
  const raw = buildMime({
    to: ['a@example.com'],
    subject: 'Report',
    text: 'Hello ✓',
    html: '<p>Hello ✓</p>',
    attachments: [
      { filename: 'report.pdf', mimeType: 'application/pdf', data: pdf },
      { filename: 'notes "v2".txt', mimeType: 'text/plain', data: Buffer.from('n') },
    ],
    boundary: fixedBoundaries(),
  });
  const top = parseEntity(raw);
  assert.match(top.headers['content-type'], /^multipart\/mixed; boundary="=_test_2"$/);
  const [body, a1, a2, ...rest] = partsOf(top);
  assert.equal(rest.length, 0);
  assert.match(body.headers['content-type'], /^multipart\/alternative; boundary="=_test_1"$/);
  const [plain, html] = partsOf(body);
  assert.equal(plain.headers['content-type'], 'text/plain; charset="UTF-8"');
  assert.equal(plain.headers['content-transfer-encoding'], 'base64');
  assert.equal(decode64(plain.body).toString('utf8'), 'Hello ✓');
  assert.equal(html.headers['content-type'], 'text/html; charset="UTF-8"');
  assert.equal(decode64(html.body).toString('utf8'), '<p>Hello ✓</p>');
  assert.equal(a1.headers['content-type'], 'application/pdf; name="report.pdf"');
  assert.equal(a1.headers['content-disposition'], 'attachment; filename="report.pdf"');
  assert.deepEqual(decode64(a1.body), pdf);
  assert.equal(a2.headers['content-disposition'], 'attachment; filename="notes \\"v2\\".txt"', 'quotes in a file name are escaped');
  for (const line of raw.split('\r\n')) assert.ok(line.length <= 78, `line under 79: ${line.slice(0, 40)}`);
  for (const line of a1.body.split('\r\n').filter(Boolean)) assert.ok(line.length <= 76);
});

test('HTML only is a single text/html part; a non-ASCII file name uses RFC 2231 and RFC 2047', () => {
  const only = parseEntity(buildMime({ to: ['a@example.com'], subject: 's', html: '<b>x</b>' }));
  assert.equal(only.headers['content-type'], 'text/html; charset="UTF-8"');
  const raw = buildMime({ to: ['a@example.com'], subject: 's', text: 't', attachments: [{ filename: 'Übersicht 2026.pdf', mimeType: 'application/pdf', data: Buffer.from('x') }] });
  const [, att] = partsOf(parseEntity(raw));
  assert.equal(att.headers['content-disposition'], "attachment; filename*=UTF-8''%C3%9Cbersicht%202026.pdf");
  assert.match(att.headers['content-type'], /^application\/pdf; name="=\?UTF-8\?B\?[^"]+\?="$/);
});

test('no argument can add a header: line breaks in subject, addresses, file names and types are refused', () => {
  assert.throws(() => buildMime({ to: ['a@example.com'], subject: 'x\r\nBcc: evil@example.com', text: '' }), /subject must not contain line breaks/);
  assert.throws(() => checkAddress('a@example.com\nBcc: e@example.com', 'to'), /to must not contain line breaks/);
  assert.throws(() => checkAddress('not an address', 'cc'), /cc has an invalid email address/);
  assert.throws(
    () => buildMime({ to: ['a@example.com'], subject: 's', attachments: [{ filename: 'a\r\nX: y', mimeType: 'text/plain', data: Buffer.from('') }] }),
    /attachment file name must not contain line breaks/,
  );
});

test('reply threading: In-Reply-To is the original Message-ID, References extend its chain, the subject gets one "Re: "', () => {
  assert.deepEqual(replyReferences({ messageId: '<m3@x>', references: '<m1@x> <m2@x>' }), ['<m1@x>', '<m2@x>', '<m3@x>']);
  assert.deepEqual(replyReferences({ messageId: '<m2@x>', inReplyTo: '<m1@x>' }), ['<m1@x>', '<m2@x>']);
  assert.deepEqual(replyReferences({ messageId: '<m1@x>' }), ['<m1@x>']);
  assert.deepEqual(replyReferences({ references: '<m1@x>' }), [], 'no Message-ID, no References');
  const raw = buildMime({ to: ['a@example.com'], subject: replySubject('Plan'), text: 'ok', inReplyTo: '<m3@x>', references: replyReferences({ messageId: '<m3@x>', references: '<m1@x> <m2@x>' }) });
  const { headers } = parseEntity(raw);
  assert.equal(headers['in-reply-to'], '<m3@x>');
  assert.equal(headers.references, '<m1@x> <m2@x> <m3@x>');
  assert.equal(headers.subject, 'Re: Plan');
  assert.equal(replySubject('Re: Plan'), 'Re: Plan');
  assert.equal(replySubject('RE:Plan'), 'RE:Plan');
  assert.equal(replySubject('re[2]: Plan'), 're[2]: Plan');
  assert.equal(replySubject(undefined), 'Re:');
  // A long chain is folded, and unfolds to the same ids.
  const long = Array.from({ length: 30 }, (_, i) => `<message-${i}@mail.example.com>`);
  const folded = parseEntity(buildMime({ to: ['a@example.com'], subject: 's', text: '', references: long }));
  assert.equal(folded.headers.references, long.join(' '));
});

test('reply recipients: Reply-To first, reply-all adds To and Cc, never this account and never twice; own messages go to their To', () => {
  const original = { from: 'Ana <ana@example.com>', replyTo: 'List <list@example.com>', to: 'me@example.com, Bo <bo@example.com>', cc: 'cy@example.com, ANA@example.com' };
  assert.deepEqual(replyRecipients(original, 'me@example.com', false), { to: ['List <list@example.com>'], cc: [] });
  assert.deepEqual(replyRecipients({ ...original, replyTo: undefined }, 'me@example.com', false), { to: ['Ana <ana@example.com>'], cc: [] });
  assert.deepEqual(replyRecipients({ ...original, replyTo: undefined }, 'Me@Example.com', true), {
    to: ['Ana <ana@example.com>', 'Bo <bo@example.com>'],
    cc: ['cy@example.com'],
  });
  const mine = { from: 'Me <me@example.com>', to: 'ana@example.com', cc: 'bo@example.com' };
  assert.deepEqual(replyRecipients(mine, 'me@example.com', false), { to: ['ana@example.com'], cc: [] });
  assert.deepEqual(replyRecipients(mine, 'me@example.com', true), { to: ['ana@example.com'], cc: ['bo@example.com'] });
  assert.deepEqual(splitAddresses('"Doe, Jane" <jane@example.com>, bo@example.com'), ['"Doe, Jane" <jane@example.com>', 'bo@example.com']);
});

test('charsets: each text part is decoded with its own charset; an unknown one is read as UTF-8 and says so', () => {
  assert.equal(charsetOf('text/plain; charset="ISO-8859-2"'), 'iso-8859-2');
  assert.equal(charsetOf('text/plain; format=flowed; charset=windows-1250'), 'windows-1250');
  assert.equal(charsetOf('text/plain'), undefined);
  const cases = [
    ['utf-8', Buffer.from('Grüße ✓', 'utf8'), 'Grüße ✓'],
    ['iso-8859-1', Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65]), 'Grüße'],
    ['iso-8859-2', Buffer.from([0x50, 0xf8, 0xed, 0x6c, 0x69, 0xb9]), 'Příliš'],
    ['windows-1250', Buffer.from([0x9a, 0x9d, 0x9e]), 'šťž'],
    ['windows-1252', Buffer.from([0x80, 0x93, 0x94]), '€“”'],
    // WHATWG reads iso-8859-1 as windows-1252, as mail programs do: 0x93 and 0x94 are curly quotes, not control characters.
    ['iso-8859-1', Buffer.from([0x93, 0x48, 0x94, 0xe9]), '“H”é'],
    ['us-ascii', Buffer.from('plain'), 'plain'],
    [undefined, Buffer.from('Ünïcode', 'utf8'), 'Ünïcode'],
  ];
  for (const [charset, bytes, text] of cases) {
    const out = decodeText(bytes, charset);
    assert.equal(out.text, text, `${charset}`);
    assert.equal(out.fallback, false);
  }
  const unknown = decodeText(Buffer.from('ok', 'utf8'), 'x-made-up');
  assert.deepEqual(unknown, { text: 'ok', charset: 'utf-8', fallback: true });
});

test('tidyText: CRLF as LF, no blank lines at the start or end, at most one blank line in a row', () => {
  assert.equal(tidyText('\r\n\r\n  \r\n\r\nHello\r\n\r\n\r\n\r\nWorld\r\n\r\n \r\n'), 'Hello\n\nWorld');
  assert.equal(tidyText('  indented first line\nnext'), '  indented first line\nnext', 'indentation of the first line is kept');
  assert.equal(tidyText(''), '');
  assert.equal(quoteText('a\n\nb', 'Ana', 'Mon'), 'On Mon, Ana wrote:\n> a\n>\n> b');
});

test('base64: lines of 76 characters with CRLF, and the length formula matches', () => {
  for (const n of [0, 1, 2, 3, 56, 57, 58, 1000, 100000]) {
    const text = base64Lines(Buffer.alloc(n, 1));
    assert.equal(base64LinesLength(n), text.length, `${n} bytes`);
    for (const line of text.split('\r\n').filter(Boolean)) assert.ok(line.length <= 76);
  }
  assert.equal(GMAIL_MAX_MESSAGE_BYTES, 36_700_160);
  assert.equal(GMAIL_JSON_RAW_MAX_BYTES, 5 * 1024 * 1024);
});

test('foldHeader keeps short lines whole and never leaves a line of only spaces', () => {
  assert.equal(foldHeader('To', 'a@example.com'), 'To: a@example.com');
  const folded = foldHeader('Subject', `x${'  y'.repeat(40)}`);
  for (const line of folded.split('\r\n')) assert.ok(line.trim().length > 0);
  assert.equal(folded.replace(/\r\n/g, ''), `Subject: x${'  y'.repeat(40)}`);
});
