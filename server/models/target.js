import pool from "../config/db.js";

// The user's targets with updated_at, or undefined when none are set.
export async function findByUser(userId) {
  const result = await pool.query(
    "SELECT calories, protein_g, fat_g, carbs_g, water_ml, updated_at FROM user_targets WHERE user_id = $1",
    [userId]
  );
  return result.rows[0];
}

// The user's target values only (no updated_at), or undefined.
export async function findValuesByUser(userId) {
  const result = await pool.query(
    "SELECT calories, protein_g, fat_g, carbs_g, water_ml FROM user_targets WHERE user_id = $1",
    [userId]
  );
  return result.rows[0];
}

export async function upsertTargets(userId, { calories, proteinG, fatG, carbsG, waterMl }) {
  const result = await pool.query(
    `INSERT INTO user_targets (user_id, calories, protein_g, fat_g, carbs_g, water_ml)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       calories = EXCLUDED.calories,
       protein_g = EXCLUDED.protein_g,
       fat_g = EXCLUDED.fat_g,
       carbs_g = EXCLUDED.carbs_g,
       water_ml = EXCLUDED.water_ml,
       updated_at = NOW()
     RETURNING calories, protein_g, fat_g, carbs_g, water_ml, updated_at`,
    [userId, calories, proteinG, fatG, carbsG, waterMl]
  );
  return result.rows[0];
}
