import { useEffect, useRef, useState } from "react";
import { api } from "../../api.js";
import { preparePhoto } from "../../photo.js";

// Shrinks the photo, sends it to POST /meals/analyze and hands the result to
// onResult. While it runs: `busy` and the seconds since it started; cancel()
// aborts the request. A failure keeps the server's error (429 daily limit,
// 502 couldn't read the photo, 413 too large...) until the next try.
export function usePlateAnalysis(onResult) {
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const controller = useRef(null);

  // Leaving the page cancels an upload that's still going.
  useEffect(() => () => controller.current?.abort(), []);

  async function analyze(file) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setError(null);
    setBusy(true);
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    try {
      const photo = await preparePhoto(file);
      if (c.signal.aborted) return;
      const form = new FormData();
      form.append("photo", photo);
      const result = await api("/meals/analyze", { method: "POST", body: form, signal: c.signal });
      if (!c.signal.aborted) onResult(result);
    } catch (err) {
      if (err.name !== "AbortError" && !c.signal.aborted) setError(err);
    } finally {
      clearInterval(timer);
      if (controller.current === c) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }

  return { analyze, cancel, busy, elapsed, error };
}
