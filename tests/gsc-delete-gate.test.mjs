// sc_site_delete and sc_sitemap_delete through the real approval gate (1.41.1): a runServer child with the curated Search
// Console tools, driven by the MCP client, which answers the approval form. Their preview (the property, the sitemap, the
// account and what the removal does) is worked out in prepare, so the form shows it; before, the form showed the raw
// arguments and the preview text was never shown. The child's HTTP layer is stubbed and records every request to a file,
// so nothing reaches Google. A declined approval sends nothing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-gsc-gate-'));
  temps.push(dir);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens);
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(join(tokens, 'searchconsole.token.json'), JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { appendFileSync } from 'node:fs';`,
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(REPO, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  appendFileSync(process.env.CALLS_FILE, JSON.stringify({ method: String(opts.method ?? 'GET').toUpperCase(), path: url.pathname }) + '\\n');`,
      `  return { data: {}, status: 204, headers: new Headers(), config: opts };`,
      `};`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { buildTools } = await import(${JSON.stringify(dist('servers/searchconsole.js'))});`,
      `await runServer({ name: 'gsc', version: '0.0.0', buildTools });`,
      '',
    ].join('\n'),
  );
  return { dir, tokens, entry, callsFile: join(dir, 'calls.jsonl') };
}

const callsIn = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

async function connect(s, extraEnv, answer) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const { ElicitRequestSchema } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href);
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  const env = { ...base, GSM_TOKEN_DIR: s.tokens, GSM_ALLOW_WRITES: 'true', CALLS_FILE: s.callsFile, APPDATA: join(s.dir, 'appdata'), ...extraEnv };
  const transport = new StdioClientTransport({ command: process.execPath, args: [s.entry], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsc-gate', version: '0.0.0' }, { capabilities: { elicitation: { form: {} } } });
  const asked = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push({ message: request.params.message, callsBefore: callsIn(s.callsFile).length });
    return answer;
  });
  await client.connect(transport);
  return { client, asked };
}

test('sc_site_delete and sc_sitemap_delete: the form shows the property, the sitemap and the effect; declined, nothing is sent', async () => {
  const s = setup();
  const { client, asked } = await connect(s, { GSM_HOOK_ACTIVE: '1' }, { action: 'decline' });
  try {
    const site = await client.callTool({ name: 'sc_site_delete', arguments: { site_url: 'https://example.com/' } });
    assert.equal(site.isError, true);
    assert.match(site.content[0].text, /You declined this action\. Nothing was changed\./);
    const sitemap = await client.callTool({ name: 'sc_sitemap_delete', arguments: { site_url: 'sc-domain:example.com', feedpath: 'https://example.com/sitemap.xml' } });
    assert.equal(sitemap.isError, true);
    assert.equal(asked.length, 2, 'a delete asks even when the hook is active (destructive)');
    assert.match(asked[0].message, /^About to permanently change or delete Google data: sc_site_delete/);
    assert.match(asked[0].message, /"property": "https:\/\/example\.com\/"/);
    assert.match(asked[0].message, /"effect": "Property is removed from this account\. Its performance, indexing and sitemap history are no longer accessible/);
    assert.match(asked[0].message, /"from_account": "the default account of this server/);
    assert.match(asked[1].message, /"feedpath": "https:\/\/example\.com\/sitemap\.xml"/);
    assert.match(asked[1].message, /"effect": "Sitemap is removed from Search Console, not from the site\./);
    assert.equal(callsIn(s.callsFile).length, 0, 'declined: no request at all');
    // A property string that is not one is refused before the form.
    const bad = await client.callTool({ name: 'sc_site_delete', arguments: { site_url: 'example.com' } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /is not a Search Console property/);
    assert.equal(asked.length, 2);
  } finally {
    await client.close();
  }
});

test('sc_sitemap_delete approved: one DELETE, after the approval', async () => {
  const s = setup();
  const { client, asked } = await connect(s, {}, { action: 'accept', content: { approve: true } });
  try {
    const res = await client.callTool({ name: 'sc_sitemap_delete', arguments: { site_url: 'sc-domain:example.com', feedpath: 'https://example.com/sitemap.xml' } });
    assert.notEqual(res.isError, true, res.content[0].text);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].callsBefore, 0, 'the approval came before the request');
    assert.deepEqual(callsIn(s.callsFile).map((c) => c.method), ['DELETE']);
  } finally {
    await client.close();
  }
});
