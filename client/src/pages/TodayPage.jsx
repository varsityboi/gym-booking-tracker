import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { getUser } from "../auth.js";
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

// "Asha" from "Asha Rao"; null when there's no name.
function firstName() {
  return getUser()?.name?.trim().split(/\s+/)[0] || null;
}

export default function TodayPage() {
  const { status, data, error, reload } = useTodayData();
  const greeting = `Hi ${firstName() ?? "there"}!`;

  if (!data) {
    return (
      <section>
        <h1 className="text-2xl font-extrabold text-ink">
          {greeting} <span aria-hidden="true">👋</span>
        </h1>
        <div className="mt-4">
          {status === "error" ? (
            <RetryBox message={`Couldn't load today: ${error.message}`} onRetry={reload} />
          ) : (
            <p className="text-sm text-ink-muted" role="status">
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
        <h1 className="text-2xl font-extrabold text-ink md:text-3xl">
          {greeting} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Today · {longDate(date)}</p>
      </div>

      {status === "error" && (
        <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded numbers.`} onRetry={reload} />
      )}

      {/* Phone: one column in this order. md+: nutrition on the left (3/5),
          everything else stacked on the right; dense flow lets nutrition
          start beside "Log a meal". */}
      <div className="grid gap-5 md:grid-flow-dense md:grid-cols-5 md:items-start">
      <Link
        to="/meals"
        className="flex h-14 items-center justify-center rounded-full bg-primary text-lg font-bold text-on-primary shadow-card transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 md:col-span-2 md:col-start-4"
      >
        Log a meal
      </Link>

      {!targets && (
        <Link
          to="/targets"
          className="block rounded-card border border-primary-line bg-primary-soft p-4 hover:bg-primary-soft-hover md:col-span-2 md:col-start-4"
        >
          <span className="block font-bold text-primary-ink">Set your daily goals</span>
          <span className="mt-0.5 block text-sm text-primary-ink">
            Pick calorie, protein, fat, carb and water targets to track your progress.
          </span>
        </Link>
      )}

      <section
        aria-labelledby="nutrition-heading"
        className="rounded-card bg-surface p-5 shadow-card md:col-span-3 md:col-start-1 md:row-span-4 md:p-6"
      >
        <h2 id="nutrition-heading" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Nutrition
        </h2>
        <ul className="mt-4 space-y-5">
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

      <div className="md:col-span-2 md:col-start-4">
        <WaterCard waterMl={waterMl} targetMl={targets ? targets.water_ml : null} reload={reload} />
      </div>

      <div className="md:col-span-2 md:col-start-4">
        <NextClassCard nextClass={nextClass} />
      </div>
      </div>
    </section>
  );
}
