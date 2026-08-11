import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Rocket, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Select } from "@evcp/ui";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { createAdminPlatformClient } from "@/shared/platform-client";

const BRAND_POINTS = [
  { icon: Building2, text: "Configure your organization profile and defaults" },
  { icon: ShieldCheck, text: "Create the first administrator account securely" },
  { icon: Rocket, text: "Start generating and publishing internal apps" }
];

interface BusinessForm {
  businessName: string;
  timezone: string;
  locale: string;
  contactEmail: string;
  website: string;
  logoUrl: string;
  industry: string;
}

interface AdminForm {
  email: string;
  name: string;
  password: string;
  confirm: string;
}

const TIMEZONES = ["Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "UTC", "America/New_York"];
const LOCALES = [
  { value: "th", label: "ไทย (Thai)" },
  { value: "en", label: "English" }
];
const INDUSTRIES = [
  "Logistics",
  "Technology",
  "Finance",
  "Healthcare",
  "Retail",
  "Manufacturing",
  "Education",
  "Real Estate",
  "Media & Entertainment",
  "Energy & Utilities",
  "Government",
  "Professional Services",
  "Other"
];

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [business, setBusiness] = useState<BusinessForm>({
    businessName: "",
    timezone: "Asia/Bangkok",
    locale: "th",
    contactEmail: "",
    website: "",
    logoUrl: "",
    industry: ""
  });
  const [admin, setAdmin] = useState<AdminForm>({
    email: "",
    name: "",
    password: "",
    confirm: ""
  });
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setBiz = (key: keyof BusinessForm, value: string) =>
    setBusiness((current) => ({ ...current, [key]: value }));
  const setAdm = (key: keyof AdminForm, value: string) =>
    setAdmin((current) => ({ ...current, [key]: value }));

  const canContinue = business.businessName.trim().length > 0;
  const passwordTooShort = admin.password.length > 0 && admin.password.length < 8;
  const passwordMismatch = admin.confirm.length > 0 && admin.password !== admin.confirm;
  const canSubmit =
    admin.email.trim().length > 0 &&
    admin.name.trim().length > 0 &&
    admin.password.length >= 8 &&
    admin.password === admin.confirm;

  async function handleSubmit() {
    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      await createAdminPlatformClient().initializeSetup({
        business: {
          businessName: business.businessName.trim(),
          timezone: business.timezone,
          locale: business.locale,
          contactEmail: business.contactEmail.trim() || undefined,
          website: business.website.trim() || undefined,
          logoUrl: business.logoUrl.trim() || undefined,
          industry: business.industry.trim() || undefined
        },
        admin: {
          email: admin.email.trim(),
          name: admin.name.trim(),
          password: admin.password
        }
      });
      onComplete();
    } catch (error) {
      setErrorMessage((error as Error).message || "Setup failed — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="creator-auth-screen">
      <div className="creator-auth-shell setup-shell">
        <aside className="creator-auth-brand" aria-hidden="true">
          <div className="creator-auth-brand-top">
            <HorizonLogo className="horizon-logo-auth creator-auth-brand-logo" />
          </div>
          <div className="creator-auth-brand-copy">
            <h2>Set up your Horizon platform in minutes.</h2>
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

        <section className="creator-auth-form" aria-label="First-time setup">
          <div className="creator-auth-form-head">
            <div>
              <h1>First-time setup</h1>
              <p className="creator-auth-sub">
                {step === 1
                  ? "Step 1 of 2 · Organization details"
                  : "Step 2 of 2 · Administrator account"}
              </p>
            </div>
          </div>

          <div className="creator-auth-steps">
            <div className={`creator-auth-step ${step === 1 ? "is-current" : "is-done"}`}>
              <span className="creator-auth-step-index">{step === 1 ? "Step 1" : "Done"}</span>
              <strong>Business</strong>
              <small>Organization details</small>
            </div>
            <div className={`creator-auth-step ${step === 2 ? "is-current" : ""}`}>
              <span className="creator-auth-step-index">Step 2</span>
              <strong>Admin account</strong>
              <small>Your sign-in</small>
            </div>
          </div>

          {step === 1 ? (
            <>
              <label className="creator-auth-label">
                Business / organization name *
                <div className="creator-auth-field">
                  <input
                    value={business.businessName}
                    onChange={(event) => setBiz("businessName", event.target.value)}
                    placeholder="Acme Co., Ltd."
                  />
                </div>
              </label>
              <div className="creator-auth-grid">
                <label className="creator-auth-label">
                  Timezone
                  <Select
                    value={business.timezone}
                    onChange={(event) => setBiz("timezone", event.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="creator-auth-label">
                  Language
                  <Select
                    value={business.locale}
                    onChange={(event) => setBiz("locale", event.target.value)}
                  >
                    {LOCALES.map((locale) => (
                      <option key={locale.value} value={locale.value}>
                        {locale.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="creator-auth-grid">
                <label className="creator-auth-label">
                  Contact email
                  <div className="creator-auth-field">
                    <input
                      type="email"
                      value={business.contactEmail}
                      onChange={(event) => setBiz("contactEmail", event.target.value)}
                      placeholder="ops@acme.co"
                    />
                  </div>
                </label>
                <label className="creator-auth-label">
                  Website
                  <div className="creator-auth-field">
                    <input
                      value={business.website}
                      onChange={(event) => setBiz("website", event.target.value)}
                      placeholder="https://acme.co"
                    />
                  </div>
                </label>
              </div>
              <div className="creator-auth-grid">
                <label className="creator-auth-label">
                  Logo URL
                  <div className="creator-auth-field">
                    <input
                      value={business.logoUrl}
                      onChange={(event) => setBiz("logoUrl", event.target.value)}
                      placeholder="https://acme.co/logo.png"
                    />
                  </div>
                </label>
                <label className="creator-auth-label">
                  Industry
                  <Select
                    value={business.industry}
                    onChange={(event) => setBiz("industry", event.target.value)}
                  >
                    <option value="">Select industry…</option>
                    {INDUSTRIES.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="creator-auth-grid">
                <label className="creator-auth-label">
                  Admin name *
                  <div className="creator-auth-field">
                    <input
                      value={admin.name}
                      onChange={(event) => setAdm("name", event.target.value)}
                      placeholder="Jane Admin"
                    />
                  </div>
                </label>
                <label className="creator-auth-label">
                  Admin email *
                  <div className="creator-auth-field">
                    <input
                      type="email"
                      value={admin.email}
                      onChange={(event) => setAdm("email", event.target.value)}
                      autoComplete="username"
                      placeholder="admin@acme.co"
                    />
                  </div>
                </label>
              </div>
              <div className="creator-auth-grid">
                <label className="creator-auth-label">
                  Password *
                  <div className="creator-auth-field">
                    <input
                      type="password"
                      value={admin.password}
                      onChange={(event) => setAdm("password", event.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                    />
                  </div>
                </label>
                <label className="creator-auth-label">
                  Confirm password *
                  <div className="creator-auth-field">
                    <input
                      type="password"
                      value={admin.confirm}
                      onChange={(event) => setAdm("confirm", event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </label>
              </div>
              {passwordTooShort ? (
                <p className="creator-auth-error">Password must be at least 8 characters.</p>
              ) : null}
              {passwordMismatch ? (
                <p className="creator-auth-error">Passwords do not match.</p>
              ) : null}
            </>
          )}

          {errorMessage ? (
            <p role="alert" className="creator-auth-error">
              {errorMessage}
            </p>
          ) : null}

          <div className="creator-auth-actions">
            {step === 2 ? (
              <button type="button" className="creator-auth-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                Back
              </button>
            ) : null}
            {step === 1 ? (
              <button
                type="button"
                className="creator-auth-submit"
                onClick={() => setStep(2)}
                disabled={!canContinue}
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="creator-auth-submit"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit || isSubmitting}
              >
                <CheckCircle2 size={16} />
                {isSubmitting ? "Creating…" : "Create admin & finish"}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
