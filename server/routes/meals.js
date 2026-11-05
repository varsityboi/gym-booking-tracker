import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { validate, createMealSchema } from "../middleware/validate.js";
import { analyze, create } from "../controllers/meals.js";
const router = Router();

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, PHOTO_TYPES.includes(file.mimetype)),
});

router.post("/analyze", requireAuth, upload.single("photo"), analyze);
router.post("/", requireAuth, validate(createMealSchema), create);

export default router;
