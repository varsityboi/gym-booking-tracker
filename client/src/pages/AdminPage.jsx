import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../api.js";
import AdminClassCard from "../components/admin/AdminClassCard.jsx";
import NewClassForm from "../components/admin/NewClassForm.jsx";
import RetryBox from "../components/RetryBox.jsx";
import { groupByDay } from "../time.js";

// GET /admin/classes (the server's default: now to 30 days ahead). As on the
// other pages, only the newest answer is used, reloads keep the list on
// screen, and coming back to the tab reloads. refreshKey goes up on every
// reload so open People panels load again too.
function useAdminClasses() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    setRefreshKey(id);
    try {
      const data = await api("/admin/classes");
      if (id === latest.current) setState({ status: "ready", data, error: null });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, status: "error", error }));
    }
  }, []);

  useEffect(() => {
    // Loading data is what this effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { ...state, reload, refreshKey };
}

export default function AdminPage() {
  const { status, data, error, reload, refreshKey } = useAdminClasses();
  const [showCancelled, setShowCancelled] = useState(true);
  const toggleId = useId();

  let list;
  if (!data) {
    list =
      status === "error" ? (
        <RetryBox message={`Couldn't load classes: ${error.message}`} onRetry={reload} />
      ) : (
        <p className="text-sm text-slate-500" role="status">
          Loading classes…
        </p>
      );
  } else {
    const shown = showCancelled ? data : data.filter((c) => c.status !== "cancelled");
    const hidden = data.length - shown.length;
    list = (
      <>
        {status === "error" && (
          <RetryBox message={`Couldn't refresh: ${error.message}. Showing the last loaded list.`} onRetry={reload} />
        )}
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {hidden > 0
              ? `No scheduled classes in the next 30 days (${hidden} cancelled hidden)`
              : "No classes in the next 30 days"}
          </p>
        ) : (
          groupByDay(shown, (c) => c.starts_at).map((group) => (
            <div key={group.key}>
              <h3 className="mb-2 text-base font-semibold text-slate-800">{group.heading}</h3>
              <ul className="space-y-3">
                {group.items.map((cls) => (
                  <AdminClassCard key={cls.id} cls={cls} reload={reload} refreshKey={refreshKey} />
                ))}
              </ul>
            </div>
          ))
        )}
      </>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Admin</h1>

      <NewClassForm onCreated={reload} />

      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="upcoming-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Next 30 days
          </h2>
          <label htmlFor={toggleId} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              id={toggleId}
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200"
            />
            Show cancelled
          </label>
        </div>
        {list}
      </section>
    </section>
  );
}
