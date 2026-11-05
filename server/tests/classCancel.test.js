// Admin class cancellation tests against the real database, through the real
// classes/bookings/me routers over HTTP. No AI calls.
// booking_events is append-only, so rows it references stay: users are named
// "zz class-cancel-test ..." with login disabled, and classes with events are
// moved to 2000-01-01 so they never show up. Everything else is deleted.
//
// Opt-in: these tests write to the database, so they only run with
// DB_TESTS=1 (npm run test:db, which also loads .env). Otherwise the suite is
// skipped and nothing database-related is even imported.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const RUN_DB_TESTS = process.env.DB_TESTS === "1";
const SKIP_MESSAGE =
  "writes to the real database; run with DB_TESTS=1 (npm run test:db) to include it";

let express, jwt, pool, classesRouter, bookingsRouter, meRouter;
if (RUN_DB_TESTS) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("DB_TESTS=1 needs DATABASE_URL and JWT_SECRET (npm run test:db loads .env)");
  }
  ({ default: express } = await import("express"));
  ({ default: jwt } = await import("jsonwebtoken"));
  ({ default: pool } = await import("../config/db.js"));
  ({ default: classesRouter } = await import("../routes/classes.js"));
  ({ default: bookingsRouter } = await import("../routes/bookings.js"));
  ({ default: meRouter } = await import("../routes/me.js"));
}

const stamp = Date.now();
const RACE_ROUNDS = 5;
let server;
let base;
let admin;
const users = {}; // M1..M5 -> { id, token }
const classIds = [];
let cancelledClassId;

async function makeUser(name, role = "member") {
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, '!', $3) RETURNING id",
    [`zz class-cancel-test ${stamp} ${name}`, `zz-cancel-${stamp}-${name.toLowerCase()}@example.test`, role]
  );
  const id = rows[0].id;
  return { id, token: jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
}

async function makeClass(capacity) {
  const { rows } = await pool.query(
    `INSERT INTO classes (title, starts_at, capacity)
     VALUES ($1, NOW() + INTERVAL '1 day', $2) RETURNING id`,
    [`zz class-cancel-test ${stamp} #${classIds.length + 1}`, capacity]
  );
  classIds.push(rows[0].id);
  return rows[0].id;
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

const activeBookings = async (classId) =>
  (await pool.query("SELECT user_id FROM bookings WHERE class_id = $1 AND status = 'active'", [classId]))
    .rowCount;

describe("class cancellation (real database)", { skip: RUN_DB_TESTS ? false : SKIP_MESSAGE }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/classes", classesRouter);
    app.use("/bookings", bookingsRouter);
    app.use("/me", meRouter);
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: "something went wrong" });
    });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;

    admin = await makeUser("admin", "admin");
    for (let i = 1; i <= 5; i++) users[`M${i}`] = await makeUser(`M${i}`);
  });

  after(async () => {
    server?.close();
    const ids = [admin, ...Object.values(users)].filter(Boolean).map((u) => u.id);
    // Classes and users that no event refers to can go; the rest stay, out of sight.
    await pool.query(
      "UPDATE classes SET starts_at = '2000-01-01' WHERE id = ANY($1) AND id IN (SELECT class_id FROM booking_events)",
      [classIds]
    );
    await pool.query(
      `DELETE FROM waitlist WHERE class_id = ANY($1)
         AND id NOT IN (SELECT waitlist_id FROM booking_events WHERE waitlist_id IS NOT NULL)`,
      [classIds]
    );
    await pool.query(
      `DELETE FROM bookings WHERE class_id = ANY($1)
         AND id NOT IN (SELECT booking_id FROM booking_events WHERE booking_id IS NOT NULL)`,
      [classIds]
    );
    await pool.query(
      "DELETE FROM classes WHERE id = ANY($1) AND id NOT IN (SELECT class_id FROM booking_events)",
      [classIds]
    );
    await pool.query(
      "DELETE FROM users WHERE id = ANY($1) AND id NOT IN (SELECT user_id FROM booking_events)",
      [ids]
    );
    await pool.end();
  });

  test("cancel with 2 bookings and 2 waiting: counts, statuses and events", async () => {
    const classId = await makeClass(2);
    cancelledClassId = classId;
    for (const u of ["M1", "M2"]) {
      assert.equal((await api("POST", `/classes/${classId}/book`, users[u])).status, 201);
    }
    for (const u of ["M3", "M4"]) {
      assert.equal((await api("POST", `/classes/${classId}/waitlist`, users[u])).status, 201);
    }

    const res = await api("POST", `/classes/${classId}/cancel`, admin, { reason: "Instructor is ill" });
    assert.equal(res.status, 200);
    assert.equal(res.body.cancelledBookings, 2);
    assert.equal(res.body.removedWaitlistEntries, 2);
    assert.equal(res.body.class.id, classId);
    assert.equal(res.body.class.status, "cancelled");
    assert.equal(res.body.class.booked, 0);
    assert.equal(res.body.class.cancel_reason, "Instructor is ill");
    assert.ok(res.body.class.cancelled_at);

    const bookings = await pool.query("SELECT status FROM bookings WHERE class_id = $1", [classId]);
    assert.deepEqual(bookings.rows.map((r) => r.status), ["cancelled", "cancelled"]);
    const waiting = await pool.query("SELECT status FROM waitlist WHERE class_id = $1", [classId]);
    assert.deepEqual(waiting.rows.map((r) => r.status), ["left", "left"]);

    const events = await pool.query(
      `SELECT user_id, booking_id, waitlist_id FROM booking_events
       WHERE class_id = $1 AND action = 'class_cancelled' ORDER BY id`,
      [classId]
    );
    const byBooking = events.rows.filter((e) => e.booking_id !== null && e.waitlist_id === null);
    const byEntry = events.rows.filter((e) => e.waitlist_id !== null && e.booking_id === null);
    assert.equal(events.rowCount, 4);
    assert.deepEqual(byBooking.map((e) => e.user_id).sort(), [users.M1.id, users.M2.id].sort());
    assert.deepEqual(byEntry.map((e) => e.user_id).sort(), [users.M3.id, users.M4.id].sort());
  });

  test("the cancelled class is hidden from lists, bookings/mine and /me/today", async () => {
    const list = await api("GET", "/classes", users.M1);
    assert.ok(!list.body.some((c) => c.id === cancelledClassId));

    const mine1 = await api("GET", "/bookings/mine", users.M1);
    assert.ok(!mine1.body.bookings.some((b) => b.class_id === cancelledClassId));
    const mine3 = await api("GET", "/bookings/mine", users.M3);
    assert.ok(!mine3.body.waitlist.some((w) => w.class_id === cancelledClassId));

    const today = await api("GET", "/me/today", users.M1);
    assert.notEqual(today.body.next_class?.class_id, cancelledClassId);
  });

  test("a member can't cancel a class: 403", async () => {
    const classId = await makeClass(2);
    const res = await api("POST", `/classes/${classId}/cancel`, users.M1);
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "admins only");
  });

  test("bad reason: 400; missing class: 404", async () => {
    const classId = classIds.at(-1);
    const long = await api("POST", `/classes/${classId}/cancel`, admin, { reason: "x".repeat(201) });
    assert.equal(long.status, 400);
    assert.equal(long.body.error, "reason must be 1 to 200 characters");
    assert.equal((await api("POST", "/classes/999999999/cancel", admin)).status, 404);
  });

  test("cancelling twice: 409", async () => {
    const res = await api("POST", `/classes/${cancelledClassId}/cancel`, admin);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "class is already cancelled");
  });

  test("booking, joining the waitlist and changing capacity afterwards: 409", async () => {
    const book = await api("POST", `/classes/${cancelledClassId}/book`, users.M5);
    assert.equal(book.status, 409);
    assert.equal(book.body.error, "class was cancelled");

    const join = await api("POST", `/classes/${cancelledClassId}/waitlist`, users.M5);
    assert.equal(join.status, 409);
    assert.equal(join.body.error, "class was cancelled");

    const capacity = await api("PATCH", `/classes/${cancelledClassId}/capacity`, admin, { capacity: 5 });
    assert.equal(capacity.status, 409);
    assert.equal(capacity.body.error, "class was cancelled");

    assert.equal(await activeBookings(cancelledClassId), 0);
  });

  test(`a booking at the same moment as the cancel never survives it (${RACE_ROUNDS} rounds)`, async () => {
    const outcomes = { bookedFirst: 0, cancelledFirst: 0 };
    for (let round = 0; round < RACE_ROUNDS; round++) {
      const classId = await makeClass(5);
      const [book, cancel] = await Promise.all([
        api("POST", `/classes/${classId}/book`, users.M5),
        api("POST", `/classes/${classId}/cancel`, admin, { reason: "race" }),
      ]);

      assert.equal(cancel.status, 200);
      if (book.status === 201) {
        // The booking won the lock; the cancel then cancelled it.
        outcomes.bookedFirst++;
        assert.equal(cancel.body.cancelledBookings, 1);
      } else {
        outcomes.cancelledFirst++;
        assert.equal(book.status, 409);
        assert.equal(book.body.error, "class was cancelled");
        assert.equal(cancel.body.cancelledBookings, 0);
      }
      assert.equal(await activeBookings(classId), 0, "no active booking in a cancelled class");
      const cls = await pool.query("SELECT status, booked FROM classes WHERE id = $1", [classId]);
      assert.deepEqual(cls.rows[0], { status: "cancelled", booked: 0 });
    }
    console.log(`race outcomes: ${JSON.stringify(outcomes)}`);
  });

  // Forces the order the race above rarely produces: the cancel holds the
  // class lock while a booking waits for it, then the booking must fail.
  test("a booking waiting on the cancel's lock fails with 'class was cancelled'", async () => {
    const classId = await makeClass(5);
    const holder = await pool.connect();
    // Waits until some other backend is blocked on a lock running `like`.
    const waitingOn = async (like) => {
      for (let i = 0; i < 250; i++) {
        const { rowCount } = await pool.query(
          `SELECT 1 FROM pg_stat_activity
           WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE $1`,
          [like]
        );
        if (rowCount > 0) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`nothing waiting on ${like}`);
    };
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT 1 FROM classes WHERE id = $1 FOR UPDATE", [classId]);

      const cancel = api("POST", `/classes/${classId}/cancel`, admin, { reason: "ordered" });
      await waitingOn("%FROM classes WHERE id = $1 FOR UPDATE%");
      const book = api("POST", `/classes/${classId}/book`, users.M5);
      await waitingOn("%SET booked = booked + 1%");

      // Release: the cancel queued first, so it gets the lock first.
      await holder.query("ROLLBACK");
      const [cancelRes, bookRes] = await Promise.all([cancel, book]);

      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.body.cancelledBookings, 0);
      assert.equal(bookRes.status, 409);
      assert.equal(bookRes.body.error, "class was cancelled");
      assert.equal(await activeBookings(classId), 0);
    } finally {
      holder.release();
    }
  });
});
