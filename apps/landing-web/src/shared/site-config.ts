export type NavItem = { label: string; href: string };

/**
 * Canonical public origin. `NEXT_PUBLIC_*` is inlined by the Next.js compiler at build
 * time, so this value is fixed when the image is built — it cannot be changed by a
 * runtime environment variable. See `docker/landing-web.Dockerfile`, which accepts it as a
 * build argument, and the README's "Landing site" section.
 */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4103";

export const siteConfig = {
  name: "Horizon",
  repositoryUrl: "https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform",
  navItems: [
    { label: "Platform", href: "#surfaces" },
    { label: "How it works", href: "#lifecycle" },
    { label: "Security", href: "#governance" },
    { label: "Self-host", href: "#self-host" },
    { label: "FAQ", href: "#faq" }
  ] as const satisfies readonly NavItem[]
};
