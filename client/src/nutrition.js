// Meal items being reviewed before saving, and the maths on them. Everything
// here is for display and for building the POST /meals body; the server
// recomputes nutrition itself when the meal is saved.
//
// A review item:
//   { key, kind: "table" | "estimated" | "unknown", foodId, name, detected,
//     grams (the input's text), per100g: { calories, protein_g, fat_g, carbs_g } | null,
//     confident, explanation, alternatives: [{ foodId, name }],
//     userNumbers (an estimate the member typed in, not the AI's), touched }

export const MACROS = ["calories", "protein_g", "fat_g", "carbs_g"];

export const MAX_GRAMS = 5000;
const MAX_CALORIES_PER_100G = 900;

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;
export const round1 = (n) => round(n, 1);
export const round2 = (n) => round(n, 2);

const format1 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const format0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const fmt = (n) => format1.format(n);
export const fmtKcal = (n) => format0.format(n);

// "120" -> 120, " 7.5 " -> 7.5, "" / "abc" -> NaN.
export function parseAmount(text) {
  const s = String(text ?? "").trim();
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// The server's rule for grams, as a message, or null when fine.
export function gramsError(grams) {
  if (Number.isNaN(grams)) return "enter the grams";
  if (grams <= 0) return "grams must be more than 0";
  if (grams > MAX_GRAMS) return `grams must be at most ${MAX_GRAMS}`;
  return null;
}

// A foods-table row (GET /foods/search) -> per100g.
export const foodPer100g = (food) => ({
  calories: food.calories_per_100g,
  protein_g: food.protein_per_100g,
  fat_g: food.fat_per_100g,
  carbs_g: food.carbs_per_100g,
});

const scale = (per100g, grams) => Object.fromEntries(MACROS.map((k) => [k, (per100g[k] * grams) / 100]));

// The item's nutrition for its current grams (unrounded), or null when it has
// no per-100g values yet or the grams aren't valid.
export function nutritionOf(item) {
  const grams = parseAmount(item.grams);
  if (!item.per100g || gramsError(grams)) return null;
  return scale(item.per100g, grams);
}

// Sum over the items that have nutrition, unrounded.
export function totalsOf(items) {
  const totals = { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  for (const item of items) {
    const n = nutritionOf(item);
    if (n) for (const k of MACROS) totals[k] += n[k];
  }
  return totals;
}

let nextKey = 1;
const newKey = () => `item-${nextKey++}`;

// One item of the POST /meals/analyze response -> a review item. Estimates and
// unknown items have no name from the server, so the detected name is used.
export function fromAnalyzeItem(a) {
  return {
    key: newKey(),
    kind: a.kind,
    foodId: a.foodId ?? null,
    name: a.name ?? a.detected,
    detected: a.detected,
    grams: String(a.grams),
    per100g: a.per100g,
    confident: Boolean(a.confident),
    explanation: a.explanation,
    alternatives: a.alternatives ?? [],
    userNumbers: false,
    touched: false,
  };
}

// A table food picked from search, added by hand.
export function fromFood(food, grams) {
  return { ...newItemBase(), ...asFood(food), grams: String(grams) };
}

// A custom food with numbers typed in by hand, added by hand.
export function fromNumbers(values) {
  return { ...newItemBase(), ...asNumbers(values) };
}

function newItemBase() {
  return { key: newKey(), detected: null, alternatives: [], confident: true, explanation: null, touched: true };
}

const asFood = (food) => asTable({ foodId: food.id, name: food.name, per100g: foodPer100g(food) });

// { foodId, name, per100g }: an analyze alternative, or a food row reshaped.
const asTable = ({ foodId, name, per100g }) => ({ kind: "table", foodId, name, per100g: { ...per100g }, userNumbers: false });

// { name, grams, calories, protein_g, fat_g, carbs_g } (totals for those grams,
// already checked by checkNumbers) -> an estimate with per-100g values.
const asNumbers = ({ name, grams, ...totals }) => ({
  kind: "estimated",
  foodId: null,
  name: name.trim(),
  grams: String(grams),
  per100g: per100gFromTotals(totals, grams),
  userNumbers: true,
});

export const per100gFromTotals = (totals, grams) =>
  Object.fromEntries(MACROS.map((k) => [k, round2((totals[k] / grams) * 100)]));

// Swap the dish for a table food: it was picked by hand, so no "please check".
export const swapToFood = (item, food) => ({ ...item, ...asFood(food), confident: true, touched: true });

// Swap to one of the analyze alternatives, which carry their own per100g.
export const swapToAlternative = (item, alt) => ({ ...item, ...asTable(alt), confident: true, touched: true });

// Replace the item with totals typed in by hand: it becomes an estimate.
export const withNumbers = (item, values) => ({ ...item, ...asNumbers(values), confident: true, touched: true });

export const withGrams = (item, grams) => ({ ...item, grams, touched: true });

// Checks the numbers form: { name, grams, calories, protein_g, fat_g, carbs_g }
// as typed. Returns { values } (numbers) or { error }. Same limits as the
// server, applied to the per-100g values that will be sent.
export function checkNumbers(form) {
  const name = String(form.name ?? "").trim();
  if (!name) return { error: "name is required" };
  if (name.length > 100) return { error: "name too long (100 characters at most)" };
  const grams = parseAmount(form.grams);
  const gErr = gramsError(grams);
  if (gErr) return { error: gErr };

  const values = { name, grams: round2(grams) };
  for (const k of MACROS) {
    const n = parseAmount(form[k]);
    if (Number.isNaN(n)) return { error: `enter ${MACRO_LABELS[k].toLowerCase()}` };
    if (n < 0) return { error: "numbers can't be negative" };
    values[k] = n;
  }

  const per100g = per100gFromTotals(values, values.grams);
  if (per100g.calories > MAX_CALORIES_PER_100G) {
    return { error: `that's over ${MAX_CALORIES_PER_100G} kcal per 100 g, check the calories or grams` };
  }
  if (per100g.protein_g + per100g.fat_g + per100g.carbs_g > 100) {
    return { error: "protein + fat + carbs can't weigh more than the food itself" };
  }
  return { values };
}

export const MACRO_LABELS = { calories: "Calories", protein_g: "Protein", fat_g: "Fat", carbs_g: "Carbs" };

// What stops this item being saved, or null.
export function itemError(item) {
  if (item.kind === "unknown") return "pick a food, enter the numbers, or remove this item";
  const gErr = gramsError(parseAmount(item.grams));
  if (gErr) return gErr;
  if (item.kind === "estimated" && !item.name.trim()) return "name is required";
  return null;
}

// The POST /meals item for a saveable review item.
export function toPayload(item) {
  const grams = round2(parseAmount(item.grams));
  if (item.kind === "table") return { foodId: item.foodId, grams };
  return {
    name: item.name.trim(),
    grams,
    caloriesPer100g: round2(item.per100g.calories),
    proteinPer100g: round2(item.per100g.protein_g),
    fatPer100g: round2(item.per100g.fat_g),
    carbsPer100g: round2(item.per100g.carbs_g),
  };
}

// The explanation sentence: the server's while the item is as it sent it,
// otherwise worked out again for the current food and grams.
export function explanationOf(item) {
  if (!item.touched && item.explanation) return item.explanation;
  const n = nutritionOf(item);
  if (!n) return item.explanation;
  const grams = fmt(parseAmount(item.grams));
  const sum = `${fmtKcal(item.per100g.calories)} kcal per 100g x ${grams} g = ${fmt(round1(n.calories))} kcal`;
  if (item.kind === "table") return `${item.name} from the nutrition table: ${sum}`;
  return item.userNumbers ? `Your numbers: ${sum}` : `AI estimate: ${sum}`;
}
