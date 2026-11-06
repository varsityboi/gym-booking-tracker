import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ClassCard from "../components/classes/ClassCard.jsx";
import MyBookings from "../components/classes/MyBookings.jsx";
import RetryBox from "../components/RetryBox.jsx";
import { groupByDay } from "../time.js";

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

export default function ClassesPage() {
  const { status, data, error, reload } = useClassesData();

  if (!data) {
    return (
      <section>
        <h1 className="text-2xl font-extrabold text-ink md:text-3xl">Classes</h1>
        <div className="mt-4">
          {status === "error" ? (
            <RetryBox message={`Couldn't load classes: ${error.message}`} onRetry={reload} />
          ) : (
            <p className="text-sm text-ink-muted" role="status">
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
      <h1 className="text-2xl font-extrabold text-ink md:text-3xl">Classes</h1>

      {status === "error" && (
        <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded lists.`} onRetry={reload} />
      )}

      <MyBookings bookings={mine.bookings} waitlist={mine.waitlist} reload={reload} />

      <section aria-labelledby="this-week">
        <h2 id="this-week" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          This week
        </h2>
        {classes.length === 0 ? (
          <div className="mt-3 rounded-card border-2 border-dashed border-line-strong p-8 text-center">
            <p className="font-bold text-ink">No classes this week</p>
            <p className="mt-1 text-sm text-ink-muted">New classes are added regularly, so check back soon.</p>
          </div>
        ) : (
          groupByDay(classes, (c) => c.starts_at).map((group) => (
            <div key={group.key} className="mt-4">
              <h3 className="mb-3 text-lg font-extrabold text-ink">{group.heading}</h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((cls) => (
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
