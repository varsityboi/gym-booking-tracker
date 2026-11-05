import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getUser, isLoggedIn } from "../auth.js";

// Wraps routes that need a logged-in user (and, with role, that role).
// Without a token: to /login, remembering where they were going.
// Wrong role: to /today. This only hides pages; the server checks every
// request itself.
export default function RequireAuth({ role }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (role && getUser()?.role !== role) {
    return <Navigate to="/today" replace />;
  }
  return <Outlet />;
}
