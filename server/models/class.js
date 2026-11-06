import pool from "../config/db.js";
import { lockClass, promoteFromWaitlist, POSITION_SQL } from "./waitlist.js";

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

// Admin views. One class row for an admin: every column the lists show, with
// places left and the number waiting counted in the same query.
const ADMIN_CLASS_COLUMNS = `c.id, c.title, c.starts_at, c.capacity, c.booked,
  c.capacity - c.booked AS places_left, c.status, c.cancelled_at, c.cancel_reason,
  (SELECT COUNT(*)::int FROM waitlist w WHERE w.class_id = c.id AND w.status = 'waiting') AS waiting_count`;

export const ADMIN_CLASSES_LIMIT = 200;

// Every class (scheduled or cancelled) starting in [from, to), in time order,
// at most ADMIN_CLASSES_LIMIT rows.
export async function listClassesForAdmin(from, to) {
  const result = await pool.query(
    `SELECT ${ADMIN_CLASS_COLUMNS}
     FROM classes c
     WHERE c.starts_at >= $1 AND c.starts_at < $2
     ORDER BY c.starts_at, c.id
     LIMIT $3`,
    [from, to, ADMIN_CLASSES_LIMIT]
  );
  return result.rows;
}

// A class with its active bookings (oldest first) and its waiting list (in
// line order, with the same positions members see). undefined when the class
// doesn't exist.
// The three reads run in one read-only REPEATABLE READ transaction on one
// client, so they all see the same snapshot: a booking or promotion landing
// in between can't show someone as both booked and waiting, or make the
// counts disagree with the lists.
export async function findClassPeople(classId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const cls = await client.query(`SELECT ${ADMIN_CLASS_COLUMNS} FROM classes c WHERE c.id = $1`, [classId]);
    if (cls.rowCount === 0) {
      await client.query("COMMIT");
      return undefined;
    }

    const booked = await client.query(
      `SELECT b.id AS "bookingId", u.id AS "userId", u.name, u.email, b.created_at AS "bookedAt"
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.class_id = $1 AND b.status = 'active'
       ORDER BY b.created_at, b.id`,
      [classId]
    );
    const waiting = await client.query(
      `SELECT ${POSITION_SQL} AS position, u.id AS "userId", u.name, u.email, w.created_at AS "joinedAt"
       FROM waitlist w
       JOIN users u ON u.id = w.user_id
       WHERE w.class_id = $1 AND w.status = 'waiting'
       ORDER BY w.created_at, w.id`,
      [classId]
    );

    await client.query("COMMIT");
    return { class: cls.rows[0], booked: booked.rows, waiting: waiting.rows };
  } catch (err) {
    // Don't let a failed ROLLBACK hide the error that caused it.
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
