import pool from "../config/db.js";
import { lockClass, promoteFromWaitlist } from "./waitlist.js";

// Takes a seat and records the booking in one transaction.
// Returns { booking, class }, or { error: "full" } when the class is full (the
// user can join the waitlist), or { error: "unavailable" } when it already
// started or doesn't exist. Other errors are thrown after ROLLBACK (23505
// when the user already has an active booking for this class).
export async function bookClass(classId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const seat = await client.query(
      `UPDATE classes SET booked = booked + 1
       WHERE id = $1 AND booked < capacity AND starts_at > NOW()
       RETURNING id, title, starts_at, capacity, booked`,
      [classId]
    );

    if (seat.rowCount === 0) {
      const cls = await client.query(
        "SELECT 1 FROM classes WHERE id = $1 AND starts_at > NOW() AND booked >= capacity",
        [classId]
      );
      await client.query("ROLLBACK");
      return { error: cls.rowCount > 0 ? "full" : "unavailable" };
    }

    const booking = await client.query(
      "INSERT INTO bookings (user_id, class_id) VALUES ($1, $2) RETURNING id, class_id, status, created_at",
      [userId, classId]
    );

    await client.query(
      "INSERT INTO booking_events (booking_id, user_id, class_id, action) VALUES ($1, $2, $3, 'booked')",
      [booking.rows[0].id, userId, classId]
    );

    await client.query("COMMIT");
    return { booking: booking.rows[0], class: seat.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Cancels the user's active booking in one transaction. The seat goes to the
// oldest waiting entry if the class hasn't started (booked stays the same),
// otherwise booked goes down by one.
// Returns { booking, promotedUserId } (null when nobody was promoted), or
// null when there's no such active booking.
export async function cancelBooking(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the class first, so cancels and promotions for a class run one at
    // a time. The booking is checked again after the lock (see below).
    const found = await client.query(
      "SELECT class_id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'active'",
      [bookingId, userId]
    );
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const cls = await lockClass(client, found.rows[0].class_id);

    // Still active? A concurrent cancel of the same booking may have won the lock.
    const booking = await client.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id, class_id, status`,
      [bookingId, userId]
    );

    if (booking.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      "INSERT INTO booking_events (booking_id, user_id, class_id, action) VALUES ($1, $2, $3, 'cancelled')",
      [booking.rows[0].id, userId, booking.rows[0].class_id]
    );

    const [promotedUserId = null] = cls.started
      ? []
      : await promoteFromWaitlist(client, cls.id, 1);
    if (promotedUserId === null) {
      await client.query("UPDATE classes SET booked = booked - 1 WHERE id = $1", [cls.id]);
    }

    await client.query("COMMIT");
    return { booking: booking.rows[0], promotedUserId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listUpcomingForUser(userId) {
  const result = await pool.query(
    `SELECT b.id, b.class_id, c.title, c.starts_at
     FROM bookings b
     JOIN classes c ON c.id = b.class_id
     WHERE b.user_id = $1 AND b.status = 'active' AND c.starts_at > NOW()
     ORDER BY c.starts_at`,
    [userId]
  );
  return result.rows;
}

// The user's next upcoming active booking, or undefined.
export async function findNextForUser(userId) {
  const result = await pool.query(
    `SELECT b.id AS booking_id, b.class_id, c.title, c.starts_at
     FROM bookings b
     JOIN classes c ON c.id = b.class_id
     WHERE b.user_id = $1 AND b.status = 'active' AND c.starts_at > NOW()
     ORDER BY c.starts_at
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}
