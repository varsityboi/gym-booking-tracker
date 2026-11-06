import { useState } from "react";
import { api } from "../../api.js";
import { CardError, SecondaryButton } from "../classes/buttons.jsx";
import ProgressRow from "./ProgressRow.jsx";

// Today's water with "+ Glass" (250 ml, the server's default) and "+ Bottle"
// (500 ml). Every tap is its own POST /water, and the buttons stay usable
// while earlier taps are still on their way. The total only ever comes from
// the server: each finished request reloads /me/today.
export default function WaterCard({ waterMl, targetMl, reload }) {
  const [running, setRunning] = useState(0);
  const [error, setError] = useState(null);

  async function add(body) {
    setError(null);
    setRunning((n) => n + 1);
    try {
      await api("/water", { method: "POST", body });
    } catch (err) {
      setError(err);
    } finally {
      // Reload whether it worked or not: the server's total is the truth.
      await reload();
      setRunning((n) => n - 1);
    }
  }

  return (
    <section aria-labelledby="water-heading" className="rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 id="water-heading" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Water
        </h2>
        {running > 0 && (
          <span role="status" className="text-xs font-bold text-water">
            adding…
          </span>
        )}
      </div>
      <ul className="mt-3">
        <ProgressRow label="Today" total={waterMl} target={targetMl} unit="ml" digits={0} barClass="bg-water" />
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => add(undefined)}
          className="h-14 flex-1 rounded-full bg-water text-lg font-bold shadow-sm transition-colors text-on-primary hover:bg-water-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-water/40"
        >
          + Glass
        </button>
        <SecondaryButton onClick={() => add({ ml: 500 })}>+ Bottle</SecondaryButton>
      </div>
      <p className="mt-2 text-xs text-ink-muted">Glass 250 ml · Bottle 500 ml</p>
      <CardError message={error && `Couldn't add water: ${error.message}`} />
    </section>
  );
}
