/**
 * The tool list of every server in config/servers.json, built without starting
 * the server. The CLI uses it to size scope profiles. Each curated builder is
 * keyed by the "curated" path in the server map, as the bundler reads it.
 */
import type { RuntimeConfig } from '../core/config.js';
import { discoveryToolsFor, toolNamesOf } from '../core/discovery/tools.js';
import type { ServerSpec } from '../core/registry.js';
import type { ToolDef } from '../core/tools.js';
import { withOrigin } from '../core/toolset.js';
import { buildTools as buildCloud } from './cloud.js';
import { buildTools as buildGads } from './gads.js';
import { buildTools as buildGanalytics } from './ganalytics.js';
import { buildTools as buildGcalendar } from './gcalendar.js';
import { buildTools as buildGchat } from './gchat.js';
import { buildTools as buildGclassroom } from './gclassroom.js';
import { buildTools as buildGcontacts } from './gcontacts.js';
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
  'src/servers/gads.ts': buildGads,
  'src/servers/gchat.ts': buildGchat,
  'src/servers/gcontacts.ts': buildGcontacts,
  'src/servers/gclassroom.ts': buildGclassroom,
  'src/servers/ganalytics.ts': buildGanalytics,
};

/**
 * Curated tools first, then the discovery tools, as the bundled entry registers them. Each tool carries its origin
 * (curated or generated), as in the bundled entry, so the curated toolset can be told apart.
 */
export async function buildServerTools(spec: ServerSpec, cfg: RuntimeConfig): Promise<ToolDef[]> {
  const tools: ToolDef[] = [];
  if (spec.curated) {
    const build = CURATED[spec.curated];
    if (!build) throw new Error(`No tool definition for server ${spec.name} at ${spec.curated}`);
    tools.push(...withOrigin('curated', await build(cfg)));
  }
  // The generated tools take no curated name, the same rule the bundled entry follows.
  if (spec.apis?.length) tools.push(...withOrigin('generated', await discoveryToolsFor(spec.name, cfg, toolNamesOf(tools))));
  return tools;
}
