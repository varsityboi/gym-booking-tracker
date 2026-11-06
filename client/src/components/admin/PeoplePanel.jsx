import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { dayAndTime } from "../../time.js";

// GET /admin/classes/:id/people while the panel is open. refreshKey changes
// after every action on the page, which loads it again; the last answer stays
// on screen meanwhile.
export default function PeoplePanel({ classId, refreshKey }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await api(`/admin/classes/${classId}/people`);
      if (id === latest.current) setState({ status: "ready", data, error: null });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, status: "error", error }));
    }
  }, [classId]);

  useEffect(() => {
    // Loading data is what this effect is for; load only sets state after its await.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load, refreshKey]);

  const { status, data, error } = state;
  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3" data-testid="people-panel" aria-live="polite">
      {status === "error" && (
        <p className="text-sm text-red-700 first-letter:uppercase">
          Couldn't load people: {error.message}{" "}
          <button type="button" onClick={load} className="font-medium underline">
            Retry
          </button>
        </p>
      )}
      {!data && status === "loading" && <p className="text-sm text-slate-500">Loading people…</p>}
      {data && (
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booked ({data.booked.length})</h4>
            {data.booked.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nobody yet</p>
            ) : (
              <ol className="mt-1 space-y-1" aria-label="Booked">
                {data.booked.map((b) => (
                  <li key={b.bookingId} className="text-sm">
                    <span className="font-medium text-slate-900">{b.name}</span>{" "}
                    <span className="break-all text-slate-500">{b.email}</span>
                    <span className="block text-xs text-slate-400">booked {dayAndTime(b.bookedAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waitlist ({data.waiting.length})</h4>
            {data.waiting.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nobody waiting</p>
            ) : (
              <ol className="mt-1 space-y-1" aria-label="Waitlist">
                {data.waiting.map((w) => (
                  <li key={w.userId} className="text-sm">
                    <span className="font-semibold text-slate-700">{w.position}.</span>{" "}
                    <span className="font-medium text-slate-900">{w.name}</span>{" "}
                    <span className="break-all text-slate-500">{w.email}</span>
                    <span className="block text-xs text-slate-400">joined {dayAndTime(w.joinedAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
