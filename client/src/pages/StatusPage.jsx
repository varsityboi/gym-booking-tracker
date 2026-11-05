import { useEffect, useState } from "react";
import { api } from "../api.js";

// TEMPORARY: proves the browser can reach the API (CORS included) by calling
// GET /db-test. Remove once real pages call the API.
export default function StatusPage() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    api("/db-test", { signal: controller.signal })
      .then((data) => setState({ data }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ error });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">API status</h1>
      <p className="mt-1 text-sm text-slate-500">
        GET {import.meta.env.VITE_API_URL}/db-test
      </p>

      {state.loading && <p className="mt-6 text-slate-600">Checking…</p>}

      {state.data && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="status-ok">
          <p className="font-medium text-emerald-800">Connected</p>
          <p className="mt-1 text-sm text-emerald-700">
            Database time: <time dateTime={state.data.now}>{new Date(state.data.now).toLocaleString()}</time>
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-white p-2 text-xs text-slate-700">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}

      {state.error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="status-error">
          <p className="font-medium text-red-800">Not connected</p>
          <p className="mt-1 text-sm text-red-700">
            {state.error.message}
            {state.error.status ? ` (HTTP ${state.error.status})` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
