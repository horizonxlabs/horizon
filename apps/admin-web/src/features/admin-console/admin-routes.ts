export type AdminPage =
  | "dashboard"
  | "services"
  | "ai-providers"
  | "guardrails"
  | "knowledge"
  | "audit-logs"
  | "users"
  | "auth"
  | "system"
  | "domain"
  | "domains"
  | "publishing"
  | "not-found";

const ADMIN_PATHS: Record<string, AdminPage> = {
  "/admin": "dashboard",
  "/admin/services": "services",
  "/admin/ai-providers": "ai-providers",
  "/admin/guardrails": "guardrails",
  "/admin/knowledge": "knowledge",
  "/admin/audit-logs": "audit-logs",
  "/admin/users": "users",
  "/admin/auth": "auth",
  "/admin/system": "system",
  "/admin/domain": "domain",
  "/admin/domains": "domains",
  "/admin/publishing": "publishing"
};

export function adminPageFromPath(pathname: string): AdminPage {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return ADMIN_PATHS[normalized] ?? "not-found";
}
