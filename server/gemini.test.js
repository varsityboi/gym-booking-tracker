import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readPlate } from "./gemini.js";

const image = Buffer.from("fake image");
const okInteraction = {
  output_text: JSON.stringify({ items: [{ name: "Boiled rice", grams: 150 }] }),
};

// Shaped like the SDK's APIError subclasses: numeric status plus parsed body.
function apiError(status, code) {
  const err = new Error(`${status} ${code}`);
  err.name = status === 503 ? "InternalServerError" : "BadRequestError";
  err.status = status;
  err.error = { error: { code, message: code } };
  return err;
}

const timeoutError = () =>
  Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });

// Every create call made in the current test, across all fakes.
let allCalls;

// Records every call so tests can check models, options and waits.
// `takesMs` says how far each call moves the fake clock.
function fakeCreate(responses, { takesMs = () => 0 } = {}) {
  const calls = [];
  const create = async (params, options) => {
    calls.push({ model: params.model, options });
    allCalls.push({ model: params.model, options });
    clock += takesMs(options, calls.length);
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { create, calls };
}

// Fake clock: sleep moves it forward instead of really waiting.
let clock;
const now = () => clock;

let sleeps;
const sleep = async (ms) => {
  sleeps.push(ms);
  clock += ms;
};

let warnings;
const originalWarn = console.warn;
beforeEach(() => {
  allCalls = [];
  clock = 0;
  sleeps = [];
  warnings = [];
  console.warn = (msg) => warnings.push(msg);
});
afterEach(() => {
  console.warn = originalWarn;
  // The SDK's built-in retries must be off on every call, or they hide inside
  // one attempt and blow through our time budget.
  assert.ok(allCalls.length > 0, "test made no create calls");
  for (const call of allCalls) {
    assert.deepEqual(call.options.retries, { strategy: "none" }, `retries on ${call.model}`);
  }
});

test("retries a 503 once with backoff, then succeeds", async () => {
  const { create, calls } = fakeCreate([apiError(503, "service_unavailable"), okInteraction]);

  const items = await readPlate(image, "image/jpeg", { create, sleep, now });

  assert.deepEqual(items, [{ name: "Boiled rice", grams: 150 }]);
  assert.deepEqual(
    calls.map((c) => c.model),
    ["gemini-3.6-flash", "gemini-3.6-flash"]
  );
  assert.ok(calls.every((c) => c.options.timeout_ms === 15_000));
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] >= 1000 && sleeps[0] < 1250, `wait ${sleeps[0]}`);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /attempt 1\/3 on gemini-3\.6-flash failed \(service_unavailable\)/);
});

test("two 503s on flash, then flash-lite succeeds", async () => {
  const { create, calls } = fakeCreate([
    apiError(503, "service_unavailable"),
    apiError(503, "service_unavailable"),
    okInteraction,
  ]);

  const items = await readPlate(image, "image/jpeg", { create, sleep, now });

  assert.equal(items.length, 1);
  assert.deepEqual(
    calls.map((c) => c.model),
    ["gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]
  );
  assert.equal(sleeps.length, 1);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /attempt 2\/3 on gemini-3\.6-flash failed \(service_unavailable\)/);
});

test("does not retry a non-retryable error", async () => {
  const badKey = apiError(400, "invalid_argument");
  const { create, calls } = fakeCreate([badKey, okInteraction]);

  await assert.rejects(readPlate(image, "image/jpeg", { create, sleep, now }), badKey);

  assert.equal(calls.length, 1);
  assert.equal(sleeps.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /attempt 1\/3 on gemini-3\.6-flash failed \(invalid_argument\)/);
});

test("rate limit and timeout both count as busy and lead to the fallback", async () => {
  const { create, calls } = fakeCreate([
    Object.assign(apiError(429, "resource_exhausted"), { name: "RateLimitError" }),
    timeoutError(),
    okInteraction,
  ]);

  const items = await readPlate(image, "image/jpeg", { create, sleep, now });

  assert.equal(items.length, 1);
  assert.equal(calls.at(-1).model, "gemini-3.5-flash-lite");
  assert.equal(warnings.length, 2);
});

test("throws the last error when the fallback also fails", async () => {
  const last = apiError(503, "service_unavailable");
  const { create, calls } = fakeCreate([
    apiError(503, "service_unavailable"),
    apiError(503, "service_unavailable"),
    last,
  ]);

  await assert.rejects(readPlate(image, "image/jpeg", { create, sleep, now }), last);
  assert.equal(calls.length, 3);
  assert.equal(warnings.length, 3);
  assert.match(warnings[2], /attempt 3\/3 on gemini-3\.5-flash-lite/);
});

test("every attempt hangs: 2 flash attempts, then flash-lite gets the time left", async (t) => {
  t.mock.method(Math, "random", () => 0); // no jitter, so the timeline is exact
  const last = timeoutError();
  // Every attempt hangs until its own timeout_ms runs out.
  const { create, calls } = fakeCreate([timeoutError(), timeoutError(), last], {
    takesMs: (options) => options.timeout_ms,
  });

  await assert.rejects(readPlate(image, "image/jpeg", { create, sleep, now }), last);

  // 0-15s flash, 1s wait, 16-31s flash (17s of its share left, capped at 15s),
  // 31-45s flash-lite gets the 14s that remain.
  assert.deepEqual(
    calls.map((c) => [c.model, c.options.timeout_ms]),
    [
      ["gemini-3.6-flash", 15_000],
      ["gemini-3.6-flash", 15_000],
      ["gemini-3.5-flash-lite", 14_000],
    ]
  );
  assert.deepEqual(sleeps, [1000]);
  assert.equal(clock, 45_000);
  assert.equal(warnings.length, 3);
});

test("skips the flash retry when only the reserve is left", async (t) => {
  t.mock.method(Math, "random", () => 0);
  // The first call overruns its timeout and takes 30s.
  const { create, calls } = fakeCreate([timeoutError(), okInteraction], {
    takesMs: (options, n) => (n === 1 ? 30_000 : 0),
  });

  const items = await readPlate(image, "image/jpeg", { create, sleep, now });

  // 15s left = only 3s for flash beyond the reserve, so straight to flash-lite, no wait.
  assert.equal(items.length, 1);
  assert.deepEqual(
    calls.map((c) => [c.model, c.options.timeout_ms]),
    [
      ["gemini-3.6-flash", 15_000],
      ["gemini-3.5-flash-lite", 15_000],
    ]
  );
  assert.deepEqual(sleeps, []);
  assert.match(warnings[1], /no time for attempt 2\/3 on gemini-3\.6-flash, skipping/);
});
