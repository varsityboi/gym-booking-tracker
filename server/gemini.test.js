import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readPlate, pickMatches, estimateNutrition } from "./gemini.js";
import { analyzeItems } from "./analyze.js";

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
    calls.push({ model: params.model, options, params });
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

// --- pickMatches, estimateNutrition and the /analyze merge -----------------

const json = (value) => ({ output_text: JSON.stringify(value) });
const promptOf = (call) => call.params.input[0].text;

// Rows shaped like searchFoods results.
const food = (id, name, score, full, [cal, protein, fat, carbs]) => ({
  id,
  name,
  score,
  full,
  calories_per_100g: cal,
  protein_per_100g: protein,
  fat_per_100g: fat,
  carbs_per_100g: carbs,
});
const parathas = [
  food(1, "Dal parantha/paratha", 1, 0.533, [260, 8, 10, 35]),
  food(2, "Plain parantha/paratha", 1, 0.5, [298, 6.5, 13.3, 38.6]),
  food(3, "Paneer parantha/paratha", 1, 0.5, [280, 10, 14, 30]),
];
const rotis = [food(10, "Soya roti", 1, 0.5, [250, 15, 5, 35]), food(11, "Chapati/Roti", 1, 0.417, [202.31, 5.88, 3.56, 35.65])];
// Fake searchFoods: paratha and roti are in the table, chutney isn't.
const search = async (name) => ({ Paratha: parathas, Roti: rotis })[name] ?? [];
const asCandidates = (rows) => rows.map(({ id, name }) => ({ id, name }));

test("pickMatches returns the picked ids, and null for 'none'", async () => {
  const { create, calls } = fakeCreate([
    json({ picks: [{ index: 0, foodId: 2 }, { index: 1, foodId: 0 }] }),
  ]);

  const picked = await pickMatches(
    [
      { detected: "Paratha", grams: 90, candidates: asCandidates(parathas) },
      { detected: "Tomato chutney", grams: 20, candidates: asCandidates(rotis) },
    ],
    { create, sleep, now }
  );

  assert.deepEqual(picked, [2, null]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.timeout_ms, 5_000); // 10s text budget, not the photo one
  assert.match(promptOf(calls[0]), /"id":2,"name":"Plain parantha\/paratha"/);
  assert.equal(calls[0].params.input.length, 1, "text only, no image");
});

test("pickMatches turns a foodId that wasn't offered for that item into null", async () => {
  // 11 is a real candidate, but for the second item, not the first.
  const { create } = fakeCreate([
    json({ picks: [{ index: 0, foodId: 11 }, { index: 1, foodId: 11 }] }),
  ]);

  const picked = await pickMatches(
    [
      { detected: "Paratha", grams: 90, candidates: asCandidates(parathas) },
      { detected: "Roti", grams: 40, candidates: asCandidates(rotis) },
    ],
    { create, sleep, now }
  );

  assert.deepEqual(picked, [null, 11]);
});

test("estimateNutrition turns impossible numbers into null", async () => {
  const { create, calls } = fakeCreate([
    json({
      estimates: [
        { index: 0, calories: 40, protein_g: 1, fat_g: 0.5, carbs_g: 8 },
        { index: 1, calories: 1200, protein_g: 5, fat_g: 5, carbs_g: 5 }, // calories > 900
        { index: 2, calories: 500, protein_g: 60, fat_g: 30, carbs_g: 20 }, // macros sum to 110 g
        { index: 3, calories: 100, protein_g: -1, fat_g: 1, carbs_g: 1 }, // negative
      ],
    }),
  ]);

  const estimates = await estimateNutrition(
    [{ name: "Tomato chutney" }, { name: "A" }, { name: "B" }, { name: "C" }, { name: "Not answered" }],
    { create, sleep, now }
  );

  assert.deepEqual(estimates, [
    { calories: 40, protein_g: 1, fat_g: 0.5, carbs_g: 8 },
    null,
    null,
    null,
    null,
  ]);
  assert.equal(calls.length, 1, "one call for all items");
});

test("analyze: AI picks table items, estimates the rest, and adds up totals", async () => {
  const { create, calls } = fakeCreate([
    json({ picks: [{ index: 0, foodId: 2 }] }),
    json({ estimates: [{ index: 0, calories: 40, protein_g: 1, fat_g: 0.5, carbs_g: 8 }] }),
  ]);

  const { items, totals } = await analyzeItems(
    [{ name: "Paratha", grams: 90 }, { name: "Tomato chutney", grams: 35 }],
    { search, gemini: { create, sleep, now } }
  );

  assert.deepEqual(items[0], {
    detected: "Paratha",
    grams: 90,
    source: "ai",
    alternatives: [
      { foodId: 1, name: "Dal parantha/paratha" },
      { foodId: 3, name: "Paneer parantha/paratha" },
    ],
    kind: "table",
    confident: true,
    foodId: 2,
    name: "Plain parantha/paratha",
    per100g: { calories: 298, protein_g: 6.5, fat_g: 13.3, carbs_g: 38.6 },
    nutrition: { calories: 268.2, protein_g: 5.9, fat_g: 12, carbs_g: 34.7 },
    explanation: "Plain parantha/paratha from the nutrition table: 298 kcal per 100g x 90 g = 268.2 kcal",
  });
  assert.equal(items[1].kind, "estimated");
  assert.equal(items[1].confident, false);
  assert.deepEqual(items[1].nutrition, { calories: 14, protein_g: 0.4, fat_g: 0.2, carbs_g: 2.8 });
  assert.equal(
    items[1].explanation,
    "Not in our table. AI estimate: 40 kcal per 100g x 35 g = 14 kcal. You can edit this."
  );
  assert.deepEqual(totals, { calories: 282.2, protein_g: 6.3, fat_g: 12.2, carbs_g: 37.5, unknownCount: 0 });
  // Only the unmatched item is sent for an estimate.
  assert.match(promptOf(calls[1]), /"name":"Tomato chutney"/);
  assert.doesNotMatch(promptOf(calls[1]), /Paratha/);
});

test("analyze: falls back to search ranking when pickMatches throws", async () => {
  const { create } = fakeCreate([
    apiError(400, "invalid_argument"), // pickMatches
    json({ estimates: [{ index: 0, calories: 40, protein_g: 1, fat_g: 0.5, carbs_g: 8 }] }),
  ]);

  const { items, totals } = await analyzeItems(
    [{ name: "Paratha", grams: 90 }, { name: "Tomato chutney", grams: 35 }],
    { search, gemini: { create, sleep, now } }
  );

  // Search's top row, not confident: it's only 0.033 ahead of the next one.
  assert.equal(items[0].source, "search");
  assert.equal(items[0].kind, "table");
  assert.equal(items[0].name, "Dal parantha/paratha");
  assert.equal(items[0].confident, false);
  // No search results, so it still gets an AI estimate.
  assert.equal(items[1].kind, "estimated");
  assert.equal(items[1].source, "search");
  assert.equal(totals.unknownCount, 0);
  assert.ok(warnings.some((w) => /analyze: pickMatches failed, using search ranking/.test(w)));
});

test("analyze: leaves items unknown when estimateNutrition throws", async () => {
  const { create } = fakeCreate([
    json({ picks: [{ index: 0, foodId: 2 }] }),
    apiError(400, "invalid_argument"), // estimateNutrition
  ]);

  const { items, totals } = await analyzeItems(
    [{ name: "Paratha", grams: 90 }, { name: "Tomato chutney", grams: 35 }],
    { search, gemini: { create, sleep, now } }
  );

  assert.equal(items[0].kind, "table");
  assert.deepEqual(items[1], {
    detected: "Tomato chutney",
    grams: 35,
    source: "ai",
    alternatives: [],
    kind: "unknown",
    confident: false,
    foodId: null,
    name: null,
    per100g: null,
    nutrition: null,
    explanation: "We couldn't match or estimate this. Please pick a food or enter it.",
  });
  // Totals cover only the table item.
  assert.deepEqual(totals, { calories: 268.2, protein_g: 5.9, fat_g: 12, carbs_g: 34.7, unknownCount: 1 });
  assert.ok(warnings.some((w) => /analyze: estimateNutrition failed, leaving items unknown/.test(w)));
});
