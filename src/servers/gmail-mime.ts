/**
 * Pure helpers for the curated Gmail tools: building RFC 5322 messages (MIME, RFC 2047 headers, RFC 2231 file names),
 * reply threading, and decoding the text parts Gmail returns. No network and no file access here, so every rule can be
 * tested on its own (tests/gmail-mime.test.mjs).
 */
import { randomBytes } from 'node:crypto';

const CRLF = '\r\n';

/**
 * The largest message Gmail accepts: 35 MB (36,700,160 bytes), the maxSize Google's Gmail Discovery document gives for
 * users.messages.send and users.drafts.create (mediaUpload.maxSize "35MB"; the snapshots in data/discovery keep only
 * that the methods take media). It counts the whole encoded message, attachments included.
 */
export const GMAIL_MAX_MESSAGE_BYTES = 36_700_160;

/**
 * Above this size the message goes to Gmail's upload endpoint (/upload/gmail/v1/..., uploadType=multipart) instead of
 * the JSON `raw` field. Google's upload guide names 5 MB as the limit of a simple request.
 */
export const GMAIL_JSON_RAW_MAX_BYTES = 5 * 1024 * 1024;

/** Throws when a header value has a line break, so no argument can add a header of its own. */
export function singleLine(value: string, field: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${field} must not contain line breaks.`);
  return value.trim();
}

const isAscii = (text: string): boolean => !/[^\x20-\x7e]/.test(text);

/**
 * RFC 2047 encoded-words (UTF-8, base64), never splitting a UTF-8 character. At most 39 bytes per word, so a word is
 * at most 64 characters and "Subject: " plus one word stays within the 76 characters RFC 2047 allows a line.
 * Text that is printable ASCII is returned as it is.
 */
export function encodeWords(text: string): string[] {
  if (isAscii(text)) return [text];
  const words: Buffer[] = [];
  let current = Buffer.alloc(0);
  for (const ch of text) {
    const bytes = Buffer.from(ch, 'utf8');
    if (current.length + bytes.length > 39) {
      words.push(current);
      current = Buffer.alloc(0);
    }
    current = Buffer.concat([current, bytes]);
  }
  if (current.length) words.push(current);
  return words.map((w) => `=?UTF-8?B?${w.toString('base64')}?=`);
}

/** A header value as RFC 2047 encoded-words (one string, words separated by a space). */
export function encodeHeaderText(text: string): string {
  return encodeWords(text).join(' ');
}

/**
 * One header line, folded (RFC 5322 2.2.3) at spaces so each line stays at or under 78 characters where a space allows
 * it. Unfolding removes only the line break, so the value is unchanged.
 */
export function foldHeader(name: string, value: string): string {
  const words = value.split(' ');
  const lines: string[] = [];
  let line = `${name}:`;
  for (const word of words) {
    // A run of spaces stays on its line: a folded line must not hold only white space.
    if (word === '') {
      line += ' ';
      continue;
    }
    if (line.length + 1 + word.length > 78 && line.length > name.length + 1) {
      lines.push(line);
      line = ` ${word}`;
    } else {
      line += ` ${word}`;
    }
  }
  lines.push(line);
  return lines.join(CRLF);
}

/** Splits an address header (To, Cc, From, Reply-To) at the commas that are outside quotes, comments and angle brackets. */
export function splitAddresses(header: string | undefined | null): string[] {
  if (!header) return [];
  const out: string[] = [];
  let current = '';
  let quoted = false;
  let angle = 0;
  let comment = 0;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (quoted) {
      current += ch;
      if (ch === '\\' && i + 1 < header.length) current += header[++i];
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === '<') angle++;
    else if (ch === '>') angle = Math.max(0, angle - 1);
    else if (ch === '(') comment++;
    else if (ch === ')') comment = Math.max(0, comment - 1);
    else if (ch === ',' && angle === 0 && comment === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The bare address of "Name <a@b>" or "a@b", in lower case. */
export function emailOf(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

/** Checks one recipient and returns it as given ("a@b" or "Name <a@b>"). Line breaks and invalid addresses throw. */
export function checkAddress(raw: string, field: string): string {
  const value = singleLine(raw, field);
  const addr = value.match(/<([^>]+)>/)?.[1] ?? value;
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+$/.test(addr)) throw new Error(`${field} has an invalid email address: "${value}".`);
  return value;
}

/** A recipient for a header: a display name that is not ASCII is RFC 2047 encoded; the address is kept. */
export function formatAddress(value: string): string {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(value);
  const display = m?.[1] ?? '';
  if (!m || isAscii(display)) return value;
  const name = display.trim().replace(/^"(.*)"$/, '$1');
  return `${encodeHeaderText(name)} <${m[2] ?? ''}>`;
}

/** Base64 with 76-character lines, each ending in CRLF (RFC 2045 6.8). */
export function base64Lines(data: Buffer): string {
  return data.toString('base64').replace(/.{1,76}/g, `$&${CRLF}`);
}

/** Bytes of base64Lines(n bytes): 4 characters per 3 bytes, plus CRLF per 76 characters. */
export function base64LinesLength(bytes: number): number {
  const chars = 4 * Math.ceil(bytes / 3);
  return chars + 2 * Math.ceil(chars / 76);
}

/** A quoted MIME parameter value (RFC 2045): backslash and double quote escaped. */
function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

/** The filename parameters of an attachment: plain for ASCII, RFC 2231 (filename*) and RFC 2047 (name) otherwise. */
function fileParams(filename: string): { type: string; disposition: string } {
  if (isAscii(filename)) return { type: `name=${quoted(filename)}`, disposition: `filename=${quoted(filename)}` };
  const pct = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return { type: `name=${quoted(encodeHeaderText(filename))}`, disposition: `filename*=UTF-8''${pct}` };
}

export interface MimeAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface MimeSpec {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** The plain text body. */
  text?: string;
  /** The HTML body. With text, the two go in multipart/alternative. */
  html?: string;
  attachments?: MimeAttachment[];
  /** The Message-ID of the message this one replies to (with the angle brackets). */
  inReplyTo?: string;
  /** The References chain of a reply: message ids, oldest first. */
  references?: string[];
  /** Makes the boundaries predictable (tests). Default: random. */
  boundary?: () => string;
}

const randomBoundary = (): string => `=_gsm_${randomBytes(12).toString('hex')}`;

function textPart(subtype: 'plain' | 'html', body: string): string {
  return [`Content-Type: text/${subtype}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(body, 'utf8'))].join(CRLF);
}

function multipart(subtype: 'mixed' | 'alternative', boundary: string, parts: string[]): string {
  // Each part ends with CRLF (the base64 lines do), so the delimiter follows directly.
  const body = parts.map((part) => `--${boundary}${CRLF}${part}`).join('');
  return [`Content-Type: multipart/${subtype}; boundary="${boundary}"`, '', `${body}--${boundary}--${CRLF}`].join(CRLF);
}

function attachmentPart(a: MimeAttachment): string {
  const params = fileParams(singleLine(a.filename, 'attachment file name'));
  return [
    `Content-Type: ${singleLine(a.mimeType, 'attachment type')}; ${params.type}`,
    `Content-Disposition: attachment; ${params.disposition}`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(a.data),
  ].join(CRLF);
}

/**
 * Builds an RFC 5322 message: UTF-8 text, RFC 2047 headers, multipart/alternative for text with HTML, and
 * multipart/mixed with base64 attachments. Date, From and Message-ID are left to Gmail. Every byte is 7-bit ASCII, so
 * the result is a string. A plain text message with no attachment has the layout gmail_create_draft has always sent.
 */
export function buildMime(spec: MimeSpec): string {
  const boundary = spec.boundary ?? randomBoundary;
  const headers = [foldHeader('To', spec.to.map(formatAddress).join(', '))];
  if (spec.cc?.length) headers.push(foldHeader('Cc', spec.cc.map(formatAddress).join(', ')));
  if (spec.bcc?.length) headers.push(foldHeader('Bcc', spec.bcc.map(formatAddress).join(', ')));
  headers.push(foldHeader('Subject', encodeHeaderText(singleLine(spec.subject, 'subject'))));
  if (spec.inReplyTo) headers.push(`In-Reply-To: ${singleLine(spec.inReplyTo, 'In-Reply-To')}`);
  if (spec.references?.length) headers.push(foldHeader('References', spec.references.map((r) => singleLine(r, 'References')).join(' ')));
  headers.push('MIME-Version: 1.0');

  const hasText = spec.text !== undefined;
  const hasHtml = spec.html !== undefined;
  let body: string;
  if (hasText && hasHtml) body = multipart('alternative', boundary(), [textPart('plain', spec.text ?? ''), textPart('html', spec.html ?? '')]);
  else if (hasHtml) body = textPart('html', spec.html ?? '');
  else body = textPart('plain', spec.text ?? '');

  if (spec.attachments?.length) body = multipart('mixed', boundary(), [body, ...spec.attachments.map(attachmentPart)]);
  // The body part starts with its own Content-Type header, so it joins the message headers directly.
  return `${headers.join(CRLF)}${CRLF}${body}`;
}

// ---------- replies ----------

/** "Re: " in front of a subject, unless it already starts with a reply prefix (Re:, RE:, re[2]:). */
export function replySubject(subject: string | undefined | null): string {
  const s = (subject ?? '').trim();
  return /^re\s*(\[\d+\])?\s*:/i.test(s) ? s : `Re: ${s}`.trimEnd();
}

/**
 * The References of a reply (RFC 5322 3.6.4): the original's References (or, without them, its In-Reply-To), then its
 * Message-ID. Empty when the original has no Message-ID.
 */
export function replyReferences(original: { messageId?: string; references?: string; inReplyTo?: string }): string[] {
  if (!original.messageId) return [];
  const ids = (text: string | undefined): string[] => (text ?? '').match(/<[^<>\s]+>/g) ?? [];
  const chain = ids(original.references);
  const base = chain.length ? chain : ids(original.inReplyTo);
  const own = ids(original.messageId)[0] ?? original.messageId.trim();
  return [...base.filter((id) => id !== own), own];
}

export interface ReplyRecipients {
  to: string[];
  cc: string[];
}

/**
 * Who a reply goes to. Reply: the original's Reply-To, else its From. When the original was sent by this account, the
 * reply goes to its To (as Gmail does). Reply-all adds the original's To and Cc. This account is never a recipient,
 * and no address is listed twice.
 */
export function replyRecipients(
  original: { from?: string; replyTo?: string; to?: string; cc?: string },
  me: string | undefined,
  replyAll: boolean,
): ReplyRecipients {
  const self = me?.toLowerCase();
  const fromMe = self !== undefined && splitAddresses(original.from).some((a) => emailOf(a) === self);
  const primary = fromMe ? splitAddresses(original.to) : splitAddresses(original.replyTo).length ? splitAddresses(original.replyTo) : splitAddresses(original.from);
  const seen = new Set<string>();
  const keep = (list: string[]): string[] =>
    list.filter((a) => {
      const e = emailOf(a);
      if (!e || e === self || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
  const to = keep(primary);
  if (!replyAll) return { to, cc: [] };
  const moreTo = fromMe ? [] : keep(splitAddresses(original.to));
  const cc = keep(splitAddresses(original.cc));
  return { to: [...to, ...moreTo], cc };
}

/** The original as quoted text under a reply: "On <date>, <from> wrote:" and each line with "> ". */
export function quoteText(text: string, from: string | undefined, date: string | undefined): string {
  const lines = tidyText(text).split('\n').map((line) => (line ? `> ${line}` : '>'));
  return `On ${date ?? 'an earlier date'}, ${from ?? 'the sender'} wrote:\n${lines.join('\n')}`;
}

/** Text as HTML: escaped, line breaks as <br>. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The original as an HTML quote under a reply. */
export function quoteHtml(html: string, from: string | undefined, date: string | undefined): string {
  return `<div class="gmail_quote">On ${escapeHtml(date ?? 'an earlier date')}, ${escapeHtml(from ?? 'the sender')} wrote:<br><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${html}</blockquote></div>`;
}

// ---------- reading ----------

/** The charset parameter of a Content-Type header value, lower case, without quotes. */
export function charsetOf(contentType: string | undefined | null): string | undefined {
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType ?? '');
  return m?.[1] ? m[1].toLowerCase() : undefined;
}

/**
 * Decodes the bytes of a text part with its charset (TextDecoder: utf-8, iso-8859-1 to -16, windows-1250 to -1258,
 * us-ascii, koi8-r, shift_jis, gb18030 and the other WHATWG encodings). No charset means UTF-8. A charset TextDecoder
 * does not know is decoded as UTF-8, and `fallback` says so.
 */
export function decodeText(bytes: Uint8Array, charset: string | undefined): { text: string; charset: string; fallback: boolean } {
  const label = (charset ?? 'utf-8').trim().toLowerCase();
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label);
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8', fallback: true };
  }
  // WHATWG maps iso-8859-1, us-ascii, latin1 and cp1252 to windows-1252. Node's decoder reads that one as plain Latin-1,
  // so bytes 0x80 to 0x9F (the euro sign, curly quotes, dashes) would become control characters. Decoded here instead.
  if (decoder.encoding === 'windows-1252') return { text: decodeWindows1252(bytes), charset: label, fallback: false };
  return { text: decoder.decode(bytes), charset: label, fallback: false };
}

/** windows-1252 bytes 0x80 to 0x9F (WHATWG index); every other byte is the same code point as in Latin-1. */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (WINDOWS_1252_HIGH[b - 0x80] ?? b) : b);
  return out;
}

/**
 * Text for reading: line breaks as \n, no blank lines at the start or the end, and at most one blank line in a row.
 * Mail often starts with many blank lines, which would use up the character budget.
 */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t ]*\n)+/, '')
    .replace(/(?:\n[ \t ]*)+$/, '')
    .replace(/[ \t ]+$/, '')
    .replace(/\n(?:[ \t ]*\n){2,}/g, '\n\n');
}

/** HTML as readable text: scripts and styles dropped, block ends as line breaks, the common entities decoded. */
export function htmlToText(html: string): string {
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
