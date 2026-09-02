import type { FeatureItem } from "@/shared/content-types";

export const governanceContent = {
  eyebrow: "Security and governance",
  title: "The controls an enterprise product needs.",
  description:
    "AI-assisted delivery is only useful inside an enterprise if every generation, every release, and every access grant leaves evidence behind.",
  items: [
    {
      title: "Provider key protection",
      description:
        "API keys stay in a secret store and are injected at request time, never written into project code."
    },
    {
      title: "Quotas and guardrails",
      description:
        "Per-project token quotas, prompt guardrails, and usage recorded for every generation."
    },
    {
      title: "Isolation by default",
      description: "Each project gets its own runtime container and its own database schema."
    },
    {
      title: "Single sign-on",
      description: "Native accounts, or an existing identity provider over OIDC and SAML."
    },
    {
      title: "Pre-publish checks",
      description:
        "Every release is validated for rollback safety before it ships, so a bad migration cannot strand an app."
    },
    {
      title: "Audit evidence",
      description: "Tasks, previews, deployments, and usage are recorded for later review."
    }
  ] as const satisfies readonly FeatureItem[]
};
