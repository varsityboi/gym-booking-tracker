import { Link } from "react-router-dom";
import { dayAndTime } from "../../time.js";

// The member's next booked class, or a nudge to book one. Either way it opens /classes.
export default function NextClassCard({ nextClass }) {
  return (
    <section aria-labelledby="next-class-heading">
      <h2 id="next-class-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Next class
      </h2>
      <Link
        to="/classes"
        className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
      >
        {nextClass ? (
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900">{nextClass.title}</span>
            <span className="mt-0.5 block text-sm text-slate-600">{dayAndTime(nextClass.starts_at)}</span>
          </span>
        ) : (
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900">No class booked</span>
            <span className="mt-0.5 block text-sm text-indigo-600">Browse classes</span>
          </span>
        )}
        <span aria-hidden="true" className="text-slate-400">
          ›
        </span>
      </Link>
    </section>
  );
}
