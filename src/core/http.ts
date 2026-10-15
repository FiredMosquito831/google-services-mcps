/**
 * The one retry rule for Google API requests. Where it runs:
 *   - OAuth, service account and ADC clients: core/auth.ts wraps each client's request method with requestWithRetry,
 *     so every request sent through one of them is covered. That includes the generated googleapis clients (their
 *     requests go through the auth client) and the curated tools that call request directly.
 *   - The API key client: core/discovery/tools.ts sendAuthorized calls requestWithRetry directly.
 *
 * A request is repeated only when Google says it was throttled or unavailable, which means it was not processed:
 *   - HTTP 429 and 503, for any method. A repeated write is safe for these.
 *   - HTTP 403 whose error body gives the reason rateLimitExceeded, userRateLimitExceeded or quotaExceeded. This
 *     is repeated only for an idempotent request (GET, HEAD, OPTIONS), so a write is never repeated for a 403.
 * Every other status, and every error without an HTTP status (network, timeout, a bad request), is thrown at once.
 *
 * At most MAX_ATTEMPTS attempts are made, in all. The wait before a retry starts at 500 ms, doubles each time and
 * has jitter. A Retry-After header in seconds replaces that wait, up to MAX_RETRY_AFTER_MS. The last answer or error
 * is what the caller gets when the attempts run out.
 */

/** The shape of an answer: a status, the parsed body, and optionally the response headers. */
export interface HttpResult {
  status: number;
  data: unknown;
  headers?: unknown;
}

export interface RetryOptions {
  /** True for GET, HEAD or OPTIONS. Only an idempotent request repeats a 403 rate-limit answer. Default false. */
  idempotent?: boolean;
  /** Attempts in all, including the first. Default MAX_ATTEMPTS. */
  maxAttempts?: number;
  /** The wait before the first retry, in milliseconds. Default BASE_DELAY_MS. */
  baseDelayMs?: number;
  /** A number in [0, 1) for the jitter. Default Math.random. Tests fix it. */
  random?: () => number;
  /** Waits this many milliseconds. Default is a timer. Tests replace it to avoid real waits. */
  sleep?: (ms: number) => Promise<void>;
}

export const MAX_ATTEMPTS = 3;
export const BASE_DELAY_MS = 500;
/** The longest wait a Retry-After header can ask for. A longer one is cut to this. */
export const MAX_RETRY_AFTER_MS = 60_000;

const RATE_LIMIT_REASONS: ReadonlySet<string> = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for GET, HEAD and OPTIONS. Any other method (POST, PUT, PATCH, DELETE) may change data. */
export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

interface Failure {
  status: number;
  data: unknown;
  headers?: unknown;
}

/** The HTTP status and body of a thrown error, from the response its library attached. Null for any other error. */
function failureOf(err: unknown): Failure | null {
  if (typeof err !== 'object' || err === null) return null;
  const response = (err as { response?: { status?: unknown; data?: unknown; headers?: unknown } }).response;
  if (!response || typeof response.status !== 'number') return null;
  return { status: response.status, data: response.data, headers: response.headers };
}

/** The reasons in a Google error body, such as rateLimitExceeded. A string body is parsed first. */
function reasonsOf(data: unknown): string[] {
  let body = data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return [];
    }
  }
  const errors = (body as { error?: { errors?: unknown } } | null | undefined)?.error?.errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((e) => (e as { reason?: unknown } | null)?.reason)
    .filter((reason): reason is string => typeof reason === 'string');
}

/** Whether this answer is one the request may be repeated for. */
export function isRetryable(failure: { status: number; data: unknown }, idempotent: boolean): boolean {
  if (failure.status === 429 || failure.status === 503) return true;
  return idempotent && failure.status === 403 && reasonsOf(failure.data).some((reason) => RATE_LIMIT_REASONS.has(reason));
}

/** One header value by name, for a Headers object or a plain object with any case of the name. */
function headerOf(headers: unknown, name: string): string | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined;
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = (getter as (key: string) => unknown).call(headers, name);
    return typeof value === 'string' ? value : undefined;
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== name) continue;
    const first = Array.isArray(value) ? value[0] : value;
    return first === undefined || first === null ? undefined : String(first);
  }
  return undefined;
}

/** Retry-After in milliseconds, when it is a number of seconds. An HTTP date is not used, so the backoff applies. */
function retryAfterMs(headers: unknown): number | undefined {
  const raw = headerOf(headers, 'retry-after')?.trim();
  if (raw === undefined || !/^\d+(\.\d+)?$/.test(raw)) return undefined;
  return Math.min(Math.round(Number(raw) * 1000), MAX_RETRY_AFTER_MS);
}

/** The wait before the retry after attempt number `attempt` (1 for the first try). */
export function delayBefore(attempt: number, failure: { headers?: unknown }, options: RetryOptions = {}): number {
  const fromHeader = retryAfterMs(failure.headers);
  if (fromHeader !== undefined) return fromHeader;
  const nominal = (options.baseDelayMs ?? BASE_DELAY_MS) * 2 ** (attempt - 1);
  const jitter = 0.8 + 0.4 * (options.random ?? Math.random)();
  return Math.round(nominal * jitter);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs send and repeats it under the rule above. send is called once per attempt. If it resolves with a retryable
 * status, that answer is returned once the attempts are used up. If it throws a retryable error, that error is thrown
 * once the attempts are used up. Any other outcome is returned or thrown at once.
 */
export async function requestWithRetry<T extends HttpResult>(send: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
  const idempotent = options.idempotent === true;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt += 1) {
    let failure: Failure;
    try {
      const res = await send();
      if (!isRetryable(res, idempotent) || attempt >= attempts) return res;
      failure = { status: res.status, data: res.data, headers: res.headers };
    } catch (err) {
      const found = failureOf(err);
      if (found === null || !isRetryable(found, idempotent) || attempt >= attempts) throw err;
      failure = found;
    }
    await sleep(delayBefore(attempt, failure, options));
  }
}
