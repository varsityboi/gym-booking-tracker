import { getIndiaDayBounds, getTotalsBetween } from "../models/meal.js";
import { getTotalBetween as getWaterBetween } from "../models/water.js";
import { findValuesByUser } from "../models/target.js";
import { findNextForUser } from "../models/booking.js";

const round1 = (n) => Math.round(n * 10) / 10;

export async function today(req, res) {
  const userId = req.user.id;

  // Compute the India-time day bounds once, so every query below uses the
  // exact same window even if the request runs across midnight.
  const { start_at: startAt, end_at: endAt, date } = await getIndiaDayBounds();

  const [t, water, targetsRow, nextClass] = await Promise.all([
    getTotalsBetween(userId, startAt, endAt),
    getWaterBetween(userId, startAt, endAt),
    findValuesByUser(userId),
    findNextForUser(userId),
  ]);

  // pg returns NUMERIC and SUM(int) (bigint) as strings, so convert to numbers.
  const totals = {
    calories: Number(t.calories),
    protein_g: Number(t.protein_g),
    fat_g: Number(t.fat_g),
    carbs_g: Number(t.carbs_g),
  };
  const waterMl = Number(water.water_ml);
  const targets = targetsRow ?? null;

  const remaining = targets
    ? {
        calories: round1(targets.calories - totals.calories),
        protein_g: round1(targets.protein_g - totals.protein_g),
        fat_g: round1(targets.fat_g - totals.fat_g),
        carbs_g: round1(targets.carbs_g - totals.carbs_g),
        water_ml: targets.water_ml - waterMl,
      }
    : null;

  res.json({
    date,
    totals,
    water_ml: waterMl,
    targets,
    remaining,
    next_class: nextClass ?? null,
  });
}
