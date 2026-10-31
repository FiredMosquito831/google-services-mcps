// Plugin manifests, READMEs and the marketplace listing (1.38.1): every plugin.json names its homepage (the product's
// documentation page), the repository and the Apache-2.0 licence; every plugin folder has a README.md with the install
// line, the sign-in, the options, the update commands and links that exist; every marketplace entry has a category and
// tags. All written by scripts/bundle.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
const products = readJson('config', 'products.json').products;
const plugins = readdirSync(join(ROOT, 'plugins')).sort();
const REPO = 'https://github.com/FiredMosquito831/google-services-mcps';

test('every plugin.json has homepage, repository and license; the homepage is the product page in this repository', () => {
  assert.deepEqual(plugins, Object.keys(products).sort());
  for (const id of plugins) {
    const manifest = readJson('plugins', id, '.claude-plugin', 'plugin.json');
    assert.equal(manifest.homepage, `${REPO}/blob/main/docs/products/${id}.md`, id);
    assert.doesNotThrow(() => new URL(manifest.homepage), `${id}: the homepage parses as a URL (or the plugin fails to load)`);
    assert.ok(existsSync(join(ROOT, 'docs', 'products', `${id}.md`)), `${id}: docs/products/${id}.md exists`);
    assert.equal(manifest.repository, REPO);
    assert.equal(manifest.license, 'Apache-2.0');
  }
});

test('every plugin has a README with the install line, its sign-in, the options, the update commands and links that exist', () => {
  for (const id of plugins) {
    const readme = readFileSync(join(ROOT, 'plugins', id, 'README.md'), 'utf8');
    const group = products[id].group;
    assert.ok(readme.startsWith(`# ${products[id].title} (\`${id}\`)\n\n${products[id].description}\n`), id);
    assert.ok(readme.includes(`claude plugin install ${id}@google-services-mcps`), `${id}: install line`);
    assert.ok(readme.includes('claude plugin marketplace add FiredMosquito831/google-services-mcps'), `${id}: marketplace line`);
    assert.ok(readme.includes(`claude plugin marketplace update google-services-mcps\nclaude plugin update ${id}@google-services-mcps`), `${id}: update lines`);
    const setup = { apikey: 'setup-apikey', 'service-account': 'auth_setup_service_account', 'workspace-admin': 'auth_setup_admin' }[group] ?? 'auth_login';
    assert.ok(readme.includes(setup), `${id}: sign-in names ${setup}`);
    for (const option of ['allow_writes', 'confirmation', 'toolset', 'token_dir']) assert.ok(readme.includes(`\`${option}\``), `${id}: option ${option}`);
    for (const [, rel] of readme.matchAll(/\(https:\/\/github\.com\/FiredMosquito831\/google-services-mcps\/blob\/main\/([^)#]+)\)/g)) {
      assert.ok(existsSync(join(ROOT, rel)), `${id}: ${rel} exists`);
    }
    assert.ok(readme.includes('License: Apache-2.0.'), id);
  }
});

test('every marketplace entry has a category and search tags, from config/plugin-text.json', () => {
  const marketplace = readJson('.claude-plugin', 'marketplace.json');
  const listing = readJson('config', 'plugin-text.json').listing;
  assert.deepEqual(Object.keys(listing).sort(), plugins);
  assert.equal(marketplace.plugins.length, plugins.length);
  for (const entry of marketplace.plugins) {
    assert.equal(entry.category, listing[entry.name].category, entry.name);
    assert.deepEqual(entry.tags, listing[entry.name].tags, entry.name);
    assert.match(entry.category, /^[a-z][a-z-]*$/, entry.name);
    assert.ok(entry.tags.length >= 3 && entry.tags.every((t) => /^[a-z0-9][a-z0-9-]*$/.test(t)), `${entry.name}: tags ${entry.tags}`);
    assert.ok(entry.tags.includes('google'), entry.name);
  }
});
