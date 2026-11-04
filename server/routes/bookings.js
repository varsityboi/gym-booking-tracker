import express from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";

const router = express.Router();

router.get("/mine", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT b.id, b.class_id, c.title, c.starts_at
     FROM bookings b
     JOIN classes c ON c.id = b.class_id
     WHERE b.user_id = $1 AND b.status = 'active' AND c.starts_at > NOW()
     ORDER BY c.starts_at`,
    [req.user.id]
  );
  res.json(result.rows);
});

router.post("/:id/cancel", requireAuth, async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: "invalid booking id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const booking = await client.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id, class_id, status`,
      [bookingId, req.user.id]
    );

    if (booking.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "active booking not found" });
    }

    await client.query(
      "UPDATE classes SET booked = booked - 1 WHERE id = $1",
      [booking.rows[0].class_id]
    );

    await client.query(
      "INSERT INTO booking_events (booking_id, user_id, class_id, action) VALUES ($1, $2, $3, 'cancelled')",
      [booking.rows[0].id, req.user.id, booking.rows[0].class_id]
    );

    await client.query("COMMIT");
    res.json({ booking: booking.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
