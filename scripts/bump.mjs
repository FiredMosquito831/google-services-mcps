#!/usr/bin/env node
// Moves both npm packages to one new version, so they cannot drift:
//   - the installer, @firedmosquito831/google-services-mcps (package.json and package-lock.json)
//   - the short name, google-services-mcps (packages/google-services-mcps/package.json), and its exact pin on the installer
//
// Usage: node scripts/bump.mjs patch|minor|major|X.Y.Z
// It writes those files and nothing else. Commit the bump with the change it ships.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const INSTALLER = '@firedmosquito831/google-services-mcps';
const SHORT = join('packages', 'google-services-mcps', 'package.json');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function compare(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function nextVersion(current, spec) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`current version "${current}" is not X.Y.Z`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (spec === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (spec === 'minor') return `${major}.${minor + 1}.0`;
  if (spec === 'major') return `${major + 1}.0.0`;
  if (!SEMVER.test(spec)) throw new Error(`"${spec}" is not patch, minor, major or X.Y.Z`);
  if (compare(spec, current) <= 0) throw new Error(`${spec} is not newer than ${current}`);
  return spec;
}

export function bumpVersions(root, spec) {
  const installerFile = join(root, 'package.json');
  const shortFile = join(root, SHORT);
  const lockFile = join(root, 'package-lock.json');
  const installer = read(installerFile);
  const short = read(shortFile);
  if (short.version !== installer.version || short.dependencies?.[INSTALLER] !== installer.version) {
    throw new Error('the two packages are not at the same version before the bump; fix that first');
  }
  const next = nextVersion(installer.version, spec);
  installer.version = next;
  short.version = next;
  short.dependencies[INSTALLER] = next;
  write(installerFile, installer);
  write(shortFile, short);
  if (existsSync(lockFile)) {
    const lock = read(lockFile);
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    write(lockFile, lock);
  }
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const spec = process.argv[2];
  if (!spec) {
    console.error('usage: node scripts/bump.mjs patch|minor|major|X.Y.Z');
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`both packages moved to ${bumpVersions(root, spec)}`);
}
