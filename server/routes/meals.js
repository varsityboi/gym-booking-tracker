import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";
import { validate, createMealSchema } from "../validate.js";
import multer from "multer";
import { readPlate } from "../gemini.js";
import { searchFoods } from "../foodSearch.js";
const router = Router();

const round1 = (n) => Math.round(n * 10) / 10;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, PHOTO_TYPES.includes(file.mimetype)),
});

// Reads a plate photo and suggests matching foods. Saves nothing.
router.post("/analyze", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "send a photo (jpeg, png, webp or heic) in the 'photo' field" });
  }

  let detectedItems;
  try {
    detectedItems = await readPlate(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "couldn't read the photo, please try again" });
  }

  const items = await Promise.all(
    detectedItems.map(async ({ name, grams }) => {
      const [top, ...rest] = await searchFoods(name, 3);
      const per = (value) => round1((grams * value) / 100);
      return {
        detected: name,
        grams,
        match: top
          ? {
              foodId: top.id,
              name: top.name,
              calories: per(top.calories_per_100g),
              protein_g: per(top.protein_per_100g),
              fat_g: per(top.fat_per_100g),
              carbs_g: per(top.carbs_per_100g),
            }
          : null,
        confident: top ? top.score >= 0.8 : false,
        alternatives: rest.map((r) => ({ foodId: r.id, name: r.name })),
      };
    })
  );

  res.json({ items });
});

router.post("/", requireAuth, validate(createMealSchema), async (req, res) => {
  const { eatenAt, items } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const meal = await client.query(
      "INSERT INTO meals (user_id, eaten_at) VALUES ($1, COALESCE($2, NOW())) RETURNING id",
      [req.user.id, eatenAt ?? null]
    );
    const mealId = meal.rows[0].id;

    // One meal_items row per item, inserted in a single statement, then joined
    // to foods so each row comes back with its name and computed nutrition.
    const inserted = await client.query(
      `WITH ins AS (
         INSERT INTO meal_items (meal_id, food_id, grams)
         SELECT $1, food_id, grams
         FROM unnest($2::int[], $3::numeric[]) AS t(food_id, grams)
         RETURNING id, food_id, grams
       )
       SELECT f.name,
              ins.grams,
              ROUND(ins.grams * f.calories_per_100g / 100, 1) AS calories,
              ROUND(ins.grams * f.protein_per_100g / 100, 1) AS protein_g,
              ROUND(ins.grams * f.fat_per_100g / 100, 1) AS fat_g,
              ROUND(ins.grams * f.carbs_per_100g / 100, 1) AS carbs_g
       FROM ins
       JOIN foods f ON f.id = ins.food_id
       ORDER BY ins.id`,
      [mealId, items.map((i) => i.foodId), items.map((i) => i.grams)]
    );

    await client.query("COMMIT");

    // pg returns NUMERIC as strings, so convert to numbers.
    res.status(201).json({
      mealId,
      items: inserted.rows.map((r) => ({
        name: r.name,
        grams: Number(r.grams),
        calories: Number(r.calories),
        protein_g: Number(r.protein_g),
        fat_g: Number(r.fat_g),
        carbs_g: Number(r.carbs_g),
      })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return res.status(400).json({ error: "one of the foods does not exist" });
    }
    throw err;
  } finally {
    client.release();
  }
});

export default router;
