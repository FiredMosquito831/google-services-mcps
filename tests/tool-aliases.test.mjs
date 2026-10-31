// Readable tool names (2.0.0) and the old names as aliases.
//
//  - the generator's naming rules: budget, pattern, uniqueness per server, the reduction order;
//  - every built plugin's tool map and tool-aliases.json: each tool once, each old name pointing at a tool;
//  - every old name of every plugin decides exactly as its new name does, under a policy that names either of them;
//  - the bundled server: a call under the old name runs the same tool, and tools/list shows the new name only;
//  - the bundled hook: a policy rule that names an old name applies, and the decision matches the new name's.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(fileURLToPath(new URL('..', import.meta.url)));
const dist = (rel) => pathToFileURL(join(REPO, 'dist', rel)).href;

const { assignReadableToolNames, readableNameFor, readableNameCandidates } = await import(dist('core/discovery/tool-names.js'));
const { nameBudget } = await import(dist('core/discovery/methods.js'));
const { toolAliasesFrom, toolAliasesDocument, readToolAliases, NO_TOOL_ALIASES } = await import(dist('core/tool-aliases.js'));
const { decide, setToolAliasLookup } = await import(dist('core/policy.js'));

const SERVER_MAP = JSON.parse(readFileSync(join(REPO, 'config', 'servers.json'), 'utf8'));
const PLUGINS = join(REPO, 'plugins');

/** Every product's built tool map and alias table. */
function built() {
  const out = [];
  for (const id of readdirSync(PLUGINS)) {
    const mapFile = join(PLUGINS, id, 'tool-map.json');
    if (!existsSync(mapFile)) continue;
    const server = SERVER_MAP.servers.find((s) => s.plugin === id);
    if (!server) continue;
    const aliasesFile = join(PLUGINS, id, 'tool-aliases.json');
    out.push({
      id,
      server: server.name,
      budget: nameBudget(id, server.name),
      prefix: `mcp__plugin_${id}_${server.name}__`,
      tools: JSON.parse(readFileSync(mapFile, 'utf8')),
      aliases: existsSync(aliasesFile) ? JSON.parse(readFileSync(aliasesFile, 'utf8')).aliases : {},
    });
  }
  return out;
}
const BUILT = built();
const TEMPS = [];
after(() => {
  for (const dir of TEMPS) rmSync(dir, { recursive: true, force: true });
  setToolAliasLookup(undefined);
});

// --------------------------------------------------------------------------- naming rules

test('naming: every generated tool name fits its server, matches [a-z0-9_]+ and is unique per server', () => {
  assert.ok(BUILT.length >= 20, 'the plugins are built');
  for (const p of BUILT) {
    const names = p.tools.map((t) => t.name.slice(p.prefix.length));
    assert.equal(new Set(names).size, names.length, `${p.id}: a tool name is listed twice`);
    for (const name of names) {
      assert.match(name, /^[a-z0-9_]+$/, `${p.id}: ${name}`);
      assert.ok(name.length <= p.budget, `${p.id}: ${name} is ${name.length} characters, the budget is ${p.budget}`);
      assert.ok(name.length > 0, `${p.id}: an empty name`);
    }
  }
});

test('naming: container words and a repeated API name go first, then common words are shortened', () => {
  const budget = 37;
  const method = (apiName, resource, methodName) => ({ apiName, apiVersion: 'v1', resource, methodName, fullId: [apiName, ...resource, methodName].join('.') });
  const name = (m) => readableNameFor(m, budget);
  // apikeys.projects.locations.keys.undelete: the containers go, nothing else is needed.
  assert.equal(name(method('apikeys', ['projects', 'locations', 'keys'], 'undelete')), 'apikeys_keys_undelete');
  // cloudbilling.billingAccounts.subAccounts.create: "accounts" is shortened, then the resource that repeats the API
  // prefix goes, because it still does not fit.
  assert.equal(name(method('cloudbilling', ['billingAccounts', 'subAccounts'], 'create')), 'billing_sub_accts_create');
  // cloudbilling.billingAccounts.subAccounts.list fits once the words are shortened.
  assert.equal(name(method('cloudbilling', ['billingAccounts', 'subAccounts'], 'list')), 'billing_billing_accts_sub_accts_list');
  // monitoring: a resource is reduced to its head word (managedFolders -> folders), and the prefix stays whole.
  assert.equal(name(method('storage', ['managedFolders'], 'getIamPolicy')), 'storage_folders_get_iam_policy');
  assert.equal(name(method('monitoring', ['projects', 'alertPolicies'], 'delete')), 'monitor_alert_policies_delete');
  // A head word that says nothing on its own is not used: smimeInfo keeps "smime", sendAs keeps "send_as".
  assert.equal(name(method('gmail', ['users', 'settings', 'sendAs', 'smimeInfo'], 'list')), 'gmail_send_as_smime_info_list');
  // The last resource is kept when the chain has to give way.
  assert.equal(name(method('cloudresourcemanager', ['organizations', 'capabilityConfigs'], 'get')), 'crm_orgs_capability_configs_get');
});

test('naming: a name that fits as it is keeps its spelling, and the budget is never exceeded', () => {
  // The first candidate is the name the old rule produced, so a name that fits is not renamed.
  const plain = { apiName: 'storage', apiVersion: 'v1', resource: ['buckets'], methodName: 'list', fullId: 'storage.buckets.list' };
  assert.equal(readableNameFor(plain, 37), 'storage_buckets_list');
  assert.equal(readableNameCandidates(plain)[0], 'storage_buckets_list');
  for (const budget of [16, 20, 24, 29, 31, 35, 37, 39, 43]) {
    const methods = Array.from({ length: 40 }, (_, i) => ({
      apiName: 'discoveryengine',
      apiVersion: 'v1',
      resource: ['projects', 'locations', 'collections', `dataStore${i}`],
      methodName: 'listServingConfigs',
      fullId: `discoveryengine.projects.locations.collections.dataStore${i}.listServingConfigs`,
    }));
    const names = assignReadableToolNames(methods, ['api_methods'], budget);
    assert.equal(new Set(names).size, names.length, `unique at ${budget}`);
    for (const n of names) {
      assert.ok(n.length <= budget, `${n} is longer than ${budget}`);
      assert.match(n, /^[a-z0-9_]+$/);
      assert.notEqual(n, 'api_methods', 'the reserved name is never reused');
    }
  }
});

// --------------------------------------------------------------------------- the alias data

test('aliases: every plugin names an old name that points at one of its tools, never at a name it still uses', () => {
  let total = 0;
  for (const p of BUILT) {
    const names = new Set(p.tools.map((t) => t.name.slice(p.prefix.length)));
    for (const [from, to] of Object.entries(p.aliases)) {
      total += 1;
      assert.ok(names.has(to), `${p.id}: ${from} points at ${to}, which is no tool of this server`);
      assert.ok(!names.has(from), `${p.id}: ${from} is still a tool name, so it cannot be an alias`);
      assert.ok(to.length <= p.budget && from.length <= p.budget, `${p.id}: ${from} -> ${to} is too long`);
      assert.match(from, /^[a-z0-9_]+$/);
    }
  }
  assert.ok(total > 1000, `the rename reached most hashed and clipped names (${total} aliases)`);
});

test('aliases: the file a plugin ships is the table the module builds, and a missing file means no aliases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-aliases-'));
  TEMPS.push(dir);
  assert.deepEqual(readToolAliases(dir).namesFor('x'), ['x'], 'no file: every name stands for itself');
  const renames = { old_one: 'new_one', old_two: 'new_two' };
  writeFileSync(join(dir, 'tool-aliases.json'), JSON.stringify(toolAliasesDocument(renames)));
  const table = readToolAliases(dir);
  assert.equal(table.canonical('old_one'), 'new_one');
  assert.deepEqual(table.namesFor('new_one').sort(), ['new_one', 'old_one']);
  assert.deepEqual(table.namesFor('other'), ['other']);
  assert.equal(NO_TOOL_ALIASES.empty, true);
});

// --------------------------------------------------------------------------- policy, every alias

/** A policy with one rule (or none) at the given risk. */
const rulePolicy = (match, action) => ({ confirmation: 'every-change', rules: match === null ? [] : [{ match, action }] });

test('policy: every old name decides exactly as its new name does, and a rule naming either one applies', () => {
  let checked = 0;
  for (const p of BUILT) {
    if (Object.keys(p.aliases).length === 0) continue;
    const table = toolAliasesFrom(p.aliases);
    // The table holds the server's short names; a hook event and decide() carry the full name.
    const shortOf = (name) => (name.startsWith(p.prefix) ? name.slice(p.prefix.length) : name);
    setToolAliasLookup((name) => table.namesFor(shortOf(name)).map((n) => `${p.prefix}${n}`));
    try {
      for (const [from, to] of Object.entries(p.aliases)) {
        const oldName = `${p.prefix}${from}`;
        const newName = `${p.prefix}${to}`;
        for (const risk of ['read', 'modify', 'destructive']) {
          const cases = [
            rulePolicy(null, 'ask'),
            rulePolicy(newName, 'deny'),
            rulePolicy(oldName, 'deny'),
            rulePolicy(newName, 'ask'),
            rulePolicy(oldName, 'ask'),
            rulePolicy(newName, 'allow'),
            rulePolicy(oldName, 'allow'),
            rulePolicy(`${p.prefix}*`, 'ask'),
          ];
          for (const policy of cases) {
            const underOld = decide({ toolName: oldName, risk, policy });
            const underNew = decide({ toolName: newName, risk, policy });
            assert.deepEqual(underOld.decision, underNew.decision, `${p.id}: ${from} vs ${to} with ${JSON.stringify(policy.rules)}`);
            // A rule that names either name must really match: the read default is an allow with no rule at all.
            if (policy.rules[0]?.action === 'deny') assert.equal(underOld.decision, 'deny', `${p.id}: ${policy.rules[0].match} names a denied tool`);
            checked += 1;
          }
          // A deny that names the old tool wins even where an allow names the new one, and the other way round.
          const mixed = { confirmation: 'every-change', rules: [{ match: oldName, action: 'deny' }, { match: newName, action: 'allow' }] };
          assert.equal(decide({ toolName: newName, risk, policy: mixed }).decision, 'deny', `${p.id}: a deny on the old name wins`);
          const mixedReverse = { confirmation: 'every-change', rules: [{ match: newName, action: 'deny' }, { match: oldName, action: 'allow' }] };
          assert.equal(decide({ toolName: oldName, risk, policy: mixedReverse }).decision, 'deny', `${p.id}: a deny on the new name wins`);
          checked += 2;
        }
      }
    } finally {
      setToolAliasLookup(undefined);
    }
  }
  assert.ok(checked > 5000, `every alias decided both ways (${checked} decisions)`);
});

test('policy: without a registered alias table a name stands for itself, as before 2.0.0', () => {
  setToolAliasLookup(undefined);
  const policy = rulePolicy('mcp__plugin_gmail_gmail__gmail_users_settings_get_auto_forwardin', 'allow');
  const result = decide({ toolName: 'mcp__plugin_gmail_gmail__gmail_settings_get_auto_forwarding', risk: 'read', policy });
  assert.equal(result.decision, 'allow', 'a read is allowed either way, and the alias rule does not match');
  assert.doesNotMatch(result.reason, /policy rule/);
});

// --------------------------------------------------------------------------- the bundled server

/** An entry that stubs Google's HTTP layer and runs the bundled gmail server. */
function gmailChild(dir) {
  const entry = join(dir, 'entry.mjs');
  writeFileSync(
    entry,
    [
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(REPO, 'package.json'))});`,
      `const { OAuth2Client } = require('google-auth-library');`,
      `const { runServer } = await import(${JSON.stringify(dist('core/tools.js'))});`,
      `const { loadRegistry, serverByName } = await import(${JSON.stringify(dist('core/registry.js'))});`,
      `const { buildServerTools } = await import(${JSON.stringify(dist('servers/index.js'))});`,
      `const reg = loadRegistry(${JSON.stringify(dist('core/registry.js'))});`,
      `OAuth2Client.prototype.request = async function (opts) {`,
      `  const url = new URL(opts.url);`,
      `  if (url.pathname.endsWith('/settings/autoForwarding')) {`,
      `    return { data: { enabled: true, emailAddress: 'fwd@example.com', disposition: 'leaveInInbox' }, status: 200, headers: new Headers(), config: opts };`,
      `  }`,
      `  return { data: { emailAddress: 'me@example.com' }, status: 200, headers: new Headers(), config: opts };`,
      `};`,
      `await runServer({ name: 'gmail', version: '0.0.0', buildTools: (cfg) => buildServerTools(serverByName(reg, 'gmail'), cfg) });`,
      '',
    ].join('\n'),
  );
  const tokens = join(dir, 'tokens');
  mkdirSync(tokens, { recursive: true });
  writeFileSync(join(tokens, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'test-client', client_secret: 'test-secret' } }));
  writeFileSync(
    join(tokens, 'workspace-user.token.json'),
    JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expiry_date: Date.now() + 3600_000, token_type: 'Bearer' }),
  );
  return { entry, tokens };
}

function childEnv(dir, tokens) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_') && k !== 'GOOGLE_APPLICATION_CREDENTIALS'),
  );
  return { ...base, GSM_TOKEN_DIR: tokens, GSM_ALLOW_WRITES: 'true', APPDATA: join(dir, 'appdata') };
}

test('server: tools/list shows each tool once under its new name, and a call under the old name runs the same tool', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-alias-call-'));
  TEMPS.push(dir);
  const { entry, tokens } = gmailChild(dir);
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: childEnv(dir, tokens), stderr: 'pipe' });
  const client = new Client({ name: 'alias-call', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
    const aliases = JSON.parse(readFileSync(join(PLUGINS, 'gmail', 'tool-aliases.json'), 'utf8')).aliases;
    const old = 'gmail_users_settings_get_auto_forwardin';
    const now = aliases[old];
    assert.equal(now, 'gmail_settings_get_auto_forwarding');

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, 'no tool is listed twice');
    assert.ok(names.includes(now), 'the tool is listed under its new name');
    assert.ok(!names.includes(old), 'an old name is never listed');
    for (const from of Object.keys(aliases)) assert.ok(!names.includes(from), `old name ${from} is not listed`);

    const byNew = await client.callTool({ name: now, arguments: { userId: 'me' } });
    const byOld = await client.callTool({ name: old, arguments: { userId: 'me' } });
    assert.equal(byOld.isError, undefined, `the old name is accepted: ${JSON.stringify(byOld.content)}`);
    assert.equal(JSON.stringify(byOld.content), JSON.stringify(byNew.content), 'the same handler ran, with the same answer');
    assert.match(byNew.content[0].text, /fwd@example\.com/);

    const unknown = await client.callTool({ name: 'gmail_no_such_tool', arguments: {} });
    assert.equal(unknown.isError, true, 'an unknown name still fails');
  } finally {
    await client.close();
  }
});

// --------------------------------------------------------------------------- the bundled hook

/** Runs a bundled plugin's hook with one event, and a policy file in a temp token folder. */
function runHook(hook, tokenDir, toolName, input = {}) {
  const { spawnSync } = require('node:child_process');
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      session_id: 'test',
      transcript_path: 't.jsonl',
      cwd: process.cwd(),
      permission_mode: 'default',
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_input: input,
      tool_use_id: 'toolu_1',
    }),
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_'))),
      GSM_TOKEN_DIR: tokenDir,
    },
    encoding: 'utf8',
  });
  const line = (res.stdout ?? '').trim().split('\n').filter(Boolean).pop();
  return line ? JSON.parse(line).hookSpecificOutput : null;
}

test('hook: a policy rule that names an old tool applies to the new name, and the decision matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-alias-hook-'));
  TEMPS.push(dir);
  const aliases = JSON.parse(readFileSync(join(PLUGINS, 'gmail', 'tool-aliases.json'), 'utf8')).aliases;
  const old = 'gmail_users_settings_forwarding_create';
  const now = aliases[old];
  assert.equal(now, 'gmail_settings_addresses_create');
  const prefix = 'mcp__plugin_gmail_gmail__';
  const hook = join(PLUGINS, 'gmail', 'bin', 'gsm-hook.mjs');

  // A deny that names the old tool: both names are denied, with the same reason.
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ rules: [{ match: `${prefix}${old}`, action: 'deny' }] }));
  const denyOld = runHook(hook, dir, `${prefix}${old}`, { user_id: 'me', address: 'x@example.com' });
  const denyNew = runHook(hook, dir, `${prefix}${now}`, { user_id: 'me', address: 'x@example.com' });
  assert.equal(denyOld.permissionDecision, 'deny');
  assert.equal(denyNew.permissionDecision, 'deny', 'the rule on the old name applies to the new name');
  assert.equal(
    denyOld.permissionDecisionReason.replace(`${prefix}${old}`, 'X'),
    denyNew.permissionDecisionReason.replace(`${prefix}${now}`, 'X'),
    'the same reason, apart from the name the call used',
  );

  // The same for the other way round: an allow that names the new tool lets the old name through without a prompt.
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ rules: [{ match: `${prefix}${now}`, action: 'allow' }] }));
  const allowNew = runHook(hook, dir, `${prefix}${now}`, { user_id: 'me', address: 'x@example.com' });
  const allowOld = runHook(hook, dir, `${prefix}${old}`, { user_id: 'me', address: 'x@example.com' });
  assert.equal(allowNew, null, 'a matching allow rule prints nothing');
  assert.equal(allowNew, allowOld, 'the old name allows too');

  // Without a rule the write asks, the same way under either name.
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ rules: [] }));
  const askOld = runHook(hook, dir, `${prefix}${old}`, { user_id: 'me', address: 'x@example.com' });
  const askNew = runHook(hook, dir, `${prefix}${now}`, { user_id: 'me', address: 'x@example.com' });
  assert.equal(askOld.permissionDecision, 'ask');
  assert.equal(askNew.permissionDecision, 'ask');
  assert.equal(askOld.permissionDecisionReason.replace(`${prefix}${old}`, 'X'), askNew.permissionDecisionReason.replace(`${prefix}${now}`, 'X'));
});
