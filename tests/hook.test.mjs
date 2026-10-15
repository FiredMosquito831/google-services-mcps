// PreToolUse hook, run as a child process the way Claude Code runs it.
// Each test builds a fake plugin folder "google-cloud" in a temp dir: the compiled hook is
// copied to <plugin>/bin/gsm-hook.mjs and the policy module to <plugin>/core/, so the
// hook finds <plugin>/tool-map.json exactly as it will in the bundled plugin.
// The token dir is always a fresh temp dir, and CLAUDE_PLUGIN_OPTION_CONFIRMATION is
// cleared unless a test sets it, so the developer's own policy and settings never leak in.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = (rel) => fileURLToPath(new URL(`../dist/${rel}`, import.meta.url));
const work = [];
after(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

// The plugin is google-cloud, so Claude Code names its tools mcp__plugin_google_cloud_<server>__<tool>.
const READ = 'mcp__plugin_google_cloud_gcloud_compute__list_instances';
const MODIFY = 'mcp__plugin_google_cloud_gcloud_compute__update_instance';
const DESTRUCTIVE = 'mcp__plugin_google_cloud_gcloud_compute__delete_instance';

const TOOL_MAP = [
  { name: READ, kind: 'read', scopes: [], methodId: 'compute.instances.list' },
  { name: MODIFY, kind: 'write', scopes: [], methodId: 'compute.instances.update' },
  { name: DESTRUCTIVE, kind: 'destructive', scopes: [], methodId: 'compute.instances.delete' },
];

/**
 * A fake plugin folder. toolMap null means no tool-map.json. policy, when given, is written
 * as <tokenDir>/policy.json; a string is written as-is, anything else as JSON.
 */
function fakePlugin({ toolMap = TOOL_MAP, policy, folder = 'google-cloud', manifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gsm-hook-test-'));
  work.push(root);
  const plugin = join(root, folder);
  mkdirSync(join(plugin, 'bin'), { recursive: true });
  mkdirSync(join(plugin, 'core'), { recursive: true });
  const tokenDir = join(root, 'tokens');
  mkdirSync(tokenDir);
  writeFileSync(join(plugin, 'package.json'), '{"type":"module"}\n');
  copyFileSync(dist('hook/pretooluse.js'), join(plugin, 'bin', 'gsm-hook.mjs'));
  copyFileSync(dist('core/policy.js'), join(plugin, 'core', 'policy.js'));
  // The hook also imports the dynamic-risk rule (resolveDynamicKind) for dynamic tools.
  copyFileSync(dist('core/dynamic.js'), join(plugin, 'core', 'dynamic.js'));
  if (toolMap !== null) writeFileSync(join(plugin, 'tool-map.json'), JSON.stringify(toolMap, null, 2));
  // manifest: undefined writes no plugin.json; a string is written as-is; anything else as JSON.
  if (manifest !== undefined) {
    mkdirSync(join(plugin, '.claude-plugin'));
    writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  }
  if (policy !== undefined) {
    writeFileSync(join(tokenDir, 'policy.json'), typeof policy === 'string' ? policy : JSON.stringify(policy));
  }
  return { hook: join(plugin, 'bin', 'gsm-hook.mjs'), tokenDir };
}

function event(toolName, toolInput = { project: 'my-project', instance: 'vm-1' }) {
  return {
    session_id: 'test-session',
    transcript_path: 'transcript.jsonl',
    cwd: process.cwd(),
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'toolu_test',
  };
}

/** Runs the hook with stdin set to the event (or the raw text), and the given env changes. */
function runHook(hook, { input, raw, tokenDir, env = {} }) {
  const childEnv = { ...process.env, GSM_TOKEN_DIR: tokenDir };
  delete childEnv.CLAUDE_PLUGIN_OPTION_CONFIRMATION;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const result = spawnSync(process.execPath, [hook], {
    input: raw ?? JSON.stringify(input),
    env: childEnv,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.error, undefined, `hook did not run: ${result.error}`);
  assert.equal(result.status, 0, `exit code must be 0, stderr: ${result.stderr}`);
  return result.stdout;
}

/** The hookSpecificOutput object, after checking that stdout is one JSON line. */
function decisionOf(stdout) {
  assert.ok(stdout.endsWith('\n'), 'output ends with a newline');
  const parsed = JSON.parse(stdout);
  assert.deepEqual(Object.keys(parsed), ['hookSpecificOutput']);
  return parsed.hookSpecificOutput;
}

test('a read tool produces no output', () => {
  const { hook, tokenDir } = fakePlugin();
  assert.equal(runHook(hook, { input: event(READ), tokenDir }), '');
});

test('a modify tool asks by default, with a description of the action', () => {
  const { hook, tokenDir } = fakePlugin();
  const out = decisionOf(runHook(hook, { input: event(MODIFY), tokenDir }));
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'ask');
  assert.deepEqual(Object.keys(out).sort(), ['hookEventName', 'permissionDecision', 'permissionDecisionReason']);
  const reason = out.permissionDecisionReason;
  assert.match(reason, new RegExp(`^About to change Google data: ${MODIFY}\n`));
  assert.match(reason, /has not run yet/);
  assert.match(reason, /every-change/);
  assert.match(reason, /"instance": "vm-1"/);
  assert.match(reason, /Method: compute\.instances\.update/);
});

test('a destructive tool passes silently when CLAUDE_PLUGIN_OPTION_CONFIRMATION is off', () => {
  const { hook, tokenDir } = fakePlugin();
  const stdout = runHook(hook, { input: event(DESTRUCTIVE), tokenDir, env: { CLAUDE_PLUGIN_OPTION_CONFIRMATION: 'off' } });
  assert.equal(stdout, '');
});

test('a modify tool passes silently under destructive-only, but a destructive one still asks', () => {
  const { hook, tokenDir } = fakePlugin();
  const env = { CLAUDE_PLUGIN_OPTION_CONFIRMATION: 'destructive-only' };
  assert.equal(runHook(hook, { input: event(MODIFY), tokenDir, env }), '');
  const out = decisionOf(runHook(hook, { input: event(DESTRUCTIVE), tokenDir, env }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /permanently change or delete/);
  assert.match(out.permissionDecisionReason, /may be irreversible/);
});

test('a deny rule produces a deny decision, even when confirmation is off', () => {
  const { hook, tokenDir } = fakePlugin({ policy: { confirmation: 'off', rules: [{ match: '*delete*', action: 'deny' }] } });
  const out = decisionOf(runHook(hook, { input: event(DESTRUCTIVE), tokenDir }));
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /Denied by policy rule "\*delete\*"/);
});

test('an allow rule never produces allow output: the normal permission flow runs', () => {
  const { hook, tokenDir } = fakePlugin({ policy: { rules: [{ match: '*', action: 'allow' }] } });
  assert.equal(runHook(hook, { input: event(DESTRUCTIVE), tokenDir }), '');
  assert.equal(runHook(hook, { input: event(MODIFY), tokenDir }), '');
});

test('an unknown tool of this plugin asks, even when an allow rule matches it', () => {
  const { hook, tokenDir } = fakePlugin({ policy: { rules: [{ match: '*', action: 'allow' }] } });
  const out = decisionOf(runHook(hook, { input: event('mcp__plugin_google_cloud_gcloud_compute__made_up'), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /Unknown tool, asking to be safe\./);
});

test('an unknown tool asks under confirmation off too', () => {
  const { hook, tokenDir } = fakePlugin();
  const out = decisionOf(
    runHook(hook, {
      input: event('mcp__plugin_google_cloud_gcloud_compute__made_up'),
      tokenDir,
      env: { CLAUDE_PLUGIN_OPTION_CONFIRMATION: 'off' },
    }),
  );
  assert.equal(out.permissionDecision, 'ask');
});

test('built-in tools and tools of other MCP servers are ignored', () => {
  const { hook, tokenDir } = fakePlugin();
  for (const toolName of ['Bash', 'Read', 'mcp__github__create_issue']) {
    assert.equal(runHook(hook, { input: event(toolName), tokenDir }), '', toolName);
  }
});

test('a tool of another plugin prints nothing, even one this plugin\'s map does not list', () => {
  // Changed: this used to expect an ask. Another plugin's tool is not this plugin's, so the hook says nothing about it.
  const { hook, tokenDir } = fakePlugin();
  assert.equal(runHook(hook, { input: event('mcp__plugin_google_workspace_gmail__send_message'), tokenDir }), '');
  assert.equal(runHook(hook, { input: event('mcp__plugin_gmail_gmail__send_message'), tokenDir }), '');
});

test('the plugin name in plugin.json, not the folder, decides which tools are this plugin\'s', () => {
  // The folder is a version number, and the manifest names the plugin google-cloud.
  const { hook, tokenDir } = fakePlugin({ folder: '0.1.0', manifest: { name: 'google-cloud' } });
  assert.equal(decisionOf(runHook(hook, { input: event(DESTRUCTIVE), tokenDir })).permissionDecision, 'ask');
  assert.equal(runHook(hook, { input: event('mcp__plugin_google_workspace_gmail__send_message'), tokenDir }), '');
});

test('a manifest name with a hyphen is matched with the underscore form that Claude Code uses in tool names', () => {
  // The manifest says google-cloud; its tools are named mcp__plugin_google_cloud_..., so they are this plugin's.
  const { hook, tokenDir } = fakePlugin({ manifest: { name: 'google-cloud' } });
  assert.equal(decisionOf(runHook(hook, { input: event(MODIFY), tokenDir })).permissionDecision, 'ask');
});

test('an unreadable plugin.json falls back to the prefix of the first tool-map entry', () => {
  const { hook, tokenDir } = fakePlugin({ manifest: '{ "name": ' });
  assert.equal(decisionOf(runHook(hook, { input: event(DESTRUCTIVE), tokenDir })).permissionDecision, 'ask');
  assert.equal(runHook(hook, { input: event('mcp__plugin_google_workspace_gmail__send_message'), tokenDir }), '');
});

test('with neither plugin.json nor a tool map, this plugin cannot be identified: its tools ask, and others print nothing', () => {
  const { hook, tokenDir } = fakePlugin({ toolMap: null });
  const out = decisionOf(runHook(hook, { input: event(READ), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /could not be identified/);
  assert.notEqual(runHook(hook, { input: event('mcp__plugin_google_workspace_gmail__send_message'), tokenDir }), '', 'a plugin tool still asks');
  assert.equal(runHook(hook, { input: event('Bash'), tokenDir }), '', 'a built-in tool prints nothing');
});

test('garbage stdin produces no output and exits 0', () => {
  const { hook, tokenDir } = fakePlugin();
  assert.equal(runHook(hook, { raw: '{ not json', tokenDir }), '');
  assert.equal(runHook(hook, { raw: '', tokenDir }), '');
  assert.equal(runHook(hook, { raw: '[1,2,3]', tokenDir }), '');
});

test('a policy file that does not parse makes the hook ask, and the reason names the file', () => {
  const { hook, tokenDir } = fakePlugin({ policy: '{ "rules": ' });
  const out = decisionOf(runHook(hook, { input: event(READ), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /policy\.json/);
  assert.match(out.permissionDecisionReason, /asking to be safe/);
});

test('an invalid CLAUDE_PLUGIN_OPTION_CONFIRMATION is ignored, so the default asks', () => {
  const { hook, tokenDir } = fakePlugin();
  const out = decisionOf(
    runHook(hook, { input: event(DESTRUCTIVE), tokenDir, env: { CLAUDE_PLUGIN_OPTION_CONFIRMATION: 'sometimes' } }),
  );
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /every-change/);
});

test('a missing tool map asks for every plugin tool, including reads', () => {
  // With a manifest the plugin is known, so the tool map is the only thing missing.
  const { hook, tokenDir } = fakePlugin({ toolMap: null, manifest: { name: 'google-cloud' } });
  const out = decisionOf(runHook(hook, { input: event(READ), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /Tool map not found in this plugin, asking to be safe\./);
});

test('a malformed tool map asks, and the reason says why', () => {
  const { hook, tokenDir } = fakePlugin({ toolMap: { not: 'an array' }, manifest: { name: 'google-cloud' } });
  const out = decisionOf(runHook(hook, { input: event(READ), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /must hold a JSON array/);
});

test('the folder name does not matter: a versioned cache folder is handled the same way', () => {
  // Claude Code may run a plugin from a folder named after its version, so the folder name is not used.
  const { hook, tokenDir } = fakePlugin({ folder: '0.1.0' });
  const out = decisionOf(runHook(hook, { input: event(DESTRUCTIVE), tokenDir }));
  assert.equal(out.permissionDecision, 'ask');
});
