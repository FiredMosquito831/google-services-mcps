// requestWithRetry: the one retry rule for Google requests. The send function is stubbed, and the waits are recorded
// instead of taken, so the tests run at once. The rule is in src/core/http.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { requestWithRetry, isIdempotentMethod, isRetryable, MAX_ATTEMPTS, MAX_RETRY_AFTER_MS } = await import(
  new URL('../dist/core/http.js', import.meta.url).href
);

/** An error as google-auth-library and gaxios throw it: the HTTP response is on error.response. */
function httpError(status, data = {}, headers = undefined) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data, headers } });
}

const RATE_LIMIT_BODY = { error: { code: 403, errors: [{ reason: 'rateLimitExceeded' }] } };
const QUOTA_BODY = { error: { code: 403, errors: [{ domain: 'usageLimits', reason: 'quotaExceeded' }] } };

/** A send function that answers with each item of `script` in turn: an Error is thrown, anything else is returned. */
function scripted(script) {
  const seen = { calls: 0 };
  const send = async () => {
    const step = script[seen.calls];
    seen.calls += 1;
    if (step === undefined) throw new Error('send called more often than the script allows');
    if (step instanceof Error) throw step;
    return step;
  };
  return { send, seen };
}

/** Options that record each wait and use a fixed jitter of 0.5, so the wait is exactly the base delay times 2^n. */
function recorder(extra = {}) {
  const waits = [];
  const options = { random: () => 0.5, sleep: async (ms) => waits.push(ms), ...extra };
  return { options, waits };
}

test('a 429 is retried, and the success that follows is returned after one wait of 500 ms', async () => {
  const { send, seen } = scripted([httpError(429), { status: 200, data: 'ok' }]);
  const { options, waits } = recorder();
  const res = await requestWithRetry(send, options);
  assert.equal(res.data, 'ok');
  assert.equal(seen.calls, 2);
  assert.deepEqual(waits, [500]);
});

test('a 400 is never retried: the error is thrown at once', async () => {
  const bad = httpError(400, { error: { message: 'bad request' } });
  const { send, seen } = scripted([bad, { status: 200, data: 'never' }]);
  const { options, waits } = recorder();
  await assert.rejects(requestWithRetry(send, options), (err) => err === bad);
  assert.equal(seen.calls, 1);
  assert.deepEqual(waits, []);
});

test('at most three attempts are made, and the last error is the one thrown', async () => {
  const first = httpError(503);
  const second = httpError(503);
  const last = httpError(503);
  const { send, seen } = scripted([first, second, last, { status: 200, data: 'never' }]);
  const { options, waits } = recorder();
  await assert.rejects(requestWithRetry(send, options), (err) => err === last);
  assert.equal(seen.calls, MAX_ATTEMPTS);
  assert.equal(MAX_ATTEMPTS, 3);
  assert.deepEqual(waits, [500, 1000], 'the wait doubles between the attempts');
});

test('a Retry-After header in seconds replaces the backoff, so a 1 second header waits 1000 ms, not 500', async () => {
  const { send, seen } = scripted([httpError(429, {}, { 'retry-after': '1' }), { status: 200, data: 'ok' }]);
  const { options, waits } = recorder();
  const res = await requestWithRetry(send, options);
  assert.equal(res.data, 'ok');
  assert.equal(seen.calls, 2);
  assert.deepEqual(waits, [1000]);
});

test('Retry-After is read from a Headers object too, and a decimal number of seconds is accepted', async () => {
  const { send } = scripted([httpError(503, {}, new Headers({ 'Retry-After': '0.25' })), { status: 200, data: 'ok' }]);
  const { options, waits } = recorder();
  await requestWithRetry(send, options);
  assert.deepEqual(waits, [250]);
});

test('a Retry-After longer than 60 seconds is cut to 60 seconds', async () => {
  assert.equal(MAX_RETRY_AFTER_MS, 60_000);
  const { send } = scripted([httpError(429, {}, { 'retry-after': '3600' }), { status: 200, data: 'ok' }]);
  const { options, waits } = recorder();
  await requestWithRetry(send, options);
  assert.deepEqual(waits, [60_000]);
});

test('a Retry-After that is an HTTP date is ignored, and the backoff applies', async () => {
  const { send } = scripted([httpError(429, {}, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }), { status: 200, data: 'ok' }]);
  const { options, waits } = recorder();
  await requestWithRetry(send, options);
  assert.deepEqual(waits, [500]);
});

test('the jitter moves each wait within 20 percent of its nominal value', async () => {
  const low = recorder({ random: () => 0 });
  await requestWithRetry(scripted([httpError(429), { status: 200, data: 1 }]).send, low.options);
  assert.deepEqual(low.waits, [400], 'the lowest jitter is 80 percent');
  const high = recorder({ random: () => 0.999999 });
  await requestWithRetry(scripted([httpError(429), { status: 200, data: 1 }]).send, high.options);
  assert.equal(high.waits[0], 600, 'the highest jitter is about 120 percent');
});

test('a 403 rate-limit answer is retried for a GET, but only when the body names the reason', async () => {
  for (const body of [RATE_LIMIT_BODY, QUOTA_BODY, JSON.stringify(RATE_LIMIT_BODY)]) {
    const { send, seen } = scripted([httpError(403, body), { status: 200, data: 'ok' }]);
    const { options } = recorder({ idempotent: true });
    await requestWithRetry(send, options);
    assert.equal(seen.calls, 2, `retried for ${JSON.stringify(body)}`);
  }
  const plain = scripted([httpError(403, { error: { errors: [{ reason: 'forbidden' }] } }), { status: 200, data: 'never' }]);
  await assert.rejects(requestWithRetry(plain.send, recorder({ idempotent: true }).options));
  assert.equal(plain.seen.calls, 1, 'a 403 without a rate-limit reason is not retried');
});

test('a 403 rate-limit answer is not retried for a write, so a repeated write is only ever a 429 or 503', async () => {
  const { send, seen } = scripted([httpError(403, RATE_LIMIT_BODY), { status: 200, data: 'never' }]);
  await assert.rejects(requestWithRetry(send, recorder({ idempotent: false }).options));
  assert.equal(seen.calls, 1);
});

test('a write is retried for 429 and 503, and not for 500 or 502', async () => {
  for (const status of [429, 503]) {
    const { send, seen } = scripted([httpError(status), { status: 200, data: 'ok' }]);
    await requestWithRetry(send, recorder({ idempotent: false }).options);
    assert.equal(seen.calls, 2, `${status} is retried for a write`);
  }
  for (const status of [500, 502]) {
    const { send, seen } = scripted([httpError(status), { status: 200, data: 'never' }]);
    await assert.rejects(requestWithRetry(send, recorder({ idempotent: false }).options));
    assert.equal(seen.calls, 1, `${status} is not retried`);
  }
});

test('an answer that resolves with a retryable status is retried too, and the last one is returned when attempts run out', async () => {
  const { send, seen } = scripted([{ status: 429, data: 'slow' }, { status: 429, data: 'slow' }, { status: 429, data: 'still slow' }]);
  const { options, waits } = recorder();
  const res = await requestWithRetry(send, options);
  assert.equal(res.status, 429);
  assert.equal(res.data, 'still slow');
  assert.equal(seen.calls, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test('an error with no HTTP status, such as a network failure, is thrown at once', async () => {
  const network = new Error('socket hang up');
  const { send, seen } = scripted([network, { status: 200, data: 'never' }]);
  await assert.rejects(requestWithRetry(send, recorder().options), (err) => err === network);
  assert.equal(seen.calls, 1);
});

test('the default wait is a real timer, so a small base delay runs without the injected sleep', async () => {
  const { send, seen } = scripted([httpError(429), { status: 200, data: 'ok' }]);
  const res = await requestWithRetry(send, { baseDelayMs: 1, random: () => 0.5 });
  assert.equal(res.data, 'ok');
  assert.equal(seen.calls, 2);
});

test('isRetryable and isIdempotentMethod classify statuses and methods as the rule says', () => {
  assert.equal(isRetryable({ status: 429, data: undefined }, false), true);
  assert.equal(isRetryable({ status: 503, data: undefined }, false), true);
  assert.equal(isRetryable({ status: 400, data: undefined }, true), false);
  assert.equal(isRetryable({ status: 403, data: RATE_LIMIT_BODY }, true), true);
  assert.equal(isRetryable({ status: 403, data: RATE_LIMIT_BODY }, false), false);
  assert.equal(isIdempotentMethod('GET'), true);
  assert.equal(isIdempotentMethod('head'), true);
  assert.equal(isIdempotentMethod('POST'), false);
  assert.equal(isIdempotentMethod('DELETE'), false);
});
