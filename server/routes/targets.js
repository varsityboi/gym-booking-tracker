import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate, targetsSchema } from "../middleware/validate.js";
import { get, put } from "../controllers/targets.js";

const router = Router();

router.get("/", requireAuth, get);
router.put("/", requireAuth, validate(targetsSchema), put);

export default router;
