// The hook's scope (1.38.2): each plugin's PreToolUse matcher is anchored to its own server's tools
// (^mcp__plugin_<id>_<server>__), and the hook prints nothing for a call whose mcp_server.source says it is not a plugin's
// server (Claude Code 2.1.274 or later sends mcp_server; "Base trust decisions on source rather than on name or the
// mcp__<server>__ tool-name prefix", code.claude.com/docs/en/hooks). Fail closed: when mcp_server or its source is missing
// or not a string, the hook decides by the tool name exactly as before. Runs the bundled hooks of the built plugins in a
// temp token folder (no policy file); nothing is sent anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
const plugins = readdirSync(join(ROOT, 'plugins')).sort();

const home = mkdtempSync(join(tmpdir(), 'gsm-hook-source-'));
test.after(() => rmSync(home, { recursive: true, force: true }));
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GSM_') && !k.startsWith('CLAUDE_PLUGIN_OPTION_'))),
  GSM_TOKEN_DIR: join(home, 'tokens'),
  HOME: home,
  USERPROFILE: home,
};

function hook(plugin, input) {
  const res = spawnSync(process.execPath, [join(ROOT, 'plugins', plugin, 'bin', 'gsm-hook.mjs')], { input: JSON.stringify(input), env, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout.trim();
}
const event = (tool, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {}, ...extra });

test('every plugin: the matcher is anchored to its own server and matches every tool of its map and none of another plugin', () => {
  const maps = Object.fromEntries(plugins.map((p) => [p, readJson('plugins', p, 'tool-map.json').map((t) => t.name)]));
  for (const plugin of plugins) {
    const server = readJson('plugins', plugin, 'servers.json').servers[0].name;
    const entries = readJson('plugins', plugin, 'hooks', 'hooks.json').hooks.PreToolUse;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].matcher, `^mcp__plugin_${plugin}_${server}__`);
    const re = new RegExp(entries[0].matcher);
    for (const name of maps[plugin]) assert.ok(re.test(name), `${plugin} matches ${name}`);
    for (const other of plugins.filter((p) => p !== plugin)) for (const name of maps[other]) assert.ok(!re.test(name), `${plugin} does not match ${name}`);
    for (const name of ['Bash', `mcp__${plugin}__x`, `mcp__plugin_${plugin}_other__x`, `xmcp__plugin_${plugin}_${server}__x`]) assert.ok(!re.test(name), `${plugin} does not match ${name}`);
  }
});

const WRITE = 'mcp__plugin_gmail_gmail__gmail_label';
const READ = 'mcp__plugin_gmail_gmail__gmail_search';

test('mcp_server.source plugin, or no usable source: the decision is the one made without mcp_server', () => {
  const ask = hook('gmail', event(WRITE));
  assert.match(ask, /"permissionDecision":"ask"/);
  assert.equal(hook('gmail', event(READ)), '');
  for (const server of [
    { name: 'plugin:gmail:gmail', source: 'plugin' },
    { name: 'plugin:gmail:gmail' },
    { name: 'x', source: 42 },
    { source: null },
    'plugin',
    null,
    [],
  ]) {
    assert.equal(hook('gmail', event(WRITE, { mcp_server: server })), ask, JSON.stringify(server));
    assert.equal(hook('gmail', event(READ, { mcp_server: server })), '', JSON.stringify(server));
  }
  // An unknown tool of this plugin still asks, and with source plugin too.
  assert.match(hook('gmail', event('mcp__plugin_gmail_gmail__not_a_tool', { mcp_server: { source: 'plugin' } })), /"permissionDecision":"ask"/);
});

test('gsm doctor accepts the anchored matcher of a server in .mcp.json and the older ^mcp__plugin_<id>_, and fails another', async () => {
  const { runDoctor } = await import(new URL('../dist/cli/doctor.js', import.meta.url).href);
  const { loadProductRegistry } = await import(new URL('../dist/cli/products.js', import.meta.url).href);
  const folder = join(home, 'plugin-gmail');
  cpSync(join(ROOT, 'plugins', 'gmail'), folder, { recursive: true });
  const doctor = () => {
    const lines = [];
    const roots = { layout: 'plugin', root: folder, mapFile: join(folder, 'servers.json') };
    runDoctor({ roots, registry: loadProductRegistry(roots), pluginId: 'gmail', tokenDir: join(home, 'doctor-tokens'), env: {} }, { log: (l) => lines.push(l), warn: (l) => lines.push(l) });
    return lines;
  };
  const withMatcher = (matcher) => {
    const file = join(folder, 'hooks', 'hooks.json');
    const hooks = JSON.parse(readFileSync(file, 'utf8'));
    hooks.hooks.PreToolUse[0].matcher = matcher;
    writeFileSync(file, JSON.stringify(hooks));
  };
  assert.ok(doctor().includes('PASS gmail: hooks/hooks.json matches ^mcp__plugin_gmail_gmail__ and runs bin/gsm-hook.mjs'), 'the built matcher passes');
  withMatcher('^mcp__plugin_gmail_');
  assert.ok(doctor().includes('PASS gmail: hooks/hooks.json matches ^mcp__plugin_gmail_ and runs bin/gsm-hook.mjs'), 'the older matcher still passes');
  withMatcher('^mcp__plugin_gmail_other__');
  assert.ok(
    doctor().includes('FAIL gmail: hooks/hooks.json has no PreToolUse entry with matcher ^mcp__plugin_gmail_gmail__ or ^mcp__plugin_gmail_'),
    'a matcher for a server the plugin does not have fails',
  );
});

test('mcp_server.source that is not plugin: the call is not this plugin\'s tool, whatever its name, and the hook prints nothing', () => {
  for (const source of ['user', 'project', 'local', 'sdk', 'managed', 'claudeai']) {
    assert.equal(hook('gmail', event(WRITE, { mcp_server: { name: 'plugin_gmail_gmail', source } })), '', source);
    assert.equal(hook('gmail', event('mcp__plugin_gmail_gmail__not_a_tool', { mcp_server: { name: 'x', source } })), '', source);
  }
});
