import { Navigate, Outlet } from "react-router-dom";
import { isLoggedIn } from "../auth.js";

// Wraps /login and /signup: someone already logged in goes to /today.
export default function GuestOnly() {
  return isLoggedIn() ? <Navigate to="/today" replace /> : <Outlet />;
}
