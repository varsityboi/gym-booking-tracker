import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { mine, cancel } from "../controllers/bookings.js";

const router = express.Router();

router.get("/mine", requireAuth, mine);
router.post("/:id/cancel", requireAuth, cancel);

export default router;
