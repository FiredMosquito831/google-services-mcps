// Codex config.toml: install then uninstall must give back the original bytes, with or without a final newline.
// Install appends a block, and when the file had no final newline it adds one. That newline is recorded inside the
// managed block, so uninstall removes exactly it. The planner is pure, so nothing is written to disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as codex from '../dist/cli/adapters/codex.js';

const SERVER_FILE = '/plugins/gcloud/servers/gcloud.mjs';

function plan(text, action, servers) {
  return codex.planCodex({
    file: 'config.toml',
    text,
    action,
    servers: servers.map((name) => ({ name })),
    serverFile: () => SERVER_FILE,
    allowWrites: false,
  });
}

/** Install, then uninstall the same servers. Returns the file text after each step. */
function roundTrip(text, servers = ['gcloud']) {
  const installed = plan(text, 'install', servers).after;
  const restored = plan(installed, 'uninstall', servers).after;
  return { installed, restored };
}

test('a file with a final newline comes back byte for byte', () => {
  const original = 'model = "gpt-5"\n[profile.default]\napproval = "on-request"\n';
  const { installed, restored } = roundTrip(original);
  assert.notEqual(installed, original, 'install changed the file');
  assert.equal(restored, original);
});

test('a file without a final newline comes back byte for byte, with no newline added', () => {
  const original = 'model = "gpt-5"';
  const { installed, restored } = roundTrip(original);
  assert.equal(installed.includes('# gsm: a newline was added above this block'), true, 'the newline is recorded in the block');
  assert.equal(restored, original);
  assert.equal(restored.endsWith('\n'), false);
});

test('a file without a final newline but with several lines comes back byte for byte', () => {
  const original = 'model = "gpt-5"\n\n[profile.default]\napproval = "on-request"';
  assert.equal(roundTrip(original).restored, original);
});

test('a CRLF file with a final newline, and one without, both come back byte for byte', () => {
  const withNewline = 'model = "gpt-5"\r\n[profile.default]\r\napproval = "on-request"\r\n';
  assert.equal(roundTrip(withNewline).restored, withNewline);
  const withoutNewline = 'model = "gpt-5"\r\n[profile.default]\r\napproval = "on-request"';
  assert.equal(roundTrip(withoutNewline).restored, withoutNewline);
});

test('an empty file comes back empty', () => {
  assert.equal(roundTrip('').restored, '');
});

test('a block that keeps other gsm servers keeps its newline record, and the last server to go takes the newline with it', () => {
  const original = 'model = "gpt-5"';
  const installed = plan(original, 'install', ['gcloud', 'gsc']).after;
  const onlyGsc = plan(installed, 'uninstall', ['gcloud']).after;
  assert.equal(onlyGsc.includes('# gsm: a newline was added above this block'), true, 'the record stays while the block remains');
  assert.equal(onlyGsc.includes('[mcp_servers.gsm-gsc]'), true);
  assert.equal(plan(onlyGsc, 'uninstall', ['gsc']).after, original);
});

test('installing again on a file that already has the block keeps the newline record and does not add a second newline', () => {
  const original = 'model = "gpt-5"';
  const installed = plan(original, 'install', ['gcloud']).after;
  const again = plan(installed, 'install', ['gcloud']).after;
  assert.equal(again, installed, 'a second identical install changes nothing');
  assert.equal(plan(again, 'uninstall', ['gcloud']).after, original);
});

test('a file that already ends with a newline gets no newline record, so its bytes are the same as before', () => {
  const original = 'model = "gpt-5"\n';
  const installed = plan(original, 'install', ['gcloud']).after;
  assert.equal(installed.includes('# gsm: a newline was added above this block'), false);
});
