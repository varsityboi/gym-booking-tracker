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
        <p className="text-sm text-slate-500" role="status">
          Loading meals…
        </p>
      );
  } else if (data.meals.length === 0) {
    body = (
      <>
        {status === "error" && <RetryBox message={`Couldn't refresh: ${error.message}`} onRetry={reload} />}
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {isToday ? "No meals logged yet" : "No meals logged on this day"}
        </p>
      </>
    );
  } else {
    body = (
      <div className="space-y-3">
        {status === "error" && (
          <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded list.`} onRetry={reload} />
        )}
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Day total</p>
          <NutritionLine nutrition={data.totals} />
        </div>
        <ul className="space-y-3" aria-label="Meals">
          {data.meals.map((meal) => (
            <li key={meal.id} className="rounded-xl border border-slate-200 bg-white px-4 pt-3" data-meal-id={meal.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{timeOfDay(meal.eaten_at)}</h3>
                <NutritionLine nutrition={meal.totals} className="text-xs text-slate-500" />
              </div>
              <ul className="divide-y divide-slate-100">
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
        <h2 id="day-meals-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
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
            className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      </div>
      {body}
    </section>
  );
}
