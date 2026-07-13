import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { createAdminPlatformClient } from "@/shared/platform-client";

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
    <main className="first-run-shell">
      <section className="first-run-hero">
        <span className="eyebrow">First-time setup</span>
        <h1>Set up your Horizon platform</h1>
        <p>Configure your organization and create the first administrator account to get started.</p>
      </section>
      <section className="first-run-layout">
        <aside className="first-run-progress">
          <article className={`first-run-step status-${step === 1 ? "current" : "complete"}`}>
            <span>{step === 1 ? "current" : "done"}</span>
            <strong>1. Business</strong>
            <small>Organization details</small>
          </article>
          <article className={`first-run-step status-${step === 2 ? "current" : "pending"}`}>
            <span>{step === 2 ? "current" : "pending"}</span>
            <strong>2. Admin account</strong>
            <small>Your sign-in</small>
          </article>
        </aside>

        <section className="first-run-main">
          {step === 1 ? (
            <div className="first-run-form">
              <label>
                Business / organization name *
                <input
                  value={business.businessName}
                  onChange={(event) => setBiz("businessName", event.target.value)}
                  placeholder="Acme Co., Ltd."
                />
              </label>
              <div className="first-run-subgrid">
                <label>
                  Timezone
                  <select
                    value={business.timezone}
                    onChange={(event) => setBiz("timezone", event.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Language
                  <select
                    value={business.locale}
                    onChange={(event) => setBiz("locale", event.target.value)}
                  >
                    {LOCALES.map((locale) => (
                      <option key={locale.value} value={locale.value}>
                        {locale.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="first-run-subgrid">
                <label>
                  Contact email
                  <input
                    type="email"
                    value={business.contactEmail}
                    onChange={(event) => setBiz("contactEmail", event.target.value)}
                    placeholder="ops@acme.co"
                  />
                </label>
                <label>
                  Website
                  <input
                    value={business.website}
                    onChange={(event) => setBiz("website", event.target.value)}
                    placeholder="https://acme.co"
                  />
                </label>
              </div>
              <div className="first-run-subgrid">
                <label>
                  Logo URL
                  <input
                    value={business.logoUrl}
                    onChange={(event) => setBiz("logoUrl", event.target.value)}
                    placeholder="https://acme.co/logo.png"
                  />
                </label>
                <label>
                  Industry
                  <input
                    value={business.industry}
                    onChange={(event) => setBiz("industry", event.target.value)}
                    placeholder="Logistics"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="first-run-form">
              <div className="first-run-subgrid">
                <label>
                  Admin name *
                  <input
                    value={admin.name}
                    onChange={(event) => setAdm("name", event.target.value)}
                    placeholder="Jane Admin"
                  />
                </label>
                <label>
                  Admin email *
                  <input
                    type="email"
                    value={admin.email}
                    onChange={(event) => setAdm("email", event.target.value)}
                    autoComplete="username"
                    placeholder="admin@acme.co"
                  />
                </label>
              </div>
              <div className="first-run-subgrid">
                <label>
                  Password *
                  <input
                    type="password"
                    value={admin.password}
                    onChange={(event) => setAdm("password", event.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </label>
                <label>
                  Confirm password *
                  <input
                    type="password"
                    value={admin.confirm}
                    onChange={(event) => setAdm("confirm", event.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              {passwordTooShort ? (
                <p className="creator-auth-error">Password must be at least 8 characters.</p>
              ) : null}
              {passwordMismatch ? (
                <p className="creator-auth-error">Passwords do not match.</p>
              ) : null}
            </div>
          )}

          {errorMessage ? (
            <p role="alert" className="creator-auth-error">
              {errorMessage}
            </p>
          ) : null}

          <div className="first-run-action-row">
            {step === 2 ? (
              <button type="button" className="secondary-button" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                Back
              </button>
            ) : null}
            {step === 1 ? (
              <button type="button" onClick={() => setStep(2)} disabled={!canContinue}>
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit || isSubmitting}
              >
                <CheckCircle2 size={16} />
                {isSubmitting ? "Creating…" : "Create admin & finish"}
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
