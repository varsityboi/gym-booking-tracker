import { useEffect, useRef } from "react";

// An in-page confirmation using <dialog>: showModal() traps focus, makes the
// rest of the page inert, and Escape cancels. Rendered only while open.
// children (optional) go under the message, e.g. a reason field.
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Keep it", onConfirm, onCancel, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault(); // Escape: let React decide, so state stays in sync
        onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-card bg-surface p-6 shadow-lift backdrop:bg-ink/40"
    >
      <h2 id="confirm-title" className="text-lg font-bold text-ink">
        {title}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{message}</p>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="h-11 rounded-full bg-danger text-sm font-bold text-on-primary hover:bg-danger-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="h-11 rounded-full border border-line-strong text-sm font-bold text-ink-soft hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
