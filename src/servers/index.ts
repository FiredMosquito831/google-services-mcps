/**
 * The tool list of every server in config/servers.json, built without starting
 * the server. The CLI uses it to size scope profiles. Each curated builder is
 * keyed by the "curated" path in the server map, as the bundler reads it.
 */
import type { RuntimeConfig } from '../core/config.js';
import { discoveryToolsFor, toolNamesOf } from '../core/discovery/tools.js';
import type { ServerSpec } from '../core/registry.js';
import type { ToolDef } from '../core/tools.js';
import { buildTools as buildCloud } from './cloud.js';
import { buildTools as buildGcalendar } from './gcalendar.js';
import { buildTools as buildGdrive } from './gdrive.js';
import { buildTools as buildGmail } from './gmail.js';
import { buildTools as buildSearchConsole } from './searchconsole.js';
import { buildTools as buildWorkspaceAdmin } from './workspace-admin.js';

type Builder = (cfg: RuntimeConfig) => Promise<ToolDef[]> | ToolDef[];

const CURATED: Record<string, Builder> = {
  'src/servers/cloud.ts': buildCloud,
  'src/servers/gmail.ts': buildGmail,
  'src/servers/gdrive.ts': buildGdrive,
  'src/servers/gcalendar.ts': buildGcalendar,
  'src/servers/workspace-admin.ts': buildWorkspaceAdmin,
  'src/servers/searchconsole.ts': buildSearchConsole,
};

/** Curated tools first, then the discovery tools, as the bundled entry registers them. */
export async function buildServerTools(spec: ServerSpec, cfg: RuntimeConfig): Promise<ToolDef[]> {
  const tools: ToolDef[] = [];
  if (spec.curated) {
    const build = CURATED[spec.curated];
    if (!build) throw new Error(`No tool definition for server ${spec.name} at ${spec.curated}`);
    tools.push(...(await build(cfg)));
  }
  // The generated tools take no curated name, the same rule the bundled entry follows.
  if (spec.apis?.length) tools.push(...(await discoveryToolsFor(spec.name, cfg, toolNamesOf(tools))));
  return tools;
}
