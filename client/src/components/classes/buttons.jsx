// Buttons and messages shared by class cards and "My bookings" rows.

const base =
  "h-10 rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

export function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className={`${base} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-300`}
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
      className={`${base} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-indigo-200`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CardError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 first-letter:uppercase">
      {message}
    </p>
  );
}
