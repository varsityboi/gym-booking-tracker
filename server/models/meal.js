import pool from "../config/db.js";

// Saves a meal and its items in one transaction and returns
// { mealId, rows } with one row per item, in input order:
// { name, kind, grams, calories, protein_g, fat_g, carbs_g } (pg strings).
// Errors are thrown after ROLLBACK (23503 when a foodId doesn't exist).
export async function createMeal(userId, eatenAt, items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const meal = await client.query(
      "INSERT INTO meals (user_id, eaten_at) VALUES ($1, COALESCE($2, NOW())) RETURNING id",
      [userId, eatenAt ?? null]
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
    return { mealId, rows: inserted.rows };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Today's bounds in India time: { start_at, end_at, date }.
export async function getIndiaDayBounds() {
  const bounds = await pool.query(
    `SELECT
       start_at,
       start_at + INTERVAL '1 day' AS end_at,
       to_char(start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
     FROM (
       SELECT date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AS start_at
     ) t`
  );
  return bounds.rows[0];
}

// Nutrition totals for the user's meals in [startAt, endAt).
export async function getTotalsBetween(userId, startAt, endAt) {
  // Table items take nutrition from foods, estimated items from est_*.
  const result = await pool.query(
    `SELECT
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.calories_per_100g, mi.est_calories_per_100g) / 100), 1), 0) AS calories,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.protein_per_100g, mi.est_protein_per_100g) / 100), 1), 0) AS protein_g,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.fat_per_100g, mi.est_fat_per_100g) / 100), 1), 0) AS fat_g,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.carbs_per_100g, mi.est_carbs_per_100g) / 100), 1), 0) AS carbs_g
     FROM meals m
     JOIN meal_items mi ON mi.meal_id = m.id
     LEFT JOIN foods f ON f.id = mi.food_id
     WHERE m.user_id = $1 AND m.eaten_at >= $2 AND m.eaten_at < $3`,
    [userId, startAt, endAt]
  );
  return result.rows[0];
}
