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
      className={`rounded-card p-5 ${cancelled ? "border border-line bg-sunken" : "bg-surface shadow-card"}`}
      data-class-id={cls.id}
      aria-busy={busy || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-ink">{cls.title}</h3>
          <p className="mt-0.5 text-sm text-ink-soft">{timeOfDay(cls.starts_at)}</p>
          <p className="mt-1 text-sm text-ink-soft" data-testid="counts">
            {cls.booked} of {cls.capacity} booked · {cls.waiting_count} waiting
          </p>
        </div>
        {cancelled && (
          <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-ink-soft ring-1 ring-line-strong">Cancelled</span>
        )}
      </div>
      {cancelled && (
        <p className="mt-1 text-sm text-ink-muted">{cls.cancel_reason ? `Reason: ${cls.cancel_reason}` : "No reason given"}</p>
      )}

      {notice && (
        <p role="status" className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-sm font-bold text-success">
          {notice}
        </p>
      )}
      <CardError message={error?.message} />

      {!cancelled && (
        <>
          <form onSubmit={saveCapacity} noValidate className="mt-3 flex items-end gap-2">
            <div className="w-24">
              <label htmlFor={capacityId} className="mb-1 block text-xs font-medium text-ink-soft">
                Places
              </label>
              <input
                id={capacityId}
                inputMode="numeric"
                autoComplete="off"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                aria-invalid={capacityProblem ? true : undefined}
                className="block h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <PrimaryButton type="submit" disabled={busy}>
              Save
            </PrimaryButton>
          </form>
          {capacityProblem && <p className="mt-1 text-sm text-danger first-letter:uppercase">{capacityProblem}</p>}

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
          <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-ink-soft">
            Reason (optional)
          </label>
          <input
            id={reasonId}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Instructor is ill"
            className="block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-ink-muted">{reason.trim().length}/200</p>
        </ConfirmDialog>
      )}
    </li>
  );
}
