#!/usr/bin/env node
// Moves the npm package (google-services-mcps) to one new version: package.json and package-lock.json.
//
// Usage: node scripts/bump.mjs patch|minor|major|X.Y.Z
// It writes those two files and nothing else. Commit the bump with the change it ships.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

export function bumpVersion(root, spec) {
  const pkgFile = join(root, 'package.json');
  const lockFile = join(root, 'package-lock.json');
  const pkg = read(pkgFile);
  const next = nextVersion(pkg.version, spec);
  pkg.version = next;
  write(pkgFile, pkg);
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
  console.log(`google-services-mcps moved to ${bumpVersion(root, spec)}`);
}
