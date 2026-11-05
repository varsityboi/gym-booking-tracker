import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { search } from "../controllers/foods.js";

const router = Router();

router.get("/search", requireAuth, search);

export default router;
