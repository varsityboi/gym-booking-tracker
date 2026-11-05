import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../auth.js";

const MEMBER_LINKS = [
  { to: "/today", label: "Today" },
  { to: "/classes", label: "Classes" },
  { to: "/meals", label: "Meals" },
  { to: "/targets", label: "Targets" },
];

// Phone-width app shell: header with logout, page content, and a bottom
// navigation bar (plus Admin for admins).
export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();
  const links = user?.role === "admin" ? [...MEMBER_LINKS, { to: "/admin", label: "Admin" }] : MEMBER_LINKS;

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-lg font-semibold text-slate-900">Gym</span>
        <div className="flex items-center gap-3">
          {user?.name && <span className="text-sm text-slate-500">{user.name}</span>}
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {links.map(({ to, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `block py-3 text-center text-sm font-medium ${
                    isActive ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                  }`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
