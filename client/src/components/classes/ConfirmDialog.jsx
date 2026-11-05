import { useEffect, useRef } from "react";

// An in-page confirmation using <dialog>: showModal() traps focus, makes the
// rest of the page inert, and Escape cancels. Rendered only while open.
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Keep it", onConfirm, onCancel }) {
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
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-white p-5 shadow-xl backdrop:bg-slate-900/40"
    >
      <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="h-11 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="h-11 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          {cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
