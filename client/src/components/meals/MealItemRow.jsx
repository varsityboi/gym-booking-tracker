import { useId, useState } from "react";
import { api } from "../../api.js";
import { fmt, gramsError, parseAmount, round2 } from "../../nutrition.js";
import { CardError, PrimaryButton, SecondaryButton } from "../classes/buttons.jsx";
import ConfirmDialog from "../classes/ConfirmDialog.jsx";
import { useCardAction } from "../classes/useCardAction.js";
import NutritionLine from "./NutritionLine.jsx";

// One saved item in the day list. Edits send the version the list was loaded
// with; if the item changed since (another tab or device), the server answers
// 409 and the list is reloaded so the current values show.
export default function MealItemRow({ mealId, item, reload }) {
  const { busy, error, run } = useCardAction(reload);
  const [editing, setEditing] = useState(false);
  const [grams, setGrams] = useState("");
  const [gramsProblem, setGramsProblem] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const gramsId = useId();
  const path = `/meals/${mealId}/items/${item.id}`;

  // Close the editor when the change worked, or when it was refused because
  // the item changed: the reload then shows the new grams to start from.
  const request = (send) =>
    run(async () => {
      try {
        await send();
        setEditing(false);
      } catch (err) {
        if (err.status === 409 || err.status === 404) setEditing(false);
        throw err;
      }
    });

  function saveGrams(e) {
    e.preventDefault();
    const value = parseAmount(grams);
    const problem = gramsError(value);
    if (problem) return setGramsProblem(problem);
    setGramsProblem(null);
    request(() => api(path, { method: "PATCH", body: { version: item.version, grams: round2(value) } }));
  }

  function remove() {
    setConfirming(false);
    request(() => api(path, { method: "DELETE", body: { version: item.version } }));
  }

  return (
    <li className="py-3" data-item-id={item.id} aria-busy={busy || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {item.name}
            {item.kind === "estimated" && <span className="ml-2 text-xs font-normal text-slate-500">estimate</span>}
          </p>
          <p className="text-sm text-slate-500">{fmt(item.grams)} g</p>
          <NutritionLine nutrition={item.nutrition} />
        </div>
        {!editing && (
          <div className="flex shrink-0 flex-col gap-2">
            <SecondaryButton
              disabled={busy}
              onClick={() => {
                setGrams(String(item.grams));
                setGramsProblem(null);
                setEditing(true);
              }}
            >
              Edit grams
            </SecondaryButton>
            <SecondaryButton disabled={busy} onClick={() => setConfirming(true)}>
              Remove
            </SecondaryButton>
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={saveGrams} noValidate className="mt-2 flex items-end gap-2">
          <div className="w-28">
            <label htmlFor={gramsId} className="mb-1 block text-xs font-medium text-slate-600">
              Grams
            </label>
            <input
              id={gramsId}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <PrimaryButton type="submit" disabled={busy}>
            Save
          </PrimaryButton>
          <SecondaryButton disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </SecondaryButton>
        </form>
      )}
      {gramsProblem && editing && <p className="mt-1 text-sm text-red-700 first-letter:uppercase">{gramsProblem}</p>}
      <CardError message={error?.message} />

      {confirming && (
        <ConfirmDialog
          title="Remove this food?"
          message={`${item.name}, ${fmt(item.grams)} g. It will no longer count towards the day's totals.`}
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
