/**
 * The environment entries the installers write for each server, and how the CLI reads them back.
 *
 * The servers read GSM_ALLOW_WRITES and GSM_CONFIRMATION from their environment. The config-file
 * adapters (codex, opencode, agy) write them per server. The claude adapter cannot: its values are
 * plugin user options. A key is written only when its flag is given, so without a flag the server default applies.
 *
 * No core import here: the adapters use this module, and they must stay light to load.
 */
import { CONFIRMATION_MODES, type ConfirmationMode } from './types.js';

/** The default the servers use when GSM_CONFIRMATION is unset. Shown by status. */
export const CONFIRMATION_DEFAULT: ConfirmationMode = 'every-change';

/** Environment pairs in the order they are written. */
export type EnvPairs = Array<[string, string]>;

/** The env entries for one server. Nothing is written for a flag that was not given. */
export function serverEnvironment(allowWrites: boolean, confirmation: ConfirmationMode | undefined): EnvPairs {
  const pairs: EnvPairs = [];
  if (allowWrites) pairs.push(['GSM_ALLOW_WRITES', 'true']);
  if (confirmation !== undefined) pairs.push(['GSM_CONFIRMATION', confirmation]);
  return pairs;
}

export function envObject(pairs: EnvPairs): Record<string, string> {
  return Object.fromEntries(pairs);
}

export interface ConfirmationStatus {
  /** The mode in effect: the value in the environment, or the default. */
  mode: string;
  /** True when GSM_CONFIRMATION is set in the environment. */
  set: boolean;
  /** False when the environment holds a value the servers do not know. */
  known: boolean;
}

export function confirmationStatus(env: NodeJS.ProcessEnv): ConfirmationStatus {
  const raw = (env.GSM_CONFIRMATION ?? '').trim();
  if (raw === '') return { mode: CONFIRMATION_DEFAULT, set: false, known: true };
  return { mode: raw, set: true, known: (CONFIRMATION_MODES as readonly string[]).includes(raw) };
}

/** True only for the exact value 'true', the same rule as core/config.ts. */
export function writesEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.GSM_ALLOW_WRITES === 'true';
}
