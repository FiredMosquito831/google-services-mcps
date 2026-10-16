import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpVersion, nextVersion } from '../scripts/bump.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const put = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

test('the package is google-services-mcps, its lockfile is at the same version, and it has the same command name', () => {
  const pkg = read(join(REPO, 'package.json'));
  assert.equal(pkg.name, 'google-services-mcps');
  assert.equal(read(join(REPO, 'package-lock.json')).version, pkg.version);
  assert.equal(pkg.bin['google-services-mcps'], 'gsm.mjs');
  assert.equal(pkg.bin.gsm, 'gsm.mjs');
});

test('nextVersion: patch, minor, major and an explicit newer version; a downgrade or a bad spec is refused', () => {
  assert.equal(nextVersion('0.1.3', 'patch'), '0.1.4');
  assert.equal(nextVersion('0.1.3', 'minor'), '0.2.0');
  assert.equal(nextVersion('0.1.3', 'major'), '1.0.0');
  assert.equal(nextVersion('0.1.3', '0.1.5'), '0.1.5');
  assert.throws(() => nextVersion('0.1.3', '0.1.3'), /not newer/);
  assert.throws(() => nextVersion('0.1.3', 'bogus'), /is not patch, minor, major or X\.Y\.Z/);
});

test('bumpVersion moves package.json and the lockfile, and keeps the rest of package.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsm-bump-'));
  try {
    put(join(dir, 'package.json'), { name: 'google-services-mcps', version: '0.1.3', keep: 'yes' });
    put(join(dir, 'package-lock.json'), { name: 'google-services-mcps', version: '0.1.3', lockfileVersion: 3, packages: { '': { name: 'google-services-mcps', version: '0.1.3' } } });

    assert.equal(bumpVersion(dir, 'patch'), '0.1.4');

    const pkg = read(join(dir, 'package.json'));
    assert.equal(pkg.version, '0.1.4');
    assert.equal(pkg.keep, 'yes');
    const lock = read(join(dir, 'package-lock.json'));
    assert.equal(lock.version, '0.1.4');
    assert.equal(lock.packages[''].version, '0.1.4');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
