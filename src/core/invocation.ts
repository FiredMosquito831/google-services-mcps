import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The words the suite prints for its own command. The text is written as "node gsm.mjs", and the printed output
 * replaces that with the command that works for the route the program was started by (see invocationFor).
 */
const DEFAULT_PREFIX = 'node gsm.mjs';
export const NPM_PACKAGE = '@firedmosquito831/google-services-mcps';

let prefix = DEFAULT_PREFIX;

/** Sets the command to print. Called once when the program starts. */
export function setInvocation(text: string): void {
  prefix = text;
}

/** The command to print for this program, for example "npx @firedmosquito831/google-services-mcps". */
export function invocation(): string {
  return prefix;
}

/** Replaces every "node gsm.mjs" in a printed line with the command for this route. Other text is unchanged. */
export function invocationText(text: string): string {
  return prefix === DEFAULT_PREFIX ? text : text.split(DEFAULT_PREFIX).join(prefix);
}

/**
 * The gsm.mjs file that a command runs. A server bundle lives in <plugin>/servers/, and its CLI is <plugin>/bin/gsm.mjs.
 * The compiled CLI (dist/cli/gsm.js, used in development and by the tests) runs the repository's gsm.mjs.
 * Anything else (the repository's gsm.mjs, the npm package's gsm.mjs, a plugin's bin/gsm.mjs) is the file itself.
 */
export function gsmFileFor(moduleFile: string): string {
  const dir = dirname(moduleFile);
  if (basename(dir) === 'servers') return join(dirname(dir), 'bin', 'gsm.mjs');
  if (basename(dir) === 'cli' && basename(dirname(dir)) === 'dist') return join(dirname(dirname(dir)), 'gsm.mjs');
  return moduleFile;
}

/**
 * The command to print for a program that runs from moduleUrl, while the user is in folder cwd:
 *  - an npm package (its files are under node_modules/@firedmosquito831/google-services-mcps): "npx <package>"
 *  - the folder that holds gsm.mjs, when that is the current folder: "node gsm.mjs"
 *  - anywhere else: "node <full path to gsm.mjs>", quoted, so it works from any folder
 */
export function invocationFor(moduleUrl: string, cwd: string): string {
  const file = gsmFileFor(fileURLToPath(moduleUrl));
  if (file.split(sep).join('/').includes(`/node_modules/${NPM_PACKAGE}/`)) return `npx ${NPM_PACKAGE}`;
  return resolve(cwd) === dirname(file) ? DEFAULT_PREFIX : `node "${file}"`;
}
