import { Navigate, Route, Routes } from "react-router-dom";
import { isLoggedIn } from "./auth.js";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import AuthPlaceholder from "./pages/AuthPlaceholder.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import StatusPage from "./pages/StatusPage.jsx";

// "/" and unknown paths: /today when logged in, /login otherwise.
function HomeRedirect() {
  return <Navigate to={isLoggedIn() ? "/today" : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<AuthPlaceholder title="Log in" otherLink={{ to: "/signup", label: "Create an account" }} />}
      />
      <Route
        path="/signup"
        element={<AuthPlaceholder title="Sign up" otherLink={{ to: "/login", label: "I already have an account" }} />}
      />
      {/* TEMPORARY: checks the API connection; remove with StatusPage. */}
      <Route path="/status" element={<StatusPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/today" element={<Placeholder title="Today" />} />
          <Route path="/classes" element={<Placeholder title="Classes" />} />
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
