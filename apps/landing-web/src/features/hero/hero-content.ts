import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

export const heroContent = {
  eyebrow: "Open source · self-hosted",
  headline: "Ship internal software at AI speed — under enterprise control.",
  subhead:
    "Horizon turns a requirement into a product requirements document, an AI-built workspace, and a governed deployment, all inside infrastructure you own.",
  actions: [
    { label: "Get started", href: "#self-host" },
    { label: "View on GitHub", href: siteConfig.repositoryUrl, external: true }
  ] as const satisfies readonly LinkAction[]
};
