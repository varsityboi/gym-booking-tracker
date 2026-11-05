import { Link } from "react-router-dom";

// Stand-in for /login and /signup until the forms are built: a phone-width
// card outside the main layout (no bottom navigation).
export default function AuthPlaceholder({ title, otherLink }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">The form is coming soon.</p>
      <Link to={otherLink.to} className="mt-6 text-sm font-medium text-indigo-600">
        {otherLink.label}
      </Link>
    </div>
  );
}
