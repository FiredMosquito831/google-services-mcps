// Destructive tools and Claude Code's permission prompt (1.38.0): a destructive tool carries
// _meta["anthropic/requiresUserInteraction"] = true in tools/list when this server's gate would ask before it (the
// confirmation setting and the policy file say ask), so Claude Code shows its permission prompt on every call, in every
// mode that prompts, and no allow rule or hook skips it (code.claude.com/docs/en/mcp, "Require approval for a specific
// tool"). Nothing else carries a _meta. Run after compiling (npm test does). The last tests start bundled servers with a
// fake sign-in (fake values, never sent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const { requiresUserInteraction, REQUIRES_USER_INTERACTION } = await import(dist('core/tools.js'));

const temps = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const KEY = 'anthropic/requiresUserInteraction';
const policy = (extra = {}) => ({ confirmation: 'every-change', rules: [], ...extra });
const envMode = (mode) => ({ confirmation: mode, confirmationFromEnv: true });
const noEnv = { confirmation: 'every-change', confirmationFromEnv: false };

test('the marker key is the one Claude Code documents', () => {
  assert.equal(REQUIRES_USER_INTERACTION, KEY);
});

test('requiresUserInteraction: a destructive tool the gate asks about; never a read, write or dynamic tool', () => {
  const tool = (kind) => ({ name: 'demo_delete', kind, methodId: 'demo.items.delete' });
  assert.equal(requiresUserInteraction(tool('destructive'), policy(), noEnv), true);
  for (const kind of ['read', 'write', 'dynamic']) assert.equal(requiresUserInteraction(tool(kind), policy(), noEnv), false, kind);
  // The confirmation setting: every-change and destructive-only ask before a destructive action; off never asks.
  assert.equal(requiresUserInteraction(tool('destructive'), policy(), envMode('destructive-only')), true);
  assert.equal(requiresUserInteraction(tool('destructive'), policy(), envMode('off')), false);
  // Without the environment setting, the policy file's confirmation applies, as in the gate.
  assert.equal(requiresUserInteraction(tool('destructive'), policy({ confirmation: 'off' }), noEnv), false);
  assert.equal(requiresUserInteraction(tool('destructive'), policy({ confirmation: 'off' }), envMode('every-change')), true);
  // Policy rules: allow and deny need no prompt from Claude Code (allowed by the person; refused by the server); ask does.
  assert.equal(requiresUserInteraction(tool('destructive'), policy({ rules: [{ match: 'demo_delete', action: 'allow' }] }), noEnv), false);
  assert.equal(requiresUserInteraction(tool('destructive'), policy({ rules: [{ match: 'demo.items.*', action: 'deny' }] }), noEnv), false);
  assert.equal(requiresUserInteraction(tool('destructive'), policy({ confirmation: 'off', rules: [{ match: 'demo_*', action: 'ask' }] }), noEnv), true);
  // A policy file that cannot be read makes the gate ask, so the marker is set.
  assert.equal(requiresUserInteraction(tool('destructive'), undefined, noEnv), true);
});

// ---- bundled servers ----

const keyDir = tempDir('gsm-rui-key-');
const keyFile = join(keyDir, 'key.json');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
writeFileSync(keyFile, JSON.stringify({ type: 'service_account', client_email: 'sa@test-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' }));

function fakeSignIn(plugin, extra = {}, policyFile) {
  const map = readJson('plugins', plugin, 'tool-map.json');
  const group = readJson('plugins', plugin, 'servers.json').servers[0].group;
  const scopes = [...new Set(map.flatMap((t) => t.scopes ?? []))].sort();
  const dir = tempDir(`gsm-rui-${plugin}-`);
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens, { recursive: true });
  const env = {};
  if (group === 'apikey') env.GSM_API_KEY = 'fake-key-never-sent';
  else if (group === 'service-account') writeFileSync(join(tokens, 'service-account.json'), JSON.stringify({ keyFile, clientEmail: 'sa@test-project.iam.gserviceaccount.com', savedAt: '2026-10-30T00:00:00Z' }));
  else if (group === 'workspace-admin') writeFileSync(join(tokens, 'workspace-admin.scopes.json'), JSON.stringify({ subject: 'admin@example.com', scopes, profile: 'custom', keyFile }));
  else writeFileSync(join(tokens, `${group}.token.json`), JSON.stringify({ access_token: 'fake', refresh_token: 'fake', scope: scopes.join(' ') }));
  if (policyFile) writeFileSync(join(tokens, 'policy.json'), JSON.stringify(policyFile));
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'));
  return { ...base, ...env, GSM_TOKEN_DIR: tokens, GSM_ALLOW_WRITES: 'true', GSM_HOOK_ACTIVE: '1', HOME: dir, USERPROFILE: dir, APPDATA: join(dir, 'appdata'), CLOUDSDK_CONFIG: join(dir, 'gcloud'), ...extra };
}

async function listed(plugin, env) {
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'plugins', plugin, 'servers', `${plugin}.mjs`)], env, stderr: 'pipe' });
  const client = new Client({ name: 'gsm-rui-test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const tools = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  } finally {
    await client.close();
  }
}

test('every bundled server: exactly its destructive tools carry the marker, as JSON true, and no tool has another _meta key', { timeout: 600_000 }, async () => {
  let marked = 0;
  for (const plugin of readdirSync(join(ROOT, 'plugins')).sort()) {
    const map = readJson('plugins', plugin, 'tool-map.json');
    const kindOf = new Map(map.map((t) => [t.name.slice(t.name.lastIndexOf('__') + 2), t.kind]));
    for (const tool of await listed(plugin, fakeSignIn(plugin))) {
      // The runtime tools are writes in the tool map (dumpTools), so none of them is marked.
      const destructive = kindOf.get(tool.name) === 'destructive';
      if (destructive) {
        assert.deepEqual(tool._meta, { [KEY]: true }, `${plugin}/${tool.name}`);
        marked += 1;
      } else {
        assert.equal(tool._meta, undefined, `${plugin}/${tool.name} has no _meta`);
      }
    }
  }
  assert.ok(marked > 300, `${marked} destructive tools marked`);
});

test('confirmation off, and a policy rule that allows a tool, leave the marker off', { timeout: 120_000 }, async () => {
  const off = await listed('gmail', fakeSignIn('gmail', { GSM_CONFIRMATION: 'off' }));
  assert.equal(off.filter((t) => t._meta !== undefined).length, 0, 'confirmation off: no marker');
  const only = await listed('gmail', fakeSignIn('gmail', { GSM_CONFIRMATION: 'destructive-only' }));
  assert.deepEqual(only.find((t) => t.name === 'gmail_send')._meta, { [KEY]: true }, 'destructive-only still asks before a send');
  const allowed = await listed('gmail', fakeSignIn('gmail', {}, { rules: [{ match: 'gmail_trash', action: 'allow' }] }));
  assert.equal(allowed.find((t) => t.name === 'gmail_trash')._meta, undefined, 'the person allowed gmail_trash in policy.json');
  assert.deepEqual(allowed.find((t) => t.name === 'gmail_send')._meta, { [KEY]: true });
  // Writes off: no destructive tool is listed, so nothing carries the marker.
  const readOnly = await listed('gmail', fakeSignIn('gmail', { GSM_ALLOW_WRITES: 'false' }));
  assert.equal(readOnly.filter((t) => t._meta !== undefined).length, 0);
});
