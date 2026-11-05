import { Link } from "react-router-dom";

// The phone-width frame for /login and /signup: no header or bottom nav.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-white px-6 py-10">
      <p className="text-lg font-semibold text-indigo-600">Gym</p>
      <h1 className="mt-6 text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-8">{children}</div>
      {footer && (
        <p className="mt-8 text-center text-sm text-slate-600">
          {footer.text}{" "}
          <Link to={footer.to} className="font-medium text-indigo-600 hover:text-indigo-800">
            {footer.link}
          </Link>
        </p>
      )}
    </div>
  );
}
