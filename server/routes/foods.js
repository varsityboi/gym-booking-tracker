import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

router.get("/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2 || q.length > 100) {
    return res.status(400).json({ error: "q must be 2 to 100 characters" });
  }

  const result = await pool.query(
    `SELECT id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g,
            word_similarity($1, name) AS score
     FROM foods
     WHERE $1 <% name OR name ILIKE '%' || $1 || '%'
     ORDER BY score DESC
     LIMIT 10`,
    [q]
  );
  res.json(result.rows);
});

export default router;