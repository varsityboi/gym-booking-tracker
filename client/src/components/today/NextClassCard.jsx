import { Link } from "react-router-dom";
import { dayAndTime } from "../../time.js";

// The member's next booked class, or a nudge to book one. Either way it opens /classes.
export default function NextClassCard({ nextClass }) {
  return (
    <section aria-labelledby="next-class-heading">
      <h2 id="next-class-heading" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
        Next class
      </h2>
      <Link
        to="/classes"
        className="mt-2 flex items-center justify-between gap-3 rounded-card bg-surface p-5 shadow-card transition-shadow hover:shadow-lift"
      >
        {nextClass ? (
          <span className="min-w-0">
            <span className="block truncate font-bold text-ink">{nextClass.title}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{dayAndTime(nextClass.starts_at)}</span>
          </span>
        ) : (
          <span className="min-w-0">
            <span className="block font-bold text-ink">No class booked</span>
            <span className="mt-0.5 block text-sm font-semibold text-primary-ink">Browse classes</span>
          </span>
        )}
        <span aria-hidden="true" className="text-ink-muted">
          ›
        </span>
      </Link>
    </section>
  );
}
