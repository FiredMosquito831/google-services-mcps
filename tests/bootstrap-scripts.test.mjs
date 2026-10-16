// Tests for the one-line bootstrap installers: scripts/install.cmd (Windows Command Prompt), scripts/install.ps1
// (Windows PowerShell 5.1 and PowerShell 7) and scripts/install.sh (sh on Linux, macOS and WSL). Run after compiling
// (npm test does). The static checks read the three files. The behaviour checks run them offline: the archive is
// `git archive HEAD` of this repository, and every install folder, home folder and temp folder is a new folder under one
// temp root. HOME and USERPROFILE point at a temp folder as well, so the real home folder and the real Claude config are
// never used. The download from GitHub (test 13) runs only with GSM_NETWORK_TESTS=1.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CMD = join(REPO, 'scripts', 'install.cmd');
const PS1 = join(REPO, 'scripts', 'install.ps1');
const SH = join(REPO, 'scripts', 'install.sh');
const ROOT_GSM = join(REPO, 'gsm.mjs');
const WINDOWS = process.platform === 'win32';
const NETWORK = process.env.GSM_NETWORK_TESTS === '1';
const CODELOAD_MAIN = 'https://codeload.github.com/FiredMosquito831/google-services-mcps/zip/refs/heads/main';
const USAGE_LINE = 'Run with install, list, uninstall, status, products, doctor or --help';

// The one-liners, exactly as the scripts' header comments and the README state them.
const CMD_INSTALL = 'curl -fsSL -o "%TEMP%\\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd && "%TEMP%\\install-gsm.cmd" install --agent claude --plugin gmail';
const CMD_UNINSTALL = 'curl -fsSL -o "%TEMP%\\install-gsm.cmd" https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.cmd && "%TEMP%\\install-gsm.cmd" uninstall --all --yes';
const PS_INSTALL = '& ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) install --agent claude --plugin gmail';
const PS_UNINSTALL = '& ([scriptblock]::Create((irm "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.ps1"))) uninstall --all --yes';
const SH_INSTALL = 'curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- install --agent claude --plugin gmail';
const SH_UNINSTALL = 'curl -fsSL "https://raw.githubusercontent.com/FiredMosquito831/google-services-mcps/main/scripts/install.sh" | sh -s -- uninstall --all --yes';

const FILES = [
  {
    name: 'install.cmd',
    path: CMD,
    comment: /^rem\b/i,
    lines: [CMD_INSTALL, CMD_UNINSTALL],
    forward: /^node "%INSTALL_DIR%\\gsm\.mjs" %\*$/m,
  },
  {
    name: 'install.ps1',
    path: PS1,
    comment: /^#/,
    lines: [PS_INSTALL, PS_UNINSTALL],
    forward: /^\s*& node \(Join-Path \$dir 'gsm\.mjs'\) @forward\s*$/m,
  },
  {
    name: 'install.sh',
    path: SH,
    comment: /^#/,
    lines: [SH_INSTALL, SH_UNINSTALL],
    forward: /^\s*node "\$install_dir\/gsm\.mjs" "\$@"/m,
  },
];

// ---- temp root and helpers ------------------------------------------------------------------------------------------

const ROOT = mkdtempSync(join(tmpdir(), 'gsm-boot-'));
after(() => rmSync(ROOT, { recursive: true, force: true }));
let counter = 0;
function fresh(label) {
  const dir = join(ROOT, `${String(++counter).padStart(3, '0')}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
const posix = (p) => p.replace(/\\/g, '/');
const report = (r) => `status=${r.status} error=${r.error ?? '-'}\n--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}`;
const isEmptyDir = (dir) => readdirSync(dir).length === 0;
// Running npm (the requirement check runs `npm --version`) leaves Node's own compile cache in TEMP. That is npm's folder, not ours.
const leftovers = (dir) => readdirSync(dir).filter((name) => name !== 'node-compile-cache');
const missingUrl = (dir) => pathToFileURL(join(dir, 'missing', 'none.zip')).href;
const DRY = (home) => ['install', '--agent', 'codex', '--plugin', 'gmail', '--scope', 'global', '--home', home, '--dry-run'];
const PATH_KEY = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';

/** The environment for one run: a fresh fake home, no GSM_* from the outer shell, then the extra values. */
function envWith(extra = {}) {
  const home = fresh('fake-home');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const key of ['GSM_ARCHIVE_URL', 'GSM_REF', 'GSM_DIR']) delete env[key];
  return { ...env, ...extra };
}

function findSh() {
  const candidates = ['sh'];
  if (WINDOWS) candidates.push(join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'sh.exe'));
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['-c', 'exit 0'], { stdio: 'ignore' }).status === 0) return candidate;
  }
  return null;
}
const SH_BIN = findSh();
const NEEDS_SH = SH_BIN ? false : 'no sh on PATH (Git for Windows ships one in usr/bin)';
const NEEDS_WINDOWS = WINDOWS ? false : 'Windows only';
const GIT_USR_BIN = join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin');
const SYSTEM32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32');
// A drive other than the temporary folder's, for the cross-drive test. Null on a machine with one drive.
const OTHER_DRIVE = WINDOWS
  ? ['D', 'E', 'F', 'G', 'H', 'I'].map((d) => `${d}:\\`).find((root) => existsSync(root) && root[0].toLowerCase() !== tmpdir()[0].toLowerCase()) ?? null
  : null;

function hasExe(exe) {
  return spawnSync(exe, ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore', timeout: 60000 }).status === 0;
}
const HAS_PS51 = WINDOWS && hasExe('powershell.exe');
const HAS_PS7 = WINDOWS && hasExe('pwsh.exe');

function runSh(args, env) {
  return spawnSync(SH_BIN, [posix(SH), ...args], { env, cwd: fresh('cwd'), encoding: 'utf8', timeout: 300000 });
}

const cmdQuote = (a) => (/[\s"]/.test(a) ? `"${a}"` : a);
function runCmd(scriptPath, args, env) {
  const line = [`"${scriptPath}"`, ...args.map(cmdQuote)].join(' ');
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
    env, cwd: fresh('cwd'), encoding: 'utf8', timeout: 300000, windowsVerbatimArguments: true,
  });
}

const PS_FLAGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
function runPsFile(exe, scriptPath, args, env) {
  return spawnSync(exe, [...PS_FLAGS, '-File', scriptPath, ...args], { env, cwd: fresh('cwd'), encoding: 'utf8', timeout: 300000 });
}
/** The shape of the one-liner: the file text becomes a scriptblock, then the arguments. Get-Content stands in for irm. */
function runPsOneLiner(exe, scriptPath, args, env) {
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const call = `& ([scriptblock]::Create((Get-Content -Raw -LiteralPath ${q(scriptPath)}))) ${args.map((a) => (/\s/.test(a) ? q(a) : a)).join(' ')}`;
  return spawnSync(exe, [...PS_FLAGS, '-Command', `${call}; exit $LASTEXITCODE`], {
    env, cwd: fresh('cwd'), encoding: 'utf8', timeout: 300000,
  });
}

let archiveUrl = null;
/** A file:// URL of the zip that `git archive HEAD` makes (the committed tree, with the prefix GitHub uses). */
function archive() {
  if (!archiveUrl) {
    const zip = join(fresh('archive'), 'src.zip');
    const r = spawnSync('git', ['archive', '--format=zip', '--prefix=google-services-mcps-main/', '-o', zip, 'HEAD'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(r.status, 0, report(r));
    archiveUrl = pathToFileURL(zip).href;
  }
  return archiveUrl;
}

let noGsmUrl = null;
/** A file:// URL of a zip of the repository's README only: a download that does not contain gsm.mjs. */
function archiveWithoutGsm() {
  if (!noGsmUrl) {
    const zip = join(fresh('archive-no-gsm'), 'no-gsm.zip');
    const r = spawnSync('git', ['archive', '--format=zip', '--prefix=google-services-mcps-main/', '-o', zip, 'HEAD', 'README.md'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(r.status, 0, report(r));
    noGsmUrl = pathToFileURL(zip).href;
  }
  return noGsmUrl;
}

/** Copies a script to a folder under a new name, the way the one-liners save it as install-gsm.cmd. */
function copyScript(folder, name, text) {
  const path = join(folder, name);
  writeFileSync(path, text);
  return path;
}

/** cmd reports a goto to a missing label on stderr and then exits 1, so the exit code alone can hide it. */
function assertNoLabelError(r) {
  assert.doesNotMatch(r.stdout + r.stderr, /batch label|cannot find/i, report(r));
}

/** The checks shared by the dry runs of cmd and PowerShell: installed, nothing left behind, arguments intact. */
function assertDryRunInstalled(r, { installDir, home, tempDir }) {
  assert.equal(r.status, 0, report(r));
  assertNoLabelError(r);
  assert.ok(existsSync(join(installDir, 'gsm.mjs')), 'gsm.mjs is in the install folder');
  assert.match(r.stdout, /gmail/);
  assert.match(r.stdout, /codex/);
  assert.ok(r.stdout.includes(home), 'the --home argument (with a space) reached gsm.mjs intact');
  assert.ok(isEmptyDir(home), 'nothing written in the home folder');
  assert.deepEqual(leftovers(tempDir), [], 'the temp folder is cleaned up');
  assert.deepEqual(readdirSync(dirname(installDir)), [installDir.split(/[\\/]/).pop()], 'no .partial folder is left');
}

// ---- 1. static checks ----------------------------------------------------------------------------------------------

for (const file of FILES) {
  const text = () => readFileSync(file.path, 'utf8');

  test(`${file.name}: its one-liners are in the header comment`, () => {
    const lines = text().split(/\r?\n/);
    for (const oneLiner of file.lines) {
      assert.ok(
        lines.some((l) => l.includes(oneLiner) && file.comment.test(l)),
        `header comment of ${file.name} lacks: ${oneLiner}`,
      );
    }
  });

  test(`${file.name}: forwards every argument to node unchanged, and states the usage`, () => {
    assert.match(text(), file.forward);
    if (file.name === 'install.ps1') assert.match(text(), /\$args\b/);
    if (file.name === 'install.sh') assert.match(text(), /"\$@"/);
    assert.match(text(), new RegExp(USAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test(`${file.name}: the real home folder is named only through the variables, and the file is ASCII only`, () => {
    const body = text();
    assert.doesNotMatch(body, /C:\\Users\\|\/Users\/|\/home\//i);
    assert.ok([...body].every((ch) => ch.charCodeAt(0) < 128), `${file.name} has a non-ASCII character`);
  });

  test(`${file.name}: the same download source and environment names as the contract`, () => {
    const body = text();
    assert.ok(body.includes('codeload.github.com/FiredMosquito831/google-services-mcps/zip/'), 'codeload source');
    assert.ok(body.includes('refs/heads/main'), 'default branch main');
    for (const name of ['GSM_ARCHIVE_URL', 'GSM_REF', 'GSM_DIR', 'Downloading google-services-mcps from GitHub ...', 'Installing with: node gsm.mjs']) {
      assert.ok(body.includes(name), `${file.name} lacks ${name}`);
    }
    assert.ok(body.includes('https://nodejs.org') && body.includes('winget install OpenJS.NodeJS.LTS'), 'node hint');
  });
}

test('install.ps1 has no param block (the arguments come in $args)', () => {
  assert.doesNotMatch(readFileSync(PS1, 'utf8'), /^\s*param\s*\(/im);
});

test('install.sh passes sh -n (syntax check)', { skip: NEEDS_SH }, () => {
  const r = spawnSync(SH_BIN, ['-n', posix(SH)], { encoding: 'utf8' });
  assert.equal(r.status, 0, report(r));
});

// ---- 2 to 4. sh, offline ---------------------------------------------------------------------------------------------

test('2. sh: offline archive, dry run for codex; the folder is created with gsm.mjs and nothing is written in the home', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-dry');
  const home = join(dir, 'home');
  mkdirSync(home);
  const installDir = join(dir, 'missing-parent', 'google-services-mcps');
  const tempDir = join(dir, 'tmp');
  mkdirSync(tempDir);
  const r = runSh(DRY(posix(home)), envWith({ GSM_ARCHIVE_URL: archive(), GSM_DIR: posix(installDir), TMPDIR: posix(tempDir) }));
  assert.equal(r.status, 0, report(r));
  assert.ok(existsSync(join(installDir, 'gsm.mjs')), 'gsm.mjs is in the install folder');
  assert.match(r.stdout, /gmail/);
  assert.match(r.stdout, /codex/);
  assert.match(r.stdout, /dry-run/);
  assert.ok(isEmptyDir(home), 'nothing written in the home folder');
  assert.deepEqual(leftovers(tempDir), [], 'the temp folder is cleaned up');
});

test('3. sh: a missing archive names the download, exits 1, creates no install folder and cleans up', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-missing');
  const installDir = join(dir, 'parent', 'google-services-mcps');
  const tempDir = join(dir, 'tmp');
  mkdirSync(tempDir);
  const r = runSh(DRY(posix(join(dir, 'home'))), envWith({ GSM_ARCHIVE_URL: missingUrl(dir), GSM_DIR: posix(installDir), TMPDIR: posix(tempDir) }));
  assert.equal(r.status, 1, report(r));
  assert.match(r.stderr, /Download failed/);
  assert.equal(existsSync(installDir), false, 'no install folder');
  assert.equal(existsSync(join(dir, 'parent')), false, 'no parent folder either');
  assert.deepEqual(leftovers(tempDir), [], 'the temp folder is cleaned up after the error');
});

test('4. sh: no arguments prints the usage, exits 0, downloads nothing and creates no install folder', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-usage');
  const installDir = join(dir, 'google-services-mcps');
  const r = runSh([], envWith({ GSM_ARCHIVE_URL: missingUrl(dir), GSM_DIR: posix(installDir) }));
  assert.equal(r.status, 0, report(r));
  assert.match(r.stdout, /install --agent claude --plugin gmail/);
  assert.match(r.stdout, /uninstall --all --yes/);
  assert.match(r.stdout, new RegExp(USAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(existsSync(installDir), false);
});

test('4a. sh: an archive without gsm.mjs exits 1, says so, and creates no install folder', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-no-gsm');
  const installDir = join(dir, 'gsm');
  const tempDir = join(dir, 'tmp');
  mkdirSync(tempDir);
  const r = runSh(DRY(posix(join(dir, 'home'))), envWith({ GSM_ARCHIVE_URL: archiveWithoutGsm(), GSM_DIR: posix(installDir), TMPDIR: posix(tempDir) }));
  assert.equal(r.status, 1, report(r));
  assert.match(r.stderr, /does not contain gsm\.mjs/);
  assert.equal(existsSync(installDir), false);
  assert.deepEqual(leftovers(tempDir), []);
});

test('4a. sh: a second run replaces the install folder, so a stale file is gone and no .partial is left', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-replace');
  const installDir = join(dir, 'gsm');
  const home = join(dir, 'home');
  mkdirSync(home);
  const env = envWith({ GSM_ARCHIVE_URL: archive(), GSM_DIR: posix(installDir) });
  const first = runSh(DRY(posix(home)), env);
  assert.equal(first.status, 0, report(first));
  writeFileSync(join(installDir, 'stale.txt'), 'old');
  const second = runSh(DRY(posix(home)), env);
  assert.equal(second.status, 0, report(second));
  assert.equal(existsSync(join(installDir, 'stale.txt')), false, 'the old folder was replaced');
  assert.ok(existsSync(join(installDir, 'gsm.mjs')));
  assert.equal(readdirSync(dir).some((n) => n.endsWith('.partial')), false, 'no .partial folder is left');
});

test('4b. sh: node older than 20 prints where to get Node and exits 1 before any download', { skip: NEEDS_SH }, () => {
  const dir = fresh('sh-old-node');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'node'), '#!/bin/sh\necho 18\n');
  // Linux skips a PATH entry that is not executable, so the fake node must be executable to be found first.
  chmodSync(join(bin, 'node'), 0o755);
  const installDir = join(dir, 'google-services-mcps');
  const env = envWith({
    GSM_ARCHIVE_URL: archive(),
    GSM_DIR: posix(installDir),
    [PATH_KEY]: [bin, process.env[PATH_KEY]].join(WINDOWS ? ';' : ':'),
  });
  const r = runSh(['install', '--agent', 'codex', '--plugin', 'gmail', '--scope', 'global', '--dry-run'], env);
  assert.equal(r.status, 1, report(r));
  assert.match(r.stderr, /Node\.js 20 or newer is required/);
  assert.match(r.stderr, /https:\/\/nodejs\.org/);
  assert.doesNotMatch(r.stdout + r.stderr, /Downloading/);
  assert.equal(existsSync(installDir), false);
});

test('4c. sh: the download works when the Windows curl comes first on PATH (Git Bash on Windows)', {
  skip: NEEDS_WINDOWS || (existsSync(join(GIT_USR_BIN, 'sh.exe')) && existsSync(join(SYSTEM32, 'curl.exe')) ? false : 'needs Git for Windows and System32 curl.exe'),
}, () => {
  const dir = fresh('sh-win-curl');
  const installDir = join(dir, 'gsm');
  const home = join(dir, 'home');
  mkdirSync(home);
  const tempDir = join(dir, 'tmp');
  mkdirSync(tempDir);
  // System32 first: its curl.exe cannot write to a /tmp path, so install.sh must hand it a Windows path.
  const env = envWith({
    GSM_ARCHIVE_URL: archive(),
    GSM_DIR: posix(installDir),
    TMPDIR: posix(tempDir),
    [PATH_KEY]: [SYSTEM32, GIT_USR_BIN, process.env[PATH_KEY]].join(';'),
  });
  const r = runSh(DRY(posix(home)), env);
  assert.equal(r.status, 0, report(r));
  assert.match(r.stdout, /dry-run/);
  assert.ok(existsSync(join(installDir, 'gsm.mjs')), 'gsm.mjs is in the install folder');
  assert.deepEqual(leftovers(tempDir), [], 'the temp folder is cleaned up');
});

test('5. cmd: the install folder on another drive from %TEMP% (copied across drives, not moved)', {
  skip: NEEDS_WINDOWS || (OTHER_DRIVE ? false : 'needs a second drive'),
}, () => {
  const dir = fresh('cmd-other-drive');
  const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8'));
  const tempDir = fresh('cmd-other-drive-temp');
  const far = mkdtempSync(join(OTHER_DRIVE, 'gsm-boot-'));
  try {
    const installDir = join(far, 'nested', 'google-services-mcps');
    const home = join(dir, 'home');
    mkdirSync(home);
    const env = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir });
    const r = runCmd(script, DRY(home), env);
    assertDryRunInstalled(r, { installDir, home, tempDir });
  } finally {
    rmSync(far, { recursive: true, force: true });
  }
});

// ---- 5. cmd and PowerShell, offline -----------------------------------------------------------------------------------

for (const [label, eol] of [['LF, as the repository and the raw download store it', '\n'], ['CRLF, as a Windows checkout with autocrlf writes it', '\r\n']]) {
  test(`5. cmd (${label}): dry run from install-gsm.cmd, with spaces in the temp folder, install folder and --home`, { skip: NEEDS_WINDOWS }, () => {
    const dir = fresh('cmd-bin with space');
    const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8').replace(/\r?\n/g, eol));
    const tempDir = fresh('temp with space');
    const home = join(fresh('cmd-home'), 'home with space');
    mkdirSync(home, { recursive: true });
    const installDir = join(fresh('cmd-gsm'), 'nested dir', 'google-services-mcps');
    const env = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir });
    const r = runCmd(script, DRY(home), env);
    assertDryRunInstalled(r, { installDir, home, tempDir });
  });
}

test('5. cmd: no arguments prints the usage, exits 0, downloads nothing', { skip: NEEDS_WINDOWS }, () => {
  const dir = fresh('cmd-usage');
  const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8'));
  const installDir = join(dir, 'google-services-mcps');
  const r = runCmd(script, [], envWith({ GSM_ARCHIVE_URL: missingUrl(dir), GSM_DIR: installDir }));
  assert.equal(r.status, 0, report(r));
  assertNoLabelError(r);
  assert.match(r.stdout, /install --agent claude --plugin gmail/);
  assert.match(r.stdout, new RegExp(USAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(existsSync(installDir), false);
});

test('5. cmd: a missing archive exits 1 with a download message and creates no install folder', { skip: NEEDS_WINDOWS }, () => {
  const dir = fresh('cmd-missing');
  const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8'));
  const installDir = join(dir, 'parent', 'google-services-mcps');
  const tempDir = fresh('cmd-missing-temp');
  const r = runCmd(script, DRY(join(dir, 'home')), envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: missingUrl(dir), GSM_DIR: installDir }));
  assert.equal(r.status, 1, report(r));
  assertNoLabelError(r);
  assert.match(r.stderr, /Download failed/);
  assert.equal(existsSync(installDir), false);
  assert.deepEqual(leftovers(tempDir), [], 'the temp folder is cleaned up after the error');
});

test('5. cmd: an archive without gsm.mjs exits 1 and says so; a second run replaces the install folder', { skip: NEEDS_WINDOWS }, () => {
  const dir = fresh('cmd-no-gsm');
  const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8'));
  const installDir = join(dir, 'gsm');
  const tempDir = fresh('cmd-no-gsm-temp');
  const env = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archiveWithoutGsm(), GSM_DIR: installDir });
  const none = runCmd(script, DRY(join(dir, 'home')), env);
  assert.equal(none.status, 1, report(none));
  assertNoLabelError(none);
  assert.match(none.stderr, /does not contain gsm\.mjs/);
  assert.equal(existsSync(installDir), false);
  assert.deepEqual(leftovers(tempDir), []);

  const home = join(dir, 'home');
  mkdirSync(home);
  const env2 = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir });
  const first = runCmd(script, DRY(home), env2);
  assert.equal(first.status, 0, report(first));
  writeFileSync(join(installDir, 'stale.txt'), 'old');
  const second = runCmd(script, DRY(home), env2);
  assert.equal(second.status, 0, report(second));
  assertNoLabelError(second);
  assert.equal(existsSync(join(installDir, 'stale.txt')), false, 'the old folder was replaced');
  assert.equal(readdirSync(dir).some((n) => n.endsWith('.partial')), false, 'no .partial folder is left');
});

test('5. cmd: node older than 20 (or missing) prints where to get Node and exits 1 before any download', { skip: NEEDS_WINDOWS }, () => {
  const dir = fresh('cmd-old-node');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'node.cmd'), '@echo off\r\nexit /b 1\r\n');
  const script = copyScript(dir, 'install-gsm.cmd', readFileSync(CMD, 'utf8'));
  const installDir = join(dir, 'google-services-mcps');
  const env = envWith({ GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir, [PATH_KEY]: [bin, process.env[PATH_KEY]].join(';') });
  const r = runCmd(script, DRY(join(dir, 'home')), env);
  assert.equal(r.status, 1, report(r));
  assertNoLabelError(r);
  assert.match(r.stdout + r.stderr, /https:\/\/nodejs\.org/);
  assert.match(r.stdout + r.stderr, /winget install OpenJS\.NodeJS\.LTS/);
  assert.doesNotMatch(r.stdout + r.stderr, /Downloading/);
  assert.equal(existsSync(installDir), false);
});

for (const [label, exe, available] of [['Windows PowerShell 5.1', 'powershell.exe', HAS_PS51], ['PowerShell 7', 'pwsh.exe', HAS_PS7]]) {
  test(`5. ${label} -File: dry run, with spaces in the temp folder, install folder and --home`, { skip: available ? false : `${exe} not found` }, () => {
    const dir = fresh('ps-bin with space');
    const script = copyScript(dir, 'install-gsm.ps1', readFileSync(PS1, 'utf8'));
    const tempDir = fresh('temp with space');
    const home = join(fresh('ps-home'), 'home with space');
    mkdirSync(home, { recursive: true });
    const installDir = join(fresh('ps-gsm'), 'nested dir', 'google-services-mcps');
    const env = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir });
    const r = runPsFile(exe, script, DRY(home), env);
    assertDryRunInstalled(r, { installDir, home, tempDir });
  });

  test(`5. ${label} -File: no arguments prints the usage, exits 0, downloads nothing`, { skip: available ? false : `${exe} not found` }, () => {
    const dir = fresh('ps-usage');
    const installDir = join(dir, 'google-services-mcps');
    const r = runPsFile(exe, PS1, [], envWith({ GSM_ARCHIVE_URL: missingUrl(dir), GSM_DIR: installDir }));
    assert.equal(r.status, 0, report(r));
    assert.match(r.stdout, new RegExp(USAGE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(existsSync(installDir), false);
  });
}

test('5. PowerShell scriptblock form (the one-liner shape): comma list, node exit code in $LASTEXITCODE', { skip: HAS_PS51 ? false : 'powershell.exe not found' }, () => {
  const dir = fresh('ps-oneliner');
  const tempDir = fresh('temp with space');
  const home = join(fresh('ps-home'), 'home with space');
  mkdirSync(home, { recursive: true });
  const installDir = join(dir, 'google-services-mcps');
  const env = envWith({ TEMP: tempDir, TMP: tempDir, GSM_ARCHIVE_URL: archive(), GSM_DIR: installDir });
  const args = ['install', '--agent', 'codex', '--plugin', 'gmail,gcalendar', '--scope', 'global', '--home', home, '--dry-run'];
  const r = runPsOneLiner('powershell.exe', PS1, args, env);
  assert.equal(r.status, 0, report(r));
  assert.match(r.stdout, /gmail/);
  assert.match(r.stdout, /gcalendar/);
  assert.ok(existsSync(join(installDir, 'gsm.mjs')));
  assert.deepEqual(leftovers(tempDir), []);

  const bad = runPsOneLiner('powershell.exe', PS1, ['install', '--agent', 'codex', '--plugin', 'nosuchproduct', '--home', home, '--dry-run'], envWith({ GSM_ARCHIVE_URL: archive(), GSM_DIR: join(dir, 'second') }));
  assert.notEqual(bad.status, 0, report(bad));
  assert.match(bad.stdout + bad.stderr, /nosuchproduct/);
});

// ---- 13. the real GitHub source (network, opt-in) ------------------------------------------------------------------

test('13. GitHub: the real zip download, its size and HTTP status, and a dry run from the real source (GSM_NETWORK_TESTS=1)', {
  skip: NETWORK ? NEEDS_SH : 'set GSM_NETWORK_TESTS=1 to download from GitHub',
}, (t) => {
  const dir = fresh('github');
  const zip = join(dir, 'real.zip');
  const c = spawnSync('curl', ['-sSL', '-o', zip, '-w', '%{http_code}', CODELOAD_MAIN], { encoding: 'utf8', timeout: 300000 });
  assert.equal(c.status, 0, report(c));
  const size = statSync(zip).size;
  t.diagnostic(`curl HTTP ${c.stdout.trim()}, real.zip ${size} bytes`);
  assert.equal(c.stdout.trim(), '200');
  assert.ok(size > 100000, `real.zip is only ${size} bytes`);

  const home = fresh('github-home');
  const installDir = join(dir, 'gsm');
  // No GSM_ARCHIVE_URL and no GSM_REF: this is the real source.
  const r = runSh(DRY(posix(home)), envWith({ GSM_DIR: posix(installDir) }));
  assert.equal(r.status, 0, report(r));
  assert.match(r.stdout, /gmail/);
  assert.match(r.stdout, /codex/);
  assert.ok(isEmptyDir(home), 'nothing written in the home folder');
});

// ---- 14. npm and npx route -----------------------------------------------------------------------------------------

test('14. npm route: package.json bin gsm points at gsm.mjs, and node gsm.mjs --help runs from another folder', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.bin?.gsm, 'gsm.mjs');
  const r = spawnSync(process.execPath, [ROOT_GSM, '--help'], { cwd: fresh('elsewhere'), env: envWith(), encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, report(r));
  assert.match(r.stdout, /gsm: install the Google services MCP suite/);
});
