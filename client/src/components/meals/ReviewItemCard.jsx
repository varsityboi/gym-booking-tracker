import { useId, useState } from "react";
import {
  explanationOf,
  fmt,
  itemError,
  nutritionOf,
  round1,
  swapToAlternative,
  swapToFood,
  withGrams,
  withNumbers,
} from "../../nutrition.js";
import { CardError, SecondaryButton } from "../classes/buttons.jsx";
import FoodSearch from "./FoodSearch.jsx";
import NumbersForm from "./NumbersForm.jsx";
import NutritionLine from "./NutritionLine.jsx";

function kindLabel(item) {
  if (item.kind === "table") return { text: "From nutrition table", className: "bg-emerald-50 text-emerald-800" };
  if (item.kind === "unknown") return { text: "Needs your input", className: "bg-red-100 text-red-800" };
  if (item.userNumbers) return { text: "Your numbers", className: "bg-slate-100 text-slate-700" };
  return { text: "AI estimate", className: "bg-sky-50 text-sky-800" };
}

// The totals the numbers form starts with: what the item has now, if anything.
function numbersFormStart(item) {
  const n = nutritionOf(item);
  const start = { name: item.name ?? "", grams: item.grams };
  if (n) for (const [k, v] of Object.entries(n)) start[k] = String(round1(v));
  return start;
}

// One food in the meal being reviewed. Every change goes to onChange(newItem)
// so the page's totals stay live; nothing is sent until "Save meal".
// serverError: the server's message when saving failed on this item.
export default function ReviewItemCard({ item, onChange, onRemove, showError, serverError }) {
  const gramsId = useId();
  const [panel, setPanel] = useState(null); // null | "search" | "numbers"

  const label = kindLabel(item);
  const unknown = item.kind === "unknown";
  const pleaseCheck = !item.confident && !unknown;
  const problem = showError ? itemError(item) : null;

  function pickFood(food) {
    onChange(swapToFood(item, food));
    setPanel(null);
  }

  // Alternatives come with their per-100g values, so this needs no request.
  function pickAlternative(alt) {
    // Keep the replaced food on offer, in case it was right after all.
    const previous = item.kind === "table" ? [{ foodId: item.foodId, name: item.name, per100g: item.per100g }] : [];
    onChange({
      ...swapToAlternative(item, alt),
      alternatives: [...item.alternatives.filter((a) => a.foodId !== alt.foodId), ...previous],
    });
  }

  const border = unknown ? "border-red-300" : pleaseCheck ? "border-amber-300 bg-amber-50/40" : "border-slate-200";

  return (
    <li
      className={`rounded-xl border bg-white p-4 ${serverError ? "border-red-400" : border}`}
      data-kind={item.kind}
      data-review-item={item.key}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${label.className}`}>{label.text}</span>
        {pleaseCheck && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Please check</span>
        )}
      </div>

      <h3 className="mt-2 font-semibold text-slate-900">{item.name}</h3>
      {item.detected && item.detected !== item.name && (
        <p className="text-xs text-slate-500">Seen in the photo as: {item.detected}</p>
      )}

      <div className="mt-3 flex items-end gap-3">
        <div className="w-28 shrink-0">
          <label htmlFor={gramsId} className="mb-1 block text-xs font-medium text-slate-600">
            Grams
          </label>
          <input
            id={gramsId}
            inputMode="decimal"
            autoComplete="off"
            value={item.grams}
            onChange={(e) => onChange(withGrams(item, e.target.value))}
            className="block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <NutritionLine nutrition={nutritionOf(item)} className="pb-2.5 text-sm text-slate-600" />
      </div>

      {explanationOf(item) && <p className="mt-2 text-sm text-slate-500">{explanationOf(item)}</p>}

      {item.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-600">Or is it:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {item.alternatives.map((alt) => (
              <button
                key={alt.foodId}
                type="button"
                onClick={() => pickAlternative(alt)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800 hover:bg-indigo-100"
              >
                {alt.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <SecondaryButton onClick={() => setPanel(panel === "search" ? null : "search")} aria-expanded={panel === "search"}>
          {item.kind === "table" ? "Change food" : "Pick a food"}
        </SecondaryButton>
        <SecondaryButton onClick={() => setPanel(panel === "numbers" ? null : "numbers")} aria-expanded={panel === "numbers"}>
          Edit numbers
        </SecondaryButton>
        <SecondaryButton onClick={onRemove}>Remove</SecondaryButton>
      </div>

      {panel === "search" && (
        <div className="mt-3">
          <FoodSearch onPick={pickFood} label={`Search for ${item.name}`} autoFocus />
        </div>
      )}
      {panel === "numbers" && (
        <div className="mt-3">
          <NumbersForm
            initial={numbersFormStart(item)}
            submitLabel="Use these numbers"
            onSubmit={(values) => {
              onChange(withNumbers(item, values));
              setPanel(null);
            }}
            onCancel={() => setPanel(null)}
          />
        </div>
      )}

      <CardError message={problem ?? (serverError && `Couldn't save: ${serverError}`)} />
      {item.kind === "estimated" && item.per100g && (
        <p className="mt-2 text-xs text-slate-400">
          Per 100 g: {fmt(item.per100g.calories)} kcal · P {fmt(item.per100g.protein_g)}g · F {fmt(item.per100g.fat_g)}g · C{" "}
          {fmt(item.per100g.carbs_g)}g
        </p>
      )}
    </li>
  );
}
