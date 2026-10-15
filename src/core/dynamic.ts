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
