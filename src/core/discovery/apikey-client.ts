/**
 * Client for the apikey group: products that take a Google API key instead of an
 * OAuth login. The key goes in the key query parameter of every request. Nothing
 * is logged. The key never appears in an error or in a returned value: every
 * string that leaves this module has the key replaced with [redacted].
 */
import type { RuntimeConfig } from '../config.js';

/** Time allowed for one request, from sending it to reading the whole body. */
const TIMEOUT_MS = 60_000;

export const MISSING_API_KEY_MESSAGE = 'This API needs an API key. Run: gsm setup-apikey';

let fetchOverride: typeof fetch | undefined;

/** Test seam: replaces fetch for the API key client. Pass undefined to restore it. Production code never sets it. */
export function setFetchForTests(fn: typeof fetch | undefined): void {
  fetchOverride = fn;
}

export interface ApiKeyRequestOptions {
  url: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
}

export interface ApiKeyResponse {
  status: number;
  data: unknown;
}

/** Replaces every occurrence of the key in a string, and in every string of a value (keys included). */
function redactKeyIn(value: unknown, key: string): unknown {
  if (typeof value === 'string') return value.split(key).join('[redacted]');
  if (Array.isArray(value)) return value.map((item) => redactKeyIn(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]): [string, unknown] => [redactKeyIn(name, key) as string, redactKeyIn(item, key)]),
    );
  }
  return value;
}

/** The request URL with the query parameters and the key. The key is set last, so no caller value can replace it. */
function withQuery(url: string, params: Record<string, unknown> | undefined, key: string): string {
  const target = new URL(url);
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) target.searchParams.append(name, String(item));
  }
  target.searchParams.set('key', key);
  return target.toString();
}

/** The Google error message from a failed response, with its status word when there is one. Falls back to the text. */
function failureText(status: number, data: unknown, text: string): string {
  const error = (data as { error?: { message?: unknown; status?: unknown } } | null)?.error;
  const message = typeof error?.message === 'string' && error.message !== '' ? error.message : text.replace(/\s+/g, ' ').trim().slice(0, 300);
  const word = typeof error?.status === 'string' && error.status !== '' ? ` (${error.status})` : '';
  return `HTTP ${status}${word}: ${message || 'no error message'}`;
}

export class ApiKeyClient {
  /** Private, so the key is not shown by JSON.stringify or by inspecting the object. */
  readonly #apiKey: string | undefined;

  /** Takes the key from the core config. Construction does not fail without a key: request() does. */
  constructor(cfg: Pick<RuntimeConfig, 'apiKey'>) {
    this.#apiKey = cfg.apiKey;
  }

  /**
   * Sends one request with the key in the query string. Throws when no key is configured.
   * JSON bodies are sent as application/json. A JSON response is parsed; any other response
   * is returned as text. A non-2xx status throws an Error with the status and Google's message.
   */
  async request(options: ApiKeyRequestOptions): Promise<ApiKeyResponse> {
    const key = this.#apiKey;
    if (!key) throw new Error(MISSING_API_KEY_MESSAGE);

    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    let body: string | undefined;
    if (options.data !== undefined) {
      body = JSON.stringify(options.data);
      if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
    }

    const url = withQuery(options.url, options.params, key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    let text: string;
    try {
      res = await (fetchOverride ?? fetch)(url, { method, headers, body, signal: controller.signal });
      text = await res.text();
    } catch (err) {
      const why = controller.signal.aborted
        ? `no answer within ${TIMEOUT_MS / 1000} seconds`
        : err instanceof Error
          ? err.message
          : String(err);
      throw new Error(String(redactKeyIn(`The request ${method} ${options.url} failed: ${why}.`, key)));
    } finally {
      clearTimeout(timer);
    }

    let data: unknown = text;
    if (text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        // Not JSON: the text is returned as it is.
      }
    }

    if (!res.ok) {
      // The status and the redacted body ride on the error, so requestWithRetry (core/http.ts) can read the status.
      const failure = new Error(String(redactKeyIn(failureText(res.status, data, text), key)));
      throw Object.assign(failure, { response: { status: res.status, data: redactKeyIn(data, key) } });
    }
    return { status: res.status, data: redactKeyIn(data, key) };
  }
}
