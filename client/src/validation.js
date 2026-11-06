// Client-side checks that mirror the server's zod schemas
// (server/middleware/validate.js: signupSchema, loginSchema), so obviously
// bad input is caught before a request. The server still checks everything.
// Each function returns { field: message } for the problems found (empty
// object when valid), using the server's own messages where it has them.

// zod 4's email pattern (zod/v4/core/regexes.js), checked after trimming.
// Kept character-for-character identical to zod's, escapes included.
// oxlint-disable-next-line no-useless-escape
const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

function checkEmail(email) {
  const value = email.trim();
  if (!value) return "email is required";
  if (!EMAIL.test(value)) return "invalid email";
  return null;
}

export function validateLogin({ email, password }) {
  const errors = {};
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "password is required";
  return errors;
}

export function validateSignup({ name, email, password }) {
  const errors = {};
  const trimmedName = name.trim();
  if (!trimmedName) errors.name = "name is required";
  else if (trimmedName.length > 100) errors.name = "name must be at most 100 characters";
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (password.length < 8) errors.password = "password must be at least 8 characters";
  else if (password.length > 72) errors.password = "password must be at most 72 characters";
  return errors;
}

// targetsSchema: five whole numbers. min/max and the server's messages for
// going over (or under, where it has its own).
export const TARGET_FIELDS = [
  { name: "calories", label: "Calories", unit: "kcal", min: 500, max: 6000, rangeMessage: "calories must be from 500 to 6000" },
  { name: "proteinG", label: "Protein", unit: "g", min: 0, max: 500, rangeMessage: "protein must be at most 500g" },
  { name: "fatG", label: "Fat", unit: "g", min: 0, max: 500, rangeMessage: "fat must be at most 500g" },
  { name: "carbsG", label: "Carbs", unit: "g", min: 0, max: 1000, rangeMessage: "carbs must be at most 1000g" },
  { name: "waterMl", label: "Water", unit: "ml", min: 250, max: 8000, rangeMessage: "water must be from 250 to 8000 ml" },
];

// "2000" -> 2000; "", "12.5", "2e3", "abc" -> NaN. Only plain digits (with an
// optional minus, so "-5" gets the range message rather than a format one).
export function parseWhole(text) {
  const s = String(text ?? "").trim();
  return /^-?\d+$/.test(s) ? Number(s) : NaN;
}

// { calories: "2000", ... } as typed -> { values, errors }. values only when
// errors is empty.
export function validateTargets(form) {
  const errors = {};
  const values = {};
  for (const { name, label, min, max, rangeMessage } of TARGET_FIELDS) {
    const text = String(form[name] ?? "").trim();
    const n = parseWhole(text);
    const lower = label.toLowerCase();
    if (text === "") errors[name] = `${lower} is required`;
    else if (/^-?\d*\.\d+$|^-?\d+\.\d*$/.test(text)) errors[name] = `${lower} must be a whole number`;
    else if (Number.isNaN(n)) errors[name] = `${lower} must be a number`;
    else if (n < 0 && min === 0) errors[name] = `${lower} can't be negative`;
    else if (n < min || n > max) errors[name] = rangeMessage;
    else values[name] = n;
  }
  return Object.keys(errors).length ? { errors } : { values, errors };
}

// kcal from protein, fat and carbs (4 / 9 / 4 per gram), or null until all
// three are usable numbers.
export function macroCalories(form) {
  const [p, f, c] = ["proteinG", "fatG", "carbsG"].map((k) => parseWhole(form[k]));
  if ([p, f, c].some((n) => Number.isNaN(n) || n < 0)) return null;
  return 4 * p + 9 * f + 4 * c;
}
