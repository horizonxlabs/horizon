import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

export const openSourceContent = {
  eyebrow: "Open source",
  title: "Developed in the open.",
  description:
    "The architecture decision records explain why the platform is shaped the way it is — read them before you commit to it, then run it yourself and open an issue.",
  action: {
    label: "Read the source",
    href: siteConfig.repositoryUrl,
    external: true
  } satisfies LinkAction
};
