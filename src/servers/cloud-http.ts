/**
 * REST calls of the curated gcloud tools whose APIs have no client library in this package (Logging, Monitoring v1,
 * IAM v1, Cloud Billing, Cloud Storage), and of the curated Workspace tools in the same position (gchat.ts: the Chat
 * API). Each call goes through the account's auth client, so the retry rules and the
 * account choice of core/auth.ts apply. A Google error body is rethrown with its HTTP status, reason and message, as
 * describeError (core/tools.ts) reads them, the same way bqCall in cloud.ts does for BigQuery.
 */
import type { JWT, OAuth2Client } from 'google-auth-library';

type Auth = OAuth2Client | JWT;

export interface CloudRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PATCH';
  /** Query parameters; undefined values are left out. */
  query?: Record<string, string | number | boolean | undefined>;
  /** A JSON body (an object), or raw bytes for a media upload (a string, a Buffer or a stream). */
  body?: unknown;
  headers?: Record<string, string>;
  /** arraybuffer for media downloads; JSON otherwise. */
  responseType?: 'json' | 'arraybuffer';
}

export interface CloudResponse<T> {
  data: T;
  status: number;
}

/** A Google API error: the HTTP status, Google's reason and message. */
export class CloudApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly errors: Array<{ reason?: string }> | undefined,
    readonly response: unknown,
  ) {
    super(message);
  }
}

/** The HTTP status of an error from cloudCall or the auth client, when it has one. */
export function statusOf(err: unknown): number | undefined {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } } | null;
  const raw = e?.code ?? e?.response?.status ?? e?.status;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Makes the request function of one server: each call asks getAuth for the client of the call's account. */
export function makeCloudCall(getAuth: () => Promise<Auth>) {
  return async function cloudCall<T>(req: CloudRequest): Promise<CloudResponse<T>> {
    const url = new URL(req.url);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    try {
      const res = await (await getAuth()).request<T>({
        url: url.toString(),
        method: req.method ?? 'GET',
        ...(req.body !== undefined ? { data: req.body } : {}),
        ...(req.headers ? { headers: req.headers } : {}),
        ...(req.responseType === 'arraybuffer' ? { responseType: 'arraybuffer' as const } : {}),
      });
      return { data: res.data, status: res.status };
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown } };
      const data = e?.response?.data;
      // An error body may come as bytes when the request asked for arraybuffer.
      const parsed = typeof data === 'object' && data !== null && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer) ? data : parseJsonBytes(data);
      const apiError = (parsed as { error?: { message?: string; code?: number; errors?: Array<{ reason?: string }> } } | undefined)?.error;
      if (!apiError?.message) throw err;
      throw new CloudApiError(apiError.message, apiError.code ?? e.response?.status, apiError.errors, e.response);
    }
  };
}

export type CloudCall = ReturnType<typeof makeCloudCall>;

function parseJsonBytes(data: unknown): unknown {
  try {
    if (typeof data === 'string') return JSON.parse(data);
    if (data instanceof ArrayBuffer) return JSON.parse(Buffer.from(data).toString('utf8'));
    if (ArrayBuffer.isView(data)) return JSON.parse(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
  } catch {
    // Not JSON: the caller rethrows the original error.
  }
  return undefined;
}

/** Bytes of a media answer, whatever form the HTTP layer gave them in. */
export function bytesOf(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (data === undefined || data === null) return Buffer.alloc(0);
  throw new Error('Google returned no content.');
}
