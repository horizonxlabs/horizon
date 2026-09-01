import { SectionCard } from "@evcp/ui";
import type { Ref } from "react";

export type PublishAccessUrlCardProps = {
  value: string;
  previewUrl: string;
  error?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange(value: string): void;
};

const SUBDOMAIN_INPUT_ID = "creator-publish-subdomain";
const SUBDOMAIN_HINT_ID = "creator-publish-subdomain-hint";
const SUBDOMAIN_ERROR_ID = "creator-publish-subdomain-error";

export function PublishAccessUrlCard({
  value,
  previewUrl,
  error,
  disabled = false,
  inputRef,
  onChange
}: PublishAccessUrlCardProps) {
  const describedBy = error ? `${SUBDOMAIN_HINT_ID} ${SUBDOMAIN_ERROR_ID}` : SUBDOMAIN_HINT_ID;

  return (
    <SectionCard
      className="creator-publish-access-card"
      eyebrow="Access URL"
      title="Choose how people open this app"
    >
      <div className="creator-access-url-options">
        <div className="creator-access-url-option is-selected">
          <label className="creator-access-url-option-heading">
            <input
              type="radio"
              name="creator-publish-access-url-type"
              value="platform"
              checked
              readOnly
              disabled={disabled}
            />
            <span>
              <strong>Platform subdomain</strong>
              <small>Managed by the platform and ready immediately after publishing.</small>
            </span>
          </label>

          <div className="creator-access-url-fields">
            <div className="creator-access-url-field">
              <label htmlFor={SUBDOMAIN_INPUT_ID}>Subdomain label</label>
              <input
                ref={inputRef}
                id={SUBDOMAIN_INPUT_ID}
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
              />
              <small id={SUBDOMAIN_HINT_ID}>
                Use 3–63 lowercase letters, numbers, or single hyphens.
              </small>
              {error ? (
                <small id={SUBDOMAIN_ERROR_ID} className="creator-access-url-error" role="alert">
                  {error}
                </small>
              ) : null}
            </div>

            <div className="creator-access-url-field creator-access-url-preview">
              <label htmlFor="creator-publish-access-url-preview">URL preview</label>
              <output
                id="creator-publish-access-url-preview"
                aria-label="Full platform access URL"
                aria-live="polite"
                title={previewUrl || undefined}
              >
                {previewUrl || "Waiting for the platform URL configuration"}
              </output>
              <small>The domain is supplied securely by the platform.</small>
            </div>
          </div>
        </div>

        <fieldset className="creator-access-url-option creator-access-url-option-disabled" disabled>
          <legend>Custom domain</legend>
          <label className="creator-access-url-option-heading">
            <input type="radio" name="creator-publish-access-url-type" value="custom" />
            <span>
              <strong>
                Custom domain <em>Coming soon</em>
              </strong>
              <small>Connect a company domain with managed DNS verification.</small>
            </span>
          </label>
        </fieldset>
      </div>
    </SectionCard>
  );
}
