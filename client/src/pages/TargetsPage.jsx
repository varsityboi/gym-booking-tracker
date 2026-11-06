import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { FormError, SubmitButton, TextField } from "../components/form.jsx";
import RetryBox from "../components/RetryBox.jsx";
import { macroCalories, parseWhole, TARGET_FIELDS, validateTargets } from "../validation.js";

const PLACEHOLDERS = { calories: "e.g. 2000", proteinG: "e.g. 120", fatG: "e.g. 60", carbsG: "e.g. 250", waterMl: "e.g. 3000" };
const EMPTY = { calories: "", proteinG: "", fatG: "", carbsG: "", waterMl: "" };

// GET /targets ({ calories, protein_g, ... } or null) -> the form's text values.
const toForm = (t) =>
  t
    ? {
        calories: String(t.calories),
        proteinG: String(t.protein_g),
        fatG: String(t.fat_g),
        carbsG: String(t.carbs_g),
        waterMl: String(t.water_ml),
      }
    : EMPTY;

// Loaded once: reloading on tab focus could overwrite numbers being typed.
function useTargets() {
  const [state, setState] = useState({ status: "loading", data: undefined, error: null });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await api("/targets");
      if (id === latest.current) setState({ status: "ready", data, error: null });
    } catch (error) {
      if (id === latest.current) setState({ status: "error", data: undefined, error });
    }
  }, []);

  useEffect(() => {
    // Loading data is what this effect is for.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  // Retry shows the loading state again while it asks.
  const retry = () => {
    setState({ status: "loading", data: undefined, error: null });
    reload();
  };

  return { ...state, retry };
}

const fmtKcal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// The macros' calories next to the calorie target, as a hint only.
function MacroHint({ form }) {
  const fromMacros = macroCalories(form);
  if (fromMacros === null) return null;
  const calories = parseWhole(form.calories);
  const diff = calories > 0 ? (fromMacros - calories) / calories : 0;
  const far = calories > 0 && Math.abs(diff) > 0.15;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600" aria-live="polite">
      <p data-testid="macro-hint">
        Protein, fat and carbs add up to about {fmtKcal.format(fromMacros)} kcal (4 / 9 / 4 kcal per gram).
      </p>
      {far && (
        <p className="mt-1 text-amber-800" data-testid="macro-note">
          That's about {Math.round(Math.abs(diff) * 100)}% {diff > 0 ? "more" : "less"} than your calorie target of{" "}
          {fmtKcal.format(calories)} kcal. That's fine to save; you may want to adjust one or the other.
        </p>
      )}
    </div>
  );
}

export default function TargetsPage() {
  const { status, data, error, retry } = useTargets();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Daily targets</h1>
        <p className="mt-0.5 text-sm text-slate-500">What you aim for each day. Today's screen tracks you against these.</p>
      </div>
      {status === "error" ? (
        <RetryBox message={`Couldn't load your targets: ${error.message}`} onRetry={retry} />
      ) : status === "loading" ? (
        <p className="text-sm text-slate-500" role="status">
          Loading targets…
        </p>
      ) : (
        // Keyed on the loaded values, so a reload after an error starts fresh.
        <TargetsForm key={JSON.stringify(data)} initial={toForm(data)} isNew={data === null} />
      )}
    </section>
  );
}

function TargetsForm({ initial, isNew }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState(null);
  const inputs = useRef({});

  const field = (name) => ({
    value: form[name],
    error: errors[name],
    inputRef: (el) => {
      inputs.current[name] = el;
    },
    onChange: (e) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [name]: value }));
      setSaved(false);
      // Once a field has been flagged, re-check it as it's fixed.
      if (errors[name]) setErrors((errs) => ({ ...errs, [name]: validateTargets({ ...form, [name]: value }).errors[name] }));
    },
  });

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const { values, errors: found } = validateTargets(form);
    setErrors(found);
    setServerError(null);
    if (!values) {
      const first = TARGET_FIELDS.find((f) => found[f.name]);
      inputs.current[first.name]?.focus();
      return;
    }
    setSaving(true);
    try {
      const t = await api("/targets", { method: "PUT", body: values });
      setForm(toForm(t));
      setSaved(true);
    } catch (err) {
      setServerError(`Couldn't save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {isNew && !saved && (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          You haven't set targets yet. Fill these in to see progress bars on Today.
        </p>
      )}
      <FormError message={serverError} />
      {TARGET_FIELDS.map(({ name, label, unit }) => (
        <TextField
          key={name}
          label={`${label} (${unit})`}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          placeholder={PLACEHOLDERS[name]}
          {...field(name)}
        />
      ))}
      <MacroHint form={form} />
      <SubmitButton busy={saving} busyLabel="Saving…">
        Save targets
      </SubmitButton>
      {saved && (
        <p role="status" className="text-center text-sm font-medium text-emerald-700">
          Saved ✓{" "}
          <Link to="/today" className="text-indigo-600 underline hover:text-indigo-800">
            See today's progress
          </Link>
        </p>
      )}
    </form>
  );
}
