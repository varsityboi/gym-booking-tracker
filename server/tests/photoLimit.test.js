// Daily photo limit, against the real database (photo_analyses), with a fake
// readPlate and analyzeItems so no AI (and no food search) is called.
// Everything it creates is deleted afterwards (photo_analyses has no
// append-only references).
//
// Opt-in: this writes to the database, so it only runs with DB_TESTS=1
// (npm run test:db, which also loads .env). Otherwise the suite is skipped and
// nothing database-related is even imported.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const RUN_DB_TESTS = process.env.DB_TESTS === "1";
const SKIP_MESSAGE =
  "writes to the real database; run with DB_TESTS=1 (npm run test:db) to include it";

let express, jwt, pool, requireAuth, upload, makeAnalyzeHandler;
if (RUN_DB_TESTS) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("DB_TESTS=1 needs DATABASE_URL and JWT_SECRET (npm run test:db loads .env)");
  }
  ({ default: express } = await import("express"));
  ({ default: jwt } = await import("jsonwebtoken"));
  ({ default: pool } = await import("../config/db.js"));
  ({ requireAuth } = await import("../middleware/auth.js"));
  ({ upload } = await import("../routes/meals.js"));
  ({ makeAnalyzeHandler } = await import("../controllers/meals.js"));
}

const LIMIT = 3;
const stamp = Date.now();
let server;
let base;
let user;
let readPlateCalls = 0;
// Each call takes the next outcome: an object to return, or an Error to throw.
const outcomes = [];

const fakeReadPlate = async () => {
  readPlateCalls++;
  const next = outcomes.shift();
  if (next instanceof Error) throw next;
  return next;
};
const fakeAnalyzeItems = async (items, { visionProvider }) => ({
  items: items.map((i) => ({ detected: i.name, grams: i.grams })),
  totals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, unknownCount: 0 },
  providers: { vision: visionProvider, pick: null, estimate: null },
});

async function analyzePhoto() {
  const form = new FormData();
  form.append("photo", new Blob([Buffer.from("not really a photo")], { type: "image/jpeg" }), "plate.jpg");
  const res = await fetch(`${base}/meals/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${user.token}` },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

describe("daily photo limit (real database)", { skip: RUN_DB_TESTS ? false : SKIP_MESSAGE }, () => {
  before(async () => {
    const app = express();
    app.post(
      "/meals/analyze",
      requireAuth,
      upload.single("photo"),
      makeAnalyzeHandler({ readPlate: fakeReadPlate, analyzeItems: fakeAnalyzeItems, dailyLimit: LIMIT })
    );
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: "something went wrong" });
    });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;

    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, '!') RETURNING id",
      [`zz photo-limit-test ${stamp}`, `zz-photo-${stamp}@example.test`]
    );
    user = { id: rows[0].id, token: jwt.sign({ id: rows[0].id, role: "member" }, process.env.JWT_SECRET) };

    // Yesterday's analyses (India time) don't count toward today.
    for (let i = 0; i < LIMIT; i++) {
      await pool.query(
        `INSERT INTO photo_analyses (user_id, created_at, vision_provider, duration_ms, ok)
         VALUES ($1, date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' - INTERVAL '1 hour', 'gemini', 1000, true)`,
        [user.id]
      );
    }
  });

  after(async () => {
    server?.close();
    if (user) {
      await pool.query("DELETE FROM photo_analyses WHERE user_id = $1", [user.id]);
      await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    }
    await pool.end();
  });

  test(`${LIMIT} analyses a day are allowed, failed ones count, the next gets 429 without calling the AI`, async () => {
    outcomes.push(
      { items: [{ name: "Paratha", grams: 100 }], provider: "gemini" },
      new Error("every provider failed"),
      { items: [{ name: "Raita", grams: 50 }], provider: "groq" }
    );

    const first = await analyzePhoto();
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.providers, { vision: "gemini", pick: null, estimate: null });

    const second = await analyzePhoto();
    assert.equal(second.status, 502);
    assert.equal(second.body.error, "couldn't read the photo, please try again");

    const third = await analyzePhoto();
    assert.equal(third.status, 200);
    assert.equal(readPlateCalls, 3);

    const fourth = await analyzePhoto();
    assert.equal(fourth.status, 429);
    assert.deepEqual(fourth.body, { error: `daily photo limit reached (${LIMIT}), try again tomorrow` });
    assert.equal(readPlateCalls, 3, "the AI isn't called once the limit is reached");
  });

  test("each analysis is recorded with provider, duration and outcome", async () => {
    const { rows } = await pool.query(
      `SELECT vision_provider, duration_ms, ok FROM photo_analyses
       WHERE user_id = $1
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
       ORDER BY id`,
      [user.id]
    );
    assert.deepEqual(
      rows.map((r) => [r.vision_provider, r.ok]),
      [
        ["gemini", true],
        [null, false],
        ["groq", true],
      ]
    );
    assert.ok(rows.every((r) => Number.isInteger(r.duration_ms) && r.duration_ms >= 0));
  });

  test("no photo still gets 400 and isn't recorded", async () => {
    const res = await fetch(`${base}/meals/analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${user.token}` },
      body: new FormData(),
    });
    assert.equal(res.status, 400);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM photo_analyses WHERE user_id = $1", [user.id]);
    assert.equal(rows[0].n, LIMIT + 3, "yesterday's 3 + today's 3");
  });
});
