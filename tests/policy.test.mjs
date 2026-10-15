// Consent policy: decision table, policy.json loading, argument redaction, action wording, tool map.
// Runs against the compiled output in dist/ (npm test compiles first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const policy = await import(new URL('../dist/core/policy.js', import.meta.url).href);
const dump = await import(new URL('../dist/core/dump.js', import.meta.url).href);
const { decide, loadPolicyFile, redactArgs, describeAction, riskFromKind, DEFAULT_CONFIRMATION, matchesPattern } = policy;
const { toolMapFromDefs } = dump;

const TOOL = 'mcp__plugin_google_cloud_gcloud_compute__update_instance';
const MODES = ['every-change', 'destructive-only', 'off'];

const withMode = (confirmation, rules = []) => ({ confirmation, rules });
const outcome = (risk, confirmation, rules = [], extra = {}) =>
  decide({ toolName: TOOL, risk, policy: withMode(confirmation, rules), ...extra });

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'gsm-policy-test-'));
}

test('decide: reads are allowed under every confirmation mode', () => {
  for (const mode of MODES) {
    assert.equal(outcome('read', mode).decision, 'allow', mode);
  }
});

test('decide: a modify asks only under every-change', () => {
  assert.equal(outcome('modify', 'every-change').decision, 'ask');
  assert.equal(outcome('modify', 'destructive-only').decision, 'allow');
  assert.equal(outcome('modify', 'off').decision, 'allow');
});

test('decide: a destructive action asks under every-change and destructive-only, and runs under off', () => {
  assert.equal(outcome('destructive', 'every-change').decision, 'ask');
  assert.equal(outcome('destructive', 'destructive-only').decision, 'ask');
  assert.equal(outcome('destructive', 'off').decision, 'allow');
});

test('decide: the default ask reason says what it is and which mode applies', () => {
  const result = outcome('destructive', 'every-change');
  assert.match(result.reason, /every-change/);
  assert.match(result.reason, /asks first/);
});

test('decide: deny beats ask, and ask beats allow', () => {
  const allowAndAsk = [
    { match: '*', action: 'allow' },
    { match: '*', action: 'ask' },
  ];
  assert.equal(outcome('read', 'off', allowAndAsk).decision, 'ask');

  const allowAskDeny = [...allowAndAsk, { match: 'mcp__plugin_google_cloud_*', action: 'deny' }];
  const denied = outcome('read', 'off', allowAskDeny);
  assert.equal(denied.decision, 'deny');
  assert.match(denied.reason, /mcp__plugin_google_cloud_\*/);
});

test('decide: a deny rule still applies when confirmation is off', () => {
  const result = outcome('destructive', 'off', [{ match: '*delete*', action: 'deny' }], { toolName: 'x__delete_thing' });
  assert.equal(result.decision, 'deny');
});

test('decide: an ask rule applies even to a read', () => {
  assert.equal(outcome('read', 'off', [{ match: '*', action: 'ask' }]).decision, 'ask');
});

test('decide: an allow rule silences a modify or destructive prompt, and the reason says so', () => {
  const modify = outcome('modify', 'every-change', [{ match: '*update_instance', action: 'allow' }]);
  assert.equal(modify.decision, 'allow');
  assert.match(modify.reason, /without asking/);
  assert.match(modify.reason, /overrides/);

  const destructive = outcome('destructive', 'every-change', [{ match: '*', action: 'allow' }]);
  assert.equal(destructive.decision, 'allow');
  assert.match(destructive.reason, /overrides/);
});

test('decide: an allow rule on a read does not claim to override anything', () => {
  const result = outcome('read', 'every-change', [{ match: '*', action: 'allow' }]);
  assert.equal(result.decision, 'allow');
  assert.doesNotMatch(result.reason, /overrides/);
});

test('decide: rules match the method id as well as the tool name', () => {
  const result = decide({
    toolName: 'mcp__plugin_google_workspace_gmail__send_message',
    methodId: 'gmail.users.messages.send',
    risk: 'read',
    policy: withMode('off', [{ match: 'gmail.users.*', action: 'deny' }]),
  });
  assert.equal(result.decision, 'deny');
});

test('decide: the env override replaces the policy file mode', () => {
  assert.equal(outcome('destructive', 'every-change', [], { confirmationEnvOverride: 'off' }).decision, 'allow');
  assert.equal(outcome('modify', 'off', [], { confirmationEnvOverride: 'every-change' }).decision, 'ask');
  assert.equal(outcome('modify', 'every-change', [], { confirmationEnvOverride: 'destructive-only' }).decision, 'allow');
});

test('decide: an invalid env override is ignored and the file mode is used', () => {
  assert.equal(outcome('destructive', 'every-change', [], { confirmationEnvOverride: 'sometimes' }).decision, 'ask');
  assert.equal(outcome('modify', 'off', [], { confirmationEnvOverride: 'sometimes' }).decision, 'allow');
  assert.equal(outcome('modify', 'every-change', [], { confirmationEnvOverride: '' }).decision, 'ask');
});

test('decide: the env override ignores case and surrounding spaces', () => {
  assert.equal(outcome('destructive', 'every-change', [], { confirmationEnvOverride: ' OFF ' }).decision, 'allow');
});

test('decide: with no policy, the default confirmation is every-change', () => {
  assert.equal(DEFAULT_CONFIRMATION, 'every-change');
  assert.equal(decide({ toolName: TOOL, risk: 'modify', policy: withMode(DEFAULT_CONFIRMATION) }).decision, 'ask');
});

test('riskFromKind maps read, write and destructive', () => {
  assert.equal(riskFromKind('read'), 'read');
  assert.equal(riskFromKind('write'), 'modify');
  assert.equal(riskFromKind('destructive'), 'destructive');
  assert.throws(() => riskFromKind('bogus'), /unknown tool kind/);
});

test('loadPolicyFile: a missing file gives the defaults and creates nothing', () => {
  const dir = tempDir();
  assert.deepEqual(loadPolicyFile(dir), { confirmation: 'every-change', rules: [] });
  assert.equal(existsSync(join(dir, 'policy.json')), false);
});

test('loadPolicyFile: bad JSON throws an error that names the file', () => {
  const dir = tempDir();
  const file = join(dir, 'policy.json');
  writeFileSync(file, '{ "confirmation": ');
  assert.throws(() => loadPolicyFile(dir), (err) => err.message.includes(file));
});

test('loadPolicyFile: an unknown field throws an error that names the file', () => {
  const dir = tempDir();
  const file = join(dir, 'policy.json');
  writeFileSync(file, JSON.stringify({ confirmation: 'off', colour: 'red' }));
  assert.throws(() => loadPolicyFile(dir), (err) => err.message.includes(file) && /colour/.test(err.message));
});

test('loadPolicyFile: an unknown field inside a rule is an error', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ rules: [{ match: '*', action: 'ask', note: 'x' }] }));
  assert.throws(() => loadPolicyFile(dir), /unknown field "note"/);
});

test('loadPolicyFile: an unknown confirmation value is rejected with the allowed values', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ confirmation: 'sometimes' }));
  assert.throws(() => loadPolicyFile(dir), /unknown confirmation mode "sometimes".*every-change, destructive-only, off/);
});

test('loadPolicyFile: a UTF-8 byte order mark is tolerated', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'policy.json'), `﻿${JSON.stringify({ confirmation: 'off' })}`);
  assert.equal(loadPolicyFile(dir).confirmation, 'off');
});

test('loadPolicyFile: an invalid regular expression in a re: rule is rejected', () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'policy.json'), JSON.stringify({ rules: [{ match: 're:(', action: 'deny' }] }));
  assert.throws(() => loadPolicyFile(dir), /not a valid regular expression/);
});

test('loadPolicyFile: glob and re: patterns both work once loaded', () => {
  const dir = tempDir();
  writeFileSync(
    join(dir, 'policy.json'),
    JSON.stringify({
      confirmation: 'every-change',
      rules: [
        { match: 'mcp__plugin_google_cloud_*__delete_?', action: 'deny' },
        { match: 're:^mcp__plugin_google_cloud_gcloud_compute__list_', action: 'allow' },
      ],
    }),
  );
  const loaded = loadPolicyFile(dir);
  const run = (toolName, risk) => decide({ toolName, risk, policy: loaded }).decision;

  assert.equal(run('mcp__plugin_google_cloud_gcloud_compute__delete_1', 'destructive'), 'deny');
  assert.equal(run('mcp__plugin_google_cloud_gcloud_compute__delete_12', 'destructive'), 'ask', '? matches one character only');
  assert.equal(run('mcp__plugin_google_cloud_gcloud_compute__list_instances', 'modify'), 'allow');
  assert.equal(run('mcp__plugin_google_cloud_gcloud_compute__update_instance', 'modify'), 'ask');
});

test('matchesPattern: glob characters are literal except * and ?', () => {
  assert.equal(matchesPattern('gmail.users.*', 'gmail.users.messages.send'), true);
  assert.equal(matchesPattern('gmail.users.*', 'gmailXusersY'), false);
  assert.equal(matchesPattern('tool_?', 'tool_1'), true);
  assert.equal(matchesPattern('tool_?', 'tool_12'), false);
  assert.equal(matchesPattern('re:list_', 'api_list_items'), true, 're: is unanchored unless written with ^ or $');
});

test('redactArgs: secret keys are redacted at every depth', () => {
  const value = {
    name: 'visible',
    auth: {
      Authorization: 'Bearer abc123',
      nested: [{ client_secret: 'shh', items: [{ apiKey: 'k1', api_key: 'k2', password: 'pw', Cookie: 'c=1' }] }],
    },
    privateKey: 'pk-body',
    credentials: { user: 'x' },
  };
  const text = redactArgs(value);
  for (const leaked of ['abc123', 'shh', 'k1', 'k2', 'pw', 'c=1', 'pk-body']) {
    assert.ok(!text.includes(leaked), `${leaked} must not appear`);
  }
  const parsed = JSON.parse(text);
  assert.equal(parsed.name, 'visible');
  assert.equal(parsed.auth.Authorization, '[redacted]');
  assert.equal(parsed.auth.nested[0].client_secret, '[redacted]');
  assert.equal(parsed.auth.nested[0].items[0].apiKey, '[redacted]');
  assert.equal(parsed.auth.nested[0].items[0].api_key, '[redacted]');
  assert.equal(parsed.privateKey, '[redacted]');
  assert.equal(parsed.credentials, '[redacted]', 'a secret key hides its whole value, even an object');
});

test('redactArgs: the input object is not changed', () => {
  const value = { password: 'pw' };
  redactArgs(value);
  assert.deepEqual(value, { password: 'pw' });
});

test('redactArgs: strings over 300 characters are cut with an ellipsis', () => {
  const parsed = JSON.parse(redactArgs({ body: 'a'.repeat(1000), short: 'b'.repeat(300) }));
  assert.equal(parsed.body, `${'a'.repeat(300)}...`);
  assert.equal(parsed.short, 'b'.repeat(300), 'exactly 300 characters is kept whole');
});

test('redactArgs: text over maxChars is cut and the note says how many characters were dropped', () => {
  const value = { items: Array.from({ length: 200 }, (_, i) => i) };
  const full = JSON.stringify(value, null, 2);
  const text = redactArgs(value, 100);
  assert.ok(text.startsWith(full.slice(0, 100)));
  assert.ok(text.includes(`... [${full.length - 100} more characters not shown]`));
});

test('redactArgs: short values come back whole, with no note', () => {
  assert.equal(redactArgs({ a: 1 }), JSON.stringify({ a: 1 }, null, 2));
});

test('describeAction: a modify has the "About to change" first line and says it has not run yet', () => {
  const text = describeAction({ toolName: TOOL, risk: 'modify', args: { instance: 'vm-1' } });
  const [first] = text.split('\n');
  assert.equal(first, `About to change Google data: ${TOOL}`);
  assert.match(text, /proposed action and has not run yet/);
  assert.doesNotMatch(text, /irreversible/);
  assert.match(text, /"instance": "vm-1"/);
});

test('describeAction: a destructive action says it may be irreversible and has not run yet', () => {
  const text = describeAction({
    toolName: 'mcp__plugin_google_cloud_gcloud_compute__delete_instance',
    methodId: 'compute.instances.delete',
    risk: 'destructive',
    args: { instance: 'vm-1', token: 'secret-value' },
    reason: 'Deletes data.',
  });
  const [first, second] = text.split('\n');
  assert.equal(first, 'About to permanently change or delete Google data: mcp__plugin_google_cloud_gcloud_compute__delete_instance');
  assert.equal(second, 'Why: Deletes data.');
  assert.match(text, /may be irreversible/);
  assert.match(text, /has not run yet/);
  assert.match(text, /Method: compute\.instances\.delete/);
  assert.ok(!text.includes('secret-value'), 'secrets in the arguments are redacted');
});

test('describeAction: missing arguments are shown as none', () => {
  assert.match(describeAction({ toolName: TOOL, risk: 'modify', args: undefined }), /Arguments:\n\(none\)/);
});

test('toolMapFromDefs: sorted by name, with defaults and optional fields only when given', () => {
  const entries = toolMapFromDefs([
    { name: 'mcp__plugin_p_s__zeta', kind: 'destructive' },
    { name: 'mcp__plugin_p_s__alpha', kind: 'read', scopes: ['a'], methodId: 'x.y', title: 'Alpha' },
    { name: 'mcp__plugin_p_s__mid', kind: 'write' },
  ]);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['mcp__plugin_p_s__alpha', 'mcp__plugin_p_s__mid', 'mcp__plugin_p_s__zeta'],
  );
  assert.deepEqual(entries[0], { name: 'mcp__plugin_p_s__alpha', kind: 'read', scopes: ['a'], methodId: 'x.y', title: 'Alpha' });
  assert.deepEqual(entries[1], { name: 'mcp__plugin_p_s__mid', kind: 'write', scopes: [] });
  assert.equal('methodId' in entries[2], false);
});

test('toolMapFromDefs: a duplicate name throws', () => {
  assert.throws(
    () => toolMapFromDefs([{ name: 'dup', kind: 'read' }, { name: 'dup', kind: 'write' }]),
    /duplicate tool name dup/,
  );
});

test('toolMapFromDefs: an unknown kind throws', () => {
  assert.throws(() => toolMapFromDefs([{ name: 'x', kind: 'delete' }]), /unknown kind "delete"/);
});
