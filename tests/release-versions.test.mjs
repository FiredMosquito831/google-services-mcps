import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpVersions, nextVersion } from '../scripts/bump.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = '@firedmosquito831/google-services-mcps';
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const put = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

test('the installer, the short name and the pin between them are at one version', () => {
  const version = read(join(REPO, 'package.json')).version;
  const short = read(join(REPO, 'packages', 'google-services-mcps', 'package.json'));
  assert.equal(short.version, version);
  assert.equal(short.dependencies[INSTALLER], version, 'the short name must pin the installer exactly');
  assert.equal(read(join(REPO, 'package-lock.json')).version, version);
});

test('nextVersion: patch, minor, major and an explicit newer version; a downgrade or a bad spec is refused', () => {
  assert.equal(nextVersion('0.1.3', 'patch'), '0.1.4');
  assert.equal(nextVersion('0.1.3', 'minor'), '0.2.0');
  assert.equal(nextVersion('0.1.3', 'major'), '1.0.0');
  assert.equal(nextVersion('0.1.3', '0.1.5'), '0.1.5');
  assert.throws(() => nextVersion('0.1.3', '0.1.3'), /not newer/);
  assert.throws(() => nextVersion('0.1.3', 'bogus'), /is not patch, minor, major or X\.Y\.Z/);
});

test('bumpVersions moves the installer, the short name, the pin and the lockfile, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-bump-'));
  try {
    mkdirSync(join(dir, 'packages', 'google-services-mcps'), { recursive: true });
    put(join(dir, 'package.json'), { name: INSTALLER, version: '0.1.3', keep: 'yes' });
    put(join(dir, 'package-lock.json'), { name: INSTALLER, version: '0.1.3', lockfileVersion: 3, packages: { '': { name: INSTALLER, version: '0.1.3' } } });
    put(join(dir, 'packages', 'google-services-mcps', 'package.json'), { name: 'google-services-mcps', version: '0.1.3', dependencies: { [INSTALLER]: '0.1.3' } });

    assert.equal(bumpVersions(dir, 'patch'), '0.1.4');

    const installer = read(join(dir, 'package.json'));
    assert.equal(installer.version, '0.1.4');
    assert.equal(installer.keep, 'yes');
    const lock = read(join(dir, 'package-lock.json'));
    assert.equal(lock.version, '0.1.4');
    assert.equal(lock.packages[''].version, '0.1.4');
    const short = read(join(dir, 'packages', 'google-services-mcps', 'package.json'));
    assert.equal(short.version, '0.1.4');
    assert.equal(short.dependencies[INSTALLER], '0.1.4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bumpVersions refuses to run when the two packages are already out of step, and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-bump-'));
  try {
    mkdirSync(join(dir, 'packages', 'google-services-mcps'), { recursive: true });
    put(join(dir, 'package.json'), { name: INSTALLER, version: '0.1.3' });
    put(join(dir, 'packages', 'google-services-mcps', 'package.json'), { name: 'google-services-mcps', version: '0.1.3', dependencies: { [INSTALLER]: '0.1.2' } });

    assert.throws(() => bumpVersions(dir, 'patch'), /not at the same version before the bump/);
    assert.equal(read(join(dir, 'package.json')).version, '0.1.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
