import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";
import { validate, targetsSchema } from "../validate.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT calories, protein_g, fat_g, carbs_g, water_ml, updated_at FROM user_targets WHERE user_id = $1",
    [req.user.id]
  );
  res.json(result.rows[0] ?? null);
});

router.put("/", requireAuth, validate(targetsSchema), async (req, res) => {
  const { calories, proteinG, fatG, carbsG, waterMl } = req.body;

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
    [req.user.id, calories, proteinG, fatG, carbsG, waterMl]
  );
  res.json(result.rows[0]);
});

export default router;