import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";
import { validate, waterSchema } from "../validate.js";

const router = Router();

router.post("/", requireAuth, validate(waterSchema), async (req, res) => {
  const result = await pool.query(
    "INSERT INTO water_logs (user_id, ml) VALUES ($1, $2) RETURNING id, ml, logged_at",
    [req.user.id, req.body.ml]
  );
  res.status(201).json(result.rows[0]);
});

export default router;