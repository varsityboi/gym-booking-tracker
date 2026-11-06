const formats = {
  0: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }),
};

// 1240.5 -> "1,241" (digits 0) or "1,240.5" (digits 1).
const formatAmount = (n, digits = 1) => formats[digits].format(n);

// One "label  X of Y unit" line with a bar towards the target. Without a
// target (null) it shows just the total. Past the target the bar turns amber
// and the line says how much over.
export default function ProgressRow({ label, total, target, unit, digits = 1, barClass = "bg-primary" }) {
  const amount = (n) => `${formatAmount(n, digits)}${unit === "g" ? "g" : ` ${unit}`}`;
  const hasTarget = target !== null && target !== undefined;
  const over = hasTarget && total > target;
  const percent = !hasTarget ? 0 : target > 0 ? Math.min(100, (total / target) * 100) : total > 0 ? 100 : 0;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-ink">{label}</span>
        <span className="text-ink-soft">
          {hasTarget ? (
            <>
              <span className="font-bold text-ink">{formatAmount(total, digits)}</span> of {amount(target)}
            </>
          ) : (
            <span className="font-bold text-ink">{amount(total)}</span>
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
            className="mt-2 h-3 overflow-hidden rounded-full bg-sunken"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${over ? "bg-warn-bar" : barClass}`}
              style={{ width: `${percent}%` }}
              data-over={over || undefined}
            />
          </div>
          {over && (
            <p className="mt-1 text-xs font-bold text-warn">{amount(total - target)} over</p>
          )}
        </>
      )}
    </li>
  );
}
