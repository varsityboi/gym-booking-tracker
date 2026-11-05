import { createMeal } from "../models/meal.js";
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
