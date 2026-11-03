import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { validate, signupSchema, loginSchema, createClassSchema } from "./validate.js";

const app = express();
app.use(express.json());
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Gym API is running");
});

app.get("/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.send(result.rows[0]);
});

app.post("/auth/signup", validate(signupSchema), async (req, res) => {
  const { name, email, password } = req.body;

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role",
      [name, email, passwordHash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already registered" });
    }
    throw err;
  }
});

app.post("/auth/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "wrong email or password" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [req.user.id]
  );
  res.json(result.rows[0]);
});

app.post("/classes", requireAuth, requireAdmin, validate(createClassSchema), async (req, res) => {
  const { title, startsAt, capacity } = req.body;

  const result = await pool.query(
    "INSERT INTO classes (title, starts_at, capacity) VALUES ($1, $2, $3) RETURNING *",
    [title, startsAt, capacity]
  );
  res.status(201).json(result.rows[0]);
});

app.get("/classes", requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, starts_at, capacity, booked,
            capacity - booked AS places_left
     FROM classes
     WHERE starts_at >= NOW() AND starts_at < NOW() + INTERVAL '7 days'
     ORDER BY starts_at`
  );
  res.json(result.rows);
});

app.post("/classes/:id/book", requireAuth, async (req, res) => {
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

app.post("/bookings/:id/cancel", requireAuth, async (req, res) => {
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

app.get("/bookings/mine", requireAuth, async (req, res) => {
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

app.use((req, res) => {
  res.status(404).json({ error: "route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid JSON in request body" });
  }
  res.status(500).json({ error: "something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});