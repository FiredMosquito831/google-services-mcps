/**
 * A transport that rewrites an old tool name in tools/call to the tool's name now (2.0.0).
 *
 * 2.0.0 renamed the generated per-method tools. `tools/list` shows only the new names, but a call that still uses an
 * old name must run the same tool for one release (see core/tool-aliases.ts). The MCP SDK resolves a tool by the name
 * in the request, so the rewrite has to happen before it: this wrapper sits between the client's transport and the
 * server, and changes only `params.name` of a `tools/call` request whose name is an alias. Everything else (the
 * answer, the notifications, closing, the session id) passes through untouched, and a name that is not an alias is
 * sent as it is.
 */
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';

/** The shape of a JSON-RPC request with a tools/call name, as far as this file looks. */
interface CallToolRequest {
  method?: unknown;
  params?: { name?: unknown } & Record<string, unknown>;
}

/** Rewrites one incoming message in place when it is a tools/call for an old tool name. */
export function rewriteAliasCall(message: JSONRPCMessage, canonical: (name: string) => string): void {
  const request = message as unknown as CallToolRequest;
  if (request.method !== 'tools/call') return;
  const params = request.params;
  if (params === undefined || params === null || typeof params !== 'object') return;
  const name = params.name;
  if (typeof name !== 'string' || name.length === 0) return;
  const renamed = canonical(name);
  if (renamed !== name) params.name = renamed;
}

/**
 * Wraps a transport so that an old tool name in tools/call is rewritten before the server sees it. The server's
 * callbacks are installed on the wrapper and forwarded to the inner transport, so `connect()` works as it does with
 * the plain transport.
 */
export function aliasTransport(inner: Transport, canonical: (name: string) => string): Transport {
  const wrapper: Transport = {
    start: () => inner.start(),
    send: (message: JSONRPCMessage, options?: TransportSendOptions) => inner.send(message, options),
    close: () => inner.close(),
    get onclose() {
      return inner.onclose;
    },
    set onclose(fn: (() => void) | undefined) {
      inner.onclose = fn;
    },
    get onerror() {
      return inner.onerror;
    },
    set onerror(fn: ((error: Error) => void) | undefined) {
      inner.onerror = fn;
    },
    get onmessage() {
      return inner.onmessage;
    },
    set onmessage(fn: (<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void) | undefined) {
      inner.onmessage = (message, extra) => {
        rewriteAliasCall(message, canonical);
        fn?.(message, extra);
      };
    },
  };
  Object.defineProperty(wrapper, 'sessionId', {
    get: () => inner.sessionId,
    set: (value: string | undefined) => {
      inner.sessionId = value;
    },
    enumerable: true,
  });
  Object.defineProperty(wrapper, 'setProtocolVersion', {
    get: () => inner.setProtocolVersion?.bind(inner),
    enumerable: true,
  });
  return wrapper;
}
