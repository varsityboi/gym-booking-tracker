import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { today } from "../controllers/me.js";

const router = Router();

router.get("/today", requireAuth, today);

export default router;
