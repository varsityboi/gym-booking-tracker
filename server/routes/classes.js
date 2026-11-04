import express from "express";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { validate, createClassSchema, updateCapacitySchema } from "../validate.js";

const router = express.Router();

router.post("/", requireAuth, requireAdmin, validate(createClassSchema), async (req, res) => {
  const { title, startsAt, capacity } = req.body;

  const result = await pool.query(
    "INSERT INTO classes (title, starts_at, capacity) VALUES ($1, $2, $3) RETURNING *",
    [title, startsAt, capacity]
  );
  res.status(201).json(result.rows[0]);
});

router.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, starts_at, capacity, booked,
            capacity - booked AS places_left
     FROM classes
     WHERE starts_at >= NOW() AND starts_at < NOW() + INTERVAL '7 days'
     ORDER BY starts_at`
  );
  res.json(result.rows);
});

router.post("/:id/book", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ error: "invalid class id" });
  }

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
      return res.status(409).json({ error: "class is full, already started, or does not exist" });
    }

    const booking = await client.query(
      "INSERT INTO bookings (user_id, class_id) VALUES ($1, $2) RETURNING id, class_id, status, created_at",
      [req.user.id, classId]
    );

    await client.query(
      "INSERT INTO booking_events (booking_id, user_id, class_id, action) VALUES ($1, $2, $3, 'booked')",
      [booking.rows[0].id, req.user.id, classId]
    );

    await client.query("COMMIT");
    res.status(201).json({ booking: booking.rows[0], class: seat.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "you already booked this class" });
    }
    throw err;
  } finally {
    client.release();
  }
});

router.patch("/:id/capacity", requireAuth, requireAdmin, validate(updateCapacitySchema), async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ error: "invalid class id" });
  }

  const { capacity } = req.body;

  // Check and update in one statement so a booking at the same moment can't
  // slip in between and leave booked > capacity.
  const result = await pool.query(
    `UPDATE classes SET capacity = $1
     WHERE id = $2 AND $1 >= booked
     RETURNING id, title, starts_at, capacity, booked,
               capacity - booked AS places_left`,
    [capacity, classId]
  );

  if (result.rowCount === 0) {
    const existing = await pool.query("SELECT booked FROM classes WHERE id = $1", [classId]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "class not found" });
    }
    return res.status(409).json({
      error: `capacity can't be lower than the number already booked (${existing.rows[0].booked})`,
    });
  }

  res.json(result.rows[0]);
});

export default router;
