import { LockKeyhole, Rocket, ShieldCheck, Wand2 } from "lucide-react";
import { beginCreatorKeycloakLogin } from "@/app/creator-app-helpers";
import { HorizonLogo } from "@/shared/HorizonLogo";
import type { NativeLoginResult } from "@/shared/types";

const BRAND_POINTS = [
  { icon: Wand2, text: "Describe your app in plain language, then let the workspace build it" },
  { icon: Rocket, text: "Ship to staging and production in one click" },
  { icon: ShieldCheck, text: "Secrets stay platform-managed — never in your code" }
];

export function LoginScreen({ onLoggedIn: _onLoggedIn }: { onLoggedIn: (res: NativeLoginResult) => void }) {
  return <div className="creator-auth-screen"><div className="creator-auth-shell">
    <aside className="creator-auth-brand" aria-hidden="true"><div className="creator-auth-brand-top"><HorizonLogo variant="auth" alt="" className="creator-auth-brand-logo" /></div><div className="creator-auth-brand-copy"><h2>Build internal apps just by describing them.</h2><ul className="creator-auth-brand-points">{BRAND_POINTS.map((point) => <li key={point.text}><point.icon size={16} /><span>{point.text}</span></li>)}</ul></div><p className="creator-auth-brand-foot">Enterprise Vibe Coding Platform</p></aside>
    <section className="creator-auth-form" aria-label="Creator login"><div className="creator-auth-form-head"><div><h1>Welcome back</h1><p className="creator-auth-sub">Sign in to your Creator workspace</p></div></div><p className="creator-auth-foot">Your organization’s Keycloak identity provider will complete sign-in securely.</p><button type="button" className="creator-auth-submit" onClick={() => beginCreatorKeycloakLogin()}><LockKeyhole size={16} />Continue with Keycloak</button><p className="creator-auth-foot">Need access? Contact your workspace admin.</p></section>
  </div></div>;
}
