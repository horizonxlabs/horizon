export type NavItem = { label: string; href: string };

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
