import { searchFoods } from "./foodSearch.js";
import { pickMatches, estimateNutrition } from "./gemini.js";

const round1 = (n) => Math.round(n * 10) / 10;
// 268 stays "268", 6.25 becomes "6.3".
const fmt = (n) => String(round1(n));

const MACROS = ["calories", "protein_g", "fat_g", "carbs_g"];

// Used when the AI pick fails: the top search result is the match, and it's
// confident only when strong and clearly ahead of the runner-up.
const combined = (r) => r.score + r.full;
export const isConfident = (top, second) =>
  Boolean(top) &&
  top.score >= 0.8 &&
  (!second || combined(top) - combined(second) >= 0.1);

const scale = (per100g, grams) =>
  Object.fromEntries(MACROS.map((k) => [k, round1((per100g[k] * grams) / 100)]));

const tablePer100g = (row) => ({
  calories: row.calories_per_100g,
  protein_g: row.protein_per_100g,
  fat_g: row.fat_per_100g,
  carbs_g: row.carbs_per_100g,
});

// Turns readPlate's [{ name, grams }] into analyze items with nutrition and
// meal totals. Gemini failures after readPlate don't fail the request: a
// failed pick falls back to search ranking, a failed estimate leaves the
// item unknown. `gemini` is passed through to the Gemini calls (tests use it
// for a fake create).
export async function analyzeItems(detectedItems, { search = searchFoods, gemini = {} } = {}) {
  const found = await Promise.all(
    detectedItems.map(async ({ name, grams }) => ({
      detected: name,
      grams,
      candidates: await search(name, 8),
    }))
  );

  // matches[i] = { row, confident } or null when nothing in the table fits.
  let source = "ai";
  let matches;
  try {
    const picked = await pickMatches(
      found.map(({ detected, grams, candidates }) => ({
        detected,
        grams,
        candidates: candidates.map(({ id, name }) => ({ id, name })),
      })),
      gemini
    );
    matches = found.map(({ candidates }, i) => {
      const row = candidates.find((c) => c.id === picked[i]);
      return row ? { row, confident: true } : null;
    });
  } catch (err) {
    console.warn(`analyze: pickMatches failed, using search ranking (${err.message})`);
    source = "search";
    matches = found.map(({ candidates: [top, second] }) =>
      top ? { row: top, confident: isConfident(top, second) } : null
    );
  }

  const unmatched = found.flatMap((_, i) => (matches[i] ? [] : [i]));
  const estimates = new Map();
  if (unmatched.length > 0) {
    try {
      const results = await estimateNutrition(
        unmatched.map((i) => ({ name: found[i].detected })),
        gemini
      );
      unmatched.forEach((i, j) => estimates.set(i, results[j] ?? null));
    } catch (err) {
      console.warn(`analyze: estimateNutrition failed, leaving items unknown (${err.message})`);
    }
  }

  const items = found.map(({ detected, grams, candidates }, i) => {
    const match = matches[i];
    const alternatives = candidates
      .filter((c) => c.id !== match?.row.id)
      .slice(0, 2)
      .map((c) => ({ foodId: c.id, name: c.name }));
    const base = { detected, grams, source, alternatives };

    if (match) {
      const per100g = tablePer100g(match.row);
      const nutrition = scale(per100g, grams);
      return {
        ...base,
        kind: "table",
        confident: match.confident,
        foodId: match.row.id,
        name: match.row.name,
        per100g,
        nutrition,
        explanation: `${match.row.name} from the nutrition table: ${Math.round(per100g.calories)} kcal per 100g x ${fmt(grams)} g = ${fmt(nutrition.calories)} kcal`,
      };
    }

    const estimate = estimates.get(i);
    if (estimate) {
      const per100g = Object.fromEntries(MACROS.map((k) => [k, round1(estimate[k])]));
      const nutrition = scale(per100g, grams);
      return {
        ...base,
        kind: "estimated",
        confident: false,
        foodId: null,
        name: null,
        per100g,
        nutrition,
        explanation: `Not in our table. AI estimate: ${fmt(per100g.calories)} kcal per 100g x ${fmt(grams)} g = ${fmt(nutrition.calories)} kcal. You can edit this.`,
      };
    }

    return {
      ...base,
      kind: "unknown",
      confident: false,
      foodId: null,
      name: null,
      per100g: null,
      nutrition: null,
      explanation: "We couldn't match or estimate this. Please pick a food or enter it.",
    };
  });

  const totals = Object.fromEntries(
    MACROS.map((k) => [k, round1(items.reduce((sum, it) => sum + (it.nutrition?.[k] ?? 0), 0))])
  );
  totals.unknownCount = items.filter((it) => it.kind === "unknown").length;

  return { items, totals };
}
