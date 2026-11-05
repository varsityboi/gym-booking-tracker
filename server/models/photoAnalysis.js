import pool from "../config/db.js";

// How many photos the user has had analysed since the start of today (India time).
export async function countTodayForUser(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM photo_analyses
     WHERE user_id = $1
       AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`,
    [userId]
  );
  return result.rows[0].n;
}

// Records one analysis, successful or not.
export async function recordAnalysis(userId, { visionProvider, durationMs, ok }) {
  await pool.query(
    `INSERT INTO photo_analyses (user_id, vision_provider, duration_ms, ok)
     VALUES ($1, $2, $3, $4)`,
    [userId, visionProvider ?? null, durationMs, ok]
  );
}
