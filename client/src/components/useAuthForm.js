import { useRef, useState } from "react";

// Form state for the auth screens.
// - Fields are checked with `validate` on submit; after the first submit they
//   are re-checked as she types, so messages clear as soon as they're fixed.
// - Invalid: no request; focus moves to the first field with a problem.
// - Valid: `send(values)` runs once. A ref (not just the disabled button)
//   ignores a second submit while it's running, e.g. a double Enter.
// - A failed `send` shows its message above the form: the server's error, or
//   "can't reach the server" when the request never got an answer.
export function useAuthForm(initialValues, validate, send) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const submitted = useRef(false);
  const inputRefs = useRef({});

  const field = (name) => ({
    name,
    value: values[name],
    error: errors[name],
    inputRef: (el) => {
      inputRefs.current[name] = el;
    },
    onChange: (e) => {
      const next = { ...values, [name]: e.target.value };
      setValues(next);
      if (submitted.current) setErrors(validate(next));
    },
  });

  async function onSubmit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    submitted.current = true;

    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      inputRefs.current[firstInvalid]?.focus();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setFormError("");
    try {
      await send(values);
      // On success the page navigates away; leave the button busy until then.
    } catch (err) {
      setFormError(err?.name === "ApiError" ? err.message : "something went wrong, please try again");
      busyRef.current = false;
      setBusy(false);
    }
  }

  return { field, onSubmit, busy, formError, setFormError };
}
