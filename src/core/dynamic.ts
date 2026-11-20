/**
 * The risk of a dynamic call: a method whose kind depends on its request body, not on its HTTP verb or name.
 *
 * Only the Google Ads mutate methods are dynamic. config/tool-kinds.json maps "googleads.*.mutate" to dynamic.
 * The body decides the risk of each call:
 *   - validateOnly true: read. Google checks the operations and changes nothing, so it is not gated.
 *   - any operation with a remove key, on the operation or on its one resource operation: destructive.
 *   - anything else: write.
 * The operations are in "operations" (the per-resource mutate methods) or in "mutateOperations" (googleAds.mutate).
 * Both lists are checked. A method of any other API returns null, and the caller asks.
 *
 * This is the one place the rule lives. The generated per-method tools, the gateway's api_call, the curated
 * ads_mutate and the PreToolUse hook all call it. The module has no imports, so the hook can load it alone.
 */
export type DynamicRisk = 'read' | 'write' | 'destructive';

const GOOGLE_ADS_PREFIX = 'googleads.';

/** The Discovery method id of googleAds:mutate. Policy rules and the audit log match this id. */
export const GOOGLE_ADS_MUTATE_METHOD = 'googleads.customers.googleAds.mutate';
/** BigQuery's generic query execution method; writes/DDL/DML are escalated to destructive at call time. */
export const BIGQUERY_JOBS_QUERY_METHOD = 'bigquery.jobs.query';
/** Meet spaces.patch; setting config.accessType to OPEN opens a meeting to anyone with the link and escalates to destructive. */
export const MEET_SPACES_PATCH_METHOD = 'meet.spaces.patch';

/** The curated ads_mutate tool's validate_only default: a call that does not say is validate-only, so Google only checks it. */
export const CURATED_VALIDATE_ONLY_DEFAULT = true;

/**
 * The body the rule reads for one call of the curated ads_mutate tool. Its arguments name the flag validate_only,
 * which defaults to CURATED_VALIDATE_ONLY_DEFAULT. The request body names it validateOnly. Only operations and
 * validate_only are read here, so a validateOnly key that the tool's schema strips cannot change the kind of a call.
 * The PreToolUse hook and the curated tool both classify through this function, so they agree.
 */
export function curatedMutateBody(input: { operations?: unknown; validate_only?: unknown }): {
  operations: unknown;
  validateOnly: boolean;
} {
  const validateOnly = input.validate_only === undefined ? CURATED_VALIDATE_ONLY_DEFAULT : input.validate_only === true;
  return { operations: input.operations, validateOnly };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True when the operation has a remove key, either on the operation itself or on its resource operation. */
function hasRemove(op: unknown): boolean {
  if (!isObject(op)) return false;
  if ('remove' in op) return true;
  return Object.values(op).some((inner) => isObject(inner) && 'remove' in inner);
}

/** Risk of a list of mutate operations: destructive when any one of them removes, else write. */
export function operationsRisk(operations: unknown): 'write' | 'destructive' {
  const list = Array.isArray(operations) ? operations : [];
  return list.some(hasRemove) ? 'destructive' : 'write';
}

/**
 * Risk of one call of a dynamic method, from its method id and request body. Returns null for a method of
 * any API other than Google Ads: those have no dynamic rule, so the caller asks.
 */
export function resolveDynamicKind(methodId: string, body: unknown): DynamicRisk | null {
  if (typeof methodId !== 'string' || !methodId.startsWith(GOOGLE_ADS_PREFIX)) return null;
  if (!isObject(body)) return 'write';
  if (body.validateOnly === true) return 'read';
  const risks = [operationsRisk(body.operations), operationsRisk(body.mutateOperations)];
  return risks.includes('destructive') ? 'destructive' : 'write';
}

/**
 * True when a bigquery.jobs.query request body runs DDL/DML/multi-statement or unrecognized SQL (not dryRun: true).
 * Single pure SELECT/WITH/EXPLAIN/SHOW/DESCRIBE queries without mutating SQL keywords stay write; anything else
 * (DROP, DELETE, TRUNCATE, UPDATE, INSERT, MERGE, ALTER, CREATE, multi-statement, or missing query) escalates to destructive.
 */
export function isDestructiveBigQuerySql(body: unknown): boolean {
  if (!isObject(body)) return true;
  if (body.dryRun === true) return false;
  const raw = typeof body.query === 'string' ? body.query : '';
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/'(?:\\.|''|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|""|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .trim();
  if (!stripped) return true;
  const trimmedEnd = stripped.replace(/;+\s*$/, '');
  if (trimmedEnd.includes(';')) return true;
  if (!/^(?:SELECT|WITH|EXPLAIN|SHOW|DESCRIBE)\b/i.test(trimmedEnd)) return true;
  return /\b(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT|MERGE|ALTER|CREATE|REPLACE|GRANT|REVOKE|EXECUTE|CALL|EXPORT|LOAD|RAISE)\b/i.test(
    trimmedEnd,
  );
}

/** True when a meet.spaces.patch request body sets config.accessType to OPEN. */
export function isDestructiveMeetSpacePatch(body: unknown): boolean {
  return (
    isObject(body) &&
    isObject(body.config) &&
    typeof body.config.accessType === 'string' &&
    body.config.accessType.toUpperCase() === 'OPEN'
  );
}
