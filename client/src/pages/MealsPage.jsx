import { useRef, useState } from "react";
import { api } from "../api.js";
import { PrimaryButton, SecondaryButton } from "../components/classes/buttons.jsx";
import ConfirmDialog from "../components/classes/ConfirmDialog.jsx";
import { FormError } from "../components/form.jsx";
import AddFoodPanel from "../components/meals/AddFoodPanel.jsx";
import DayMeals from "../components/meals/DayMeals.jsx";
import NutritionLine from "../components/meals/NutritionLine.jsx";
import ReviewItemCard from "../components/meals/ReviewItemCard.jsx";
import { useDayMeals } from "../components/meals/useDayMeals.js";
import { usePlateAnalysis } from "../components/meals/usePlateAnalysis.js";
import { fromAnalyzeItem, itemError, toPayload, totalsOf } from "../nutrition.js";
import { dayKey } from "../time.js";

// Log a meal from a plate photo or by hand, check every item, save it, and
// see (and fix) the day's meals below.
export default function MealsPage() {
  // India date when the page opened: the default day and the latest one to pick.
  const [today] = useState(() => dayKey(new Date()));
  const [date, setDate] = useState(today);
  const day = useDayMeals(date);

  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(null); // e.g. no food found in the photo
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // The server's error for one item after a failed save: { key, message }.
  const [itemServerError, setItemServerError] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const fileInput = useRef(null);

  const plate = usePlateAnalysis((result) => {
    const found = result.items.map(fromAnalyzeItem);
    setNotice(found.length === 0 ? "No food found in that photo. Try another photo or add it manually." : null);
    setItems((current) => [...current, ...found]);
  });

  function onPhoto(e) {
    const file = e.target.files?.[0];
    // Clear the input, so picking the same photo again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    setSaveError(null);
    plate.analyze(file);
  }

  // Changing or removing the item the server refused clears its error: it's
  // checked again on the next save.
  const clearServerErrorFor = (key) => setItemServerError((e) => (e?.key === key ? null : e));
  const updateItem = (next) => {
    clearServerErrorFor(next.key);
    setItems((list) => list.map((i) => (i.key === next.key ? next : i)));
  };
  const removeItem = (key) => {
    clearServerErrorFor(key);
    setItems((list) => list.filter((i) => i.key !== key));
  };

  function discard() {
    setConfirmingDiscard(false);
    setItems([]);
    setShowErrors(false);
    setSaveError(null);
    setItemServerError(null);
  }

  const unknownCount = items.filter((i) => i.kind === "unknown").length;
  const totals = totalsOf(items);

  async function save() {
    if (saving) return;
    if (items.some(itemError)) {
      setShowErrors(true);
      setSaveError("Fix the items marked below first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setItemServerError(null);
    const sent = items;
    try {
      await api("/meals", { method: "POST", body: { items: sent.map(toPayload) } });
      setItems([]);
      setShowErrors(false);
      setAdding(false);
      setNotice(null);
      // The meal is logged now (India time), so show today's list.
      if (date !== today) setDate(today);
      else await day.reload();
    } catch (err) {
      // itemIndex is the item's position in what was sent, which is the
      // order of the review list.
      const target = Number.isInteger(err.body?.itemIndex) ? sent[err.body.itemIndex] : undefined;
      if (target) {
        setItemServerError({ key: target.key, message: err.message });
        setSaveError("Couldn't save the meal: fix the item marked below.");
        requestAnimationFrame(() =>
          document.querySelector(`[data-review-item="${target.key}"]`)?.scrollIntoView({ block: "center" })
        );
      } else {
        setSaveError(`Couldn't save the meal: ${err.message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Meals</h1>

      <div className="space-y-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhoto}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="photo-input"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={plate.busy}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Snap your plate
        </button>
        {!adding && (
          <SecondaryButton onClick={() => setAdding(true)}>Add food manually</SecondaryButton>
        )}

        {plate.busy && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-sm font-medium text-indigo-900">
              Reading your plate… <span className="tabular-nums">{plate.elapsed}s</span>
            </p>
            <SecondaryButton onClick={plate.cancel}>Cancel</SecondaryButton>
          </div>
        )}
        <FormError message={plate.error && plate.error.message} />
        {notice && <p className="text-sm text-slate-600">{notice}</p>}
      </div>

      {adding && (
        <AddFoodPanel
          onAdd={(item) => {
            setItems((list) => [...list, item]);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {items.length > 0 && (
        <section aria-labelledby="review-heading" className="space-y-3">
          <h2 id="review-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Check your meal
          </h2>
          <FormError message={saveError} />
          <ul className="space-y-3" aria-label="Meal items">
            {items.map((item) => (
              <ReviewItemCard
                key={item.key}
                item={item}
                onChange={updateItem}
                onRemove={() => removeItem(item.key)}
                showError={showErrors}
                serverError={itemServerError?.key === item.key ? itemServerError.message : null}
              />
            ))}
          </ul>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Meal total</p>
            <NutritionLine nutrition={totals} />
            {unknownCount > 0 && (
              <p className="mt-2 text-sm font-medium text-red-700">
                {unknownCount === 1 ? "1 item needs" : `${unknownCount} items need`} your input before saving: pick a food,
                enter the numbers, or remove it.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <PrimaryButton onClick={save} disabled={saving || unknownCount > 0} aria-busy={saving || undefined}>
                {saving ? "Saving…" : "Save meal"}
              </PrimaryButton>
              <SecondaryButton disabled={saving} onClick={() => setConfirmingDiscard(true)}>
                Discard
              </SecondaryButton>
            </div>
          </div>
          {confirmingDiscard && (
            <ConfirmDialog
              title="Discard this meal?"
              message={`The ${items.length === 1 ? "food" : `${items.length} foods`} you're checking will be cleared. Nothing has been saved yet.`}
              confirmLabel="Discard"
              cancelLabel="Keep checking"
              onConfirm={discard}
              onCancel={() => setConfirmingDiscard(false)}
            />
          )}
        </section>
      )}

      <DayMeals date={date} today={today} onDateChange={setDate} day={day} />
    </section>
  );
}
