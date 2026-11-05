import pool from "../config/db.js";

// Takes a seat and records the booking in one transaction.
// Returns { booking, class }, or null when the class is full, already started
// or doesn't exist. Other errors are thrown after ROLLBACK (23505 when the
// user already has an active booking for this class).
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
      await client.query("ROLLBACK");
      return null;
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

// Cancels the user's active booking and frees its seat in one transaction.
// Returns the cancelled booking, or null when there's no such active booking.
export async function cancelBooking(bookingId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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
      "UPDATE classes SET booked = booked - 1 WHERE id = $1",
      [booking.rows[0].class_id]
    );

    await client.query(
      "INSERT INTO booking_events (booking_id, user_id, class_id, action) VALUES ($1, $2, $3, 'cancelled')",
      [booking.rows[0].id, userId, booking.rows[0].class_id]
    );

    await client.query("COMMIT");
    return booking.rows[0];
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
