import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  validate,
  createClassSchema,
  updateCapacitySchema,
  cancelClassSchema,
} from "../middleware/validate.js";
import {
  create,
  list,
  book,
  setCapacity,
  joinWaitlistForClass,
  leaveWaitlistForClass,
  cancel,
} from "../controllers/classes.js";

const router = express.Router();

router.post("/", requireAuth, requireAdmin, validate(createClassSchema), create);
router.get("/", requireAuth, list);
router.post("/:id/book", requireAuth, book);
router.patch("/:id/capacity", requireAuth, requireAdmin, validate(updateCapacitySchema), setCapacity);
router.post("/:id/waitlist", requireAuth, joinWaitlistForClass);
router.post("/:id/waitlist/leave", requireAuth, leaveWaitlistForClass);
router.post("/:id/cancel", requireAuth, requireAdmin, validate(cancelClassSchema), cancel);

export default router;
