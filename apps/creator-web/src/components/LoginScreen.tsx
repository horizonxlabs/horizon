import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";
import { apiBaseUrl } from "../lib/routing";
import { persistLoginSession } from "../lib/session";
import type { NativeLoginResult } from "../types";

async function nativeLogin(email: string, password: string): Promise<NativeLoginResult> {
  const base = apiBaseUrl() ?? "/api";
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: NativeLoginResult }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body || body.ok !== true) {
    throw new Error(body && "error" in body ? body.error.message : "Invalid email or password");
  }
  return body.data;
}

const BRAND_POINTS = [
  { icon: Wand2, text: "Describe it in plain language — the workspace builds it" },
  { icon: Rocket, text: "Ship to staging and production in one click" },
  { icon: ShieldCheck, text: "Secrets stay platform-managed — never in your code" }
];

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (res: NativeLoginResult) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(undefined);
    try {
      const result = await nativeLogin(email.trim(), password);
      persistLoginSession(result);
      onLoggedIn(result);
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
            <div className="creator-auth-brand-mark">
              <Sparkles size={20} />
            </div>
            <span className="creator-auth-brand-name">Horizon</span>
          </div>
          <div className="creator-auth-brand-copy">
            <h2>Build internal apps just by describing them.</h2>
            <ul className="creator-auth-brand-points">
              {BRAND_POINTS.map((point) => (
                <li key={point.text}>
                  <point.icon size={16} />
                  <span>{point.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="creator-auth-brand-foot">Enterprise Vibe Coding Platform</p>
        </aside>

        <form className="creator-auth-form" onSubmit={handleSubmit} aria-label="Creator login">
          <div className="creator-auth-form-head">
            <div className="creator-auth-logo">
              <Sparkles size={18} />
            </div>
            <div>
              <h1>Welcome back</h1>
              <p className="creator-auth-sub">Sign in to your Creator workspace</p>
            </div>
          </div>

          <label className="creator-auth-label">
            <span>Email</span>
            <div className="creator-auth-field">
              <Mail size={16} aria-hidden="true" />
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
              />
            </div>
          </label>

          <label className="creator-auth-label">
            <span>Password</span>
            <div className="creator-auth-field">
              <LockKeyhole size={16} aria-hidden="true" />
              <input
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
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {errorMessage ? (
            <p role="alert" className="creator-auth-error">
              <AlertCircle size={15} aria-hidden="true" />
              {errorMessage}
            </p>
          ) : null}

          <button type="submit" className="creator-auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="creator-auth-foot">Need access? Contact your workspace admin.</p>
        </form>
      </div>
    </div>
  );
}
