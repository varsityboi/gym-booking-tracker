import { useState } from "react";
import { checkNumbers } from "../../nutrition.js";
import { PrimaryButton, SecondaryButton } from "../classes/buttons.jsx";
import { TextField } from "../form.jsx";

const NUMBER_FIELDS = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein_g", label: "Protein (g)" },
  { key: "fat_g", label: "Fat (g)" },
  { key: "carbs_g", label: "Carbs (g)" },
];

// Name, grams and the totals for that amount (not per 100 g: that's what is
// on a label or in an app). onSubmit gets the checked numbers.
export default function NumbersForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => ({
    name: "",
    grams: "",
    calories: "",
    protein_g: "",
    fat_g: "",
    carbs_g: "",
    ...initial,
  }));
  const [error, setError] = useState(null);
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  function submit(e) {
    e.preventDefault();
    const { values, error: problem } = checkNumbers(form);
    if (problem) return setError(problem);
    setError(null);
    onSubmit(values);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl bg-sunken p-3">
      <TextField label="Name" autoComplete="off" maxLength={100} {...field("name")} />
      <TextField label="Grams" inputMode="decimal" autoComplete="off" {...field("grams")} />
      <p className="text-xs text-ink-muted">Totals for this many grams:</p>
      <div className="grid grid-cols-2 gap-3">
        {NUMBER_FIELDS.map(({ key, label }) => (
          <TextField key={key} label={label} inputMode="decimal" autoComplete="off" {...field(key)} />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger first-letter:uppercase">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <PrimaryButton type="submit">{submitLabel}</PrimaryButton>
        {onCancel && <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>}
      </div>
    </form>
  );
}
