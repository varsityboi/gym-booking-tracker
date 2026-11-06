import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateQuery, adminClassesQuerySchema } from "../middleware/validate.js";
import { listClasses, classPeople } from "../controllers/admin.js";

// Read-only views for admins. Every route needs an admin token.
const router = Router();

router.get("/classes", requireAuth, requireAdmin, validateQuery(adminClassesQuerySchema), listClasses);
router.get("/classes/:id/people", requireAuth, requireAdmin, classPeople);

export default router;
