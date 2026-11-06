import { useId } from "react";
import { timeOfDay } from "../../time.js";
import RetryBox from "../RetryBox.jsx";
import MealItemRow from "./MealItemRow.jsx";
import NutritionLine from "./NutritionLine.jsx";

// The meals logged on one India date, with a date picker for past days.
// `day` is useDayMeals(date) from the page, which also reloads it after a save.
export default function DayMeals({ date, today, onDateChange, day }) {
  const dateId = useId();
  const { status, data, error, reload } = day;
  const isToday = date === today;

  let body;
  if (!data) {
    body =
      status === "error" ? (
        <RetryBox message={`Couldn't load meals: ${error.message}`} onRetry={reload} />
      ) : (
        <p className="text-sm text-ink-muted" role="status">
          Loading meals…
        </p>
      );
  } else if (data.meals.length === 0) {
    body = (
      <>
        {status === "error" && <RetryBox message={`Couldn't refresh: ${error.message}`} onRetry={reload} />}
        <div className="rounded-card border-2 border-dashed border-line-strong p-8 text-center">
          <p className="font-bold text-ink">{isToday ? "No meals logged yet" : "No meals logged on this day"}</p>
          {isToday && (
            <p className="mt-1 text-sm text-ink-muted">Snap your plate or add a food above, and your day starts here.</p>
          )}
        </div>
      </>
    );
  } else {
    body = (
      <div className="space-y-3">
        {status === "error" && (
          <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded list.`} onRetry={reload} />
        )}
        <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Day total</p>
          <NutritionLine nutrition={data.totals} />
        </div>
        <ul className="grid items-start gap-4 lg:grid-cols-2" aria-label="Meals">
          {data.meals.map((meal) => (
            <li key={meal.id} className="rounded-card bg-surface px-5 pt-4 shadow-card" data-meal-id={meal.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-extrabold text-ink">{timeOfDay(meal.eaten_at)}</h3>
                <NutritionLine nutrition={meal.totals} className="text-xs text-ink-muted" />
              </div>
              <ul className="divide-y divide-line">
                {meal.items.map((item) => (
                  <MealItemRow key={item.id} mealId={meal.id} item={item} reload={reload} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section aria-labelledby="day-meals-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="day-meals-heading" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          {isToday ? "Today's meals" : "Meals"}
        </h2>
        <div>
          <label htmlFor={dateId} className="sr-only">
            Day
          </label>
          <input
            id={dateId}
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
      {body}
    </section>
  );
}
