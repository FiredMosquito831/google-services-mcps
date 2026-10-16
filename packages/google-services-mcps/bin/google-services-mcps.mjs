#!/usr/bin/env node
// The short name of @firedmosquito831/google-services-mcps. It runs that package's installer (gsm.mjs) with the same
// arguments, in this terminal: the child inherits stdin, stdout and stderr, so the menu and the prompts work, and the
// exit code is passed back.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let installer;
try {
  installer = require.resolve('@firedmosquito831/google-services-mcps/gsm.mjs');
} catch {
  console.error('google-services-mcps: the package @firedmosquito831/google-services-mcps is not installed next to this one.');
  console.error('Reinstall with: npm install -g google-services-mcps (or run it with npx google-services-mcps).');
  process.exit(1);
}

const result = spawnSync(process.execPath, [installer, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) {
  console.error(`google-services-mcps: could not start the installer: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
