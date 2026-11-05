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
     WHERE starts_at >= NOW() AND starts_at < NOW() + INTERVAL '7 days'
     ORDER BY starts_at`
  );
  return result.rows;
}

// Sets a class's capacity in one transaction. If that leaves free places and
// the class hasn't started, waiting entries are promoted in order to fill them
// (bookings, events, and booked goes up).
// Returns { class }, or { error: "not_found" }, or { error: "below_booked", booked }.
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
