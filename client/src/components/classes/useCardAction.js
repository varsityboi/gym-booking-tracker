import { useRef, useState } from "react";

// One card's request state: while an action runs the card's buttons are
// disabled (and a second tap is ignored); a failure keeps the server's
// message on that card. Afterwards, successful or not, the lists are
// reloaded from the server (never updated optimistically).
export function useCardAction(reload) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { message, status }
  const running = useRef(false);

  async function run(request) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await request();
    } catch (err) {
      setError({
        message: err?.name === "ApiError" ? err.message : "something went wrong, please try again",
        status: err?.status ?? null,
      });
    } finally {
      try {
        await reload();
      } finally {
        running.current = false;
        setBusy(false);
      }
    }
  }

  return { busy, error, run, clearError: () => setError(null) };
}
