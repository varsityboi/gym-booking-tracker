// Stand-in for pages that aren't built yet.
export default function Placeholder({ title, children }) {
  return (
    <section>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{children ?? "Coming soon."}</p>
    </section>
  );
}
