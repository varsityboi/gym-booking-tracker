import pool from "../config/db.js";

export async function addWater(userId, ml) {
  const result = await pool.query(
    "INSERT INTO water_logs (user_id, ml) VALUES ($1, $2) RETURNING id, ml, logged_at",
    [userId, ml]
  );
  return result.rows[0];
}

// { water_ml } for the user's water logs in [startAt, endAt).
export async function getTotalBetween(userId, startAt, endAt) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(ml), 0) AS water_ml
     FROM water_logs
     WHERE user_id = $1 AND logged_at >= $2 AND logged_at < $3`,
    [userId, startAt, endAt]
  );
  return result.rows[0];
}
