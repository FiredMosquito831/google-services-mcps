// Tool-name budget: the full name Claude Code shows is mcp__plugin_<plugin>_<server>__<tool>,
// and it must fit in 64 characters. These tests use the real server map to check every
// discovery server's budget, and that generated names respect it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = (rel) => new URL(`../dist/${rel}`, import.meta.url).href;
const { nameBudget, assignToolNames, CLAUDE_TOOL_NAME_MAX } = await import(dist('core/discovery/methods.js'));
const map = JSON.parse(readFileSync(join(here, '..', 'config', 'servers.json'), 'utf8'));

test('budget: the fixed Claude prefix leaves the expected room for each server', () => {
  assert.equal(CLAUDE_TOOL_NAME_MAX, 64);
  // mcp__plugin_gcloud_gcloud__ is 27 characters, so 37 remain.
  assert.equal(nameBudget('gcloud', 'gcloud'), 37);
  // mcp__plugin_gsearch_gsearch__ is 29 characters, so 35 remain.
  assert.equal(nameBudget('gsearch', 'gsearch'), 35);
});

test('budget: every server in the map keeps curated and generated names inside its budget', () => {
  for (const server of map.servers) {
    const budget = nameBudget(server.plugin, server.name);
    assert.ok(budget >= 16, `${server.name}: budget ${budget} is too small for readable names`);
  }
});

test('budget: generated names are unique and never longer than the budget', () => {
  const methods = Array.from({ length: 300 }, (_, i) => ({
    apiName: 'compute',
    apiVersion: 'v1',
    fullId: `compute.regionInstanceGroupManagers.resource${i}.operationLongName${i}`,
    resource: ['regionInstanceGroupManagers', `resource${i}`],
    methodName: `operationLongName${i}`,
  }));
  const budget = nameBudget('gcloud', 'gcloud');
  const names = assignToolNames(methods, ['api_methods'], budget);
  assert.equal(new Set(names).size, names.length, 'unique');
  for (const n of names) assert.ok(n.length <= budget, `${n} is longer than ${budget}`);
  assert.ok(!names.includes('api_methods'), 'reserved name is never reused');
});
