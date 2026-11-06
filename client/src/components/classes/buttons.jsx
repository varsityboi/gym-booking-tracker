// Buttons and messages shared by class cards and "My bookings" rows.

const base =
  "h-10 rounded-full px-5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className={`${base} bg-primary text-on-primary hover:bg-primary-hover focus-visible:ring-primary/45`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className={`${base} border border-line-strong bg-surface text-ink-soft hover:bg-sunken focus-visible:ring-primary/30`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CardError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger first-letter:uppercase">
      {message}
    </p>
  );
}
