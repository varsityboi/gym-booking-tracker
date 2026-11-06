import { useId, useState } from "react";
import { fmtKcal, fromFood, fromNumbers, gramsError, parseAmount } from "../../nutrition.js";
import { PrimaryButton, SecondaryButton } from "../classes/buttons.jsx";
import FoodSearch from "./FoodSearch.jsx";
import NumbersForm from "./NumbersForm.jsx";

const tabClass = (active) =>
  `flex-1 rounded-md py-2 text-sm font-medium ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`;

// Adds a food to the review without a photo: a table food found by search
// (with grams), or a custom food with its own numbers.
export default function AddFoodPanel({ onAdd, onClose }) {
  const [tab, setTab] = useState("search");
  const [food, setFood] = useState(null);
  const [grams, setGrams] = useState("100");
  const [error, setError] = useState(null);
  const gramsId = useId();

  function addFood(e) {
    e.preventDefault();
    const problem = gramsError(parseAmount(grams));
    if (problem) return setError(problem);
    onAdd(fromFood(food, parseAmount(grams)));
  }

  return (
    <section aria-label="Add food manually" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Add food</h2>
        <button type="button" onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>
      <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "search"} className={tabClass(tab === "search")} onClick={() => setTab("search")}>
          From the food list
        </button>
        <button type="button" role="tab" aria-selected={tab === "custom"} className={tabClass(tab === "custom")} onClick={() => setTab("custom")}>
          Custom food
        </button>
      </div>

      <div className="mt-4">
        {tab === "custom" ? (
          <NumbersForm initial={{ grams: "100" }} submitLabel="Add to meal" onSubmit={(values) => onAdd(fromNumbers(values))} />
        ) : food ? (
          <form onSubmit={addFood} noValidate className="space-y-3">
            <div>
              <p className="font-medium text-slate-900">{food.name}</p>
              <p className="text-sm text-slate-500">{fmtKcal(food.calories_per_100g)} kcal per 100 g</p>
            </div>
            <div>
              <label htmlFor={gramsId} className="mb-1.5 block text-sm font-medium text-slate-700">
                Grams
              </label>
              <input
                id={gramsId}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700 first-letter:uppercase">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <PrimaryButton type="submit">Add to meal</PrimaryButton>
              <SecondaryButton onClick={() => setFood(null)}>Pick another</SecondaryButton>
            </div>
          </form>
        ) : (
          <FoodSearch onPick={setFood} autoFocus />
        )}
      </div>
    </section>
  );
}
