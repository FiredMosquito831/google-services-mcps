// Behavior tests for Q038: appsscript_get_content file filtering, index mode, and offset/max_chars paging.
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
const { buildTools } = await import(DIST('servers/gapps.js'));

const root = mkdtempSync(join(tmpdir(), 'gsm-gapps-content-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tokenDir = join(root, 'tokens');
mkdirSync(tokenDir);
writeFileSync(join(tokenDir, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'c', client_secret: 's' } }));
writeFileSync(
  join(tokenDir, 'workspace-user.token.json'),
  JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }),
);

let respond = () => ({});
let calls = [];
OAuth2Client.prototype.request = async function fakeRequest(opts) {
  const url = new URL(opts.url);
  calls.push({ method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname, versionNumber: url.searchParams.get('versionNumber') });
  return { data: await respond(), status: 200, headers: new Headers(), config: opts };
};

const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir, GSM_MAX_RESULT_CHARS: '4000' });
const tool = (await buildTools(cfg)).find((t) => t.name === 'appsscript_get_content');
const ctx = { gate: async () => undefined, grantedScopes: null, hasScope: () => true };

test('appsscript_get_content: include_source=false returns manifest index without source bodies', async () => {
  calls = [];
  respond = () => ({
    scriptId: 'S1',
    files: [
      { name: 'appsscript', type: 'JSON', source: '{"timeZone":"UTC"}', updateTime: '2026-11-18T10:00:00Z' },
      { name: 'Code', type: 'SERVER_JS', source: 'x'.repeat(12000), functionSet: { values: [{ name: 'runJob' }] } },
    ],
  });
  const out = await tool.handler({ script_id: 'S1', version_number: 4, include_source: false }, ctx);
  assert.equal(out.file_count, 2);
  assert.equal(out.version_number, 4);
  assert.equal(calls[0].versionNumber, '4');
  assert.deepEqual(out.files, [
    { name: 'appsscript', type: 'JSON', source_chars: 18, update_time: '2026-11-18T10:00:00Z' },
    { name: 'Code', type: 'SERVER_JS', source_chars: 12000, functions: ['runJob'] },
  ]);
});

test('appsscript_get_content: file_name and offset/max_chars page a huge file cleanly with next_offset', async () => {
  respond = () => ({
    scriptId: 'S1',
    files: [
      { name: 'appsscript', type: 'JSON', source: '{}' },
      { name: 'BigCode', type: 'SERVER_JS', source: `${'A'.repeat(1000)}${'B'.repeat(800)}` },
    ],
  });
  const p1 = await tool.handler({ script_id: 'S1', file_name: 'BigCode', offset: 0, max_chars: 1000 }, ctx);
  assert.equal(p1.file.source, 'A'.repeat(1000));
  assert.equal(p1.file.next_offset, 1000);
  assert.equal(p1.file.truncated, true);
  assert.deepEqual(p1.file_names, ['appsscript', 'BigCode']);

  const p2 = await tool.handler({ script_id: 'S1', file_name: 'BigCode', offset: p1.file.next_offset, max_chars: 1000 }, ctx);
  assert.equal(p2.file.source, 'B'.repeat(800));
  assert.equal(p2.file.next_offset, undefined);
  assert.equal(p2.file.truncated, undefined);

  await assert.rejects(() => tool.handler({ script_id: 'S1', file_name: 'Missing' }, ctx), /Available files: appsscript, BigCode/);
  await assert.rejects(() => tool.handler({ script_id: 'S1', file_name: 'BigCode', offset: 5000 }, ctx), /past the end/);
  await assert.rejects(() => tool.handler({ script_id: 'S1', offset: 0 }, ctx), /offset requires file_name/);
});

test('appsscript_get_content: multi-file overflow keeps file_index and tells caller how to fetch remaining files', async () => {
  respond = () => ({
    scriptId: 'S1',
    files: [
      { name: 'appsscript', type: 'JSON', source: '{"timeZone":"UTC"}' },
      { name: 'Small', type: 'SERVER_JS', source: 'const x = 1;' },
      { name: 'Huge', type: 'SERVER_JS', source: 'Z'.repeat(6000) },
    ],
  });
  const out = await tool.handler({ script_id: 'S1' }, ctx);
  assert.equal(out.file_count, 3);
  assert.deepEqual(out.file_index.map((f) => f.name), ['appsscript', 'Small', 'Huge']);
  assert.equal(out.files.length, 2);
  assert.equal(out.truncated.omitted, 1);
  assert.match(out.truncated.how_to_continue, /file_name/);
});
