import { Navigate, Route, Routes } from "react-router-dom";
import { isLoggedIn } from "./auth.js";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import GuestOnly from "./components/GuestOnly.jsx";
import ClassesPage from "./pages/ClassesPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import TodayPage from "./pages/TodayPage.jsx";

// "/" and unknown paths: /today when logged in, /login otherwise.
function HomeRedirect() {
  return <Navigate to={isLoggedIn() ? "/today" : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      {/* TEMPORARY: checks the API connection; remove with StatusPage. */}
      <Route path="/status" element={<StatusPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/meals" element={<Placeholder title="Meals" />} />
          <Route path="/targets" element={<Placeholder title="Targets" />} />
          <Route element={<RequireAuth role="admin" />}>
            <Route path="/admin" element={<Placeholder title="Admin" />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
