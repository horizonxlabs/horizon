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
    { label: "AI Providers", route: "/admin/ai-providers" },
    { label: "Guardrails", route: "/admin/guardrails" },
    { label: "Audit Logs", route: "/admin/audit-logs" }
  ],
  creator: [
    { label: "Projects", route: "/creator/" },
    { label: "PRD Review", route: "/creator/projects/leave-management/prd" },
    { label: "AI Workspace", route: "/creator/projects/leave-management" },
    { label: "Users & Roles", route: "/creator/projects/leave-management/users" },
    { label: "Publish & Registry", route: "/creator/projects/leave-management/publish" },
    { label: "Tickets & Changes", route: "/creator/projects/leave-management/tickets" }
  ],
  store: [
    { label: "My Apps", route: "/store/" },
    { label: "Available Apps", route: "/store/available" },
    { label: "Tickets", route: "/store/tickets" },
    { label: "Profile", route: "/store/profile" }
  ]
};
