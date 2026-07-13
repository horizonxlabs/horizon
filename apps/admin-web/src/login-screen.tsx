import {
  Activity,
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ScrollText,
  ShieldCheck
} from "lucide-react";
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

const BRAND_POINTS = [
  { icon: Activity, text: "Monitor platform health, environments, and readiness" },
  { icon: ShieldCheck, text: "Manage users, access policies, and enterprise authentication" },
  { icon: ScrollText, text: "Review audit trails, guardrails, and release controls" }
];

export function AdminLoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
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
      <div className="creator-auth-shell">
        <aside className="creator-auth-brand" aria-hidden="true">
          <div className="creator-auth-brand-top">
            <img
              src="/horizon-logo.png"
              alt=""
              className="horizon-logo horizon-logo-auth creator-auth-brand-logo"
              draggable={false}
            />
          </div>
          <div className="creator-auth-brand-copy">
            <h2>Govern your platform with confidence.</h2>
            <ul className="creator-auth-brand-points">
              {BRAND_POINTS.map((point) => (
                <li key={point.text}>
                  <point.icon size={16} aria-hidden="true" />
                  <span>{point.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="creator-auth-brand-foot">Enterprise Vibe Coding Platform</p>
        </aside>

        <form
          className="creator-auth-form"
          onSubmit={handleSubmit}
          aria-label="Admin login"
          aria-busy={isSubmitting}
        >
          <div className="creator-auth-form-head">
            <div>
              <h1>Welcome back</h1>
              <p className="creator-auth-sub">Sign in to the Admin Console</p>
            </div>
          </div>

          <div className="creator-auth-label">
            <label htmlFor="admin-login-email">
              <span>Email</span>
            </label>
            <div className="creator-auth-field">
              <Mail size={16} aria-hidden="true" />
              <input
                id="admin-login-email"
                type="email"
                required
                placeholder="admin@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="creator-auth-label">
            <label htmlFor="admin-login-password">
              <span>Password</span>
            </label>
            <div className="creator-auth-field">
              <LockKeyhole size={16} aria-hidden="true" />
              <input
                id="admin-login-password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="creator-auth-eye"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {errorMessage ? (
            <p id="admin-login-error" role="alert" className="creator-auth-error">
              <AlertCircle size={15} aria-hidden="true" />
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="creator-auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="creator-auth-foot">Need admin access? Contact your platform owner.</p>
        </form>
      </div>
    </div>
  );
}
