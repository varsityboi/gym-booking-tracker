// Waitlist tests against the real database (DATABASE_URL from server/.env),
// through the real classes/bookings routers over HTTP. No AI calls.
// Throwaway users and one class (capacity 2) are created here. booking_events
// is append-only, so its rows (and the users, bookings, waitlist entries and
// class they reference) stay: users are named "zz waitlist-test ..." with
// login disabled, and the class is moved to 2000-01-01 so it never shows up.
//
// Opt-in: these tests write to the database, so they only run with
// DB_TESTS=1 (npm run test:db, which also loads .env). Otherwise the suite is
// skipped and nothing database-related is even imported.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const RUN_DB_TESTS = process.env.DB_TESTS === "1";
const SKIP_MESSAGE =
  "writes to the real database; run with DB_TESTS=1 (npm run test:db) to include it";

let express, jwt, pool, classesRouter, bookingsRouter;
if (RUN_DB_TESTS) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("DB_TESTS=1 needs DATABASE_URL and JWT_SECRET (npm run test:db loads .env)");
  }
  ({ default: express } = await import("express"));
  ({ default: jwt } = await import("jsonwebtoken"));
  ({ default: pool } = await import("../config/db.js"));
  ({ default: classesRouter } = await import("../routes/classes.js"));
  ({ default: bookingsRouter } = await import("../routes/bookings.js"));
}

const stamp = Date.now();
let server;
let base;
let classId;
let admin;
const users = {}; // U1..U7 -> { id, token }
const bookingOf = {}; // user name -> active booking id

async function makeUser(name, role = "member") {
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, '!', $3) RETURNING id",
    [`zz waitlist-test ${stamp} ${name}`, `zz-waitlist-${stamp}-${name.toLowerCase()}@example.test`, role]
  );
  const id = rows[0].id;
  return { id, token: jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
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

const classRow = async () =>
  (await pool.query("SELECT capacity, booked FROM classes WHERE id = $1", [classId])).rows[0];
const waitlistOf = async (u) => (await api("GET", "/bookings/mine", users[u])).body.waitlist;
const positionOf = async (u) => (await waitlistOf(u)).find((w) => w.class_id === classId)?.position;

describe("waitlist (real database)", { skip: RUN_DB_TESTS ? false : SKIP_MESSAGE }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/classes", classesRouter);
    app.use("/bookings", bookingsRouter);
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: "something went wrong" });
    });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;

    admin = await makeUser("admin", "admin");
    for (let i = 1; i <= 7; i++) users[`U${i}`] = await makeUser(`U${i}`);
    const { rows } = await pool.query(
      `INSERT INTO classes (title, starts_at, capacity)
       VALUES ($1, NOW() + INTERVAL '1 day', 2) RETURNING id`,
      [`zz waitlist-test ${stamp}`]
    );
    classId = rows[0].id;
  });

  after(async () => {
    server?.close();
    if (classId) {
      await pool.query("UPDATE classes SET starts_at = '2000-01-01' WHERE id = $1", [classId]);
    }
    // The admin has no events (promotions are logged under the promoted user), so it can go.
    if (admin) await pool.query("DELETE FROM users WHERE id = $1", [admin.id]);
    await pool.end();
  });

  test("join when the class has free places is refused", async () => {
    const res = await api("POST", `/classes/${classId}/waitlist`, users.U3);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "class has free places, book it instead");
  });

  test("join a class that doesn't exist: 404; bad id: 400", async () => {
    assert.equal((await api("POST", "/classes/999999999/waitlist", users.U3)).status, 404);
    assert.equal((await api("POST", "/classes/abc/waitlist", users.U3)).status, 400);
  });

  test("booking a full class says so and points to the waitlist", async () => {
    for (const u of ["U1", "U2"]) {
      const res = await api("POST", `/classes/${classId}/book`, users[u]);
      assert.equal(res.status, 201);
      bookingOf[u] = res.body.booking.id;
    }
    const res = await api("POST", `/classes/${classId}/book`, users.U3);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "class is full, you can join the waitlist");
  });

  test("join when full works, in order", async () => {
    for (const [u, position] of [["U3", 1], ["U4", 2], ["U5", 3]]) {
      const res = await api("POST", `/classes/${classId}/waitlist`, users[u]);
      assert.equal(res.status, 201);
      assert.equal(res.body.position, position);
      assert.equal(res.body.entry.status, "waiting");
      assert.equal(res.body.entry.class_id, classId);
    }
  });

  test("double join is refused", async () => {
    const res = await api("POST", `/classes/${classId}/waitlist`, users.U3);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "you are already on the waitlist for this class");
  });

  test("a booked user can't join", async () => {
    const res = await api("POST", `/classes/${classId}/waitlist`, users.U1);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "you already booked this class");
  });

  test("bookings/mine lists waiting entries with title, starts_at and position", async () => {
    const res = await api("GET", "/bookings/mine", users.U4);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.bookings, []);
    const [entry] = res.body.waitlist.filter((w) => w.class_id === classId);
    assert.equal(entry.title, `zz waitlist-test ${stamp}`);
    assert.ok(entry.starts_at);
    assert.equal(entry.position, 2);
  });

  test("cancel promotes the first in line, and positions move up", async () => {
    const res = await api("POST", `/bookings/${bookingOf.U1}/cancel`, users.U1);
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.status, "cancelled");
    assert.equal(res.body.promotedUserId, users.U3.id);

    assert.deepEqual(await classRow(), { capacity: 2, booked: 2 });
    assert.equal(await positionOf("U3"), undefined);
    assert.equal(await positionOf("U4"), 1);
    assert.equal(await positionOf("U5"), 2);

    const mine = await api("GET", "/bookings/mine", users.U3);
    const booking = mine.body.bookings.find((b) => b.class_id === classId);
    assert.ok(booking, "U3 now has a booking");
    bookingOf.U3 = booking.id;
  });

  test("two cancels at the same moment promote two different people", async () => {
    for (const u of ["U6", "U7"]) {
      assert.equal((await api("POST", `/classes/${classId}/waitlist`, users[u])).status, 201);
    }

    const [a, b] = await Promise.all([
      api("POST", `/bookings/${bookingOf.U2}/cancel`, users.U2),
      api("POST", `/bookings/${bookingOf.U3}/cancel`, users.U3),
    ]);

    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(
      [a.body.promotedUserId, b.body.promotedUserId].sort(),
      [users.U4.id, users.U5.id].sort()
    );
    assert.deepEqual(await classRow(), { capacity: 2, booked: 2 });

    const active = await pool.query(
      "SELECT user_id FROM bookings WHERE class_id = $1 AND status = 'active' ORDER BY user_id",
      [classId]
    );
    assert.deepEqual(active.rows.map((r) => r.user_id), [users.U4.id, users.U5.id].sort((x, y) => x - y));
    const twice = await pool.query(
      `SELECT user_id FROM waitlist WHERE class_id = $1 AND status = 'promoted'
       GROUP BY user_id HAVING COUNT(*) > 1`,
      [classId]
    );
    assert.equal(twice.rowCount, 0, "nobody promoted twice");
    assert.equal(await positionOf("U6"), 1);
    assert.equal(await positionOf("U7"), 2);
  });

  test("raising capacity promotes from the waitlist", async () => {
    const res = await api("PATCH", `/classes/${classId}/capacity`, admin, { capacity: 3 });
    assert.equal(res.status, 200);
    assert.equal(res.body.capacity, 3);
    assert.equal(res.body.booked, 3);
    assert.equal(res.body.places_left, 0);

    const promoted = await pool.query(
      "SELECT 1 FROM bookings WHERE class_id = $1 AND user_id = $2 AND status = 'active'",
      [classId, users.U6.id]
    );
    assert.equal(promoted.rowCount, 1);
    assert.equal(await positionOf("U7"), 1);

    // Lowering below booked is still refused with the same message.
    const low = await api("PATCH", `/classes/${classId}/capacity`, admin, { capacity: 2 });
    assert.equal(low.status, 409);
    assert.equal(low.body.error, "capacity can't be lower than the number already booked (3)");
  });

  test("leave works, and a second leave is 404", async () => {
    const res = await api("POST", `/classes/${classId}/waitlist/leave`, users.U7);
    assert.equal(res.status, 200);
    assert.equal(res.body.entry.status, "left");
    assert.deepEqual(await waitlistOf("U7"), []);

    const again = await api("POST", `/classes/${classId}/waitlist/leave`, users.U7);
    assert.equal(again.status, 404);
    assert.equal(again.body.error, "you are not on the waitlist for this class");
  });

  test("cancel with nobody waiting frees the place as before", async () => {
    const mine = await api("GET", "/bookings/mine", users.U4);
    const booking = mine.body.bookings.find((b) => b.class_id === classId);
    const res = await api("POST", `/bookings/${booking.id}/cancel`, users.U4);
    assert.equal(res.status, 200);
    assert.equal(res.body.promotedUserId, null);
    assert.deepEqual(await classRow(), { capacity: 3, booked: 2 });
  });

  test("an event is written for every step", async () => {
    const { rows } = await pool.query(
      `SELECT action, user_id, booking_id, waitlist_id FROM booking_events
       WHERE class_id = $1 ORDER BY id`,
      [classId]
    );
    const count = (action) => rows.filter((r) => r.action === action).length;
    assert.equal(count("booked"), 2); // U1, U2
    assert.equal(count("waitlisted"), 5); // U3..U7
    assert.equal(count("promoted"), 4); // U3, then U4 + U5 (concurrent), then U6 (capacity)
    assert.equal(count("cancelled"), 4); // U1, U2, U3, U4
    assert.equal(count("left_waitlist"), 1); // U7
    assert.equal(rows.length, 16);

    for (const r of rows) {
      if (r.action === "promoted") assert.ok(r.booking_id && r.waitlist_id, "promoted has both ids");
      if (r.action === "waitlisted" || r.action === "left_waitlist") {
        assert.ok(r.waitlist_id && r.booking_id === null, `${r.action} has only waitlist_id`);
      }
    }
    const promotedUsers = rows.filter((r) => r.action === "promoted").map((r) => r.user_id);
    assert.deepEqual(
      [...promotedUsers].sort((x, y) => x - y),
      [users.U3.id, users.U4.id, users.U5.id, users.U6.id].sort((x, y) => x - y)
    );
  });
});
