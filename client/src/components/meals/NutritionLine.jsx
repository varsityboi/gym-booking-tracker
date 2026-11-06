import { fmt, fmtKcal, round1 } from "../../nutrition.js";

// "298 kcal · P 5.1g · F 16.9g · C 30.7g"
export default function NutritionLine({ nutrition, className = "text-sm text-slate-600" }) {
  if (!nutrition) return <p className={className}>—</p>;
  const { calories, protein_g: p, fat_g: f, carbs_g: c } = nutrition;
  return (
    <p className={className}>
      <span className="font-semibold text-slate-900">{fmtKcal(calories)} kcal</span> · P {fmt(round1(p))}g · F{" "}
      {fmt(round1(f))}g · C {fmt(round1(c))}g
    </p>
  );
}
