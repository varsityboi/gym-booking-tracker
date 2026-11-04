import { Router } from "express";
import { requireAuth } from "../auth.js";
import { searchFoods } from "../foodSearch.js";

const router = Router();

router.get("/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2 || q.length > 100) {
    return res.status(400).json({ error: "q must be 2 to 100 characters" });
  }

  const rows = await searchFoods(q);
  res.json(rows);
});

export default router;