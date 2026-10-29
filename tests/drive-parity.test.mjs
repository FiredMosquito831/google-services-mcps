// The Drive, Docs and Sheets parity tools (1.9.0): drive_list_recent, drive_download, drive_create_file, the Office and
// comment options of drive_read_text, the new fields of drive_get_file, sheets_get_values, sheets_write_values,
// sheets_insert_rows, and the Office/OpenDocument text reader. The HTTP layer is stubbed (OAuth2Client.prototype.request),
// so nothing leaves the machine. Fake tokens in a temp folder only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { DOCX, PPTX, XLSX, docx, odp, ods, odt, pptx, xlsx, zipOf } from './fixtures/office-zip.mjs';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools, OFFICE_READ_MAX_BYTES, VALUE_INPUT } = await import(DIST('servers/gdrive.js'));
const office = await import(DIST('servers/office-text.js'));
const { classifyMethod } = await import(DIST('core/discovery/methods.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-drive-parity-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
// A server with a small result limit, for the download cap.
const small = new Map((await buildTools({ ...cfg, maxResultChars: 2000 })).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args, set = tools) => set.get(name).handler(args, ctx);

/** The whole body of a request: a string, or a stream (a multipart upload) read to the end. */
async function bodyOf(data) {
  if (data && typeof data.pipe === 'function') {
    const chunks = [];
    for await (const chunk of data) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return data;
}

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = String(value);
  const call = { method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, path: url.pathname, query, body: await bodyOf(opts.data), responseType: opts.responseType };
  calls.push(call);
  return { data: await respond(call), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};
const schema = (name) => z.object(tools.get(name).inputSchema);

// ---------------------------------------------------------------------------
// Kinds and scopes

test('kinds follow classifyMethod: list_recent, download and get_values read; create_file, write_values and insert_rows write', () => {
  assert.equal(tools.get('drive_list_recent').kind, classifyMethod('GET', 'list', 'drive.files.list'));
  assert.equal(tools.get('drive_download').kind, classifyMethod('GET', 'export', 'drive.files.export'));
  assert.equal(tools.get('sheets_get_values').kind, classifyMethod('GET', 'get', 'sheets.spreadsheets.values.get'));
  assert.equal(tools.get('drive_create_file').kind, classifyMethod('POST', 'create', 'drive.files.create'));
  assert.equal(tools.get('sheets_write_values').kind, classifyMethod('PUT', 'update', 'sheets.spreadsheets.values.update'));
  assert.equal(tools.get('sheets_insert_rows').kind, classifyMethod('POST', 'batchUpdate', 'sheets.spreadsheets.batchUpdate'));
  for (const name of ['drive_list_recent', 'drive_download', 'sheets_get_values']) assert.equal(tools.get(name).kind, 'read', name);
  for (const name of ['drive_create_file', 'sheets_write_values', 'sheets_insert_rows']) assert.equal(tools.get(name).kind, 'write', name);
  const G = (s) => `https://www.googleapis.com/auth/${s}`;
  assert.deepEqual(tools.get('drive_create_file').scopes, [G('drive'), G('drive.file')]);
  assert.deepEqual(tools.get('sheets_write_values').scopes, [G('drive'), G('drive.file'), G('spreadsheets')]);
  assert.deepEqual(tools.get('sheets_get_values').scopes, [G('drive'), G('drive.file'), G('drive.readonly'), G('spreadsheets'), G('spreadsheets.readonly')]);
  assert.deepEqual(tools.get('drive_list_recent').scopes, tools.get('drive_search').scopes);
  assert.equal([...tools.values()].some((t) => t.prepare), false);
  for (const t of tools.values()) assert.equal(t.inputSchema.confirm, undefined, `${t.name}: no model-controlled confirm`);
});

// ---------------------------------------------------------------------------
// office-text.ts

test('Office and OpenDocument text: Word, Excel, PowerPoint, odt, ods, odp', () => {
  assert.equal(office.officeText(docx(), DOCX), 'Hello world & co\nA\tB\nC');
  assert.equal(office.officeText(xlsx(), XLSX), '## Sheet: Budget\nItem,Cost\n"Rent, flat",,950.5\nTRUE,x < y\n\n## Sheet: Notes\n,Total');
  assert.equal(office.officeText(pptx(), PPTX), '## Slide 1\nTitle\nPoint\n\n## Slide 2\nSecond\nline\n\n## Slide 3\nTenth');
  assert.equal(office.officeText(odt(), 'application/vnd.oasis.opendocument.text'), 'Plan\nOne   two\tthree\nFour\nfive');
  assert.equal(office.officeText(ods(), 'application/vnd.oasis.opendocument.spreadsheet'), '## Sheet: Data\na\tb\n\tc');
  assert.equal(office.officeText(odp(), 'application/vnd.oasis.opendocument.presentation'), '## Slide 1\nFirst\n\n## Slide 2\nSecond');
  assert.equal(office.decodeXml('&lt;a&gt; &#233; &#x20AC; &quot;&apos;'), '<a> é € "\'');
});

test('Office text: not a ZIP, a missing part and a part that inflates past the cap are refused', () => {
  assert.throws(() => office.officeText(Buffer.from('%PDF-1.7 not a zip'), DOCX), /not a ZIP archive/);
  assert.throws(() => office.officeText(zipOf([{ name: 'other.xml', text: '<x/>' }]), DOCX), /has no word\/document\.xml/);
  assert.throws(() => office.officeText(docx(), 'application/msword'), /not an Office or OpenDocument type/);
  // 65 MB of zeros deflate to a few kilobytes; the reader stops at MAX_PART_BYTES (64 MB) instead of filling memory.
  const bomb = Buffer.alloc(office.MAX_PART_BYTES + 1024 * 1024);
  const archive = zipOf([{ name: 'word/document.xml', text: '' }]);
  const deflated = deflateRawSync(bomb);
  const parts = office.zipEntries(rebuildWith(archive, deflated));
  assert.throws(() => parts.get('word/document.xml')(), (err) => err instanceof RangeError || /larger than|too large/i.test(String(err)));
});

/** A one-part archive whose part is the given deflated bytes (method 8). */
function rebuildWith(_template, deflated) {
  const name = Buffer.from('word/document.xml');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt16LE(name.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(deflated.length, 20);
  entry.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(30 + name.length + deflated.length, 16);
  return Buffer.concat([local, name, deflated, entry, name, end]);
}

// ---------------------------------------------------------------------------
// drive_read_text

test('read_text: an Office file is sized, downloaded and read; over 20 MB nothing is downloaded; PDF points to drive_download', async () => {
  reset((call) => (call.query.alt === 'media' ? docx() : call.query.fields === 'size' ? { size: '2048' } : { id: 'f1', name: 'Plan.docx', mimeType: DOCX }));
  const out = await run('drive_read_text', { file_id: 'f1' });
  assert.deepEqual(calls.map((c) => [c.query.fields ?? null, c.query.alt ?? null]), [['id, name, mimeType', null], ['size', null], [null, 'media']]);
  assert.equal(calls[2].responseType, 'arraybuffer');
  assert.equal(out.text, 'Hello world & co\nA\tB\nC');
  assert.equal(out.text_source, 'text taken from the downloaded file');
  assert.equal(out.mime_type, DOCX);

  reset((call) => (call.query.fields === 'size' ? { size: String(OFFICE_READ_MAX_BYTES + 1) } : { id: 'f1', name: 'Big.xlsx', mimeType: XLSX }));
  await assert.rejects(run('drive_read_text', { file_id: 'f1' }), /over the 20971520 bytes drive_read_text reads/);
  assert.equal(calls.some((c) => c.query.alt === 'media'), false, 'too large: not downloaded');

  reset(() => ({ id: 'f1', name: 'Scan.pdf', mimeType: 'application/pdf' }));
  await assert.rejects(run('drive_read_text', { file_id: 'f1' }), /Use drive_download for the bytes/);
  assert.equal(calls.length, 1);
});

test('read_text: a 1.8.0 call sends the same requests and gets the same fields; include_comments adds the threads', async () => {
  const doc = (call) => (call.path.endsWith('/export') ? 'Doc text' : { id: 'd1', name: 'Notes', mimeType: 'application/vnd.google-apps.document' });
  reset(doc);
  const plain = await run('drive_read_text', { file_id: 'd1' });
  assert.deepEqual(calls.map((c) => c.path), ['/drive/v3/files/d1', '/drive/v3/files/d1/export']);
  assert.deepEqual(Object.keys(plain).sort(), ['id', 'mime_type', 'name', 'text', 'text_total_chars', 'truncated']);

  reset((call) =>
    call.path.endsWith('/comments')
      ? {
          comments: [
            { id: 'c1', author: { displayName: 'Ana', emailAddress: 'ana@example.com' }, content: 'Typo here', quotedFileContent: { value: 'teh' }, resolved: false, createdTime: 't1', replies: [{ author: { displayName: 'Bo' }, content: 'Fixed', createdTime: 't2' }, { content: 'gone', deleted: true }] },
            { id: 'c2', content: 'deleted', deleted: true },
          ],
        }
      : doc(call),
  );
  const withComments = await run('drive_read_text', { file_id: 'd1', include_comments: true });
  assert.equal(calls[2].path, '/drive/v3/files/d1/comments');
  assert.match(calls[2].query.fields, /^nextPageToken, comments\(/, 'Drive needs fields on comments.list');
  assert.equal(calls[2].query.pageSize, '100');
  assert.deepEqual(withComments.comments, [
    { id: 'c1', author: 'ana@example.com', content: 'Typo here', quoted_text: 'teh', resolved: false, created_time: 't1', replies: [{ author: 'Bo', content: 'Fixed', created_time: 't2' }] },
  ]);

  // Pages stop after 10 (1,000 threads), with a note.
  reset((call) => (call.path.endsWith('/comments') ? { comments: [{ id: 'x', content: 'c' }], nextPageToken: 'more' } : doc(call)));
  const many = await run('drive_read_text', { file_id: 'd1', include_comments: true });
  assert.equal(calls.filter((c) => c.path.endsWith('/comments')).length, 10);
  assert.equal(many.comments.length, 10);
  assert.match(many.comments_note, /first 1000 comment threads/);
});

// ---------------------------------------------------------------------------
// drive_download

test('download: bytes as base64; Google files exported (default text, or the type asked); the size cap is checked before a download', async () => {
  const bytes = Buffer.from([0, 1, 2, 250, 255]);
  reset((call) => (call.query.alt === 'media' ? bytes : { id: 'f1', name: 'a.bin', mimeType: 'application/octet-stream', size: '5' }));
  const out = await run('drive_download', { file_id: 'f1' });
  assert.equal(out.data_base64, bytes.toString('base64'));
  assert.equal(out.size_bytes, 5);
  assert.equal(calls[1].responseType, 'arraybuffer');

  for (const [mime, expected] of [
    ['application/vnd.google-apps.document', 'text/plain'],
    ['application/vnd.google-apps.spreadsheet', 'text/csv'],
    ['application/vnd.google-apps.presentation', 'text/plain'],
    ['application/vnd.google-apps.drawing', 'image/png'],
  ]) {
    reset((call) => (call.path.endsWith('/export') ? 'x' : { id: 'g', name: 'g', mimeType: mime }));
    const exp = await run('drive_download', { file_id: 'g' });
    assert.equal(calls[1].query.mimeType, expected, mime);
    assert.equal(exp.mime_type, expected);
  }
  reset((call) => (call.path.endsWith('/export') ? '%PDF' : { id: 'g', name: 'g', mimeType: 'application/vnd.google-apps.document' }));
  await run('drive_download', { file_id: 'g', export_mime_type: 'application/pdf' });
  assert.equal(calls[1].query.mimeType, 'application/pdf');
  reset(() => ({ id: 'g', name: 'Survey', mimeType: 'application/vnd.google-apps.form' }));
  await assert.rejects(run('drive_download', { file_id: 'g' }), /has no default export\. Give export_mime_type/);

  // Result limit 2,000 characters: room for about 750 bytes. Drive reports 5,000: nothing is downloaded.
  reset(() => ({ id: 'f1', name: 'big.pdf', mimeType: 'application/pdf', size: '5000' }));
  const big = await run('drive_download', { file_id: 'f1' }, small);
  assert.equal(big.data_base64, null);
  assert.equal(big.size_bytes, 5000);
  assert.match(big.note, /over this server's result limit of 2000 characters/);
  assert.equal(calls.length, 1, 'not downloaded');
  // An export has no size up front: it is checked after the export.
  reset((call) => (call.path.endsWith('/export') ? Buffer.alloc(3000) : { id: 'g', name: 'g', mimeType: 'application/vnd.google-apps.document' }));
  const exported = await run('drive_download', { file_id: 'g' }, small);
  assert.equal(exported.data_base64, null);
  assert.equal(exported.size_bytes, 3000);
});

// ---------------------------------------------------------------------------
// drive_list_recent and drive_get_file

test('list_recent: newest first by recency (default) or the order asked, 10 a page, no folders or trash', async () => {
  reset(() => ({ files: [{ id: 'f1', name: 'a', viewedByMeTime: 'v' }], nextPageToken: 'n' }));
  const out = await run('drive_list_recent', {});
  assert.equal(calls[0].query.orderBy, 'recency desc');
  assert.equal(calls[0].query.pageSize, '10');
  assert.equal(calls[0].query.q, "trashed = false and mimeType != 'application/vnd.google-apps.folder'");
  assert.equal(out.files[0].viewed_by_me_time, 'v');
  assert.equal(out.next_page_token, 'n');
  for (const [order, sent] of [['lastModified', 'modifiedTime desc'], ['lastModifiedByMe', 'modifiedByMeTime desc'], ['viewedByMe', 'viewedByMeTime desc']]) {
    reset(() => ({ files: [] }));
    await run('drive_list_recent', { order_by: order, page_size: 3 });
    assert.equal(calls[0].query.orderBy, sent);
    assert.equal(calls[0].query.pageSize, '3');
  }
});

test('get_file: adds description, extension, view and share times and can_add_children; the old fields are unchanged', async () => {
  reset(() => ({ id: 'f1', name: 'a.txt', mimeType: 'text/plain', size: '3', description: 'notes', fileExtension: 'txt', viewedByMeTime: 'v', sharedWithMeTime: 's', capabilities: { canAddChildren: false }, parents: ['p'], trashed: false }));
  const out = await run('drive_get_file', { file_id: 'f1' });
  assert.match(calls[0].query.fields, /description, fileExtension, viewedByMeTime, sharedWithMeTime, capabilities\(canAddChildren\)$/);
  assert.equal(out.description, 'notes');
  assert.equal(out.file_extension, 'txt');
  assert.equal(out.viewed_by_me_time, 'v');
  assert.equal(out.shared_with_me_time, 's');
  assert.equal(out.can_add_children, false);
  assert.equal(out.size, '3');
  assert.deepEqual(out.parents, ['p']);
});

// ---------------------------------------------------------------------------
// drive_create_file

test('create_file: a blank Google file has no upload; content goes as one multipart upload, converted only with google_type', async () => {
  reset(() => ({ id: 'n1', name: 'Plan', mimeType: 'application/vnd.google-apps.document' }));
  const blank = await run('drive_create_file', { name: 'Plan', google_type: 'document', parent_id: 'folder-1' });
  assert.equal(calls[0].url, 'https://www.googleapis.com/drive/v3/files');
  assert.deepEqual(calls[0].body, { name: 'Plan', mimeType: 'application/vnd.google-apps.document', parents: ['folder-1'] });
  assert.equal(blank.source, 'blank');

  reset(() => ({ id: 'n2' }));
  const conv = await run('drive_create_file', { name: 'Budget', google_type: 'spreadsheet', text_content: 'a,b\n1,2', content_mime_type: 'text/csv' });
  assert.equal(calls[0].url, 'https://www.googleapis.com/upload/drive/v3/files');
  assert.equal(calls[0].query.uploadType, 'multipart');
  const text = calls[0].body.toString('utf8');
  assert.match(text, /"mimeType":"application\/vnd\.google-apps\.spreadsheet"/);
  assert.match(text, /content-type: text\/csv\r\n\r\na,b\n1,2\r\n/i);
  assert.equal(conv.converted_from, 'text/csv');

  // base64: the decoded bytes are uploaded, the type kept (no conversion).
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
  reset(() => ({ id: 'n3' }));
  const up = await run('drive_create_file', { name: 'logo.png', base64_content: png.toString('base64'), content_mime_type: 'image/png' });
  const body = calls[0].body;
  assert.ok(body.includes(png), 'the decoded bytes are in the upload');
  assert.match(body.toString('latin1'), /"mimeType":"image\/png"/);
  assert.equal(up.uploaded_bytes, png.length);
  assert.equal('converted_from' in up, false);

  // A local file: its type by extension, its bytes streamed.
  const local = join(root, 'report.csv');
  writeFileSync(local, 'x,y\n');
  reset(() => ({ id: 'n4' }));
  const fromFile = await run('drive_create_file', { name: 'report.csv', local_path: local });
  assert.match(calls[0].body.toString('utf8'), /content-type: text\/csv\r\n\r\nx,y\n\r\n/i);
  assert.equal(fromFile.source, 'local_path');
  assert.equal(fromFile.uploaded_bytes, 4);
});

test('create_file: refused before any request: sign-in folders, relative or missing paths, two contents, a folder with content, bad base64', async () => {
  writeFileSync(join(tokenDir, 'notes.txt'), 'secret-ish');
  const refused = [
    [{ name: 'x', local_path: join(tokenDir, 'notes.txt') }, /File ".*notes\.txt" is refused: it is in the folder that holds Google sign-in data/],
    [{ name: 'x', local_path: join(tokenDir, 'client_secret.json') }, /is refused/],
    [{ name: 'x', local_path: 'relative.txt' }, /File "relative\.txt" must be a full path/],
    [{ name: 'x', local_path: join(root, 'missing.txt') }, /was not found/],
    [{ name: 'x', local_path: root }, /is not a file/],
    [{ name: 'x', text_content: 'a', base64_content: 'YQ==' }, /not several/],
    [{ name: 'x' }, /needs google_type .* or content/],
    [{ name: 'x', google_type: 'folder', text_content: 'a' }, /A folder takes no content/],
    [{ name: 'x', base64_content: 'YQ==' }, /needs content_mime_type/],
    [{ name: 'x', base64_content: 'not base64!', content_mime_type: 'image/png' }, /not base64 text/],
    [{ name: 'x', text_content: 'a', content_mime_type: 'application/vnd.google-apps.document' }, /not a Google type/],
  ];
  for (const [args, message] of refused) {
    reset();
    await assert.rejects(run('drive_create_file', args), message);
    assert.equal(calls.length, 0, JSON.stringify(args));
  }
  // A key file named in the environment is refused too.
  const key = join(root, 'sa-key.json');
  writeFileSync(key, '{}');
  const saved = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
  try {
    reset();
    await assert.rejects(run('drive_create_file', { name: 'k', local_path: key }), /is refused/);
    assert.equal(calls.length, 0);
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = saved;
  }
});

// ---------------------------------------------------------------------------
// Sheets

test('sheets_get_values: the range in the path, formatted by default', async () => {
  reset(() => ({ range: "'My sheet'!A1:B2", majorDimension: 'ROWS', values: [['a', 'b'], ['c']] }));
  const out = await run('sheets_get_values', { spreadsheet_id: 's1', range: "'My sheet'!A1:B2" });
  assert.equal(calls[0].url, 'https://sheets.googleapis.com/v4/spreadsheets/s1/values/\'My%20sheet\'!A1%3AB2');
  assert.equal(calls[0].query.valueRenderOption, 'FORMATTED_VALUE');
  assert.deepEqual(out, { range: "'My sheet'!A1:B2", rows: 2, columns: 2, values: [['a', 'b'], ['c']] });
  reset(() => ({}));
  const none = await run('sheets_get_values', { spreadsheet_id: 's1', range: 'A1', value_render: 'formula' });
  assert.equal(calls[0].query.valueRenderOption, 'FORMULA');
  assert.deepEqual(none.values, []);
});

test('sheets_write_values: value_input is required; data sends RAW, formulas sends USER_ENTERED', async () => {
  assert.deepEqual(VALUE_INPUT, { data: 'RAW', formulas: 'USER_ENTERED' });
  assert.equal(schema('sheets_write_values').safeParse({ spreadsheet_id: 's1', range: 'A1', values: [['=1']] }).success, false, 'no default: the caller says data or formulas');
  reset(() => ({ updatedRange: 'Sheet1!A1:D1', updatedRows: 1, updatedColumns: 4, updatedCells: 4 }));
  const data = await run('sheets_write_values', { spreadsheet_id: 's1', range: 'Sheet1!A1', values: [['=A1+B1', 1, true, null]], value_input: 'data' });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].query.valueInputOption, 'RAW');
  assert.deepEqual(calls[0].body, { range: 'Sheet1!A1', majorDimension: 'ROWS', values: [['=A1+B1', 1, true, null]] });
  assert.equal(data.value_input_option, 'RAW');
  assert.equal(data.updated_cells, 4);
  reset(() => ({}));
  const formulas = await run('sheets_write_values', { spreadsheet_id: 's1', range: 'Sheet1!C1', values: [['=A1+B1']], value_input: 'formulas' });
  assert.equal(calls[0].query.valueInputOption, 'USER_ENTERED');
  assert.equal(formulas.value_input_option, 'USER_ENTERED');
});

test('sheets_insert_rows: one insertDimension request; bad indexes are refused before any request', async () => {
  reset(() => ({ replies: [{}] }));
  const out = await run('sheets_insert_rows', { spreadsheet_id: 's1', sheet_id: 7, start_index: 2, end_index: 5 });
  assert.equal(calls[0].url, 'https://sheets.googleapis.com/v4/spreadsheets/s1:batchUpdate');
  assert.deepEqual(calls[0].body, { requests: [{ insertDimension: { range: { sheetId: 7, dimension: 'ROWS', startIndex: 2, endIndex: 5 }, inheritFromBefore: false } }] });
  assert.equal(out.inserted, 3);
  reset(() => ({}));
  await run('sheets_insert_rows', { spreadsheet_id: 's1', sheet_id: 0, start_index: 1, end_index: 2, dimension: 'COLUMNS', inherit_from_before: true });
  assert.deepEqual(calls[0].body.requests[0].insertDimension, { range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, inheritFromBefore: true });
  for (const [args, message] of [
    [{ spreadsheet_id: 's1', sheet_id: 0, start_index: 3, end_index: 3 }, /end_index must be greater than start_index/],
    [{ spreadsheet_id: 's1', sheet_id: 0, start_index: 0, end_index: 1, inherit_from_before: true }, /needs start_index above 0/],
  ]) {
    reset();
    await assert.rejects(run('sheets_insert_rows', args), message);
    assert.equal(calls.length, 0);
  }
});
