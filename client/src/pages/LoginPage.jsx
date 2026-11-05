import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { saveSession } from "../auth.js";
import AuthShell from "../components/AuthShell.jsx";
import { FormError, PasswordField, SubmitButton, TextField } from "../components/form.jsx";
import { useAuthForm } from "../components/useAuthForm.js";
import { validateLogin } from "../validation.js";

// Where to go after logging in: the page RequireAuth sent her away from, or /today.
function destination(from) {
  return typeof from === "string" && from.startsWith("/") && !["/login", "/signup"].includes(from)
    ? from
    : "/today";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { field, onSubmit, busy, formError } = useAuthForm(
    { email: "", password: "" },
    validateLogin,
    async ({ email, password }) => {
      const { token, user } = await api("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      saveSession(token, user);
      navigate(destination(location.state?.from), { replace: true });
    }
  );

  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back."
      footer={{ text: "New here?", to: "/signup", link: "Create an account" }}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...field("email")}
        />
        <PasswordField label="Password" autoComplete="current-password" {...field("password")} />
        <SubmitButton busy={busy} busyLabel="Logging in…">
          Log in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
