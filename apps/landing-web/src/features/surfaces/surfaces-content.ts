export type SurfaceItem = { title: string; audience: string; description: string };

export const surfacesContent = {
  eyebrow: "Platform",
  title: "Three surfaces, one Platform API.",
  description:
    "Administrators, builders, and employees each get a purpose-built application over the same Platform API.",
  items: [
    {
      title: "Admin Console",
      audience: "IT, security, and platform administrators",
      description:
        "Govern providers, access, policies, operations, and licenses for release readiness."
    },
    {
      title: "Creator App",
      audience: "Business builders and development teams",
      description:
        "Turn a requirement into a PRD, an AI-built workspace, a preview, and a published application."
    },
    {
      title: "App Store PWA",
      audience: "Employees and approved end users",
      description: "Discover internal apps, request access, and submit support or product feedback."
    }
  ] as const satisfies readonly SurfaceItem[]
};
