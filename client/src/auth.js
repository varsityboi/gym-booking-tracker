// The logged-in session (JWT + user) in localStorage. Every access is wrapped
// in try/catch: in a private window or with storage blocked, localStorage
// throws, and the app should then behave as logged out instead of crashing.

const TOKEN_KEY = "gym.token";
const USER_KEY = "gym.user";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// The user object saved at login ({ id, name, email, role }), or null.
export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

export const isLoggedIn = () => Boolean(getToken());
export const isAdmin = () => getUser()?.role === "admin";
