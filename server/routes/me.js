import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

const round1 = (n) => Math.round(n * 10) / 10;

router.get("/today", requireAuth, async (req, res) => {
  const userId = req.user.id;

  // Compute the India-time day bounds once, so every query below uses the
  // exact same window even if the request runs across midnight.
  const bounds = await pool.query(
    `SELECT
       start_at,
       start_at + INTERVAL '1 day' AS end_at,
       to_char(start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
     FROM (
       SELECT date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AS start_at
     ) t`
  );
  const { start_at: startAt, end_at: endAt, date } = bounds.rows[0];

  const [totalsResult, waterResult, targetsResult, nextClassResult] = await Promise.all([
    // Table items take nutrition from foods, estimated items from est_*.
    pool.query(
      `SELECT
         COALESCE(ROUND(SUM(mi.grams * COALESCE(f.calories_per_100g, mi.est_calories_per_100g) / 100), 1), 0) AS calories,
         COALESCE(ROUND(SUM(mi.grams * COALESCE(f.protein_per_100g, mi.est_protein_per_100g) / 100), 1), 0) AS protein_g,
         COALESCE(ROUND(SUM(mi.grams * COALESCE(f.fat_per_100g, mi.est_fat_per_100g) / 100), 1), 0) AS fat_g,
         COALESCE(ROUND(SUM(mi.grams * COALESCE(f.carbs_per_100g, mi.est_carbs_per_100g) / 100), 1), 0) AS carbs_g
       FROM meals m
       JOIN meal_items mi ON mi.meal_id = m.id
       LEFT JOIN foods f ON f.id = mi.food_id
       WHERE m.user_id = $1 AND m.eaten_at >= $2 AND m.eaten_at < $3`,
      [userId, startAt, endAt]
    ),
    pool.query(
      `SELECT COALESCE(SUM(ml), 0) AS water_ml
       FROM water_logs
       WHERE user_id = $1 AND logged_at >= $2 AND logged_at < $3`,
      [userId, startAt, endAt]
    ),
    pool.query(
      "SELECT calories, protein_g, fat_g, carbs_g, water_ml FROM user_targets WHERE user_id = $1",
      [userId]
    ),
    pool.query(
      `SELECT b.id AS booking_id, b.class_id, c.title, c.starts_at
       FROM bookings b
       JOIN classes c ON c.id = b.class_id
       WHERE b.user_id = $1 AND b.status = 'active' AND c.starts_at > NOW()
       ORDER BY c.starts_at
       LIMIT 1`,
      [userId]
    ),
  ]);

  // pg returns NUMERIC and SUM(int) (bigint) as strings, so convert to numbers.
  const t = totalsResult.rows[0];
  const totals = {
    calories: Number(t.calories),
    protein_g: Number(t.protein_g),
    fat_g: Number(t.fat_g),
    carbs_g: Number(t.carbs_g),
  };
  const waterMl = Number(waterResult.rows[0].water_ml);
  const targets = targetsResult.rows[0] ?? null;

  const remaining = targets
    ? {
        calories: round1(targets.calories - totals.calories),
        protein_g: round1(targets.protein_g - totals.protein_g),
        fat_g: round1(targets.fat_g - totals.fat_g),
        carbs_g: round1(targets.carbs_g - totals.carbs_g),
        water_ml: targets.water_ml - waterMl,
      }
    : null;

  res.json({
    date,
    totals,
    water_ml: waterMl,
    targets,
    remaining,
    next_class: nextClassResult.rows[0] ?? null,
  });
});

export default router;
