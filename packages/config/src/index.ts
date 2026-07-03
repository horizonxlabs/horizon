import type { NavItem, Surface } from "@evcp/types";

export const surfaceRoutes: Record<Surface, string> = {
  admin: "/admin",
  creator: "/creator",
  store: "/store"
};

export const navigation: Record<Surface, NavItem[]> = {
  admin: [
    { label: "Dashboard", route: "/admin" },
    { label: "Services", route: "/admin/services" },
    { label: "AI Keys", route: "/admin/ai-keys" },
    { label: "Guardrails", route: "/admin/guardrails" },
    { label: "Audit Logs", route: "/admin/audit-logs" }
  ],
  creator: [
    { label: "Projects", route: "/creator" },
    { label: "Workspace", route: "/creator/projects/leave-management" },
    { label: "PRD", route: "/creator/projects/leave-management/prd" },
    { label: "Tickets", route: "/creator/projects/leave-management/tickets" }
  ],
  store: [
    { label: "My Apps", route: "/store" },
    { label: "Available Apps", route: "/store/available" },
    { label: "Tickets", route: "/store/tickets" },
    { label: "Profile", route: "/store/profile" }
  ]
};
