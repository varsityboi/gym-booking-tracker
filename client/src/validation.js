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
