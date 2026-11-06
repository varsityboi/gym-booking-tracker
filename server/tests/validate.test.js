// The validate middleware's error body: the first issue's message, plus the
// item's index for POST /meals when the problem is inside one item. No
// database or AI calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, createMealSchema } from "../middleware/validate.js";

const ONION = { name: "Sliced onion", grams: 30, caloriesPer100g: 40, proteinPer100g: 1.1, fatPer100g: 0.1, carbsPer100g: 9 };

// Runs the middleware on a body: { status, body } on a 400, or { next: true }.
function run(middleware, reqBody) {
  let out = null;
  const res = {
    status(code) {
      out = { status: code };
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    },
  };
  const req = { body: reqBody };
  middleware(req, res, () => {
    out = { next: true, body: req.body };
  });
  return out;
}

const mealValidator = validate(createMealSchema, { itemIndex: true });

test("POST /meals body: an error inside an item gives its index", () => {
  const cases = [
    [[{ foodId: 1, grams: 100 }, { ...ONION, grams: 0 }], { error: "grams must be more than 0", itemIndex: 1 }],
    [[{ foodId: "x", grams: 100 }], { error: "invalid foodId", itemIndex: 0 }],
    [[ONION, ONION, { ...ONION, name: " " }], { error: "name is required", itemIndex: 2 }],
    [
      [{ foodId: 1, grams: 100 }, { ...ONION, proteinPer100g: 60, fatPer100g: 50 }],
      { error: "protein + fat + carbs can't be more than 100 g per 100 g", itemIndex: 1 },
    ],
    [[{ foodId: 1, grams: 100 }, 5], { error: "Invalid input: expected object, received number", itemIndex: 1 }],
  ];
  for (const [items, expected] of cases) {
    assert.deepEqual(run(mealValidator, { items }), { status: 400, body: expected }, JSON.stringify(items));
  }
});

test("POST /meals body: errors not about one item have no itemIndex", () => {
  assert.deepEqual(run(mealValidator, { items: [] }), { status: 400, body: { error: "a meal needs at least one food" } });
  assert.deepEqual(run(mealValidator, {}), {
    status: 400,
    body: { error: "Invalid input: expected array, received undefined" },
  });
  assert.deepEqual(run(mealValidator, { items: [{ foodId: 1, grams: 100 }], eatenAt: "nope" }), {
    status: 400,
    body: { error: "eatenAt must be a valid date" },
  });
});

test("a valid body goes on, parsed", () => {
  const out = run(mealValidator, { items: [{ foodId: 1, grams: 100 }, ONION] });
  assert.equal(out.next, true);
  assert.deepEqual(out.body.items.map((i) => i.kind), ["table", "estimated"]);
});

test("without the option, item errors have no itemIndex", () => {
  const out = run(validate(createMealSchema), { items: [{ ...ONION, grams: 0 }] });
  assert.deepEqual(out, { status: 400, body: { error: "grams must be more than 0" } });
});
