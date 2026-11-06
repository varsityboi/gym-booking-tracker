const formats = {
  0: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }),
};

// 1240.5 -> "1,241" (digits 0) or "1,240.5" (digits 1).
const formatAmount = (n, digits = 1) => formats[digits].format(n);

// One "label  X of Y unit" line with a bar towards the target. Without a
// target (null) it shows just the total. Past the target the bar turns amber
// and the line says how much over.
export default function ProgressRow({ label, total, target, unit, digits = 1, barClass = "bg-indigo-600" }) {
  const amount = (n) => `${formatAmount(n, digits)}${unit === "g" ? "g" : ` ${unit}`}`;
  const hasTarget = target !== null && target !== undefined;
  const over = hasTarget && total > target;
  const percent = !hasTarget ? 0 : target > 0 ? Math.min(100, (total / target) * 100) : total > 0 ? 100 : 0;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-slate-600">
          {hasTarget ? (
            <>
              <span className="font-semibold text-slate-900">{formatAmount(total, digits)}</span> of {amount(target)}
            </>
          ) : (
            <span className="font-semibold text-slate-900">{amount(total)}</span>
          )}
        </span>
      </div>
      {hasTarget && (
        <>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(total, target)}
            className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className={`h-full rounded-full ${over ? "bg-amber-500" : barClass}`}
              style={{ width: `${percent}%` }}
              data-over={over || undefined}
            />
          </div>
          {over && (
            <p className="mt-1 text-xs font-medium text-amber-700">{amount(total - target)} over</p>
          )}
        </>
      )}
    </li>
  );
}
