// The generated docs match what their generators build from the repository now: the README products block,
// docs/CAPABILITIES.md with docs/capabilities/, and docs/SURFACES.md. Each generator runs in --check mode, which writes
// nothing and exits 1 when its output would change. A stale document fails here instead of shipping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

const GENERATORS = [
  { script: 'scripts/gen-readme.mjs', fix: 'node scripts/gen-readme.mjs' },
  { script: 'scripts/gen-capabilities.mjs', fix: 'node scripts/gen-capabilities.mjs' },
  { script: 'scripts/gen-surfaces.mjs', fix: 'npm run surfaces' },
];

for (const { script, fix } of GENERATORS) {
  test(`${script} --check: the generated docs are current`, (t) => {
    // The generators read the built plugins (tool maps) and the catalog. Without them there is nothing to compare.
    if (!existsSync(join(REPO, 'plugins', 'gmail', 'tool-map.json')) || !existsSync(join(REPO, 'data', 'catalog.json'))) {
      t.skip('the built plugins or data/catalog.json are missing. Run: npm run build');
      return;
    }
    const r = spawnSync(process.execPath, [join(REPO, script), '--check'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(r.status, 0, `${script} --check failed. Regenerate with: ${fix}\n${r.stdout}${r.stderr}`);
  });
}
