import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate, signupSchema, loginSchema } from "../middleware/validate.js";
import { loginLimiter, signupLimiter } from "../middleware/rateLimit.js";
import { signup, login, me } from "../controllers/auth.js";

const router = express.Router();

// The limiters run before validation, so invalid bodies count as failed attempts too.
router.post("/signup", signupLimiter, validate(signupSchema), signup);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.get("/me", requireAuth, me);

export default router;
