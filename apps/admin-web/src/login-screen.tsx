import { Activity, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";
import { startAdminKeycloakLogin } from "./shared/platform-client";

const BRAND_POINTS = [
  { icon: Activity, text: "Monitor platform health, environments, and readiness" },
  { icon: ShieldCheck, text: "Manage users, access policies, and enterprise authentication" },
  { icon: ScrollText, text: "Review audit trails, guardrails, and release controls" }
];

/** Begin the server-brokered OIDC flow. No Keycloak credential or token is handled in the browser. */
export function beginAdminKeycloakLogin(returnTo = window.location.href): void {
  window.location.assign(startAdminKeycloakLogin(returnTo));
}

export function AdminLoginScreen({ onLoggedIn: _onLoggedIn }: { onLoggedIn: () => void }) {
  return (
    <div className="creator-auth-screen">
      <div className="creator-auth-shell">
        <aside className="creator-auth-brand" aria-hidden="true">
          <div className="creator-auth-brand-top"><img src="/horizon-logo.png" alt="" className="horizon-logo horizon-logo-auth creator-auth-brand-logo" draggable={false} /></div>
          <div className="creator-auth-brand-copy"><h2>Govern your platform with confidence.</h2><ul className="creator-auth-brand-points">{BRAND_POINTS.map((point) => <li key={point.text}><point.icon size={16} /><span>{point.text}</span></li>)}</ul></div>
          <p className="creator-auth-brand-foot">Enterprise Vibe Coding Platform</p>
        </aside>
        <section className="creator-auth-form" aria-label="Admin login">
          <div className="creator-auth-form-head"><div><h1>Welcome back</h1><p className="creator-auth-sub">Sign in to the Admin Console</p></div></div>
          <p className="creator-auth-foot">Your organization’s Keycloak identity provider will complete sign-in securely.</p>
          <button type="button" className="creator-auth-submit" onClick={() => beginAdminKeycloakLogin()}><LockKeyhole size={16} />Continue with Keycloak</button>
          <p className="creator-auth-foot">Need admin access? Contact your platform owner.</p>
        </section>
      </div>
    </div>
  );
}
