// A load error with a Retry button, for a page whose data couldn't be fetched.
export default function RetryBox({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-card border border-danger-line bg-danger-soft p-4">
      <p className="text-sm font-medium text-danger first-letter:uppercase">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 h-10 rounded-full bg-danger px-5 text-sm font-bold text-on-primary hover:bg-danger-hover"
      >
        Retry
      </button>
    </div>
  );
}
