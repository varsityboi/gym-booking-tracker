import { Router } from "express";
import { root, dbTest } from "../controllers/health.js";

const router = Router();

router.get("/", root);
router.get("/db-test", dbTest);

export default router;
