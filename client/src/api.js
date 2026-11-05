import { clearSession, getToken } from "./auth.js";

// One helper for every call to the server.
//   api("/classes")                                  GET
//   api("/auth/login", { method: "POST", body: {...} })   JSON body
//   api("/meals/analyze", { method: "POST", body: formData })   upload, sent as is
// Resolves with the parsed JSON reply (or text, or null when empty). Rejects
// with an ApiError carrying the server's error message and the HTTP status.

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 when the server couldn't be reached
    this.body = body;
  }
}

export async function api(path, { method = "GET", body, headers = {}, signal } = {}) {
  const token = getToken();
  const isForm = body instanceof FormData;
  const hasJsonBody = body !== undefined && !isForm;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // FormData sets its own multipart Content-Type (with the boundary).
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: hasJsonBody ? JSON.stringify(body) : body,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    // Network down, server not running, or blocked by CORS: fetch only says "failed".
    throw new ApiError("can't reach the server, check your connection", 0, null);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  // An expired or invalid session: log out and go to the login page. Only
  // when we sent a token; a 401 from a login attempt is just a wrong password,
  // and the login page shows the message instead of reloading.
  if (res.status === 401 && token) {
    clearSession();
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }

  if (!res.ok) {
    const message = (data && typeof data === "object" && data.error) || `request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}
