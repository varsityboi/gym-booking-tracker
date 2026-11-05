import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";
import { validate, createMealSchema } from "../validate.js";
import multer from "multer";
import { readPlate } from "../gemini.js";
import { analyzeItems } from "../analyze.js";
const router = Router();

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
  let visionProvider;
  try {
    ({ items: detectedItems, provider: visionProvider } = await readPlate(
      req.file.buffer,
      req.file.mimetype
    ));
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "couldn't read the photo, please try again" });
  }

  // Nothing is saved here; the client confirms or edits, then POSTs /meals.
  res.json(await analyzeItems(detectedItems, { visionProvider }));
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

    // One meal_items row per item, inserted in a single statement. Table items
    // set food_id; estimated items set custom_name and the est_* columns (the
    // other side is NULL). Nutrition comes from foods or from est_*, whichever
    // the row has. unnest keeps the input order, so ins.id follows it too.
    const est = (i, key) => (i.kind === "estimated" ? i[key] : null);
    const inserted = await client.query(
      `WITH ins AS (
         INSERT INTO meal_items (meal_id, food_id, grams, custom_name,
                                 est_calories_per_100g, est_protein_per_100g,
                                 est_fat_per_100g, est_carbs_per_100g)
         SELECT $1, food_id, grams, custom_name, cal, protein, fat, carbs
         FROM unnest($2::int[], $3::numeric[], $4::text[],
                     $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[])
              AS t(food_id, grams, custom_name, cal, protein, fat, carbs)
         RETURNING *
       )
       SELECT COALESCE(f.name, ins.custom_name) AS name,
              CASE WHEN ins.food_id IS NULL THEN 'estimated' ELSE 'table' END AS kind,
              ins.grams,
              ROUND(ins.grams * COALESCE(f.calories_per_100g, ins.est_calories_per_100g) / 100, 1) AS calories,
              ROUND(ins.grams * COALESCE(f.protein_per_100g, ins.est_protein_per_100g) / 100, 1) AS protein_g,
              ROUND(ins.grams * COALESCE(f.fat_per_100g, ins.est_fat_per_100g) / 100, 1) AS fat_g,
              ROUND(ins.grams * COALESCE(f.carbs_per_100g, ins.est_carbs_per_100g) / 100, 1) AS carbs_g
       FROM ins
       LEFT JOIN foods f ON f.id = ins.food_id
       ORDER BY ins.id`,
      [
        mealId,
        items.map((i) => (i.kind === "table" ? i.foodId : null)),
        items.map((i) => i.grams),
        items.map((i) => est(i, "name")),
        items.map((i) => est(i, "caloriesPer100g")),
        items.map((i) => est(i, "proteinPer100g")),
        items.map((i) => est(i, "fatPer100g")),
        items.map((i) => est(i, "carbsPer100g")),
      ]
    );

    await client.query("COMMIT");

    // pg returns NUMERIC as strings, so convert to numbers.
    res.status(201).json({
      mealId,
      items: inserted.rows.map((r) => ({
        name: r.name,
        kind: r.kind,
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
