/**
 * Plugin options reach a server as environment variables: the plugin's .mcp.json sets GSM_TOKEN_DIR to
 * "${user_config.token_dir}", and Claude Code substitutes the saved value. An option that was never set must read as
 * unset everywhere: an empty value, and the reference itself if it reaches the process unexpanded (Claude Code leaves
 * an unset ${VAR} in .mcp.json as its literal text, and does not document what an unset ${user_config.KEY} becomes).
 * Without this, the literal "${user_config.token_dir}" would be used as a relative folder name.
 *
 * Kept free of imports, so the hook bundle can use it without the config and auth modules.
 */

/** An unexpanded plugin option reference, such as ${user_config.token_dir}. */
const UNEXPANDED_OPTION = /^\$\{user_config\./;

/** The trimmed value of an option variable, or undefined when it is missing, blank, or an unexpanded ${user_config.*} reference. */
export function optionValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value === '' || UNEXPANDED_OPTION.test(value)) return undefined;
  return value;
}
