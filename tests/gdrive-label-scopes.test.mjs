// GD2: the generated Drive Labels write that Discovery leaves unscoped gets its scopes from
// the gdrive product declaration, so it no longer registers before a workspace-user login.
// Built from local config and tool maps only; no Google call is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (p) => new URL(`../dist/${p}`, import.meta.url).href;
const readJson = (...parts) => JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
const { loadConfig } = await import(dist('core/config.js'));
const { loadRegistry, serverByName } = await import(dist('core/registry.js'));
const { buildServerTools } = await import(dist('servers/index.js'));
const { isGranted } = await import(dist('core/tools.js'));

const METHOD = 'drivelabels.labels.updateLabelEnabledAppSettings';
const TOOL = 'mcp__plugin_gdrive_gdrive__dri_update_label_enabled_app_settings';
const LABELS = [
  'https://www.googleapis.com/auth/drive.labels',
  'https://www.googleapis.com/auth/drive.admin.labels',
];

test('gdrive drivelabels: declared scopes, built tool map, and pre-login registration', async () => {
  const server = readJson('config', 'servers.json').servers.find((s) => s.name === 'gdrive');
  assert.deepEqual(server.scopeOverrides.drivelabels, LABELS);

  const map = readJson('plugins', 'gdrive', 'tool-map.json');
  const entry = map.find((t) => t.methodId === METHOD);
  assert.deepEqual(
    { name: entry.name, kind: entry.kind, scopes: entry.scopes },
    { name: TOOL, kind: 'write', scopes: LABELS },
  );
  const siblings = map.filter((t) => t.methodId?.startsWith('drivelabels.') && t.methodId !== METHOD);
  assert.equal(siblings.length, 25, 'the other 25 drivelabels entries are unchanged');
  for (const sibling of siblings) {
    assert.ok(sibling.scopes.length > 0, sibling.methodId);
    for (const scope of LABELS) assert.ok(sibling.scopes.includes(scope), `${sibling.methodId}: ${scope}`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'gsm-gd2-'));
  try {
    const cfg = loadConfig({ GSM_TOKEN_DIR: dir, GSM_ALLOW_WRITES: 'true' });
    assert.equal(cfg.allowWrites, true);
    const spec = serverByName(loadRegistry(dist('core/registry.js')), 'gdrive');
    const tool = (await buildServerTools(spec, cfg)).find((t) => t.methodId === METHOD);
    assert.ok(tool, METHOD);
    assert.deepEqual(tool.scopes, LABELS);
    // The same isGranted + writes-enabled filter the server applies before login.
    assert.equal(isGranted(tool, []), false, 'no tool registration without a Labels grant');
    assert.equal(isGranted(tool, [LABELS[0]]), true, 'drive.labels registers it');
    assert.equal(isGranted(tool, [LABELS[1]]), true, 'drive.admin.labels registers it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
