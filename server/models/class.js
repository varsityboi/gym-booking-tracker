import pool from "../config/db.js";
import { lockClass, promoteFromWaitlist } from "./waitlist.js";

export async function createClass(title, startsAt, capacity) {
  const result = await pool.query(
    "INSERT INTO classes (title, starts_at, capacity) VALUES ($1, $2, $3) RETURNING *",
    [title, startsAt, capacity]
  );
  return result.rows[0];
}

export async function listNextSevenDays() {
  const result = await pool.query(
    `SELECT id, title, starts_at, capacity, booked,
            capacity - booked AS places_left
     FROM classes
     WHERE status = 'scheduled'
       AND starts_at >= NOW() AND starts_at < NOW() + INTERVAL '7 days'
     ORDER BY starts_at`
  );
  return result.rows;
}

// Sets a class's capacity in one transaction. If that leaves free places and
// the class hasn't started, waiting entries are promoted in order to fill them
// (bookings, events, and booked goes up).
// Returns { class }, or { error: "not_found" | "cancelled" }, or
// { error: "below_booked", booked }.
export async function updateCapacity(classId, capacity) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // The lock keeps bookings and cancels out until we're done, so booked
    // can't change between the check and the update.
    const cls = await lockClass(client, classId);
    if (!cls) {
      await client.query("ROLLBACK");
      return { error: "not_found" };
    }
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return { error: "cancelled" };
    }
    if (capacity < cls.booked) {
      await client.query("ROLLBACK");
      return { error: "below_booked", booked: cls.booked };
    }

    const promoted = cls.started
      ? []
      : await promoteFromWaitlist(client, classId, capacity - cls.booked);

    const result = await client.query(
      `UPDATE classes SET capacity = $1, booked = booked + $3
       WHERE id = $2
       RETURNING id, title, starts_at, capacity, booked,
                 capacity - booked AS places_left`,
      [capacity, classId, promoted.length]
    );

    await client.query("COMMIT");
    return { class: result.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Cancels a class in one transaction: the class becomes 'cancelled' with
// booked 0, every active booking is cancelled and every waiting entry leaves,
// each with a 'class_cancelled' event.
// Returns { class, cancelledBookings, removedWaitlistEntries }, or
// { error: "not_found" | "already_cancelled" | "started" }.
export async function cancelClass(classId, reason) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Bookings, joins and capacity changes wait for this lock, then see the
    // class as cancelled.
    const cls = await lockClass(client, classId);
    let error;
    if (!cls) error = "not_found";
    else if (cls.status === "cancelled") error = "already_cancelled";
    else if (cls.started) error = "started";
    if (error) {
      await client.query("ROLLBACK");
      return { error };
    }

    const updated = await client.query(
      `UPDATE classes
       SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $2, booked = 0
       WHERE id = $1
       RETURNING id, title, starts_at, capacity, booked, status, cancelled_at, cancel_reason`,
      [classId, reason ?? null]
    );

    // One statement each: cancel the rows and write one event per row.
    const bookings = await client.query(
      `WITH cancelled AS (
         UPDATE bookings SET status = 'cancelled'
         WHERE class_id = $1 AND status = 'active'
         RETURNING id, user_id
       )
       INSERT INTO booking_events (booking_id, user_id, class_id, action)
       SELECT id, user_id, $1, 'class_cancelled' FROM cancelled`,
      [classId]
    );
    const waiting = await client.query(
      `WITH removed AS (
         UPDATE waitlist SET status = 'left', updated_at = NOW()
         WHERE class_id = $1 AND status = 'waiting'
         RETURNING id, user_id
       )
       INSERT INTO booking_events (waitlist_id, user_id, class_id, action)
       SELECT id, user_id, $1, 'class_cancelled' FROM removed`,
      [classId]
    );

    await client.query("COMMIT");
    return {
      class: updated.rows[0],
      cancelledBookings: bookings.rowCount,
      removedWaitlistEntries: waiting.rowCount,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
