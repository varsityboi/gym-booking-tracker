// Meal history and versioned edit tests against the real database, through
// the real meals and me routers over HTTP. No AI calls (analyze isn't hit).
// meal_item_events is append-only and refers to the meals, items and users,
// so those stay: users are named "zz meal-history-test ..." with login
// disabled, and their meals are moved to 2000-01-01.
//
// Opt-in: these tests write to the database, so they only run with
// DB_TESTS=1 (npm run test:db, which also loads .env). Otherwise the suite is
// skipped and nothing database-related is even imported.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const RUN_DB_TESTS = process.env.DB_TESTS === "1";
const SKIP_MESSAGE =
  "writes to the real database; run with DB_TESTS=1 (npm run test:db) to include it";

let express, jwt, pool, mealsRouter, meRouter;
if (RUN_DB_TESTS) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("DB_TESTS=1 needs DATABASE_URL and JWT_SECRET (npm run test:db loads .env)");
  }
  ({ default: express } = await import("express"));
  ({ default: jwt } = await import("jsonwebtoken"));
  ({ default: pool } = await import("../config/db.js"));
  ({ default: mealsRouter } = await import("../routes/meals.js"));
  ({ default: meRouter } = await import("../routes/me.js"));
}

const stamp = Date.now();
const round1 = (n) => Math.round(n * 10) / 10;
let server;
let base;
let alice;
let bob;
let foods; // two table foods: [{ id, name, cal, protein, fat, carbs }]
let mealId;
let tableItemId; // starts as foods[0], 100 g
let estimateItemId; // starts as an estimate, 50 g
let bobMealId;

async function makeUser(name) {
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, '!') RETURNING id",
    [`zz meal-history-test ${stamp} ${name}`, `zz-meal-${stamp}-${name.toLowerCase()}@example.test`]
  );
  const id = rows[0].id;
  return { id, token: jwt.sign({ id, role: "member" }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
}

async function api(method, path, user, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const todaysMeal = async () => (await api("GET", "/meals", alice)).body.meals.find((m) => m.id === mealId);
const itemPath = (itemId, meal = mealId) => `/meals/${meal}/items/${itemId}`;
const ONION = { name: "Sliced onion", caloriesPer100g: 40, proteinPer100g: 1.1, fatPer100g: 0.1, carbsPer100g: 9 };

describe("meal history and versioned edits (real database)", { skip: RUN_DB_TESTS ? false : SKIP_MESSAGE }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/meals", mealsRouter);
    app.use("/me", meRouter);
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: "something went wrong" });
    });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;

    alice = await makeUser("Alice");
    bob = await makeUser("Bob");
    const { rows } = await pool.query(
      `SELECT id, name, calories_per_100g AS cal, protein_per_100g AS protein,
              fat_per_100g AS fat, carbs_per_100g AS carbs
       FROM foods ORDER BY id LIMIT 2`
    );
    foods = rows;
  });

  after(async () => {
    server?.close();
    const ids = [alice, bob].filter(Boolean).map((u) => u.id);
    await pool.query("UPDATE meals SET eaten_at = '2000-01-01' WHERE user_id = ANY($1)", [ids]);
    await pool.end();
  });

  test("POST /meals, then GET /meals lists the day with ids, versions, nutrition and totals", async () => {
    const created = await api("POST", "/meals", alice, {
      items: [{ foodId: foods[0].id, grams: 100 }, { ...ONION, grams: 50 }],
    });
    assert.equal(created.status, 201);
    mealId = created.body.mealId;

    const day = await api("GET", "/meals", alice);
    assert.equal(day.status, 200);
    assert.match(day.body.date, /^\d{4}-\d{2}-\d{2}$/);
    const meal = day.body.meals.find((m) => m.id === mealId);
    assert.equal(meal.items.length, 2);
    const [t, e] = meal.items;
    tableItemId = t.id;
    estimateItemId = e.id;

    assert.deepEqual(t, {
      id: t.id,
      version: 1,
      kind: "table",
      foodId: foods[0].id,
      name: foods[0].name,
      grams: 100,
      nutrition: {
        calories: round1(foods[0].cal),
        protein_g: round1(foods[0].protein),
        fat_g: round1(foods[0].fat),
        carbs_g: round1(foods[0].carbs),
      },
    });
    assert.deepEqual(e, {
      id: e.id,
      version: 1,
      kind: "estimated",
      foodId: null,
      name: "Sliced onion",
      grams: 50,
      nutrition: { calories: 20, protein_g: 0.6, fat_g: 0.1, carbs_g: 4.5 },
    });
    assert.equal(meal.totals.calories, round1(foods[0].cal + 20));
    // Alice has only this meal today, so the day totals equal the meal's.
    assert.deepEqual(day.body.totals, meal.totals);

    // Same date given explicitly; another date is empty; a bad date is 400.
    const same = await api("GET", `/meals?date=${day.body.date}`, alice);
    assert.ok(same.body.meals.some((m) => m.id === mealId));
    const empty = await api("GET", "/meals?date=2001-01-01", alice);
    assert.deepEqual(empty.body, {
      date: "2001-01-01",
      meals: [],
      totals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    });
    const bad = await api("GET", "/meals?date=2026-02-30", alice);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "date must be a real date");
  });

  test("editing grams returns the new nutrition and version", async () => {
    const res = await api("PATCH", itemPath(tableItemId), alice, { version: 1, grams: 200 });
    assert.equal(res.status, 200);
    assert.equal(res.body.version, 2);
    assert.equal(res.body.grams, 200);
    assert.equal(res.body.nutrition.calories, round1(foods[0].cal * 2));
    assert.equal((await todaysMeal()).items.find((i) => i.id === tableItemId).version, 2);
  });

  test("switching to an estimate and back to a table food", async () => {
    const toEstimate = await api("PATCH", itemPath(tableItemId), alice, {
      version: 2,
      name: "Homemade paratha",
      caloriesPer100g: 300,
      proteinPer100g: 6,
      fatPer100g: 14,
      carbsPer100g: 38,
    });
    assert.equal(toEstimate.status, 200);
    assert.equal(toEstimate.body.kind, "estimated");
    assert.equal(toEstimate.body.foodId, null);
    assert.equal(toEstimate.body.name, "Homemade paratha");
    assert.equal(toEstimate.body.version, 3);
    assert.equal(toEstimate.body.nutrition.calories, 600); // 200 g kept

    const toTable = await api("PATCH", itemPath(tableItemId), alice, {
      version: 3,
      foodId: foods[1].id,
      grams: 100,
    });
    assert.equal(toTable.status, 200);
    assert.equal(toTable.body.kind, "table");
    assert.equal(toTable.body.foodId, foods[1].id);
    assert.equal(toTable.body.name, foods[1].name);
    assert.equal(toTable.body.version, 4);
    assert.equal(toTable.body.nutrition.calories, round1(foods[1].cal));

    // The stored row has no estimate columns left over.
    const { rows } = await pool.query(
      "SELECT custom_name, est_calories_per_100g FROM meal_items WHERE id = $1",
      [tableItemId]
    );
    assert.deepEqual(rows[0], { custom_name: null, est_calories_per_100g: null });
  });

  test("bad edit bodies: 400; unknown food: 400", async () => {
    const both = await api("PATCH", itemPath(tableItemId), alice, { version: 4, foodId: foods[0].id, ...ONION });
    assert.equal(both.status, 400);
    assert.equal(both.body.error, "send either foodId or an estimate, not both");
    const nothing = await api("PATCH", itemPath(tableItemId), alice, { version: 4 });
    assert.equal(nothing.status, 400);
    const unknown = await api("PATCH", itemPath(tableItemId), alice, { version: 4, foodId: 999999999 });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, "food does not exist");
  });

  test("a stale version: 409", async () => {
    const res = await api("PATCH", itemPath(tableItemId), alice, { version: 1, grams: 50 });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "this item changed, reload it");
  });

  test("two edits at the same moment with the same version: one 200, one 409", async () => {
    const [a, b] = await Promise.all([
      api("PATCH", itemPath(estimateItemId), alice, { version: 1, grams: 60 }),
      api("PATCH", itemPath(estimateItemId), alice, { version: 1, grams: 70 }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const winner = a.status === 200 ? a : b;
    const item = (await todaysMeal()).items.find((i) => i.id === estimateItemId);
    assert.equal(item.version, 2);
    assert.equal(item.grams, winner.body.grams);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM meal_item_events WHERE meal_item_id = $1 AND action = 'edited'",
      [estimateItemId]
    );
    assert.equal(rows[0].n, 1, "only the winning edit is recorded");
  });

  test("adding an item to her meal: 201 with a created event", async () => {
    const res = await api("POST", `/meals/${mealId}/items`, alice, { ...ONION, name: "Raita", grams: 100 });
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, "estimated");
    assert.equal(res.body.version, 1);
    assert.equal((await todaysMeal()).items.length, 3);
  });

  test("deleting an item: stale 409, then 200, then totals drop and it's gone", async () => {
    const before = await todaysMeal();
    const item = before.items.find((i) => i.id === estimateItemId);
    const todayBefore = (await api("GET", "/me/today", alice)).body.totals;

    const stale = await api("DELETE", itemPath(estimateItemId), alice, { version: 1 });
    assert.equal(stale.status, 409);

    const res = await api("DELETE", itemPath(estimateItemId), alice, { version: item.version });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, estimateItemId);
    assert.equal(res.body.version, item.version + 1);
    assert.ok(res.body.deleted_at);

    const after = await todaysMeal();
    assert.ok(!after.items.some((i) => i.id === estimateItemId));
    assert.equal(after.totals.calories, round1(before.totals.calories - item.nutrition.calories));
    const todayAfter = (await api("GET", "/me/today", alice)).body.totals;
    assert.equal(todayAfter.calories, round1(todayBefore.calories - item.nutrition.calories));

    // Deleted items can't be edited or deleted again.
    assert.equal((await api("DELETE", itemPath(estimateItemId), alice, { version: item.version + 1 })).status, 404);
    assert.equal((await api("PATCH", itemPath(estimateItemId), alice, { version: item.version + 1, grams: 5 })).status, 404);
  });

  test("another user's meal: 404 everywhere", async () => {
    const own = await api("POST", "/meals", bob, { items: [{ foodId: foods[0].id, grams: 10 }] });
    bobMealId = own.body.mealId;

    assert.equal((await api("PATCH", itemPath(tableItemId), bob, { version: 4, grams: 1 })).status, 404);
    assert.equal((await api("DELETE", itemPath(tableItemId), bob, { version: 4 })).status, 404);
    assert.equal((await api("POST", `/meals/${mealId}/items`, bob, { foodId: foods[0].id, grams: 1 })).status, 404);
    assert.equal((await api("GET", `/meals/${mealId}/history`, bob)).status, 404);
    // Alice's item addressed through Bob's meal id doesn't match either.
    assert.equal((await api("PATCH", itemPath(tableItemId, bobMealId), alice, { version: 4, grams: 1 })).status, 404);
    // Bob doesn't see Alice's meal in his list.
    const bobDay = await api("GET", "/meals", bob);
    assert.ok(!bobDay.body.meals.some((m) => m.id === mealId));
  });

  test("history shows created, edited and removed with before/after, in order", async () => {
    const res = await api("GET", `/meals/${mealId}/history`, alice);
    assert.equal(res.status, 200);
    const { events } = res.body;
    assert.deepEqual(
      events.map((e) => [e.meal_item_id, e.action]),
      [
        [tableItemId, "created"],
        [estimateItemId, "created"],
        [tableItemId, "edited"], // grams 100 -> 200
        [tableItemId, "edited"], // to estimate
        [tableItemId, "edited"], // back to a table food
        [estimateItemId, "edited"], // the concurrent winner
        [events[6].meal_item_id, "created"], // Raita
        [estimateItemId, "removed"],
      ]
    );
    for (const e of events) {
      if (e.action === "created") {
        assert.equal(e.before, null);
        assert.equal(e.after.version, 1);
      }
      if (e.action === "edited") assert.equal(e.after.version, e.before.version + 1);
      if (e.action === "removed") {
        assert.equal(e.after, null);
        assert.equal(e.before.deleted_at, null);
      }
    }
    const [, , grams, toEstimate, toTable] = events;
    assert.deepEqual([grams.before.grams, grams.after.grams], [100, 200]);
    assert.deepEqual([toEstimate.before.food_id, toEstimate.after.food_id], [foods[0].id, null]);
    assert.equal(toEstimate.after.custom_name, "Homemade paratha");
    assert.deepEqual([toTable.before.custom_name, toTable.after.food_id], ["Homemade paratha", foods[1].id]);
  });
});
