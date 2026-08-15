export function apiBaseUrl(): string | undefined {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_PLATFORM_API_BASE_URL;
  if (
    (!configured || configured === "/api") &&
    typeof window !== "undefined" &&
    window.location.port === "4101"
  ) {
    return "http://127.0.0.1:3100";
  }
  return (configured || "/api").replace(/\/$/, "");
}
