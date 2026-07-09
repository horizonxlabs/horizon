import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiBaseUrl, saveAdminSession } from "./admin-client";

interface LoginResult {
  token: string;
  expiresAt: string;
  mustChangePassword: boolean;
}

async function nativeLogin(email: string, password: string): Promise<LoginResult> {
  const response = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: LoginResult }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body || body.ok !== true) {
    throw new Error(body && "error" in body ? body.error.message : "Invalid email or password");
  }
  return body.data;
}

export function AdminLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(undefined);
    try {
      const result = await nativeLogin(email.trim(), password);
      saveAdminSession({ token: result.token, expiresAt: result.expiresAt });
      onLoggedIn();
    } catch {
      setErrorMessage("Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="creator-auth-screen">
      <form className="creator-auth-form" onSubmit={handleSubmit} aria-label="Admin login">
        <h1>Admin Sign In</h1>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {errorMessage ? (
          <p role="alert" className="creator-auth-error">
            {errorMessage}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting}>
          <LockKeyhole size={16} />
          {isSubmitting ? "Signing in" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
