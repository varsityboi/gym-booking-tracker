import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../auth.js";

const MEMBER_LINKS = [
  { to: "/today", label: "Today" },
  { to: "/classes", label: "Classes" },
  { to: "/meals", label: "Meals" },
  { to: "/targets", label: "Targets" },
];

const logo = (
  <span className="text-lg font-extrabold text-primary-ink">
    <span aria-hidden="true">🌿 </span>Gym
  </span>
);

// The app shell. Phone: a header with the name and Log out, one column, and a
// bottom navigation bar. From md up: one top bar with the logo, the links, the
// name and Log out (no bottom bar), and content up to 64rem wide.
export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();
  const links = user?.role === "admin" ? [...MEMBER_LINKS, { to: "/admin", label: "Admin" }] : MEMBER_LINKS;

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const logoutButton = (
    <button
      type="button"
      onClick={logout}
      className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-bold text-ink-soft transition-colors hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      Log out
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 py-3 md:max-w-5xl md:px-6">
          {logo}
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {links.map(({ to, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `block rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                        isActive ? "bg-primary text-on-primary" : "text-ink-soft hover:bg-sunken hover:text-ink"
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-3">
            {user?.name && <span className="max-w-[10rem] truncate text-sm text-ink-muted">{user.name}</span>}
            {logoutButton}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 pb-28 md:max-w-5xl md:px-6 md:py-8 md:pb-12">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex w-full max-w-md">
          {links.map(({ to, label }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-center text-sm font-bold ${
                    isActive ? "text-primary-ink" : "text-ink-muted hover:text-ink"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={`h-1 w-6 rounded-full ${isActive ? "bg-primary" : "bg-transparent"}`}
                    />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
