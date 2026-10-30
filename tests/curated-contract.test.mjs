// Request contract of every curated tool (src/servers/*.ts) against Google's Discovery documents (data/discovery).
// Each tool's handler runs with representative arguments. The HTTP layer is stubbed (OAuth2Client.prototype.request),
// so no request leaves the machine; every outgoing request is recorded and checked: a Discovery method exists for its
// verb and URL (the path matches the method's template), every query parameter is a parameter of that method or a
// standard parameter of the API, every body field exists in the method's request schema (nested objects too), and
// nothing used is marked deprecated. A tool that cannot run here is listed in SKIPPED with the reason; a real mismatch
// in a curated tool is listed in KNOWN_DEFECTS (skipped with the defect named) until its own fix.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JWT, OAuth2Client } from 'google-auth-library';
import { DOCX, docx } from './fixtures/office-zip.mjs';

// No Application Default Credentials from this machine: every group below has its own login in a temp folder.
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));

// ---------------------------------------------------------------------------
// Logins in a temp folder: an OAuth token per group, and a throwaway service account key for the admin group.

const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-contract-'));
after(() => rmSync(tokenDir, { recursive: true, force: true }));
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
const token = { access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' };
for (const group of ['cloud', 'workspace-user', 'searchconsole', 'business']) {
  writeFileSync(join(tokenDir, `${group}.token.json`), JSON.stringify(token));
}
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const keyFile = join(tokenDir, 'service-account.json');
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));
const cfg = loadConfig({
  GSM_TOKEN_DIR: tokenDir,
  GSM_ALLOW_WRITES: 'true',
  GSM_SERVICE_ACCOUNT_KEY_FILE: keyFile,
  GSM_ADMIN_SUBJECT: 'admin@example.com',
});

// ---------------------------------------------------------------------------
// The stubbed HTTP layer. Typed clients (@googleapis/*) and raw calls both end in the auth client's request.

let calls = [];
let respond = () => ({});

/** The JSON metadata part of a multipart upload body (a stream), or undefined. */
async function multipartMetadata(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  const match = /content-type: application\/json[^\r\n]*\r\n\r\n([\s\S]*?)\r\n--/i.exec(text);
  return match ? JSON.parse(match[1]) : undefined;
}

async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = String(value);
  let body = opts.data;
  let multipart = false;
  if (body && typeof body.pipe === 'function') {
    multipart = true;
    body = await multipartMetadata(body);
  }
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, query, body, multipart };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
}
OAuth2Client.prototype.request = fakeRequest;
if (Object.prototype.hasOwnProperty.call(JWT.prototype, 'request')) JWT.prototype.request = fakeRequest;

/**
 * A response that most handlers can read: one item in each list (so list-then-get tools make their get calls), done
 * operations, a SELECT dry run, and a plain text Drive file.
 */
const generic = () => ({
  id: 'id-1',
  name: 'projects/123456789012',
  done: true,
  messages: [{ id: 'msg-1' }],
  drafts: [{ id: 'draft-1' }],
  message: { id: 'msg-1', threadId: 'thr-1', payload: { headers: [{ name: 'Subject', value: 'Hi' }] } },
  labels: [],
  items: [],
  files: [],
  services: [],
  keys: [],
  projects: [],
  siteEntry: [],
  sitemap: [],
  rows: [],
  calendars: {},
  mimeType: 'text/plain',
  statistics: { totalBytesProcessed: '10', query: { statementType: 'SELECT' } },
  jobComplete: true,
  jobReference: { jobId: 'job-1', location: 'US' },
  schema: { fields: [] },
  resourceNames: ['customers/1234567890'],
  results: [],
  users: [],
  groups: [],
  members: [],
  organizationUnits: [],
  domains: [],
  start: { dateTime: '2026-11-02T10:00:00Z' },
  end: { dateTime: '2026-11-02T11:00:00Z' },
});

// ---------------------------------------------------------------------------
// Discovery: an index of every method of the documents the curated servers call, by verb and URL template.

const DOCS = [
  'gmail.v1',
  'calendar.v3',
  'drive.v3',
  'sheets.v4',
  'searchconsole.v1',
  'cloudresourcemanager.v3',
  'serviceusage.v1',
  'apikeys.v2',
  'bigquery.v2',
  'googleads.v26',
  'admin.directory_v1',
  'cloudbilling.v1',
  'storage.v1',
  'chat.v1',
];

/**
 * APIs the curated gcloud tools call that have no per-method tools, so data/discovery has no snapshot of them:
 * trimmed copies of Google's documents in tests/fixtures/discovery (the methods called and their request schemas).
 */
const FIXTURE_DOCS = ['logging.v2', 'monitoring.v1', 'iam.v1', 'cloudbilling.v1beta'];

/**
 * Other hosts a document's methods are called on. sc_* tools use @googleapis/webmasters, which calls the Search Console
 * API on its older host www.googleapis.com/webmasters/v3. The searchconsole v1 document serves the same paths
 * (webmasters/v3/...) on searchconsole.googleapis.com. Only the host differs, so the paths are checked as usual.
 */
const HOST_ALIASES = { 'searchconsole.v1': ['https://www.googleapis.com/'] };

/** A URL template as a regular expression: {+name} spans slashes, {name} does not. */
function templateRegex(template) {
  const parts = template.split(/(\{\+?[^}]+\})/);
  const body = parts
    .map((part) => {
      if (/^\{\+/.test(part)) return '(.+)';
      if (/^\{/.test(part)) return '([^/]+)';
      return part.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`);
}

const methods = [];
const docs = {};
for (const file of [...DOCS, ...FIXTURE_DOCS]) {
  const dir = FIXTURE_DOCS.includes(file) ? join(REPO, 'tests', 'fixtures', 'discovery') : join(REPO, 'data', 'discovery');
  const doc = JSON.parse(readFileSync(join(dir, `${file}.json`), 'utf8'));
  docs[file] = doc;
  const bases = [`${doc.rootUrl}${doc.servicePath ?? ''}`, ...(HOST_ALIASES[file] ?? []).map((root) => `${root}${doc.servicePath ?? ''}`)];
  const add = (m) => {
    const templates = bases.flatMap((base) => [m.path, m.flatPath].filter(Boolean).map((p) => `${base}${p}`));
    // Media uploads go to the same path under /upload/, such as /upload/drive/v3/files. Discovery lists the protocols;
    // the snapshots keep only that the method takes media (mediaUpload: true).
    for (const proto of Object.values(typeof m.mediaUpload === 'object' ? (m.mediaUpload.protocols ?? {}) : {})) {
      if (proto.path) templates.push(`${doc.rootUrl.replace(/\/$/, '')}${proto.path}`);
    }
    if (m.mediaUpload === true || m.supportsMediaUpload === true) templates.push(`${doc.rootUrl}upload/${doc.servicePath ?? ''}${m.path}`);
    for (const template of templates) {
      methods.push({ doc: file, id: m.id, httpMethod: m.httpMethod, regex: templateRegex(template), literal: template.replace(/\{[^}]+\}/g, '').length, method: m });
    }
  };
  const walk = (resources) => {
    for (const r of Object.values(resources ?? {})) {
      for (const m of Object.values(r.methods ?? {})) add(m);
      walk(r.resources);
    }
  };
  for (const m of Object.values(doc.methods ?? {})) add(m);
  walk(doc.resources);
}

/** The Discovery method of one recorded request: same verb, URL matches the template. The most literal match wins. */
function methodFor(call) {
  const found = methods.filter((m) => m.httpMethod === call.method && m.regex.test(call.url)).sort((a, b) => b.literal - a.literal);
  return found[0];
}

/** Marked deprecated in Discovery: the deprecated flag, or the word in its description. */
const isDeprecated = (schema) => schema?.deprecated === true || /\bdeprecated\b/i.test(schema?.description ?? '');

/**
 * Body fields whose description uses the word for some of their values, not for the field. Each with the reason.
 * ConferenceSolutionKey.type: "eventHangout" and "eventNamedHangout" are deprecated; "hangoutsMeet" is how a Meet link
 * is created (Calendar API release notes, 2020-09-07: set conferenceData.createRequest.conferenceSolutionKey.type).
 */
const DEPRECATED_VALUES_ONLY = new Set(['ConferenceSolutionKey.type']);

/** A schema by reference (a $ref, or the bare name the snapshots keep for a method's request), or the inline schema. */
const resolve = (doc, schema) => (typeof schema === 'string' ? doc.schemas?.[schema] : schema?.$ref ? doc.schemas?.[schema.$ref] : schema);

/**
 * Google's system parameters, which every API takes (https://cloud.google.com/apis/docs/system-parameters). A Discovery
 * document lists them at its top level; the snapshots in data/discovery leave that list out, so it is written here.
 */
const STANDARD_PARAMETERS = ['$.xgafv', 'access_token', 'alt', 'callback', 'fields', 'key', 'oauth_token', 'prettyPrint', 'quotaUser', 'upload_protocol', 'uploadType'];

/** A method's parameters by name. The snapshots keep them as a list with a name on each; Discovery uses a map. */
function parametersOf(method) {
  const raw = method.parameters ?? {};
  return Array.isArray(raw) ? Object.fromEntries(raw.map((p) => [p.name, p])) : raw;
}

/** Problems of one body value against a schema: unknown fields and deprecated fields, nested objects and arrays included. */
function bodyProblems(doc, schema, value, where) {
  const s = resolve(doc, schema);
  if (!s || value === null || value === undefined) return [];
  if (Array.isArray(value)) return s.type === 'array' ? value.flatMap((item, i) => bodyProblems(doc, s.items, item, `${where}[${i}]`)) : [];
  if (typeof value !== 'object') return [];
  // A map (additionalProperties) or a free-form object takes any key.
  if (!s.properties) return s.additionalProperties ? Object.entries(value).flatMap(([k, v]) => bodyProblems(doc, s.additionalProperties, v, `${where}.${k}`)) : [];
  const out = [];
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const prop = s.properties[key];
    if (!prop) {
      out.push(`body field ${where}.${key} is not in ${typeof schema === 'string' ? schema : (schema?.$ref ?? s.id ?? 'the schema')}`);
      continue;
    }
    if (isDeprecated(prop) && !DEPRECATED_VALUES_ONLY.has(`${s.id}.${key}`)) out.push(`body field ${where}.${key} is deprecated`);
    out.push(...bodyProblems(doc, prop, child, `${where}.${key}`));
  }
  return out;
}

/** Problems of one recorded request against Discovery. Empty means it matches. */
function problemsOf(call) {
  const m = methodFor(call);
  if (!m) return { id: undefined, problems: [`no Discovery method for ${call.method} ${call.url}`] };
  const doc = docs[m.doc];
  const problems = [];
  if (isDeprecated(m.method)) problems.push(`method ${m.id} is deprecated`);
  const params = parametersOf(m.method);
  for (const key of Object.keys(call.query)) {
    const p = params[key];
    if (p && p.location !== 'query') problems.push(`parameter ${key} of ${m.id} belongs in the ${p.location}, not the query`);
    else if (p && isDeprecated(p)) problems.push(`query parameter ${key} of ${m.id} is deprecated`);
    else if (!p && !STANDARD_PARAMETERS.includes(key)) problems.push(`query parameter ${key} is not a parameter of ${m.id}`);
  }
  const hasBody = call.body !== undefined && !(typeof call.body === 'object' && call.body !== null && Object.keys(call.body).length === 0);
  if (hasBody) {
    if (!m.method.request) problems.push(`${m.id} takes no request body, but one was sent`);
    else problems.push(...bodyProblems(doc, m.method.request, call.body, 'body'));
  }
  return { id: m.id, problems };
}

// ---------------------------------------------------------------------------
// The servers and their tools.

const SERVERS = ['gmail', 'gcalendar', 'gdrive', 'searchconsole', 'cloud', 'gads', 'workspace-admin', 'gchat'];
const tools = new Map();
for (const mod of SERVERS) {
  const { buildTools } = await import(DIST(`servers/${mod}.js`));
  for (const tool of await buildTools(cfg)) tools.set(tool.name, tool);
}

const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const SITE = 'sc-domain:example.com';

// Local files for the Gmail attachments (outside the token folder, which the Gmail tools refuse). The large one sends
// the message through the upload endpoint (over 5 MB).
const attachDir = mkdtempSync(join(tmpdir(), 'gsm-contract-files-'));
after(() => rmSync(attachDir, { recursive: true, force: true }));
const SMALL_FILE = join(attachDir, 'notes.txt');
writeFileSync(SMALL_FILE, 'notes');
const LARGE_FILE = join(attachDir, 'large.bin');
writeFileSync(LARGE_FILE, Buffer.alloc(6 * 1024 * 1024, 1));

/** A message to reply to: the headers a reply reads, and a text part Gmail keeps apart (only an attachment id). */
const replyable = (call) => {
  if (call.url.endsWith('/profile')) return { emailAddress: 'me@example.com' };
  if (/\/messages\/msg-1$/.test(call.url)) {
    return {
      id: 'msg-1',
      threadId: 'thr-1',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'From', value: 'Ana <ana@example.com>' },
          { name: 'Subject', value: 'Hi' },
          { name: 'Message-ID', value: '<m1@example.com>' },
        ],
        parts: [
          { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=iso-8859-2' }], body: { size: 9, data: 'SGVsbG8' } },
          { mimeType: 'text/html', headers: [], body: { size: 900000, attachmentId: 'part-1' } },
        ],
      },
    };
  }
  if (call.url.includes('/attachments/')) return { size: 5, data: 'PGI-eDwvYj4' };
  return generic();
};

/** Threads and labels for the thread and label tools: one thread of two messages, and a user label. */
const threaded = (call) => {
  const message = (id) => ({ id, threadId: 'thr-1', labelIds: ['INBOX'], snippet: 's', payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Hi' }], body: { data: 'SGk' } } });
  if (call.url.endsWith('/threads')) return { threads: [{ id: 'thr-1' }], nextPageToken: 'n', resultSizeEstimate: 1 };
  if (call.url.endsWith('/threads/thr-1')) return { id: 'thr-1', messages: [message('m1'), message('m2')] };
  if (call.url.endsWith('/labels')) return { labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }, { id: 'Label_1', name: 'Invoices', type: 'user' }] };
  return generic();
};
const SITEMAP = 'https://example.com/sitemap.xml';

/**
 * One row per curated tool: the arguments, the Discovery methods its requests must match (in order of first use), and
 * an optional responder. A tool can have several cases (args differ); `preview` also runs the tool's preview.
 */
const CASES = {
  // gmail
  gmail_search: [{ args: { q: 'from:a@example.com', max_results: 5, page_token: 'p1' }, expect: ['gmail.users.messages.list', 'gmail.users.messages.get'] }],
  gmail_get_message: [
    { args: { id: 'msg-1', format: 'full', max_body_chars: 500 }, expect: ['gmail.users.messages.get'] },
    { args: { id: 'msg-1', format: 'metadata' }, expect: ['gmail.users.messages.get'] },
    // A text part kept apart by Gmail is fetched by its id.
    { args: { id: 'msg-1', include_html: true }, expect: ['gmail.users.messages.get', 'gmail.users.messages.attachments.get'], respond: replyable },
  ],
  gmail_get_attachment: [{ args: { message_id: 'msg-1', attachment_id: 'att-1' }, expect: ['gmail.users.messages.attachments.get'] }],
  gmail_list_labels: [
    { args: {}, expect: ['gmail.users.labels.list'] },
    { args: { user_only: true, page_size: 1, page_token: '0' }, expect: ['gmail.users.labels.list'], respond: threaded },
  ],
  gmail_list_drafts: [
    { args: { max_results: 5, page_token: 'p1' }, expect: ['gmail.users.drafts.list', 'gmail.users.drafts.get'] },
    { args: { query: 'subject:plan' }, expect: ['gmail.users.drafts.list', 'gmail.users.drafts.get'] },
  ],
  gmail_search_threads: [
    { args: { query: 'from:a@example.com', page_size: 5, page_token: 'p1', include_trash: true }, expect: ['gmail.users.threads.list', 'gmail.users.threads.get'], respond: threaded },
    { args: { view: 'concise' }, expect: ['gmail.users.threads.list', 'gmail.users.threads.get'], respond: threaded },
  ],
  gmail_get_thread: [
    { args: { thread_id: 'thr-1', max_body_chars: 500, include_html: true }, expect: ['gmail.users.threads.get'], respond: threaded },
    { args: { thread_id: 'thr-1', view: 'concise' }, expect: ['gmail.users.threads.get'], respond: threaded },
  ],
  gmail_label: [
    { args: { thread_id: 'thr-1', labels: ['invoices', 'INBOX'] }, expect: ['gmail.users.labels.list', 'gmail.users.threads.modify'], respond: threaded },
    { args: { message_id: 'm1', labels: ['Label_1'] }, expect: ['gmail.users.labels.list', 'gmail.users.messages.modify'], respond: threaded },
  ],
  gmail_unlabel: [
    { args: { thread_id: 'thr-1', labels: ['INBOX'] }, expect: ['gmail.users.labels.list', 'gmail.users.threads.modify'], respond: threaded },
    { args: { message_id: 'm1', labels: ['Invoices'] }, expect: ['gmail.users.labels.list', 'gmail.users.messages.modify'], respond: threaded },
  ],
  gmail_untrash: [
    { args: { thread_id: 'thr-1' }, expect: ['gmail.users.threads.untrash'] },
    { args: { message_id: 'm1' }, expect: ['gmail.users.messages.untrash'] },
  ],
  gmail_trash: [
    { args: { thread_id: 'thr-1' }, expect: ['gmail.users.threads.get', 'gmail.users.threads.trash'], respond: threaded },
    { args: { message_id: 'm1' }, expect: ['gmail.users.messages.get', 'gmail.users.messages.trash'] },
  ],
  gmail_create_draft: [
    { args: { to: ['a@example.com'], subject: 'Hi', body: 'Text', cc: ['b@example.com'], bcc: ['c@example.com'] }, expect: ['gmail.users.drafts.create'] },
    {
      args: { reply_to_message_id: 'msg-1', body: 'Text', body_html: '<p>Text</p>', quote_original: true, attachments: [SMALL_FILE] },
      expect: ['gmail.users.messages.get', 'gmail.users.messages.attachments.get', 'gmail.users.getProfile', 'gmail.users.drafts.create'],
      respond: replyable,
    },
    { args: { to: ['a@example.com'], subject: 'Large', attachments: [LARGE_FILE] }, expect: ['gmail.users.drafts.create'] },
  ],
  gmail_send_draft: [{ args: { draft_id: 'draft-1' }, preview: true, expect: ['gmail.users.drafts.get', 'gmail.users.drafts.send'] }],
  gmail_send: [
    { args: { to: ['a@example.com'], cc: ['b@example.com'], bcc: ['c@example.com'], subject: 'Hi', body_text: 'Text', body_html: '<p>Text</p>', attachments: [SMALL_FILE] }, expect: ['gmail.users.messages.send'] },
    // Over 5 MB: the upload endpoint, uploadType=multipart.
    { args: { to: ['a@example.com'], subject: 'Large', body_text: 'See attached', attachments: [LARGE_FILE] }, expect: ['gmail.users.messages.send'] },
  ],
  gmail_reply: [
    { args: { message_id: 'msg-1', body_text: 'Thanks', reply_all: true }, expect: ['gmail.users.messages.get', 'gmail.users.getProfile', 'gmail.users.messages.send'], respond: replyable },
    {
      args: { message_id: 'msg-1', body_html: '<p>Thanks</p>', quote_original: true, attachments: [LARGE_FILE] },
      expect: ['gmail.users.messages.get', 'gmail.users.messages.attachments.get', 'gmail.users.getProfile', 'gmail.users.messages.send'],
      respond: replyable,
    },
  ],

  // gcalendar
  calendar_list_calendars: [{ args: {}, expect: ['calendar.calendarList.list'] }],
  calendar_list_events: [
    {
      args: { calendar_id: 'primary', time_min: '2026-11-01T00:00:00Z', time_max: '2026-11-08T00:00:00Z', q: 'standup', max_results: 10, single_events: true, page_token: 'p1' },
      expect: ['calendar.events.list'],
    },
    // 1.8.0: no lower bound, event types, time zone, order by last change.
    {
      args: { include_past: true, event_types: ['default', 'outOfOffice'], time_zone: 'Europe/Zurich', order_by: 'updated', q: 'review' },
      expect: ['calendar.events.list'],
    },
  ],
  calendar_get_event: [{ args: { calendar_id: 'primary', event_id: 'ev-1' }, expect: ['calendar.events.get'] }],
  calendar_freebusy: [{ args: { time_min: '2026-11-01T00:00:00Z', time_max: '2026-11-02T00:00:00Z', calendar_ids: ['primary'] }, expect: ['calendar.freebusy.query'] }],
  calendar_suggest_time: [
    {
      args: {
        attendees: ['a@example.com'],
        start_time: '2026-11-02T08:00:00+01:00',
        end_time: '2026-11-06T18:00:00+01:00',
        duration_minutes: 45,
        time_zone: 'Europe/Berlin',
        working_hours: { start: '09:00', end: '17:00' },
        weekdays_only: true,
        max_suggestions: 3,
      },
      expect: ['calendar.freebusy.query'],
    },
  ],
  calendar_respond: [
    {
      args: { calendar_id: 'primary', event_id: 'ev-1', response: 'accepted', comment: 'See you', send_updates: 'all' },
      expect: ['calendar.events.get', 'calendar.events.patch'],
      respond: () => ({ ...generic(), attendees: [{ email: 'me@example.com', self: true, responseStatus: 'needsAction' }, { email: 'b@example.com' }] }),
    },
  ],
  calendar_create_event: [
    {
      args: {
        calendar_id: 'primary',
        summary: 'Review',
        start: '2026-11-02T10:00:00+01:00',
        end: '2026-11-02T11:00:00+01:00',
        time_zone: 'Europe/Berlin',
        description: 'Agenda',
        location: 'Room 1',
        attendees: ['a@example.com'],
        send_updates: 'none',
      },
      expect: ['calendar.events.insert'],
    },
    { args: { summary: 'Holiday', start: '2026-12-24', end: '2026-12-25' }, expect: ['calendar.events.insert'] },
    // 1.8.0: Meet link, recurrence, reminders.
    {
      args: {
        summary: 'Weekly',
        start: '2026-11-02T10:00:00+01:00',
        end: '2026-11-02T10:30:00+01:00',
        time_zone: 'Europe/Berlin',
        add_meet: true,
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10'],
        reminders: [{ method: 'popup', minutes: 10 }, { method: 'email', minutes: 60 }],
      },
      expect: ['calendar.events.insert'],
    },
  ],
  calendar_update_event: [
    {
      args: {
        calendar_id: 'primary',
        event_id: 'ev-1',
        summary: 'Review 2',
        description: 'New agenda',
        location: 'Room 2',
        start: '2026-11-02T12:00:00+01:00',
        end: '2026-11-02T13:00:00+01:00',
        time_zone: 'Europe/Berlin',
        attendees: ['a@example.com'],
        send_updates: 'all',
      },
      expect: ['calendar.events.patch'],
    },
    // 1.8.0: add and remove guests (read the event first), a Meet link, recurrence and reminders.
    {
      args: { event_id: 'ev-1', add_attendees: ['c@example.com'], remove_attendees: ['b@example.com'], add_meet: true, recurrence: ['RRULE:FREQ=DAILY;COUNT=3'], reminders: [] },
      expect: ['calendar.events.get', 'calendar.events.patch'],
      respond: () => ({ ...generic(), attendees: [{ email: 'a@example.com', responseStatus: 'accepted' }, { email: 'b@example.com' }] }),
    },
  ],
  calendar_delete_event: [{ args: { calendar_id: 'primary', event_id: 'ev-1', send_updates: 'none' }, preview: true, expect: ['calendar.events.get', 'calendar.events.delete'] }],

  // gdrive
  drive_search: [{ args: { q: "name contains 'report'", page_size: 10, page_token: 'p1' }, expect: ['drive.files.list'] }],
  drive_get_file: [{ args: { file_id: 'file-1' }, expect: ['drive.files.get'] }],
  drive_read_text: [
    { args: { file_id: 'file-1', max_chars: 1000 }, expect: ['drive.files.get'], respond: (call) => (call.query.alt === 'media' ? 'plain text' : generic()) },
    {
      args: { file_id: 'doc-1' },
      expect: ['drive.files.get', 'drive.files.export'],
      respond: (call) => (call.url.endsWith('/export') ? 'exported text' : { ...generic(), mimeType: 'application/vnd.google-apps.document' }),
    },
    // 1.9.0: an Office file (size, then the bytes) and the comment threads.
    {
      args: { file_id: 'docx-1', include_comments: true },
      expect: ['drive.files.get', 'drive.comments.list'],
      respond: (call) =>
        call.url.endsWith('/comments') ? { comments: [{ id: 'c1', content: 'Check this', replies: [] }] } : call.query.alt === 'media' ? docx() : { ...generic(), mimeType: DOCX, size: '900' },
    },
  ],
  drive_list_recent: [{ args: { order_by: 'lastModifiedByMe', page_size: 5, page_token: 'p1' }, expect: ['drive.files.list'] }],
  drive_download: [
    { args: { file_id: 'doc-1', export_mime_type: 'application/pdf' }, expect: ['drive.files.get', 'drive.files.export'], respond: (call) => (call.url.endsWith('/export') ? '%PDF' : { ...generic(), mimeType: 'application/vnd.google-apps.document' }) },
    { args: { file_id: 'file-1' }, expect: ['drive.files.get'], respond: (call) => (call.query.alt === 'media' ? 'bytes' : { ...generic(), mimeType: 'application/pdf', size: '5' }) },
  ],
  drive_create_file: [
    { args: { name: 'Plan', google_type: 'document', parent_id: 'folder-1' }, expect: ['drive.files.create'] },
    { args: { name: 'Budget', google_type: 'spreadsheet', text_content: 'a,b\n1,2', content_mime_type: 'text/csv' }, expect: ['drive.files.create'] },
    { args: { name: 'logo.png', base64_content: 'iVBORw0KGgo=', content_mime_type: 'image/png' }, expect: ['drive.files.create'] },
    { args: { name: 'notes.txt', local_path: SMALL_FILE }, expect: ['drive.files.create'] },
  ],
  sheets_get_values: [{ args: { spreadsheet_id: 'sheet-1', range: 'Sheet1!A1:C3', value_render: 'formula' }, expect: ['sheets.spreadsheets.values.get'] }],
  sheets_write_values: [
    { args: { spreadsheet_id: 'sheet-1', range: 'Sheet1!A1', values: [['a', 1, true, null]], value_input: 'data' }, expect: ['sheets.spreadsheets.values.update'] },
    { args: { spreadsheet_id: 'sheet-1', range: "'My sheet'!C1:C2", values: [['=A1+B1'], ['=A2+B2']], value_input: 'formulas' }, expect: ['sheets.spreadsheets.values.update'] },
  ],
  sheets_insert_rows: [{ args: { spreadsheet_id: 'sheet-1', sheet_id: 0, start_index: 2, end_index: 5, dimension: 'ROWS', inherit_from_before: true }, expect: ['sheets.spreadsheets.batchUpdate'] }],
  drive_create_folder: [{ args: { name: 'Reports', parent_id: 'folder-1' }, expect: ['drive.files.create'] }],
  drive_create_text_file: [{ args: { name: 'notes.txt', content: 'Hello', mime_type: 'text/plain', parent_id: 'folder-1' }, expect: ['drive.files.create'] }],
  drive_trash_file: [{ args: { file_id: 'file-1' }, preview: true, expect: ['drive.files.get', 'drive.files.update'] }],

  // searchconsole
  sc_sites_list: [{ args: {}, expect: ['webmasters.sites.list'] }],
  sc_site_get: [{ args: { site_url: SITE }, expect: ['webmasters.sites.get'] }],
  sc_sitemaps_list: [{ args: { site_url: SITE, sitemap_index: SITEMAP }, expect: ['webmasters.sitemaps.list'] }],
  sc_sitemap_get: [{ args: { site_url: SITE, feedpath: SITEMAP }, expect: ['webmasters.sitemaps.get'] }],
  sc_search_analytics_query: [
    {
      args: {
        site_url: SITE,
        start_date: '2026-10-01',
        end_date: '2026-10-28',
        dimensions: ['query', 'page'],
        type: 'web',
        row_limit: 100,
        start_row: 0,
        dimension_filter_groups: [{ groupType: 'and', filters: [{ dimension: 'query', operator: 'contains', expression: 'mcp' }] }],
      },
      expect: ['webmasters.searchanalytics.query'],
    },
  ],
  sc_url_inspect: [{ args: { site_url: SITE, inspection_url: 'https://example.com/page', language_code: 'en-US' }, expect: ['searchconsole.urlInspection.index.inspect'] }],
  sc_site_add: [{ args: { site_url: SITE }, expect: ['webmasters.sites.add'] }],
  sc_sitemap_submit: [{ args: { site_url: SITE, feedpath: SITEMAP }, expect: ['webmasters.sitemaps.submit'] }],
  sc_site_delete: [{ args: { site_url: SITE }, preview: true, expect: ['webmasters.sites.delete'] }],
  sc_sitemap_delete: [{ args: { site_url: SITE, feedpath: SITEMAP }, preview: true, expect: ['webmasters.sitemaps.delete'] }],

  // cloud
  cloud_projects_search: [{ args: { query: 'name:demo*' }, expect: ['cloudresourcemanager.projects.search'] }],
  cloud_project_get: [{ args: { project_id: 'my-project-123' }, expect: ['cloudresourcemanager.projects.get'] }],
  cloud_project_iam_policy: [{ args: { project_id: 'my-project-123' }, expect: ['cloudresourcemanager.projects.getIamPolicy'] }],
  cloud_services_list: [{ args: { project_id: 'my-project-123', enabled_only: true }, expect: ['serviceusage.services.list'] }],
  cloud_operation_get: [{ args: { name: 'operations/op-1' }, expect: ['cloudresourcemanager.operations.get'] }],
  cloud_apikeys_list: [{ args: { project_id: 'my-project-123' }, expect: ['cloudresourcemanager.projects.get', 'apikeys.projects.locations.keys.list'] }],
  cloud_apikey_get: [{ args: { key_name: 'projects/123456789012/locations/global/keys/key-1' }, expect: ['apikeys.projects.locations.keys.get'] }],
  cloud_apikey_reveal: [{ args: { key_name: 'projects/123456789012/locations/global/keys/key-1' }, expect: ['apikeys.projects.locations.keys.getKeyString'] }],
  bq_query_read: [
    { args: { project_id: 'my-project-123', query: 'SELECT 1', max_bytes_billed: 1000000, max_rows: 10, location: 'EU' }, expect: ['bigquery.jobs.insert', 'bigquery.jobs.query'] },
  ],
  bq_job_get: [{ args: { project_id: 'my-project-123', job_id: 'job-1', location: 'EU', max_rows: 10 }, expect: ['bigquery.jobs.getQueryResults'] }],
  bq_dataset_list: [{ args: { project_id: 'my-project-123', max_results: 10 }, expect: ['bigquery.datasets.list'] }],
  bq_table_list: [{ args: { project_id: 'my-project-123', dataset_id: 'analytics', max_results: 10 }, expect: ['bigquery.tables.list'] }],
  bq_table_get: [{ args: { project_id: 'my-project-123', dataset_id: 'analytics', table_id: 'events' }, expect: ['bigquery.tables.get'] }],
  bq_table_preview: [{ args: { project_id: 'my-project-123', dataset_id: 'analytics', table_id: 'events', max_rows: 5 }, expect: ['bigquery.tables.get', 'bigquery.tabledata.list'] }],
  cloud_project_create: [{ args: { project_id: 'my-project-123', display_name: 'My project', parent: 'organizations/123' }, expect: ['cloudresourcemanager.projects.create'] }],
  project_readiness: [{ args: { project_id: 'my-project-123', groups: ['workspace-user'] }, expect: ['serviceusage.services.list'] }],
  project_enable_missing: [{ args: { project_id: 'my-project-123', groups: ['searchconsole'] }, expect: ['serviceusage.services.list', 'serviceusage.services.batchEnable'] }],
  cloud_service_enable: [{ args: { project_id: 'my-project-123', service: 'gmail.googleapis.com' }, expect: ['serviceusage.services.enable'] }],
  cloud_apikey_create: [
    {
      // Another project than cloud_apikeys_list's: the project number is cached per project id, so this one is looked up.
      args: { project_id: 'other-project-456', display_name: 'Maps key', api_targets: ['maps-backend.googleapis.com'] },
      expect: ['cloudresourcemanager.projects.get', 'apikeys.projects.locations.keys.create'],
    },
  ],
  cloud_project_delete: [{ args: { project_id: 'my-project-123' }, preview: true, expect: ['cloudresourcemanager.projects.delete'] }],
  cloud_service_disable: [{ args: { project_id: 'my-project-123', service: 'gmail.googleapis.com', disable_dependent_services: false }, preview: true, expect: ['serviceusage.services.disable'] }],
  cloud_apikey_delete: [{ args: { key_name: 'projects/123456789012/locations/global/keys/key-1' }, preview: true, expect: ['apikeys.projects.locations.keys.delete'] }],
  // 1.10.0: Logging, Monitoring, IAM roles, Billing prices, Cloud Storage objects.
  logging_entries_list: [
    {
      args: { project_id: 'my-project-123', filter: 'textPayload:"timeout"', severity: 'ERROR', resource_type: 'cloud_run_revision', freshness: '6h', page_size: 20, page_token: 'p1' },
      expect: ['logging.entries.list'],
    },
    {
      args: { resource_names: ['folders/123', 'projects/my-project-123'], start_time: '2026-10-29T00:00:00Z', end_time: '2026-10-30T00:00:00Z', order: 'oldest', view: 'full' },
      expect: ['logging.entries.list'],
    },
  ],
  monitoring_query_promql: [
    {
      args: { project_id: 'my-project-123', query: 'sum(rate(run_googleapis_com:request_count[5m]))', start_time: '2026-10-30T00:00:00Z', end_time: '2026-10-30T01:00:00Z', step: '60s', timeout: '30s' },
      expect: ['monitoring.projects.location.prometheus.api.v1.query_range'],
      respond: () => ({ status: 'success', data: { resultType: 'matrix', result: [] } }),
    },
    { args: { project_id: 'my-project-123', query: 'up', time: '2026-10-30T00:00:00Z' }, expect: ['monitoring.projects.location.prometheus.api.v1.query'], respond: () => ({ status: 'success', data: { resultType: 'vector', result: [] } }) },
  ],
  monitoring_dashboards_list: [{ args: { project_id: 'my-project-123', page_size: 10, page_token: 'p1' }, expect: ['monitoring.projects.dashboards.list'] }],
  monitoring_dashboard_get: [
    { args: { project_id: 'my-project-123', dashboard_id: 'dash-1' }, expect: ['monitoring.projects.dashboards.get'] },
    { args: { name: 'projects/my-project-123/dashboards/dash-2' }, expect: ['monitoring.projects.dashboards.get'] },
  ],
  iam_roles_list: [
    { args: { view: 'full', page_size: 10, page_token: 'p1' }, expect: ['iam.roles.list'] },
    { args: { project_id: 'my-project-123', show_deleted: true }, expect: ['iam.projects.roles.list'] },
    { args: { organization_id: '123456789' }, expect: ['iam.organizations.roles.list'] },
  ],
  iam_role_get: [
    { args: { name: 'roles/viewer' }, expect: ['iam.roles.get'] },
    { args: { name: 'projects/my-project-123/roles/auditor' }, expect: ['iam.projects.roles.get'] },
    { args: { name: 'organizations/123456789/roles/auditor' }, expect: ['iam.organizations.roles.get'] },
  ],
  billing_price_lookup: [
    { args: { sku_id: 'D041-B8A1-6E0B', currency_code: 'EUR' }, expect: ['cloudbilling.skus.price.get'] },
    {
      args: { service: 'Compute Engine', query: 'N2 core', region: 'us-central1', billing_account: '012345-6789AB-CDEF01', currency_code: 'EUR', max_skus: 5 },
      expect: ['cloudbilling.services.list', 'cloudbilling.services.skus.list', 'cloudbilling.billingAccounts.skus.price.get'],
      respond: (call) =>
        call.url.endsWith('/v1/services')
          ? { services: [{ serviceId: '6F81-5844-456A', displayName: 'Compute Engine' }] }
          : call.url.endsWith('/skus')
            ? { skus: [{ skuId: 'AAAA-BBBB-CCCC', description: 'N2 Instance Core running in Americas', serviceRegions: ['us-central1'] }] }
            : {},
    },
  ],
  gcs_read_text: [
    {
      args: { bucket: 'my-bucket', object: 'logs/app.txt', generation: '7', read_offset: 2, max_bytes: 100 },
      expect: ['storage.objects.get'],
      respond: (call) => (call.query.alt === 'media' ? 'llo text' : { size: '10', contentType: 'text/plain', generation: '7' }),
    },
  ],
  gcs_read_object: [
    { args: { bucket: 'my-bucket', object: 'img/logo.png' }, expect: ['storage.objects.get'], respond: (call) => (call.query.alt === 'media' ? 'PNG' : { size: '3', contentType: 'image/png', generation: '9' }) },
  ],
  gcs_write_text: [
    { args: { bucket: 'my-bucket', object: 'notes/today.txt', text: 'hello' }, expect: ['storage.objects.insert'] },
    { args: { bucket: 'my-bucket', object: 'notes/notes.txt', local_path: SMALL_FILE, content_type: 'text/plain', overwrite: true }, expect: ['storage.objects.insert'] },
  ],

  // gads
  ads_list_customers: [{ args: {}, expect: ['googleads.customers.listAccessibleCustomers'] }],
  ads_search: [{ args: { customer_id: '1234567890', query: 'SELECT campaign.id FROM campaign' }, expect: ['googleads.customers.googleAds.search'] }],
  ads_mutate: [
    { args: { customer_id: '1234567890', operations: [{ campaignOperation: { remove: 'customers/1234567890/campaigns/9' } }] }, expect: ['googleads.customers.googleAds.mutate'] },
    {
      args: { customer_id: '1234567890', operations: [{ campaignOperation: { update: { resourceName: 'customers/1234567890/campaigns/9', name: 'New' }, updateMask: 'name' } }], validate_only: false },
      expect: ['googleads.customers.googleAds.mutate'],
    },
  ],

  // workspace-admin
  admin_users_list: [{ args: { customer: 'my_customer', query: 'email:a*', max_results: 10, page_token: 'p1', order_by: 'email' }, expect: ['directory.users.list'] }],
  admin_user_get: [{ args: { user_key: 'a@example.com' }, expect: ['directory.users.get', 'directory.groups.list'] }],
  admin_orgunits_list: [{ args: { customer_id: 'my_customer', org_unit_path: '/Sales', type: 'all' }, expect: ['directory.orgunits.list'] }],
  admin_orgunit_get: [{ args: { org_unit_path: '/Sales' }, expect: ['directory.orgunits.get'] }],
  admin_groups_list: [{ args: { domain: 'example.com', query: 'email:team*', max_results: 10, page_token: 'p1' }, expect: ['directory.groups.list'] }],
  admin_group_get: [{ args: { group_key: 'team@example.com' }, expect: ['directory.groups.get'] }],
  admin_group_members_list: [{ args: { group_key: 'team@example.com', roles: 'OWNER', max_results: 10, page_token: 'p1' }, expect: ['directory.members.list'] }],
  admin_domains_list: [{ args: { customer: 'my_customer' }, expect: ['directory.domains.list'] }],
  admin_user_create: [
    {
      args: { primary_email: 'n@example.com', given_name: 'New', family_name: 'User', password: 'a-long-test-password', org_unit_path: '/Sales', change_password_at_next_login: true },
      expect: ['directory.users.insert'],
    },
  ],
  admin_user_move_org_unit: [{ args: { user_key: 'a@example.com', org_unit_path: '/Sales' }, expect: ['directory.users.patch'] }],
  admin_user_set_suspended: [{ args: { user_key: 'a@example.com', suspended: true }, expect: ['directory.users.patch'] }],
  admin_orgunit_create: [{ args: { name: 'Sales', parent_org_unit_path: '/', description: 'Sales team' }, expect: ['directory.orgunits.insert'] }],
  admin_orgunit_update: [{ args: { org_unit_path: '/Sales', name: 'Sales EU', description: 'EU', parent_org_unit_path: '/' }, expect: ['directory.orgunits.patch'] }],
  admin_group_create: [{ args: { email: 'team@example.com', name: 'Team', description: 'The team' }, expect: ['directory.groups.insert'] }],
  admin_group_member_add: [{ args: { group_key: 'team@example.com', email: 'a@example.com', role: 'MEMBER' }, expect: ['directory.members.insert'] }],
  admin_user_delete: [{ args: { user_key: 'a@example.com' }, preview: true, expect: ['directory.users.get', 'directory.users.delete'] }],
  admin_orgunit_delete: [{ args: { org_unit_path: '/Sales' }, preview: true, expect: ['directory.orgunits.list', 'directory.users.list', 'directory.orgunits.delete'] }],
  admin_group_delete: [{ args: { group_key: 'team@example.com' }, preview: true, expect: ['directory.groups.get', 'directory.groups.delete'] }],
  admin_member_remove: [{ args: { group_key: 'team@example.com', member_key: 'a@example.com' }, preview: true, expect: ['directory.members.get', 'directory.members.delete'] }],

  // gchat (1.12.0)
  chat_search_conversations: [
    { args: { query: 'apollo', page_size: 50, page_token: 'p1' }, expect: ['chat.spaces.list'] },
    { args: { participants: ['bo@example.com'] }, expect: ['chat.spaces.findDirectMessage'] },
    { args: { participants: ['a@example.com', 'b@example.com'], page_size: 10, page_token: 'p1' }, expect: ['chat.spaces.findGroupChats'] },
  ],
  chat_list_messages: [
    {
      args: { conversation_id: 'spaces/AAA', thread_id: 'spaces/AAA/threads/t1', start_time: '2026-10-29T00:00:00Z', end_time: '2026-10-30T00:00:00Z', page_size: 10, page_token: 'p1' },
      expect: ['chat.spaces.messages.list'],
    },
    { args: { conversation_id: 'spaces/AAA', order: 'oldest', format: 'chat' }, expect: ['chat.spaces.messages.list'] },
  ],
  chat_search_messages: [
    {
      args: { query: 'budget', conversation_ids: ['spaces/AAA'], senders: ['a@example.com'], unread_only: true, start_time: '2026-10-01T00:00:00Z', page_size: 10, page_token: 'p1' },
      expect: ['chat.spaces.messages.search'],
    },
  ],
  chat_list_members: [{ args: { conversation_id: 'spaces/AAA', include_invited: true, include_groups: true, managers_only: true, page_size: 10, page_token: 'p1' }, expect: ['chat.spaces.members.list'] }],
  chat_send_message: [
    { args: { conversation_id: 'spaces/AAA', text: '**Hi**' }, expect: ['chat.spaces.get', 'chat.spaces.messages.create'] },
    { args: { conversation_id: 'spaces/AAA', text: '*Hi*', thread_id: 'spaces/AAA/threads/t1', format: 'chat' }, expect: ['chat.spaces.get', 'chat.spaces.messages.create'] },
  ],
  chat_mark_read: [{ args: { conversation_ids: ['spaces/AAA', 'spaces/BBB'] }, expect: ['chat.users.spaces.updateSpaceReadState'] }],
  chat_mark_unread: [{ args: { conversation_id: 'spaces/AAA', last_read_time: '2026-10-29T08:00:00Z' }, expect: ['chat.users.spaces.updateSpaceReadState'] }],
};

/** Tools that cannot run here, with the reason. Counted. */
const SKIPPED = {};

/** Real mismatches found in a curated tool: skipped with the defect named, until the tool is fixed in its own change. */
const KNOWN_DEFECTS = {};

test('every curated tool has a contract row, a skip reason or a known defect, and nothing else is listed', () => {
  const listed = new Set([...Object.keys(CASES), ...Object.keys(SKIPPED), ...Object.keys(KNOWN_DEFECTS)]);
  assert.deepEqual([...tools.keys()].filter((name) => !listed.has(name)), [], 'curated tools without a row');
  assert.deepEqual([...listed].filter((name) => !tools.has(name)), [], 'rows for tools that do not exist');
  assert.equal(tools.size, 107, 'the curated tool count; update the table when it changes');
});

for (const [name, cases] of Object.entries(CASES)) {
  test(`contract: ${name}`, { skip: KNOWN_DEFECTS[name] ?? SKIPPED[name] ?? false }, async () => {
    const tool = tools.get(name);
    for (const c of cases) {
      calls = [];
      respond = c.respond ?? generic;
      if (c.preview && tool.preview) await tool.preview(c.args);
      await tool.handler(c.args, ctx);
      assert.ok(calls.length > 0, `${name}: the handler sent a request`);
      const seen = [];
      for (const call of calls) {
        const { id, problems } = problemsOf(call);
        assert.deepEqual(problems, [], `${name}: ${call.method} ${call.url}`);
        if (!seen.includes(id)) seen.push(id);
      }
      assert.deepEqual(seen, c.expect, `${name}: the Discovery methods it calls`);
    }
  });
}
