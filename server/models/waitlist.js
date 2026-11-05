import pool from "../config/db.js";

// A waiting entry's 1-based place in line for its class, by (created_at, id).
// `w` is the waitlist row the position is for.
const POSITION_SQL = `(
  SELECT COUNT(*)::int FROM waitlist o
  WHERE o.class_id = w.class_id AND o.status = 'waiting'
    AND (o.created_at, o.id) <= (w.created_at, w.id)
)`;

// Locks the class row so every booking/waitlist change for a class runs one
// at a time. Returns the class (with status and started), or undefined when it
// doesn't exist. Callers check status while holding the lock.
export async function lockClass(client, classId) {
  const result = await client.query(
    `SELECT id, status, starts_at, capacity, booked, starts_at <= NOW() AS started
     FROM classes WHERE id = $1 FOR UPDATE`,
    [classId]
  );
  return result.rows[0];
}

// Promotes up to `count` waiting entries for the class, oldest first: each
// gets an active booking, its entry becomes 'promoted', and a 'promoted' event
// is written. Doesn't touch classes.booked; the caller does. Run inside a
// transaction that holds the class lock (lockClass). Returns the user ids
// promoted, in order.
export async function promoteFromWaitlist(client, classId, count) {
  if (count <= 0) return [];
  // Skips anyone who somehow already has an active booking for the class, so
  // the one_active_booking index can't fail the whole transaction.
  const waiting = await client.query(
    `SELECT w.id, w.user_id
     FROM waitlist w
     WHERE w.class_id = $1 AND w.status = 'waiting'
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.user_id = w.user_id AND b.class_id = w.class_id AND b.status = 'active'
       )
     ORDER BY w.created_at, w.id
     LIMIT $2
     FOR UPDATE`,
    [classId, count]
  );

  const promoted = [];
  for (const entry of waiting.rows) {
    const booking = await client.query(
      "INSERT INTO bookings (user_id, class_id) VALUES ($1, $2) RETURNING id",
      [entry.user_id, classId]
    );
    await client.query(
      "UPDATE waitlist SET status = 'promoted', updated_at = NOW() WHERE id = $1",
      [entry.id]
    );
    await client.query(
      `INSERT INTO booking_events (booking_id, waitlist_id, user_id, class_id, action)
       VALUES ($1, $2, $3, $4, 'promoted')`,
      [booking.rows[0].id, entry.id, entry.user_id, classId]
    );
    promoted.push(entry.user_id);
  }
  return promoted;
}

// Joins the waitlist of a full class in one transaction.
// Returns { entry, position }, or { error } with one of: "not_found",
// "cancelled", "started", "has_places", "booked", "waiting".
export async function joinWaitlist(classId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const cls = await lockClass(client, classId);
    let error;
    if (!cls) error = "not_found";
    else if (cls.status === "cancelled") error = "cancelled";
    else if (cls.started) error = "started";
    else if (cls.booked < cls.capacity) error = "has_places";
    else {
      const booked = await client.query(
        "SELECT 1 FROM bookings WHERE user_id = $1 AND class_id = $2 AND status = 'active'",
        [userId, classId]
      );
      const waiting = await client.query(
        "SELECT 1 FROM waitlist WHERE user_id = $1 AND class_id = $2 AND status = 'waiting'",
        [userId, classId]
      );
      if (booked.rowCount > 0) error = "booked";
      else if (waiting.rowCount > 0) error = "waiting";
    }
    if (error) {
      await client.query("ROLLBACK");
      return { error };
    }

    // clock_timestamp(), not NOW(): joins wait for the class lock, so the time
    // the lock was won is the fair place in line, not the transaction start.
    const inserted = await client.query(
      `INSERT INTO waitlist (user_id, class_id, created_at, updated_at)
       VALUES ($1, $2, clock_timestamp(), clock_timestamp())
       RETURNING id`,
      [userId, classId]
    );
    const entryId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO booking_events (waitlist_id, user_id, class_id, action)
       VALUES ($1, $2, $3, 'waitlisted')`,
      [entryId, userId, classId]
    );
    const result = await client.query(
      `SELECT w.id, w.class_id, w.status, w.created_at, ${POSITION_SQL} AS position
       FROM waitlist w WHERE w.id = $1`,
      [entryId]
    );

    await client.query("COMMIT");
    const { position, ...entry } = result.rows[0];
    return { entry, position };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Leaves the waitlist in one transaction. Returns the entry, or null when the
// user has no waiting entry for this class.
export async function leaveWaitlist(classId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Same lock as promotions, so leaving can't race with being promoted.
    await lockClass(client, classId);
    const left = await client.query(
      `UPDATE waitlist SET status = 'left', updated_at = NOW()
       WHERE user_id = $1 AND class_id = $2 AND status = 'waiting'
       RETURNING id, class_id, status, created_at, updated_at`,
      [userId, classId]
    );
    if (left.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO booking_events (waitlist_id, user_id, class_id, action)
       VALUES ($1, $2, $3, 'left_waitlist')`,
      [left.rows[0].id, userId, classId]
    );

    await client.query("COMMIT");
    return left.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The user's waiting entries for upcoming classes, with their place in line.
export async function listWaitingForUser(userId) {
  const result = await pool.query(
    `SELECT w.id, w.class_id, c.title, c.starts_at, ${POSITION_SQL} AS position
     FROM waitlist w
     JOIN classes c ON c.id = w.class_id
     WHERE w.user_id = $1 AND w.status = 'waiting' AND c.status = 'scheduled'
       AND c.starts_at > NOW()
     ORDER BY c.starts_at, w.id`,
    [userId]
  );
  return result.rows;
}
