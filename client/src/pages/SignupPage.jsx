import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { saveSession } from "../auth.js";
import AuthShell from "../components/AuthShell.jsx";
import { FormError, PasswordField, SubmitButton, TextField } from "../components/form.jsx";
import { useAuthForm } from "../components/useAuthForm.js";
import { validateSignup } from "../validation.js";

export default function SignupPage() {
  const navigate = useNavigate();

  const { field, onSubmit, busy, formError } = useAuthForm(
    { name: "", email: "", password: "" },
    validateSignup,
    async ({ name, email, password }) => {
      const credentials = { email: email.trim(), password };
      await api("/auth/signup", { method: "POST", body: { name: name.trim(), ...credentials } });

      // Log her straight in with the same details.
      let session;
      try {
        session = await api("/auth/login", { method: "POST", body: credentials });
      } catch (err) {
        err.message = `Your account was created, but logging in failed (${err.message}). Please log in.`;
        throw err;
      }
      saveSession(session.token, session.user);
      navigate("/today", { replace: true });
    }
  );

  return (
    <AuthShell
      title="Create your account"
      subtitle="Book classes and track your meals."
      footer={{ text: "Already have an account?", to: "/login", link: "Log in" }}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError} />
        <TextField label="Name" type="text" autoComplete="name" {...field("name")} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          {...field("email")}
        />
        <PasswordField label="Password" autoComplete="new-password" {...field("password")} />
        <p className="-mt-3 text-xs text-slate-500">8 to 72 characters.</p>
        <SubmitButton busy={busy} busyLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
