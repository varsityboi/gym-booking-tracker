import { Link } from "react-router-dom";

// The frame for /login and /signup: no header or nav. Full width on a
// phone; from md up, a centred card on the cream page.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 md:px-6">
      <div className="w-full max-w-md md:rounded-card md:bg-surface md:p-10 md:shadow-lift">
        <p className="text-lg font-extrabold text-primary-ink">
          <span aria-hidden="true">🌿 </span>Gym
        </p>
        <h1 className="mt-6 text-2xl font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-8">{children}</div>
        {footer && (
          <p className="mt-8 text-center text-sm text-ink-soft">
            {footer.text}{" "}
            <Link to={footer.to} className="font-bold text-primary-ink underline-offset-2 hover:underline">
              {footer.link}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
