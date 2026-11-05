import { useState } from "react";
import { api } from "../../api.js";
import { dayAndTime, ordinal } from "../../time.js";
import { CardError, SecondaryButton } from "./buttons.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useCardAction } from "./useCardAction.js";

// Her upcoming bookings and waitlist places, soonest first. These can be
// further ahead than the week list, so each row has its own Cancel / Leave.
export default function MyBookings({ bookings, waitlist, reload }) {
  const rows = [
    ...bookings.map((b) => ({ kind: "booking", key: `b${b.id}`, ...b })),
    ...waitlist.map((w) => ({ kind: "waiting", key: `w${w.id}`, ...w })),
  ].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  return (
    <section aria-labelledby="my-bookings">
      <h2 id="my-bookings" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        My bookings
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing booked yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <MyBookingRow key={row.key} row={row} reload={reload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MyBookingRow({ row, reload }) {
  const { busy, error, run } = useCardAction(reload);
  const [confirming, setConfirming] = useState(false);

  const cancel = () => {
    setConfirming(false);
    run(() => api(`/bookings/${row.id}/cancel`, { method: "POST" }));
  };
  const leave = () => run(() => api(`/classes/${row.class_id}/waitlist/leave`, { method: "POST" }));

  return (
    <li className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3" data-my-class-id={row.class_id}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.title}</p>
          <p className="text-sm text-slate-600">{dayAndTime(row.starts_at)}</p>
          <p className={`text-sm font-semibold ${row.kind === "booking" ? "text-emerald-700" : "text-amber-700"}`}>
            {row.kind === "booking" ? "Booked ✓" : `Waitlist: ${ordinal(row.position)} in line`}
          </p>
        </div>
        {row.kind === "booking" ? (
          <SecondaryButton onClick={() => setConfirming(true)} disabled={busy}>
            Cancel
          </SecondaryButton>
        ) : (
          <SecondaryButton onClick={leave} disabled={busy}>
            Leave
          </SecondaryButton>
        )}
      </div>
      <CardError message={error?.message} />
      {confirming && (
        <ConfirmDialog
          title="Cancel this booking?"
          message={`${row.title}, ${dayAndTime(row.starts_at)}. Your place may go to someone on the waitlist.`}
          confirmLabel="Cancel booking"
          cancelLabel="Keep booking"
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
