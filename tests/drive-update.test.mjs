// gdrive 2.1.0, from the review of 2026-10-30 (G2, G3, G4 and the 2026-10-31 lesson on preview vs prepare):
//   - drive_update_file renames, moves, stars and describes a file (Drive's PATCH, metadata only, never a type change);
//   - drive_untrash_file restores a file, and drive_trash_file works its approval out in prepare, so the form names the file;
//   - drive_read_text reads JSON, XML, SVG and YAML as text, refuses a PDF or an image with a message that names
//     drive_download instead of returning nonsense, and names the sheet of a spreadsheet (Drive's CSV export is one
//     sheet deep) with a "sheet" argument to read another one.
// The HTTP layer is stubbed (OAuth2Client.prototype.request), so nothing leaves the machine.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;
const { loadConfig } = await import(DIST('core/config.js'));
const { buildTools, csvOf, isTextMime } = await import(DIST('servers/gdrive.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-drive-update-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
writeFileSync(join(tokenDir, 'workspace-user.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_ALLOW_WRITES: 'true' });
const tools = new Map((await buildTools(cfg)).map((t) => [t.name, t]));
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };
const run = (name, args) => tools.get(name).handler(args, ctx);
const schema = (name) => z.object(tools.get(name).inputSchema);

let calls = [];
let respond = () => ({});
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  const query = Object.fromEntries(url.searchParams);
  for (const [key, value] of Object.entries(opts.params ?? {})) if (value !== undefined) query[key] = String(value);
  calls.push({ method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, path: url.pathname, query, body: opts.data });
  return { data: await respond({ method: String(opts.method ?? 'GET').toUpperCase(), url: `${url.origin}${url.pathname}`, path: url.pathname, query }), status: 200, headers: new Headers(), config: opts };
};
const reset = (responder = () => ({})) => {
  calls = [];
  respond = responder;
};

const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';
const file = (extra = {}) => ({ id: 'f1', name: 'Report', mimeType: 'text/plain', ...extra });
const tabs = (...titles) => ({ sheets: titles.map((title) => ({ properties: { title, sheetType: 'GRID' } })) });

// ---------------------------------------------------------------------------
// isTextMime and the CSV renderer

test('isTextMime: text, JSON, XML, SVG, YAML and source types are text; PDF, images and Office are not', () => {
  for (const mime of ['text/plain', 'text/csv', 'text/markdown', 'application/json', 'application/xml', 'image/svg+xml', 'application/rss+xml', 'application/yaml', 'application/x-yaml', 'application/toml', 'application/javascript', 'application/geo+json']) {
    assert.equal(isTextMime(mime), true, mime);
  }
  for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream', 'application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '']) {
    assert.equal(isTextMime(mime), false, mime);
  }
});

test('csvOf: RFC 4180 quoting, the form Drive’s own CSV export has', () => {
  assert.equal(csvOf([['a', 1, true, null], ['x,y', 'say "hi"', 'two\nlines', '']]), 'a,1,true,\n"x,y","say ""hi""","two\nlines",');
  assert.equal(csvOf([]), '');
});

// ---------------------------------------------------------------------------
// drive_update_file

test('update_file is a write that patches only the fields given: rename, star, description, move', async () => {
  assert.equal(tools.get('drive_update_file').kind, 'write');
  assert.deepEqual(tools.get('drive_update_file').scopes, ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']);
  const G = (s) => `https://www.googleapis.com/auth/${s}`;
  assert.deepEqual(tools.get('drive_update_file').scopes, [G('drive'), G('drive.file')]);

  // A rename and a star: one PATCH, no read (no move), and no other field in the body.
  reset(() => file({ name: 'Renamed', starred: true, mimeType: 'application/pdf', parents: ['p1'], webViewLink: 'https://drive.google.com/file/d/f1/view', modifiedTime: 'T1' }));
  const renamed = await run('drive_update_file', { file_id: 'f1', name: 'Renamed', starred: true });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['PATCH', '/drive/v3/files/f1']]);
  assert.deepEqual(calls[0].body, { name: 'Renamed', starred: true });
  assert.equal(calls[0].query.supportsAllDrives, 'true');
  assert.equal(calls[0].query.addParents, undefined, 'no move: no addParents');
  assert.deepEqual(renamed.changed, ['name', 'starred']);
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.starred, true);

  // A move with parent_id: the file is read for its folders first, added to the new one, taken out of the others.
  reset((call) =>
    call.path.endsWith('/f1') && call.method === 'GET' ? { id: 'f1', parents: ['old1', 'old2'] } : file({ name: 'Report', parents: ['new1'], mimeType: 'application/pdf' }),
  );
  const moved = await run('drive_update_file', { file_id: 'f1', parent_id: 'new1' });
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PATCH']);
  assert.equal(calls[0].query.fields, 'parents');
  assert.deepEqual(calls[1].body, {});
  assert.equal(calls[1].query.addParents, 'new1');
  assert.equal(calls[1].query.removeParents, 'old1,old2');
  assert.deepEqual(moved.parents, ['new1']);
  assert.deepEqual(moved.changed, ['parents']);

  // Already in the folder asked for: nothing to remove, and Drive must not be told to remove it.
  reset((call) => (call.method === 'GET' ? { id: 'f1', parents: ['new1'] } : file({ parents: ['new1'] })));
  await run('drive_update_file', { file_id: 'f1', parent_id: 'new1' });
  assert.equal(calls[1].query.removeParents, undefined);

  // One folder at a time, and an empty description clears it.
  reset(() => file({ description: '' }));
  await run('drive_update_file', { file_id: 'f1', add_parent_id: 'p2', remove_parent_id: 'p1', description: '' });
  assert.equal(calls[0].query.addParents, 'p2');
  assert.equal(calls[0].query.removeParents, 'p1');
  assert.deepEqual(calls[0].body, { description: '' });
});

test('update_file refuses nothing-to-do and a move mixed with one-folder changes, before any request', async () => {
  for (const [args, message] of [
    [{ file_id: 'f1' }, /Nothing to change/],
    [{ file_id: 'f1', parent_id: 'p1', add_parent_id: 'p2' }, /parent_id moves the file on its own/],
    [{ file_id: 'f1', parent_id: 'p1', remove_parent_id: 'p1' }, /parent_id moves the file on its own/],
  ]) {
    reset();
    await assert.rejects(run('drive_update_file', args), message);
    assert.equal(calls.length, 0, `${JSON.stringify(args)}: no request`);
  }
  // No mime_type argument at all: changing it converts a Google file.
  assert.equal(schema('drive_update_file').shape.mime_type, undefined);
});

// ---------------------------------------------------------------------------
// drive_untrash_file and the trash approval

test('untrash restores a file (trashed: false), and the approval names it from a read made in prepare', async () => {
  assert.equal(tools.get('drive_untrash_file').kind, 'write');
  assert.deepEqual(tools.get('drive_untrash_file').scopes, ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata']);
  reset((call) => (call.method === 'GET' ? { id: 'f1', name: 'Report.pdf', mimeType: 'application/pdf', trashed: true } : file({ name: 'Report.pdf', trashed: false })));
  const prepared = await tools.get('drive_untrash_file').prepare({ file_id: 'f1' }, ctx);
  assert.deepEqual(prepared.preview, {
    file_id: 'f1',
    name: 'Report.pdf',
    mime_type: 'application/pdf',
    in_trash: true,
    effect: 'Restores the file from Drive trash to its folder, with its sharing as it was.',
  });
  assert.equal(calls.length, 1, 'prepare reads only');
  assert.equal(calls[0].method, 'GET');
  calls = [];
  const out = await run('drive_untrash_file', { file_id: 'f1' });
  assert.deepEqual(calls.map((c) => c.method), ['PATCH']);
  assert.deepEqual(calls[0].body, { trashed: false });
  assert.equal(out.trashed, false);
});

test('trash works its approval out in prepare too (a preview alone is never shown); its request is unchanged', async () => {
  const tool = tools.get('drive_trash_file');
  assert.equal(tool.kind, 'destructive');
  reset(() => ({ id: 'f1', name: 'Report.pdf', mimeType: 'application/pdf', trashed: false }));
  const prepared = await tool.prepare({ file_id: 'f1' }, ctx);
  assert.deepEqual(prepared.preview, {
    file_id: 'f1',
    name: 'Report.pdf',
    mime_type: 'application/pdf',
    already_trashed: false,
    effect: 'Moves the file to Drive trash. Restorable from trash.',
  });
  assert.deepEqual(await tool.preview({ file_id: 'f1' }), prepared.preview, 'the preview says the same thing');
  calls = [];
  await run('drive_trash_file', { file_id: 'f1' });
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['PATCH', '/drive/v3/files/f1']]);
  assert.deepEqual(calls[0].body, { trashed: true });
});

// ---------------------------------------------------------------------------
// drive_read_text: text application types

test('read_text reads JSON, XML, SVG and YAML as text; the requests are the 1.8.0 ones', async () => {
  for (const [mime, text] of [
    ['application/json', '{"a":1}'],
    ['application/xml', '<root><a/></root>'],
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['application/yaml', 'a: 1'],
    ['application/x-ndjson', '{"a":1}\n{"a":2}'],
  ]) {
    reset((call) => (call.query.alt === 'media' ? text : { id: 'f1', name: 'x', mimeType: mime }));
    const out = await run('drive_read_text', { file_id: 'f1' });
    assert.equal(out.text, text, mime);
    assert.equal(out.mime_type, mime);
    assert.deepEqual(calls.map((c) => [c.method, c.query.alt ?? null]), [['GET', null], ['GET', 'media']], mime);
    assert.equal(out.text_source, undefined, `${mime}: not a converted copy`);
  }
});

test('read_text refuses a PDF and an image with a message that names drive_download, and reads nothing', async () => {
  for (const [mime, message] of [
    ['application/pdf', /is a PDF, and reading its text needs a PDF extractor this server does not have\. Use drive_download for the bytes/],
    ['image/png', /is an image \(mimeType image\/png\)[\s\S]*Use drive_download for the bytes/],
    ['application/vnd.oasis.opendocument.graphics', /Cannot read "scan" as text[\s\S]*Use drive_download for the bytes/],
  ]) {
    reset(() => ({ id: 'f1', name: 'scan', mimeType: mime }));
    await assert.rejects(run('drive_read_text', { file_id: 'f1' }), message);
    assert.equal(calls.length, 1, `${mime}: only the metadata read`);
    assert.equal(calls[0].query.alt, undefined);
  }
});

// ---------------------------------------------------------------------------
// drive_read_text: a spreadsheet's sheets

test('read_text of a spreadsheet names the sheet it read and says when there are more', async () => {
  reset((call) => {
    if (call.path === '/drive/v3/files/s1') return { id: 's1', name: 'Budget', mimeType: SPREADSHEET };
    if (call.url === 'https://sheets.googleapis.com/v4/spreadsheets/s1') return tabs('Budget', 'Notes');
    if (call.path.endsWith('/export')) return 'a,b\n1,2';
    return {};
  });
  const out = await run('drive_read_text', { file_id: 's1' });
  assert.deepEqual(calls.map((c) => [c.method, c.url]), [
    ['GET', 'https://www.googleapis.com/drive/v3/files/s1'],
    ['GET', 'https://www.googleapis.com/drive/v3/files/s1/export'],
    ['GET', 'https://sheets.googleapis.com/v4/spreadsheets/s1'],
  ]);
  assert.equal(calls[2].query.fields, 'sheets.properties(title,sheetType)');
  assert.equal(out.text, 'a,b\n1,2');
  assert.equal(out.sheet, 'Budget');
  assert.deepEqual(out.sheets, ['Budget', 'Notes']);
  assert.match(out.sheet_note, /CSV export reads the first sheet only \(Budget\)\. This spreadsheet has 2 sheets: Budget, Notes\. Read another with "sheet"/);

  // One sheet: named, and no note.
  reset((call) => {
    if (call.path === '/drive/v3/files/s1') return { id: 's1', name: 'Budget', mimeType: SPREADSHEET };
    if (call.url === 'https://sheets.googleapis.com/v4/spreadsheets/s1') return tabs('Budget');
    return 'a,b';
  });
  const single = await run('drive_read_text', { file_id: 's1' });
  assert.equal(single.sheet, 'Budget');
  assert.deepEqual(single.sheets, ['Budget']);
  assert.equal(single.sheet_note, undefined);
});

test('read_text with "sheet" reads that sheet’s values as CSV, in parts like any other text', async () => {
  reset((call) => {
    if (call.path === '/drive/v3/files/s1') return { id: 's1', name: 'Budget', mimeType: SPREADSHEET };
    if (call.url === 'https://sheets.googleapis.com/v4/spreadsheets/s1') return tabs('Budget', 'Notes');
    if (call.path === "/v4/spreadsheets/s1/values/Notes") return { values: [['item', 'cost'], ['rent, flat', 950.5]] };
    return {};
  });
  const out = await run('drive_read_text', { file_id: 's1', sheet: 'Notes', max_chars: 7 });
  const values = calls.find((c) => c.path.endsWith('/values/Notes'));
  assert.equal(values.query.valueRenderOption, 'FORMATTED_VALUE');
  assert.equal(calls.some((c) => c.path.endsWith('/export')), false, 'no export when a sheet is named');
  assert.equal(out.sheet, 'Notes');
  assert.deepEqual(out.sheets, ['Budget', 'Notes']);
  assert.equal(out.text_source, 'values of the sheet "Notes"');
  assert.equal(out.text, 'item,co', 'the CSV text, cut at max_chars');
  assert.equal(out.text_total_chars, 'item,cost\n"rent, flat",950.5'.length);
  assert.equal(out.next_offset, 7);
  assert.equal(out.truncated, true);

  // A sheet the spreadsheet does not have is refused, and lists the ones it has.
  reset((call) => (call.path === '/drive/v3/files/s1' ? { id: 's1', name: 'Budget', mimeType: SPREADSHEET } : tabs('Budget', 'Notes')));
  await assert.rejects(run('drive_read_text', { file_id: 's1', sheet: 'Nope' }), /"Nope" is not a sheet of "Budget"\. Its sheets: Budget, Notes\./);
});

test('read_text still reads the CSV export when the sheet list cannot be read', async () => {
  // The Sheets API is not called, or refuses: the export alone, with no sheet fields, as in 1.8.0.
  reset((call) => {
    if (call.path === '/drive/v3/files/s1') return { id: 's1', name: 'Budget', mimeType: SPREADSHEET };
    if (call.url === 'https://sheets.googleapis.com/v4/spreadsheets/s1') throw new Error('Sheets API has not been used in project');
    return 'a,b';
  });
  const out = await run('drive_read_text', { file_id: 's1' });
  assert.equal(out.text, 'a,b');
  assert.equal(out.sheet, undefined);
  assert.equal(out.sheet_note, undefined);
});
