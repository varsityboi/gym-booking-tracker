import { useId, useState } from "react";

// Shared form pieces: large touch targets and 16px text
// (so iOS doesn't zoom into inputs), a label on every field, and each field's
// error shown under it and linked with aria-describedby.

const inputClass = (invalid) =>
  `block h-12 w-full rounded-xl border bg-surface px-3.5 text-base text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 ${
    invalid
      ? "border-danger focus:border-danger focus:ring-danger/30"
      : "border-line-strong focus:border-primary focus:ring-primary/30"
  }`;

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger first-letter:uppercase">
      {message}
    </p>
  );
}

export function TextField({ label, error, inputRef, ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
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
          className="absolute inset-y-0 right-0 flex w-18 items-center justify-center rounded-r-xl text-sm font-bold text-primary-ink hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
      className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-medium text-danger first-letter:uppercase"
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
      className="h-12 w-full rounded-full bg-primary text-base font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-primary/60"
    >
      {busy ? busyLabel : children}
    </button>
  );
}
