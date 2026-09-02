import type { FeatureItem } from "@/shared/content-types";

export const lifecycleContent = {
  eyebrow: "How it works",
  title: "From a sentence to a deployed application.",
  description:
    "Every step leaves a record, so a delivered application can be traced back to the requirement that asked for it.",
  steps: [
    {
      title: "Idea",
      description: "An enterprise user describes the app they need in plain language."
    },
    {
      title: "PRD",
      description: "The platform turns the requirement into a structured PRD for review."
    },
    {
      title: "AI workspace",
      description: "An AI generation loop writes and edits the app inside a per-project workspace."
    },
    {
      title: "Preview",
      description: "The workspace runs live in a container, reachable at its own preview URL."
    },
    {
      title: "Publish",
      description:
        "An approval policy gates release, then the app appears in the internal App Store."
    }
  ] as const satisfies readonly FeatureItem[]
};
