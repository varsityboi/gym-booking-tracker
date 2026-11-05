import pool from "../config/db.js";

// The stored state of a meal_items row (alias `t`), as kept in
// meal_item_events.before / after.
const snapshot = (t) => `jsonb_build_object(
  'version', ${t}.version,
  'food_id', ${t}.food_id,
  'custom_name', ${t}.custom_name,
  'grams', ${t}.grams,
  'est_calories_per_100g', ${t}.est_calories_per_100g,
  'est_protein_per_100g', ${t}.est_protein_per_100g,
  'est_fat_per_100g', ${t}.est_fat_per_100g,
  'est_carbs_per_100g', ${t}.est_carbs_per_100g,
  'deleted_at', ${t}.deleted_at
)`;

// One item with its nutrition. Needs `LEFT JOIN foods f ON f.id = <t>.food_id`.
// Table items take nutrition from foods, estimated items from est_*.
const itemColumns = (t) => `${t}.id, ${t}.meal_id, ${t}.version,
  CASE WHEN ${t}.food_id IS NULL THEN 'estimated' ELSE 'table' END AS kind,
  ${t}.food_id, COALESCE(f.name, ${t}.custom_name) AS name, ${t}.grams,
  ROUND(${t}.grams * COALESCE(f.calories_per_100g, ${t}.est_calories_per_100g) / 100, 1) AS calories,
  ROUND(${t}.grams * COALESCE(f.protein_per_100g, ${t}.est_protein_per_100g) / 100, 1) AS protein_g,
  ROUND(${t}.grams * COALESCE(f.fat_per_100g, ${t}.est_fat_per_100g) / 100, 1) AS fat_g,
  ROUND(${t}.grams * COALESCE(f.carbs_per_100g, ${t}.est_carbs_per_100g) / 100, 1) AS carbs_g`;

// Saves a meal and its items in one transaction, with one 'created' event per
// item, and returns { mealId, rows } with one row per item, in input order:
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
    // The `created` CTE writes the events; Postgres runs it even though the
    // final SELECT doesn't read it.
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
       ),
       created AS (
         INSERT INTO meal_item_events (meal_item_id, meal_id, user_id, action, after)
         SELECT ins.id, ins.meal_id, $9, 'created', ${snapshot("ins")} FROM ins
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
        userId,
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

// Bounds of a given India date ('YYYY-MM-DD'): { start_at, end_at, date }.
export async function getIndiaDayBoundsFor(date) {
  const bounds = await pool.query(
    `SELECT
       start_at,
       start_at + INTERVAL '1 day' AS end_at,
       to_char(start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
     FROM (SELECT ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AS start_at) t`,
    [date]
  );
  return bounds.rows[0];
}

// Nutrition totals for the user's meals in [startAt, endAt), deleted items left out.
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
     WHERE m.user_id = $1 AND m.eaten_at >= $2 AND m.eaten_at < $3
       AND mi.deleted_at IS NULL`,
    [userId, startAt, endAt]
  );
  return result.rows[0];
}

// The user's meals in [startAt, endAt) with their (not deleted) items.
// Returns { meals: [{ id, eaten_at }], items: [item columns], totals } where
// totals has one row per meal (meal_id set) and one for the day (meal_id
// null), each summed before rounding, like /me/today.
export async function listMealsBetween(userId, startAt, endAt) {
  const params = [userId, startAt, endAt];
  const meals = await pool.query(
    `SELECT id, eaten_at FROM meals
     WHERE user_id = $1 AND eaten_at >= $2 AND eaten_at < $3
     ORDER BY eaten_at, id`,
    params
  );
  const items = await pool.query(
    `SELECT ${itemColumns("mi")}
     FROM meal_items mi
     JOIN meals m ON m.id = mi.meal_id
     LEFT JOIN foods f ON f.id = mi.food_id
     WHERE m.user_id = $1 AND m.eaten_at >= $2 AND m.eaten_at < $3
       AND mi.deleted_at IS NULL
     ORDER BY mi.id`,
    params
  );
  const totals = await pool.query(
    `SELECT mi.meal_id,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.calories_per_100g, mi.est_calories_per_100g) / 100), 1), 0) AS calories,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.protein_per_100g, mi.est_protein_per_100g) / 100), 1), 0) AS protein_g,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.fat_per_100g, mi.est_fat_per_100g) / 100), 1), 0) AS fat_g,
       COALESCE(ROUND(SUM(mi.grams * COALESCE(f.carbs_per_100g, mi.est_carbs_per_100g) / 100), 1), 0) AS carbs_g
     FROM meals m
     JOIN meal_items mi ON mi.meal_id = m.id
     LEFT JOIN foods f ON f.id = mi.food_id
     WHERE m.user_id = $1 AND m.eaten_at >= $2 AND m.eaten_at < $3
       AND mi.deleted_at IS NULL
     GROUP BY GROUPING SETS ((mi.meal_id), ())`,
    params
  );
  return { meals: meals.rows, items: items.rows, totals: totals.rows };
}

// Locks one of the user's items for a change. Returns { version, snapshot }, or
// undefined when the item doesn't exist, isn't in that meal, isn't the
// user's, or was deleted. FOR UPDATE waits for a concurrent change and then
// returns the row as that change left it, so the version check sees it.
async function lockItem(client, userId, mealId, itemId) {
  const result = await client.query(
    `SELECT mi.version, mi.deleted_at, ${snapshot("mi")} AS snapshot
     FROM meal_items mi
     JOIN meals m ON m.id = mi.meal_id
     WHERE mi.id = $1 AND mi.meal_id = $2 AND m.user_id = $3
     FOR UPDATE OF mi`,
    [itemId, mealId, userId]
  );
  const row = result.rows[0];
  return row && row.deleted_at === null ? row : undefined;
}

async function itemWithNutrition(client, itemId) {
  const result = await client.query(
    `SELECT ${itemColumns("mi")}
     FROM meal_items mi
     LEFT JOIN foods f ON f.id = mi.food_id
     WHERE mi.id = $1`,
    [itemId]
  );
  return result.rows[0];
}

// Edits one of the user's items in one transaction, if `version` is current.
// change: { grams?, foodId? } or { grams?, estimate: { name, caloriesPer100g,
// proteinPer100g, fatPer100g, carbsPer100g } }. Switching kind clears the
// other side's columns, so the table/estimate CHECK holds.
// Returns { item }, or { error: "not_found" | "stale" }. Errors are thrown
// after ROLLBACK (23503 when foodId doesn't exist).
export async function editItem(userId, mealId, itemId, version, change) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await lockItem(client, userId, mealId, itemId);
    let error;
    if (!locked) error = "not_found";
    else if (locked.version !== version) error = "stale";
    if (error) {
      await client.query("ROLLBACK");
      return { error };
    }

    const to = change.foodId !== undefined ? "table" : change.estimate ? "estimated" : null;
    const e = change.estimate ?? {};
    const updated = await client.query(
      `UPDATE meal_items SET
         grams = COALESCE($2::numeric, grams),
         food_id = CASE $3::text WHEN 'table' THEN $4::int WHEN 'estimated' THEN NULL ELSE food_id END,
         custom_name = CASE $3::text WHEN 'table' THEN NULL WHEN 'estimated' THEN $5::text ELSE custom_name END,
         est_calories_per_100g = CASE $3::text WHEN 'table' THEN NULL WHEN 'estimated' THEN $6::numeric ELSE est_calories_per_100g END,
         est_protein_per_100g = CASE $3::text WHEN 'table' THEN NULL WHEN 'estimated' THEN $7::numeric ELSE est_protein_per_100g END,
         est_fat_per_100g = CASE $3::text WHEN 'table' THEN NULL WHEN 'estimated' THEN $8::numeric ELSE est_fat_per_100g END,
         est_carbs_per_100g = CASE $3::text WHEN 'table' THEN NULL WHEN 'estimated' THEN $9::numeric ELSE est_carbs_per_100g END,
         version = version + 1
       WHERE id = $1
       RETURNING meal_id, ${snapshot("meal_items")} AS snapshot`,
      [
        itemId,
        change.grams ?? null,
        to,
        change.foodId ?? null,
        e.name ?? null,
        e.caloriesPer100g ?? null,
        e.proteinPer100g ?? null,
        e.fatPer100g ?? null,
        e.carbsPer100g ?? null,
      ]
    );

    await client.query(
      `INSERT INTO meal_item_events (meal_item_id, meal_id, user_id, action, before, after)
       VALUES ($1, $2, $3, 'edited', $4, $5)`,
      [itemId, mealId, userId, locked.snapshot, updated.rows[0].snapshot]
    );
    const item = await itemWithNutrition(client, itemId);

    await client.query("COMMIT");
    return { item };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Marks one of the user's items deleted in one transaction, if `version` is
// current. Returns { item: { id, version, deleted_at } }, or
// { error: "not_found" | "stale" }.
export async function removeItem(userId, mealId, itemId, version) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await lockItem(client, userId, mealId, itemId);
    let error;
    if (!locked) error = "not_found";
    else if (locked.version !== version) error = "stale";
    if (error) {
      await client.query("ROLLBACK");
      return { error };
    }

    const removed = await client.query(
      `UPDATE meal_items SET deleted_at = NOW(), version = version + 1
       WHERE id = $1
       RETURNING id, version, deleted_at`,
      [itemId]
    );
    await client.query(
      `INSERT INTO meal_item_events (meal_item_id, meal_id, user_id, action, before)
       VALUES ($1, $2, $3, 'removed', $4)`,
      [itemId, mealId, userId, locked.snapshot]
    );

    await client.query("COMMIT");
    return { item: removed.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Adds one item (validated like createMeal's items) to the user's meal in one
// transaction, with a 'created' event. Returns { item }, or
// { error: "not_found" } when the meal isn't hers. Errors are thrown after
// ROLLBACK (23503 when foodId doesn't exist).
export async function addItem(userId, mealId, item) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const meal = await client.query(
      "SELECT 1 FROM meals WHERE id = $1 AND user_id = $2",
      [mealId, userId]
    );
    if (meal.rowCount === 0) {
      await client.query("ROLLBACK");
      return { error: "not_found" };
    }

    const est = (key) => (item.kind === "estimated" ? item[key] : null);
    const inserted = await client.query(
      `INSERT INTO meal_items (meal_id, food_id, grams, custom_name,
                               est_calories_per_100g, est_protein_per_100g,
                               est_fat_per_100g, est_carbs_per_100g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, ${snapshot("meal_items")} AS snapshot`,
      [
        mealId,
        item.kind === "table" ? item.foodId : null,
        item.grams,
        est("name"),
        est("caloriesPer100g"),
        est("proteinPer100g"),
        est("fatPer100g"),
        est("carbsPer100g"),
      ]
    );
    const { id: itemId, snapshot: after } = inserted.rows[0];
    await client.query(
      `INSERT INTO meal_item_events (meal_item_id, meal_id, user_id, action, after)
       VALUES ($1, $2, $3, 'created', $4)`,
      [itemId, mealId, userId, after]
    );
    const added = await itemWithNutrition(client, itemId);

    await client.query("COMMIT");
    return { item: added };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// All events for the user's meal, oldest first, or null when the meal isn't hers.
export async function getMealHistory(userId, mealId) {
  const meal = await pool.query("SELECT 1 FROM meals WHERE id = $1 AND user_id = $2", [
    mealId,
    userId,
  ]);
  if (meal.rowCount === 0) return null;
  const events = await pool.query(
    `SELECT id, meal_item_id, action, before, after, created_at
     FROM meal_item_events
     WHERE meal_id = $1
     ORDER BY id`,
    [mealId]
  );
  return events.rows;
}
