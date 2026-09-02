export const selfHostContent = {
  eyebrow: "Self-host",
  title: "It runs on your server, not ours.",
  description:
    "One Compose file brings up the whole platform. There is no hosted tier to sign up for, and nothing leaves your network except the calls to whichever AI providers you configure.",
  command: "pnpm dev:setup",
  commandCaption: "Brings up the full stack, applies migrations, and seeds the database.",
  services: [
    "Postgres",
    "Redis",
    "MinIO",
    "Keycloak",
    "LiteLLM",
    "OpenBao",
    "Platform API",
    "Admin Console",
    "Creator App",
    "App Store PWA",
    "Caddy"
  ] as const
};
