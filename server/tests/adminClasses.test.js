// Admin class views against the real database, through the real admin and
// classes routers over HTTP. No AI calls.
// Throwaway users and three classes are made here: A (capacity 2, two booked,
// two waiting, one who left), B (cancelled) and C (outside the range asked
// for). booking_events is append-only, so classes and users that events
// refer to stay, moved to 2000-01-01 / named "zz admin-test ..." with login
// disabled; everything else is deleted.
//
// Opt-in: these tests write to the database, so they only run with
// DB_TESTS=1 (npm run test:db, which also loads .env). Otherwise the suite is
// skipped and nothing database-related is even imported.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const RUN_DB_TESTS = process.env.DB_TESTS === "1";
const SKIP_MESSAGE =
  "writes to the real database; run with DB_TESTS=1 (npm run test:db) to include it";

let express, jwt, pool, adminRouter, classesRouter, bookingsRouter;
if (RUN_DB_TESTS) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error("DB_TESTS=1 needs DATABASE_URL and JWT_SECRET (npm run test:db loads .env)");
  }
  ({ default: express } = await import("express"));
  ({ default: jwt } = await import("jsonwebtoken"));
  ({ default: pool } = await import("../config/db.js"));
  ({ default: adminRouter } = await import("../routes/admin.js"));
  ({ default: classesRouter } = await import("../routes/classes.js"));
  ({ default: bookingsRouter } = await import("../routes/bookings.js"));
}

const stamp = Date.now();
const DAY = 24 * 60 * 60 * 1000;
let server;
let base;
let admin;
const users = {}; // M1..M5 -> { id, token, name, email }
const classes = {}; // A, B, C -> id
const bookingIds = {}; // member -> booking id in class A

async function makeUser(name, role = "member") {
  const fullName = `zz admin-test ${stamp} ${name}`;
  const email = `zz-admin-${stamp}-${name.toLowerCase()}@example.test`;
  const { rows } = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, '!', $3) RETURNING id",
    [fullName, email, role]
  );
  const id = rows[0].id;
  return { id, name: fullName, email, token: jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
}

async function makeClass(label, offsetMs, capacity) {
  const { rows } = await pool.query(
    "INSERT INTO classes (title, starts_at, capacity) VALUES ($1, $2, $3) RETURNING id",
    [`zz admin-test ${stamp} ${label}`, new Date(Date.now() + offsetMs), capacity]
  );
  return rows[0].id;
}

async function api(method, path, user, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const rangeQuery = (fromMs, toMs) =>
  `?from=${encodeURIComponent(new Date(Date.now() + fromMs).toISOString())}` +
  `&to=${encodeURIComponent(new Date(Date.now() + toMs).toISOString())}`;
const ours = (list) => list.filter((c) => Object.values(classes).includes(c.id));

describe("admin class views (real database)", { skip: RUN_DB_TESTS ? false : SKIP_MESSAGE }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/admin", adminRouter);
    app.use("/classes", classesRouter);
    app.use("/bookings", bookingsRouter);
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).json({ error: "something went wrong" });
    });
    server = app.listen(0);
    base = `http://localhost:${server.address().port}`;

    admin = await makeUser("admin", "admin");
    for (let i = 1; i <= 5; i++) users[`M${i}`] = await makeUser(`M${i}`);

    // A: two days ahead, full (M1 then M5 booked), M2 and M4 waiting, M3 left.
    classes.A = await makeClass("A", 2 * DAY, 2);
    for (const m of ["M1", "M5"]) {
      const res = await api("POST", `/classes/${classes.A}/book`, users[m]);
      assert.equal(res.status, 201, `booking ${m}: ${JSON.stringify(res.body)}`);
      bookingIds[m] = res.body.booking?.id ?? res.body.id;
    }
    for (const m of ["M2", "M3", "M4"]) {
      const res = await api("POST", `/classes/${classes.A}/waitlist`, users[m]);
      assert.equal(res.status, 201, `waitlist ${m}: ${JSON.stringify(res.body)}`);
    }
    assert.equal((await api("POST", `/classes/${classes.A}/waitlist/leave`, users.M3)).status, 200);

    // B: an hour after A, with a booking and a waiter, then cancelled.
    classes.B = await makeClass("B", 2 * DAY + 60 * 60 * 1000, 1);
    assert.equal((await api("POST", `/classes/${classes.B}/book`, users.M1)).status, 201);
    assert.equal((await api("POST", `/classes/${classes.B}/waitlist`, users.M2)).status, 201);
    const cancelled = await api("POST", `/classes/${classes.B}/cancel`, admin, { reason: "zz test cancel" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    // C: outside the 1-3 day window used below.
    classes.C = await makeClass("C", 10 * DAY, 5);
  });

  after(async () => {
    server?.close();
    const ids = [admin, ...Object.values(users)].filter(Boolean).map((u) => u.id);
    const classIds = Object.values(classes);
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
    await pool.query("DELETE FROM classes WHERE id = ANY($1) AND id NOT IN (SELECT class_id FROM booking_events)", [
      classIds,
    ]);
    await pool.query("DELETE FROM users WHERE id = ANY($1) AND id NOT IN (SELECT user_id FROM booking_events)", [ids]);
    await pool.end();
  });

  test("members get 403 and no token gets 401, on both routes", async () => {
    for (const path of ["/admin/classes", `/admin/classes/${classes.A}/people`]) {
      const member = await api("GET", path, users.M1);
      assert.equal(member.status, 403, path);
      assert.equal(member.body.error, "admins only");
      assert.equal((await api("GET", path)).status, 401, path);
    }
  });

  test("the list has scheduled and cancelled classes in order, with waiting_count", async () => {
    const res = await api("GET", `/admin/classes${rangeQuery(1 * DAY, 3 * DAY)}`, admin);
    assert.equal(res.status, 200);
    const mine = ours(res.body);
    assert.deepEqual(mine.map((c) => c.id), [classes.A, classes.B], "A then B, and not C");
    const [a, b] = mine;

    assert.deepEqual(Object.keys(a).sort(), [
      "booked", "cancel_reason", "cancelled_at", "capacity", "id", "places_left", "starts_at", "status", "title", "waiting_count",
    ]);
    assert.equal(a.status, "scheduled");
    assert.equal(a.capacity, 2);
    assert.equal(a.booked, 2);
    assert.equal(a.places_left, 0);
    assert.equal(a.waiting_count, 2, "M2 and M4 are waiting; M3 left");
    assert.equal(a.cancelled_at, null);

    assert.equal(b.status, "cancelled");
    assert.equal(b.cancel_reason, "zz test cancel");
    assert.ok(b.cancelled_at && !Number.isNaN(Date.parse(b.cancelled_at)));
    assert.equal(b.booked, 0);
    assert.equal(b.places_left, 1);
    assert.equal(b.waiting_count, 0, "cancelling removes the waiters");

    // The whole list is in time order.
    const times = res.body.map((c) => Date.parse(c.starts_at));
    assert.deepEqual(times, [...times].sort((x, y) => x - y));
  });

  test("with no query the range is now to now + 30 days", async () => {
    const res = await api("GET", "/admin/classes", admin);
    assert.equal(res.status, 200);
    assert.deepEqual(ours(res.body).map((c) => c.id), [classes.A, classes.B, classes.C]);
    const now = Date.now();
    for (const c of res.body) {
      const t = Date.parse(c.starts_at);
      assert.ok(t >= now - 60_000 && t < now + 30 * DAY + 60_000, `${c.id} starts ${c.starts_at}`);
    }
  });

  test("bad ranges: over 90 days, backwards, or not a date give 400", async () => {
    const long = await api("GET", "/admin/classes?from=2026-01-01&to=2026-04-02", admin);
    assert.equal(long.status, 400);
    assert.equal(long.body.error, "the range can be at most 90 days");
    // Exactly 90 days (1 Jan to 31 Mar inclusive) is allowed.
    assert.equal((await api("GET", "/admin/classes?from=2026-01-01&to=2026-03-31", admin)).status, 200);

    const backwards = await api("GET", "/admin/classes?from=2026-02-01&to=2026-01-01", admin);
    assert.equal(backwards.status, 400);
    assert.equal(backwards.body.error, "to must be after from");

    for (const q of ["from=yesterday", "from=2026-02-30", "to=2026-01-01T10:00:00", "from=a&from=b"]) {
      const res = await api("GET", `/admin/classes?${q}`, admin);
      assert.equal(res.status, 400, q);
      assert.match(res.body.error, /^(from|to) must be an ISO date/, q);
    }
  });

  test("people: booked oldest first, waiting in line order matching member positions", async () => {
    const res = await api("GET", `/admin/classes/${classes.A}/people`, admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.class.id, classes.A);
    assert.equal(res.body.class.waiting_count, 2);

    const booked = res.body.booked;
    assert.deepEqual(booked.map((b) => b.userId), [users.M1.id, users.M5.id]);
    assert.deepEqual(Object.keys(booked[0]).sort(), ["bookedAt", "bookingId", "email", "name", "userId"]);
    assert.equal(booked[0].name, users.M1.name);
    assert.equal(booked[0].email, users.M1.email);
    if (bookingIds.M1) assert.equal(booked[0].bookingId, bookingIds.M1);
    assert.ok(Date.parse(booked[0].bookedAt) <= Date.parse(booked[1].bookedAt));

    const waiting = res.body.waiting;
    assert.deepEqual(
      waiting.map((w) => [w.position, w.userId]),
      [[1, users.M2.id], [2, users.M4.id]],
      "M3 left, so M4 is second"
    );
    assert.deepEqual(Object.keys(waiting[0]).sort(), ["email", "joinedAt", "name", "position", "userId"]);
    // Same positions the members themselves see.
    for (const m of ["M2", "M4"]) {
      const mine = (await api("GET", "/bookings/mine", users[m])).body.waitlist.find((w) => w.class_id === classes.A);
      assert.equal(waiting.find((w) => w.userId === users[m].id).position, mine.position, m);
    }
  });

  test("people for a cancelled class: nobody booked or waiting", async () => {
    const res = await api("GET", `/admin/classes/${classes.B}/people`, admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.class.status, "cancelled");
    assert.deepEqual(res.body.booked, []);
    assert.deepEqual(res.body.waiting, []);
  });

  test("people: missing class 404, bad id 400", async () => {
    const missing = await api("GET", "/admin/classes/999999999/people", admin);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "class not found");
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await api("GET", `/admin/classes/${id}/people`, admin);
      assert.equal(res.status, 400, id);
      assert.equal(res.body.error, "invalid class id");
    }
  });
});
