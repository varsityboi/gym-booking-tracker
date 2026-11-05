import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ClassCard from "../components/classes/ClassCard.jsx";
import MyBookings from "../components/classes/MyBookings.jsx";
import { dayHeading, dayKey } from "../time.js";

// GET /classes (scheduled, next 7 days) and GET /bookings/mine together.
// Only the newest request's answer is used, so a slow old reload can't
// overwrite a newer one. The first load shows a loading state; later reloads
// keep the current lists on screen until the new ones arrive.
function useClassesData() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const [classes, mine] = await Promise.all([api("/classes"), api("/bookings/mine")]);
      if (id === latest.current) setState({ status: "ready", data: { classes, mine }, error: null });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, status: "error", error }));
    }
  }, []);

  useEffect(() => {
    // Loading data is what this effect is for; reload only sets state after
    // its awaits, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
    // Back on the tab: places may have changed meanwhile.
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { ...state, reload };
}

// [{ key, heading, classes }] in time order, by gym-local day.
function groupByDay(classes) {
  const groups = [];
  for (const cls of classes) {
    const key = dayKey(cls.starts_at);
    if (groups.at(-1)?.key !== key) groups.push({ key, heading: dayHeading(cls.starts_at), classes: [] });
    groups.at(-1).classes.push(cls);
  }
  return groups;
}

function RetryBox({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800 first-letter:uppercase">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
}

export default function ClassesPage() {
  const { status, data, error, reload } = useClassesData();

  if (!data) {
    return (
      <section>
        <h1 className="text-xl font-semibold text-slate-900">Classes</h1>
        <div className="mt-4">
          {status === "error" ? (
            <RetryBox message={`Couldn't load classes: ${error.message}`} onRetry={reload} />
          ) : (
            <p className="text-sm text-slate-500" role="status">
              Loading classes…
            </p>
          )}
        </div>
      </section>
    );
  }

  const { classes, mine } = data;
  const bookingByClass = new Map(mine.bookings.map((b) => [b.class_id, b]));
  const waitingByClass = new Map(mine.waitlist.map((w) => [w.class_id, w]));

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Classes</h1>

      {status === "error" && (
        <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded lists.`} onRetry={reload} />
      )}

      <MyBookings bookings={mine.bookings} waitlist={mine.waitlist} reload={reload} />

      <section aria-labelledby="this-week">
        <h2 id="this-week" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          This week
        </h2>
        {classes.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No classes this week
          </p>
        ) : (
          groupByDay(classes).map((group) => (
            <div key={group.key} className="mt-3">
              <h3 className="mb-2 text-base font-semibold text-slate-800">{group.heading}</h3>
              <ul className="space-y-3">
                {group.classes.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    cls={cls}
                    booking={bookingByClass.get(cls.id)}
                    waiting={waitingByClass.get(cls.id)}
                    reload={reload}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </section>
  );
}
