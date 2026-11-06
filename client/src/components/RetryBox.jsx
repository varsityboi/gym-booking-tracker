// A load error with a Retry button, for a page whose data couldn't be fetched.
export default function RetryBox({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800 first-letter:uppercase">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
}
