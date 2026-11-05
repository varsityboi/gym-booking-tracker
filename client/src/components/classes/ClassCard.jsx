import { useState } from "react";
import { api } from "../../api.js";
import { ordinal, timeOfDay } from "../../time.js";
import { CardError, PrimaryButton, SecondaryButton } from "./buttons.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useCardAction } from "./useCardAction.js";

// The 409 the server sends when the last place went before her booking did.
export const CLASS_FULL_MESSAGE = "class is full, you can join the waitlist";

// One class in the week list. Its state comes only from the server's lists:
// `booking` is her active booking for it, `waiting` her waitlist entry.
export default function ClassCard({ cls, booking, waiting, reload }) {
  const { busy, error, run } = useCardAction(reload);
  const [confirming, setConfirming] = useState(false);
  const full = cls.places_left <= 0;

  const book = () => run(() => api(`/classes/${cls.id}/book`, { method: "POST" }));
  const joinWaitlist = () => run(() => api(`/classes/${cls.id}/waitlist`, { method: "POST" }));
  const leaveWaitlist = () => run(() => api(`/classes/${cls.id}/waitlist/leave`, { method: "POST" }));
  const cancel = () => {
    setConfirming(false);
    run(() => api(`/bookings/${booking.id}/cancel`, { method: "POST" }));
  };

  let status = null;
  let action;
  if (booking) {
    status = <span className="text-sm font-semibold text-emerald-700">Booked ✓</span>;
    action = (
      <SecondaryButton onClick={() => setConfirming(true)} disabled={busy}>
        Cancel
      </SecondaryButton>
    );
  } else if (waiting) {
    status = (
      <span className="text-sm font-semibold text-amber-700">You're {ordinal(waiting.position)} in line</span>
    );
    action = (
      <SecondaryButton onClick={leaveWaitlist} disabled={busy}>
        Leave
      </SecondaryButton>
    );
  } else if (full) {
    action = (
      <PrimaryButton onClick={joinWaitlist} disabled={busy}>
        Join waitlist
      </PrimaryButton>
    );
  } else {
    action = (
      <PrimaryButton onClick={book} disabled={busy}>
        Book
      </PrimaryButton>
    );
  }

  // The class filled up just before she booked: say so and offer the
  // waitlist, unless joining it is already the card's main action.
  const offerWaitlist =
    error?.status === 409 && error.message === CLASS_FULL_MESSAGE && !booking && !waiting && !full;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4" data-class-id={cls.id} aria-busy={busy || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">{cls.title}</h3>
          <p className="mt-0.5 text-sm text-slate-600">{timeOfDay(cls.starts_at)}</p>
          <p className={`mt-1 text-sm ${full ? "font-medium text-red-700" : "text-slate-500"}`}>
            {full
              ? "Full"
              : `${cls.places_left} of ${cls.capacity} ${cls.places_left === 1 ? "place" : "places"} left`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {status}
          {action}
        </div>
      </div>

      <CardError message={error?.message} />
      {offerWaitlist && (
        <div className="mt-2">
          <PrimaryButton onClick={joinWaitlist} disabled={busy}>
            Join waitlist
          </PrimaryButton>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Cancel this booking?"
          message={`${cls.title}, ${timeOfDay(cls.starts_at)}. Your place may go to someone on the waitlist.`}
          confirmLabel="Cancel booking"
          cancelLabel="Keep booking"
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
