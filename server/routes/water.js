import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate, waterSchema } from "../middleware/validate.js";
import { add } from "../controllers/water.js";

const router = Router();

router.post("/", requireAuth, validate(waterSchema), add);

export default router;
