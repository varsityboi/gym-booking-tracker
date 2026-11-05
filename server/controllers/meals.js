import {
  createMeal,
  getIndiaDayBounds,
  getIndiaDayBoundsFor,
  listMealsBetween,
  editItem,
  removeItem,
  addItem,
  getMealHistory,
} from "../models/meal.js";
import { readPlate } from "../services/gemini.js";
import { analyzeItems } from "../services/analyze.js";

// Reads a plate photo and suggests matching foods. Saves nothing.
export async function analyze(req, res) {
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
}

export async function create(req, res) {
  const { eatenAt, items } = req.body;

  try {
    const { mealId, rows } = await createMeal(req.user.id, eatenAt, items);

    // pg returns NUMERIC as strings, so convert to numbers.
    res.status(201).json({
      mealId,
      items: rows.map((r) => ({
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
    if (err.code === "23503") {
      return res.status(400).json({ error: "one of the foods does not exist" });
    }
    throw err;
  }
}

const formatItem = (r) => ({
  id: r.id,
  version: r.version,
  kind: r.kind,
  foodId: r.food_id,
  name: r.name,
  grams: Number(r.grams),
  nutrition: {
    calories: Number(r.calories),
    protein_g: Number(r.protein_g),
    fat_g: Number(r.fat_g),
    carbs_g: Number(r.carbs_g),
  },
});

const formatTotals = (t) => ({
  calories: Number(t?.calories ?? 0),
  protein_g: Number(t?.protein_g ?? 0),
  fat_g: Number(t?.fat_g ?? 0),
  carbs_g: Number(t?.carbs_g ?? 0),
});

// A positive whole-number route param, or null (after sending 400).
function idParam(req, res, name, label) {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: `invalid ${label} id` });
    return null;
  }
  return id;
}

const ITEM_ERRORS = {
  not_found: [404, "meal item not found"],
  stale: [409, "this item changed, reload it"],
};

// GET /meals?date=YYYY-MM-DD: the day's meals (India time, default today)
// with their items, per-meal totals and day totals. Deleted items are left out.
export async function list(req, res) {
  const { date } = req.validatedQuery;
  const bounds = date ? await getIndiaDayBoundsFor(date) : await getIndiaDayBounds();
  const { meals, items, totals } = await listMealsBetween(req.user.id, bounds.start_at, bounds.end_at);

  const totalsByMeal = new Map(totals.filter((t) => t.meal_id !== null).map((t) => [t.meal_id, t]));
  res.json({
    date: bounds.date,
    meals: meals.map((m) => ({
      id: m.id,
      eaten_at: m.eaten_at,
      items: items.filter((i) => i.meal_id === m.id).map(formatItem),
      totals: formatTotals(totalsByMeal.get(m.id)),
    })),
    totals: formatTotals(totals.find((t) => t.meal_id === null)),
  });
}

export async function addItemToMeal(req, res) {
  const mealId = idParam(req, res, "mealId", "meal");
  if (mealId === null) return;

  try {
    const result = await addItem(req.user.id, mealId, req.body);
    if (result.error) {
      return res.status(404).json({ error: "meal not found" });
    }
    res.status(201).json(formatItem(result.item));
  } catch (err) {
    if (err.code === "23503") {
      return res.status(400).json({ error: "food does not exist" });
    }
    throw err;
  }
}

export async function editMealItem(req, res) {
  const mealId = idParam(req, res, "mealId", "meal");
  if (mealId === null) return;
  const itemId = idParam(req, res, "itemId", "item");
  if (itemId === null) return;

  const { version, grams, foodId, name, caloriesPer100g, proteinPer100g, fatPer100g, carbsPer100g } =
    req.body;
  const change = { grams, foodId };
  if (name !== undefined) {
    change.estimate = { name, caloriesPer100g, proteinPer100g, fatPer100g, carbsPer100g };
  }

  try {
    const result = await editItem(req.user.id, mealId, itemId, version, change);
    if (result.error) {
      const [status, error] = ITEM_ERRORS[result.error];
      return res.status(status).json({ error });
    }
    res.json(formatItem(result.item));
  } catch (err) {
    if (err.code === "23503") {
      return res.status(400).json({ error: "food does not exist" });
    }
    throw err;
  }
}

export async function removeMealItem(req, res) {
  const mealId = idParam(req, res, "mealId", "meal");
  if (mealId === null) return;
  const itemId = idParam(req, res, "itemId", "item");
  if (itemId === null) return;

  const result = await removeItem(req.user.id, mealId, itemId, req.body.version);
  if (result.error) {
    const [status, error] = ITEM_ERRORS[result.error];
    return res.status(status).json({ error });
  }
  res.json(result.item);
}

export async function history(req, res) {
  const mealId = idParam(req, res, "mealId", "meal");
  if (mealId === null) return;

  const events = await getMealHistory(req.user.id, mealId);
  if (!events) {
    return res.status(404).json({ error: "meal not found" });
  }
  res.json({ mealId, events });
}
