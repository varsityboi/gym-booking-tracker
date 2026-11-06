import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api.js";

// GET /meals?date= for one India date. As on the other pages, only the newest
// request's answer is used and a reload keeps the current list on screen.
// Switching to another date shows loading until that date's list arrives,
// rather than the previous date's meals. Coming back to the tab reloads.
export function useDayMeals(date) {
  const [state, setState] = useState({ date: null, status: "loading", data: null, error: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await api(`/meals?date=${encodeURIComponent(date)}`);
      if (id === latest.current) setState({ date, status: "ready", data, error: null });
    } catch (error) {
      if (id === latest.current) {
        setState((s) => ({ date, status: "error", data: s.date === date ? s.data : null, error }));
      }
    }
  }, [date]);

  useEffect(() => {
    // Loading data is what this effect is for; reload only sets state after
    // its awaits, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const current = state.date === date ? state : { status: "loading", data: null, error: null };
  return { ...current, reload };
}
