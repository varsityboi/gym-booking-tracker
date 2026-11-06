import { useId, useState } from "react";
import { api } from "../../api.js";
import { timeOfDay } from "../../time.js";
import { capacityError } from "../../validation.js";
import { CardError, PrimaryButton, SecondaryButton } from "../classes/buttons.jsx";
import ConfirmDialog from "../classes/ConfirmDialog.jsx";
import { useCardAction } from "../classes/useCardAction.js";
import PeoplePanel from "./PeoplePanel.jsx";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "3 bookings cancelled, 1 removed from waitlist"
const cancelSummary = ({ cancelledBookings, removedWaitlistEntries }) =>
  `${plural(cancelledBookings, "booking", "bookings")} cancelled, ${removedWaitlistEntries} removed from waitlist`;

// One class in the admin list. Actions go through useCardAction: one at a
// time per card, the server's error stays on the card, and the page reloads
// (list and open People panels) afterwards, whatever happened.
export default function AdminClassCard({ cls, reload, refreshKey }) {
  const { busy, error, run } = useCardAction(reload);
  const [capacity, setCapacity] = useState(String(cls.capacity));
  const [capacityProblem, setCapacityProblem] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const capacityId = useId();
  const reasonId = useId();
  const cancelled = cls.status === "cancelled";

  function saveCapacity(e) {
    e.preventDefault();
    const problem = capacityError(capacity);
    setCapacityProblem(problem);
    setNotice(null);
    if (problem) return;
    const value = Number(capacity.trim());
    run(async () => {
      const updated = await api(`/classes/${cls.id}/capacity`, { method: "PATCH", body: { capacity: value } });
      setCapacity(String(updated.capacity));
      setNotice(`Places set to ${updated.capacity}`);
    });
  }

  function cancelClass() {
    const trimmed = reason.trim();
    setConfirming(false);
    setNotice(null);
    run(async () => {
      const result = await api(`/classes/${cls.id}/cancel`, {
        method: "POST",
        body: trimmed ? { reason: trimmed.slice(0, 200) } : undefined,
      });
      setNotice(`Class cancelled: ${cancelSummary(result)}`);
    });
  }

  return (
    <li
      className={`rounded-xl border bg-white p-4 ${cancelled ? "border-slate-200 opacity-80" : "border-slate-200"}`}
      data-class-id={cls.id}
      aria-busy={busy || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{cls.title}</h3>
          <p className="mt-0.5 text-sm text-slate-600">{timeOfDay(cls.starts_at)}</p>
          <p className="mt-1 text-sm text-slate-700" data-testid="counts">
            {cls.booked} of {cls.capacity} booked · {cls.waiting_count} waiting
          </p>
        </div>
        {cancelled && (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Cancelled</span>
        )}
      </div>
      {cancelled && (
        <p className="mt-1 text-sm text-slate-500">{cls.cancel_reason ? `Reason: ${cls.cancel_reason}` : "No reason given"}</p>
      )}

      {notice && (
        <p role="status" className="mt-2 text-sm font-medium text-emerald-700">
          {notice}
        </p>
      )}
      <CardError message={error?.message} />

      {!cancelled && (
        <>
          <form onSubmit={saveCapacity} noValidate className="mt-3 flex items-end gap-2">
            <div className="w-24">
              <label htmlFor={capacityId} className="mb-1 block text-xs font-medium text-slate-600">
                Places
              </label>
              <input
                id={capacityId}
                inputMode="numeric"
                autoComplete="off"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                aria-invalid={capacityProblem ? true : undefined}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <PrimaryButton type="submit" disabled={busy}>
              Save
            </PrimaryButton>
          </form>
          {capacityProblem && <p className="mt-1 text-sm text-red-700 first-letter:uppercase">{capacityProblem}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <SecondaryButton onClick={() => setPeopleOpen((o) => !o)} aria-expanded={peopleOpen}>
              {peopleOpen ? "Hide people" : "People"}
            </SecondaryButton>
            <SecondaryButton
              disabled={busy}
              onClick={() => {
                setReason("");
                setConfirming(true);
              }}
            >
              Cancel class
            </SecondaryButton>
          </div>
          {peopleOpen && <PeoplePanel classId={cls.id} refreshKey={refreshKey} />}
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Cancel this class?"
          message={`${cls.title}, ${timeOfDay(cls.starts_at)}. Everyone booked or waiting loses their place.`}
          confirmLabel="Cancel class"
          cancelLabel="Keep class"
          onConfirm={cancelClass}
          onCancel={() => setConfirming(false)}
        >
          <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-slate-700">
            Reason (optional)
          </label>
          <input
            id={reasonId}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Instructor is ill"
            className="block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <p className="mt-1 text-xs text-slate-500">{reason.trim().length}/200</p>
        </ConfirmDialog>
      )}
    </li>
  );
}
