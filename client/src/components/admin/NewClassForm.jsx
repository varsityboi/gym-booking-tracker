import { useRef, useState } from "react";
import { api } from "../../api.js";
import { gymInputNow, gymInputToIso } from "../../time.js";
import { validateNewClass } from "../../validation.js";
import { FormError, SubmitButton, TextField } from "../form.jsx";

const EMPTY = { title: "", startsAt: "", capacity: "" };
const FIELD_ORDER = ["title", "startsAt", "capacity"];

// POST /classes. The date and time are India time whatever the device's own
// zone is, sent as an ISO string with +05:30.
export default function NewClassForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [created, setCreated] = useState(null);
  const inputs = useRef({});

  const check = (f) => validateNewClass({ ...f, startsAt: gymInputToIso(f.startsAt) });
  const field = (name) => ({
    value: form[name],
    error: errors[name],
    inputRef: (el) => {
      inputs.current[name] = el;
    },
    onChange: (e) => {
      const next = { ...form, [name]: e.target.value };
      setForm(next);
      setCreated(null);
      if (errors[name]) setErrors((errs) => ({ ...errs, [name]: check(next).errors[name] }));
    },
  });

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const { values, errors: found } = check(form);
    setErrors(found);
    setServerError(null);
    setCreated(null);
    if (!values) {
      inputs.current[FIELD_ORDER.find((f) => found[f])]?.focus();
      return;
    }
    setBusy(true);
    try {
      const cls = await api("/classes", { method: "POST", body: values });
      setForm(EMPTY);
      setCreated(cls.title);
      await onCreated();
    } catch (err) {
      setServerError(`Couldn't create the class: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="new-class-heading" className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="new-class-heading" className="font-semibold text-slate-900">
        New class
      </h2>
      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        <FormError message={serverError} />
        <TextField label="Title" autoComplete="off" maxLength={100} placeholder="e.g. Morning yoga" {...field("title")} />
        <TextField label="Date and time (India time)" type="datetime-local" min={gymInputNow()} {...field("startsAt")} />
        <TextField label="Places" inputMode="numeric" autoComplete="off" placeholder="1 to 200" {...field("capacity")} />
        <SubmitButton busy={busy} busyLabel="Creating…">
          Create class
        </SubmitButton>
        {created && (
          <p role="status" className="text-center text-sm font-medium text-emerald-700">
            Class created: {created}
          </p>
        )}
      </form>
    </section>
  );
}
