// Notices that are normally silent. The media-upload skip is an expected, everyday fact, so it is written to stderr
// only when GSM_VERBOSE=1. Otherwise every run of every server would print it.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { noteSkippedUploads, discoveryToolsFor } from '../dist/core/discovery/tools.js';
import { loadConfig } from '../dist/core/config.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKIPPED = ['drive.files.create.upload'];

/** The text written to stderr while fn runs. */
function stderrOf(fn) {
  const original = process.stderr.write;
  let text = '';
  process.stderr.write = (chunk) => {
    text += String(chunk);
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return text;
}

const savedVerbose = process.env.GSM_VERBOSE;
afterEach(() => {
  if (savedVerbose === undefined) delete process.env.GSM_VERBOSE;
  else process.env.GSM_VERBOSE = savedVerbose;
});

test('a media-upload skip is written only with GSM_VERBOSE=1', () => {
  assert.equal(stderrOf(() => noteSkippedUploads('gdrive', SKIPPED, {})), '', 'silent by default');
  assert.equal(stderrOf(() => noteSkippedUploads('gdrive', SKIPPED, { GSM_VERBOSE: '0' })), '', 'silent for 0');
  assert.equal(stderrOf(() => noteSkippedUploads('gdrive', SKIPPED, { GSM_VERBOSE: 'true' })), '', 'only the value 1 turns it on');
  assert.equal(
    stderrOf(() => noteSkippedUploads('gdrive', SKIPPED, { GSM_VERBOSE: '1' })),
    '[gdrive] skipped 1 media-upload method(s): drive.files.create.upload\n',
  );
});

test('nothing is written when no method was skipped, even with GSM_VERBOSE=1', () => {
  assert.equal(stderrOf(() => noteSkippedUploads('gdrive', [], { GSM_VERBOSE: '1' })), '');
});

test('a normal run of a server with uploads prints no media-upload notice, and GSM_VERBOSE=1 prints it', async () => {
  const tokenDir = mkdtempSync(join(tmpdir(), 'gsm-notices-'));
  try {
    delete process.env.GSM_VERBOSE;
    const cfg = loadConfig({ GSM_TOKEN_DIR: tokenDir });
    let tools;
    const quietErr = await captureAsync(async () => {
      tools = await discoveryToolsFor('gdrive', cfg);
    });
    assert.ok(tools.length > 0, 'the server still has its tools');
    assert.equal(quietErr.includes('media-upload'), false, `no notice on a normal run (stderr: ${quietErr})`);

    process.env.GSM_VERBOSE = '1';
    const verboseErr = await captureAsync(async () => {
      await discoveryToolsFor('gdrive', cfg);
    });
    assert.equal(verboseErr.includes('media-upload method(s)'), true, 'the notice is written in verbose mode');
  } finally {
    rmSync(tokenDir, { recursive: true, force: true });
  }
});

/** The text written to stderr while an async fn runs. */
async function captureAsync(fn) {
  const original = process.stderr.write;
  let text = '';
  process.stderr.write = (chunk) => {
    text += String(chunk);
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return text;
}
