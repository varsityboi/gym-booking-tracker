import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate, signupSchema, loginSchema } from "../middleware/validate.js";
import { signup, login, me } from "../controllers/auth.js";

const router = express.Router();

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
router.get("/me", requireAuth, me);

export default router;
