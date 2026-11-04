import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../auth.js";
import { validate, createMealSchema } from "../validate.js";

const router = Router();

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
