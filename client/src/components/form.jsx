import { useId, useState } from "react";

// Shared form pieces for the auth screens: large touch targets and 16px text
// (so iOS doesn't zoom into inputs), a label on every field, and each field's
// error shown under it and linked with aria-describedby.

const inputClass = (invalid) =>
  `block h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
  }`;

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-600 first-letter:uppercase">
      {message}
    </p>
  );
}

export function TextField({ label, error, inputRef, ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className={inputClass(Boolean(error))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

// A password input with a Show/Hide button inside it.
export function PasswordField({ label, error, inputRef, ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={visible ? "text" : "password"}
          className={`${inputClass(Boolean(error))} pr-20`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-18 items-center justify-center rounded-r-lg text-sm font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

// The server's (or network) error for the whole form, above the fields.
export function FormError({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 first-letter:uppercase"
    >
      {message}
    </div>
  );
}

export function SubmitButton({ busy, busyLabel, children }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      className="h-12 w-full rounded-lg bg-indigo-600 text-base font-semibold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-400"
    >
      {busy ? busyLabel : children}
    </button>
  );
}
