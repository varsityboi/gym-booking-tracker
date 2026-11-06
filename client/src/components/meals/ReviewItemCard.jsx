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
  if (item.kind === "table") return { text: "From nutrition table", className: "bg-success-soft text-success" };
  if (item.kind === "unknown") return { text: "Needs your input", className: "bg-primary text-on-primary" };
  if (item.userNumbers) return { text: "Your numbers", className: "bg-sunken text-ink-soft" };
  return { text: "AI estimate", className: "bg-water-soft text-water" };
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

  // A server error on save is the only red; "needs your input" is a call to
  // action (primary), "please check" a gentle warning (amber).
  const look = serverError
    ? "border-2 border-danger bg-surface"
    : unknown
      ? "border-2 border-primary-line bg-surface"
      : pleaseCheck
        ? "border border-warn-line bg-warn-soft/40"
        : "border border-transparent bg-surface";

  return (
    <li
      className={`rounded-card p-5 shadow-card ${look}`}
      data-kind={item.kind}
      data-review-item={item.key}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${label.className}`}>{label.text}</span>
        {pleaseCheck && (
          <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn ring-1 ring-warn-line">Please check</span>
        )}
      </div>

      <h3 className="mt-2 text-lg font-bold text-ink">{item.name}</h3>
      {item.detected && item.detected !== item.name && (
        <p className="text-xs text-ink-muted">Seen in the photo as: {item.detected}</p>
      )}

      <div className="mt-3 flex items-end gap-3">
        <div className="w-28 shrink-0">
          <label htmlFor={gramsId} className="mb-1 block text-xs font-medium text-ink-soft">
            Grams
          </label>
          <input
            id={gramsId}
            inputMode="decimal"
            autoComplete="off"
            value={item.grams}
            onChange={(e) => onChange(withGrams(item, e.target.value))}
            className="block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <NutritionLine nutrition={nutritionOf(item)} className="pb-2.5 text-sm text-ink-soft" />
      </div>

      {explanationOf(item) && <p className="mt-2 text-sm text-ink-muted">{explanationOf(item)}</p>}

      {item.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-soft">Or is it:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {item.alternatives.map((alt) => (
              <button
                key={alt.foodId}
                type="button"
                onClick={() => pickAlternative(alt)}
                className="rounded-full border border-primary-line bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-soft-hover"
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
        <p className="mt-2 text-xs text-ink-muted">
          Per 100 g: {fmt(item.per100g.calories)} kcal · P {fmt(item.per100g.protein_g)}g · F {fmt(item.per100g.fat_g)}g · C{" "}
          {fmt(item.per100g.carbs_g)}g
        </p>
      )}
    </li>
  );
}
