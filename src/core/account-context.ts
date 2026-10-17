import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The Google account a tool call asked for (its `account` argument), carried through the async calls the handler makes.
 * Token and client code reads it, so a handler does not need to pass the account down. Undefined means the default.
 */
const store = new AsyncLocalStorage<{ account?: string }>();

/** Runs fn with the given account as the one in use. */
export function withAccount<T>(account: string | undefined, fn: () => Promise<T>): Promise<T> {
  return store.run({ account }, fn);
}

/** The account the current call asked for, or undefined for the default account. */
export function requestedAccount(): string | undefined {
  return store.getStore()?.account;
}
