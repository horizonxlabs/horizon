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
      description: "Per-project spend limits, prompt controls, and usage recorded for every generation."
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
      title: "Policy-based publish",
      description: "A release passes an approval policy before it reaches a single employee."
    },
    {
      title: "Audit evidence",
      description: "Tasks, previews, deployments, and usage are recorded for later review."
    }
  ] as const satisfies readonly FeatureItem[]
};
