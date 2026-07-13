import { useState, type FormEvent } from "react";
import { AlertCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { apiBaseUrl } from "@/shared/runtime-config";
import { vibeAuthHeaders } from "@/shared/session";

async function nativeChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const base = apiBaseUrl() ?? "/api";
  const response = await fetch(`${base}/auth/change-password`, {
    method: "POST",
    headers: vibeAuthHeaders(),
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: { ok: true } }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body || body.ok !== true) {
    throw new Error(body && "error" in body ? body.error.message : "Change password failed");
  }
}

export function ChangePasswordScreen({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(undefined);
    try {
      await nativeChangePassword(currentPassword, newPassword);
      onChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Change password failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="creator-auth-screen">
      <form className="creator-auth-form" onSubmit={handleSubmit} aria-label="Change password">
        <div className="creator-auth-form-head">
          <HorizonLogo variant="auth" className="creator-auth-logo" />
          <div>
            <h1>Set a New Password</h1>
            <p className="creator-auth-sub">Keep your Horizon workspace secure</p>
          </div>
        </div>
        <label className="creator-auth-label">
          <span>Current password</span>
          <div className="creator-auth-field">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </label>
        <label className="creator-auth-label">
          <span>New password</span>
          <div className="creator-auth-field">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              type="password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
        </label>
        <label className="creator-auth-label">
          <span>Confirm new password</span>
          <div className="creator-auth-field">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
        </label>
        {errorMessage ? (
          <p role="alert" className="creator-auth-error">
            <AlertCircle size={15} aria-hidden="true" />
            {errorMessage}
          </p>
        ) : null}
        <button type="submit" className="creator-auth-submit" disabled={isSubmitting}>
          <ShieldCheck size={16} />
          {isSubmitting ? "Saving" : "Save New Password"}
        </button>
      </form>
    </div>
  );
}
