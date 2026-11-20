/**
 * Curated Apps Script tools of the gapps server.
 *
 *   appsscript_get_content  read  projects.getContent with file_name filter, include_source: false index,
 *                                 and offset/max_chars slicing via fitText/fitItems so large projects are not
 *                                 silently truncated with no continuation handle (Q038).
 *
 * Auth: the OAuth user token of the workspace-user group, with script.projects.readonly or script.projects.
 */
import { z } from 'zod';
import type { RuntimeConfig } from '../core/config.js';
import { getAuthClient, googleScopes } from '../core/auth.js';
import { fitItems, fitText } from '../core/result-shape.js';
import { defineTool, type ToolDef } from '../core/tools.js';
import { makeCloudCall } from './cloud-http.js';

const SCRIPT = 'https://script.googleapis.com/v1';
const SCRIPT_READ_SCOPES = googleScopes('script.projects', 'script.projects.readonly');
export const APPS_SCRIPT_CONTENT_MAX_CHARS = 20_000;

interface ScriptFile {
  name?: string;
  type?: string;
  source?: string;
  createTime?: string;
  updateTime?: string;
  functionSet?: { values?: Array<{ name?: string }> };
}

interface ContentResponse {
  scriptId?: string;
  files?: ScriptFile[];
}

function summarizeFile(file: ScriptFile) {
  const source = typeof file.source === 'string' ? file.source : '';
  const functions = (file.functionSet?.values ?? [])
    .map((v) => v.name)
    .filter((n): n is string => typeof n === 'string' && n !== '');
  return {
    name: file.name ?? '',
    type: file.type ?? '',
    source_chars: source.length,
    ...(file.updateTime ? { update_time: file.updateTime } : {}),
    ...(file.createTime ? { create_time: file.createTime } : {}),
    ...(functions.length ? { functions } : {}),
  };
}

export async function buildTools(cfg: RuntimeConfig): Promise<ToolDef[]> {
  const scriptCall = makeCloudCall(() => getAuthClient('workspace-user', cfg));

  return [
    defineTool({
      name: 'appsscript_get_content',
      title: 'Get Apps Script project files',
      description:
        'Read the files of an Apps Script project (HEAD or a specific version_number), with optional file_name filter, include_source=false manifest index, and offset/max_chars character paging so large scripts are never silently cut without continuation. Read every file before calling appsscript_projects_update_content (which clears omitted files).',
      kind: 'read',
      scopes: SCRIPT_READ_SCOPES,
      inputSchema: {
        script_id: z.string().min(1).describe("The script project's Drive ID (from the script editor URL)."),
        version_number: z.number().int().min(1).optional().describe('Version number to read; omit for HEAD.'),
        file_name: z.string().min(1).optional().describe('Return only this file (e.g. "Code" or "appsscript").'),
        include_source: z
          .boolean()
          .optional()
          .describe('Include source code text (default true). Pass false to list file names, types, sizes, times and functions without bodies.'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Character offset into a single file source (use next_offset from the previous answer; pass file_name when the project has multiple files).'),
        max_chars: z
          .number()
          .int()
          .min(1)
          .max(APPS_SCRIPT_CONTENT_MAX_CHARS)
          .optional()
          .describe(`Maximum source characters to return per single-file slice (max ${APPS_SCRIPT_CONTENT_MAX_CHARS}; also capped to fit the server result limit).`),
      },
      async handler({ script_id, version_number, file_name, include_source, offset, max_chars }) {
        const res = await scriptCall<ContentResponse>({
          method: 'GET',
          url: `${SCRIPT}/projects/${encodeURIComponent(script_id)}/content`,
          ...(version_number !== undefined ? { query: { versionNumber: version_number } } : {}),
        });
        const files = Array.isArray(res.data?.files) ? res.data.files : [];
        const allNames = files.map((f) => f.name ?? '');
        const withSource = include_source !== false;

        const targetFile =
          file_name !== undefined
            ? files.find((f) => f.name === file_name)
            : files.length === 1 && (offset !== undefined || max_chars !== undefined)
              ? files[0]
              : undefined;

        if (file_name !== undefined && !targetFile) {
          throw new Error(
            `File "${file_name}" not found in script ${script_id}. Available files: ${allNames.join(', ') || '(none)'}`,
          );
        }

        if (targetFile) {
          const summary = summarizeFile(targetFile);
          if (!withSource) {
            return {
              script_id: res.data?.scriptId ?? script_id,
              ...(version_number !== undefined ? { version_number } : {}),
              total_files: files.length,
              file: summary,
            };
          }
          const source = typeof targetFile.source === 'string' ? targetFile.source : '';
          const start = offset ?? 0;
          if (start > source.length) {
            throw new Error(`offset ${start} is past the end of "${summary.name}" (${source.length} characters).`);
          }
          const cap = max_chars ?? APPS_SCRIPT_CONTENT_MAX_CHARS;
          const room = Math.max(800, cfg.maxResultChars - 1200);
          const chunk = fitText(source.slice(start), cap, room);
          const end = start + chunk.length;
          const more = end < source.length;
          return {
            script_id: res.data?.scriptId ?? script_id,
            ...(version_number !== undefined ? { version_number } : {}),
            total_files: files.length,
            file_names: allNames,
            file: {
              ...summary,
              offset: start,
              chars_read: chunk.length,
              ...(more ? { next_offset: end, truncated: true } : {}),
              source: chunk,
            },
          };
        }

        if (offset !== undefined) {
          throw new Error(
            `offset requires file_name when a script has ${files.length} files (${allNames.join(', ') || 'none'}).`,
          );
        }

        const summaries = files.map(summarizeFile);
        if (!withSource) {
          return fitItems(
            {
              script_id: res.data?.scriptId ?? script_id,
              ...(version_number !== undefined ? { version_number } : {}),
              file_count: files.length,
              files: summaries,
            },
            'files',
            cfg.maxResultChars,
            (shown, total) => ({
              how_to_continue: `Showing ${shown} of ${total} file summaries. Pass file_name to read a specific file.`,
            }),
          );
        }

        const fullFiles = files.map((f, i) => ({
          ...summaries[i]!,
          source: typeof f.source === 'string' ? f.source : '',
        }));
        const fileIndex = summaries.map((s) => ({ name: s.name, type: s.type, source_chars: s.source_chars }));
        return fitItems(
          {
            script_id: res.data?.scriptId ?? script_id,
            ...(version_number !== undefined ? { version_number } : {}),
            file_count: files.length,
            file_index: fileIndex,
            files: fullFiles,
          },
          'files',
          cfg.maxResultChars,
          (shown, total) => ({
            how_to_continue: `Showing ${shown} of ${total} files (see file_index for every file and character count). Call appsscript_get_content with file_name (and offset/max_chars for single large files) or include_source=false.`,
          }),
        );
      },
    }),
  ];
}
