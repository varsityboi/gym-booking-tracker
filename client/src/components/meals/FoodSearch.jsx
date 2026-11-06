import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api.js";
import { fmtKcal } from "../../nutrition.js";

const DEBOUNCE_MS = 300;

// A search box over the foods table (GET /foods/search). Typing waits 300 ms
// before asking, and a newer query cancels the older request, so results
// always match what's in the box. onPick gets the food row.
export default function FoodSearch({ onPick, label = "Search foods", autoFocus = false }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "idle", results: [], error: null });
  const timer = useRef(null);
  const controller = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      controller.current?.abort();
    },
    []
  );

  function onChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timer.current);
    controller.current?.abort();
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setState({ status: "idle", results: [], error: null });
      return;
    }
    setState((s) => ({ ...s, status: "loading" }));
    timer.current = setTimeout(async () => {
      const c = new AbortController();
      controller.current = c;
      try {
        const results = await api(`/foods/search?q=${encodeURIComponent(trimmed.slice(0, 100))}`, { signal: c.signal });
        setState({ status: "done", results, error: null });
      } catch (err) {
        if (err.name === "AbortError") return;
        setState({ status: "error", results: [], error: err.message });
      }
    }, DEBOUNCE_MS);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={onChange}
        autoFocus={autoFocus}
        placeholder="e.g. paratha, dal, banana"
        autoComplete="off"
        className="block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <div className="mt-2" aria-live="polite">
        {state.status === "loading" && <p className="text-sm text-slate-500">Searching…</p>}
        {state.status === "error" && <p className="text-sm text-red-700 first-letter:uppercase">{state.error}</p>}
        {state.status === "done" && state.results.length === 0 && (
          <p className="text-sm text-slate-500">No foods match "{query.trim()}"</p>
        )}
        {state.status === "done" && state.results.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200" aria-label="Search results">
            {state.results.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => onPick(food)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-indigo-50"
                >
                  <span className="min-w-0 text-sm text-slate-900">{food.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{fmtKcal(food.calories_per_100g)} kcal/100g</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
