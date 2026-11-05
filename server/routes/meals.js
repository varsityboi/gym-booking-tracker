import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import {
  validate,
  validateQuery,
  createMealSchema,
  mealsDayQuerySchema,
  addMealItemSchema,
  editMealItemSchema,
  removeMealItemSchema,
} from "../middleware/validate.js";
import {
  analyze,
  create,
  list,
  addItemToMeal,
  editMealItem,
  removeMealItem,
  history,
} from "../controllers/meals.js";
const router = Router();

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, PHOTO_TYPES.includes(file.mimetype)),
});

router.post("/analyze", requireAuth, upload.single("photo"), analyze);
router.post("/", requireAuth, validate(createMealSchema), create);
router.get("/", requireAuth, validateQuery(mealsDayQuerySchema), list);
router.post("/:mealId/items", requireAuth, validate(addMealItemSchema), addItemToMeal);
router.patch("/:mealId/items/:itemId", requireAuth, validate(editMealItemSchema), editMealItem);
router.delete("/:mealId/items/:itemId", requireAuth, validate(removeMealItemSchema), removeMealItem);
router.get("/:mealId/history", requireAuth, history);

export default router;
