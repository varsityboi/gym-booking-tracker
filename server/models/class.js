import pool from "../config/db.js";

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

// Returns the updated class, or null when the class doesn't exist or the new
// capacity is below the number already booked.
export async function updateCapacity(classId, capacity) {
  // Check and update in one statement so a booking at the same moment can't
  // slip in between and leave booked > capacity.
  const result = await pool.query(
    `UPDATE classes SET capacity = $1
     WHERE id = $2 AND $1 >= booked
     RETURNING id, title, starts_at, capacity, booked,
               capacity - booked AS places_left`,
    [capacity, classId]
  );
  return result.rowCount === 0 ? null : result.rows[0];
}

// Returns { booked }, or null when the class doesn't exist.
export async function findBooked(classId) {
  const existing = await pool.query("SELECT booked FROM classes WHERE id = $1", [classId]);
  return existing.rowCount === 0 ? null : existing.rows[0];
}
