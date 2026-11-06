import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import RetryBox from "../components/RetryBox.jsx";
import NextClassCard from "../components/today/NextClassCard.jsx";
import ProgressRow from "../components/today/ProgressRow.jsx";
import WaterCard from "../components/today/WaterCard.jsx";
import { longDate } from "../time.js";

// GET /me/today. Like the classes page: only the newest request's answer is
// used, the first load shows a loading state, later reloads keep the current
// numbers on screen, and coming back to the tab reloads.
function useTodayData() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await api("/me/today");
      if (id === latest.current) setState({ status: "ready", data, error: null });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, status: "error", error }));
    }
  }, []);

  useEffect(() => {
    // Loading data is what this effect is for; reload only sets state after
    // its awaits, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
    // Back on the tab: meals or water may have been logged elsewhere.
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { ...state, reload };
}

const NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "kcal", digits: 0 },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "carbs_g", label: "Carbs", unit: "g" },
];

export default function TodayPage() {
  const { status, data, error, reload } = useTodayData();

  if (!data) {
    return (
      <section>
        <h1 className="text-xl font-semibold text-slate-900">Today</h1>
        <div className="mt-4">
          {status === "error" ? (
            <RetryBox message={`Couldn't load today: ${error.message}`} onRetry={reload} />
          ) : (
            <p className="text-sm text-slate-500" role="status">
              Loading today…
            </p>
          )}
        </div>
      </section>
    );
  }

  const { date, totals, water_ml: waterMl, targets, next_class: nextClass } = data;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Today</h1>
        <p className="mt-0.5 text-sm text-slate-500">{longDate(date)}</p>
      </div>

      {status === "error" && (
        <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded numbers.`} onRetry={reload} />
      )}

      <Link
        to="/meals"
        className="flex h-14 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      >
        Log a meal
      </Link>

      {!targets && (
        <Link
          to="/targets"
          className="block rounded-xl border border-indigo-200 bg-indigo-50 p-4 hover:bg-indigo-100"
        >
          <span className="block font-semibold text-indigo-900">Set your daily goals</span>
          <span className="mt-0.5 block text-sm text-indigo-800">
            Pick calorie, protein, fat, carb and water targets to track your progress.
          </span>
        </Link>
      )}

      <section aria-labelledby="nutrition-heading" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 id="nutrition-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Nutrition
        </h2>
        <ul className="mt-3 space-y-4">
          {NUTRIENTS.map(({ key, label, unit, digits }) => (
            <ProgressRow
              key={key}
              label={label}
              total={totals[key]}
              target={targets ? targets[key] : null}
              unit={unit}
              digits={digits}
            />
          ))}
        </ul>
      </section>

      <WaterCard waterMl={waterMl} targetMl={targets ? targets.water_ml : null} reload={reload} />

      <NextClassCard nextClass={nextClass} />
    </section>
  );
}
