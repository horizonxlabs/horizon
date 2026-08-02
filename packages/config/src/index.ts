import type { NavItem, Surface } from "@evcp/types";

export const surfaceRoutes: Record<Surface, string> = {
  admin: "/admin",
  creator: "/creator",
  store: "/store"
};

export const navigation: Record<Surface, NavItem[]> = {
  admin: [
    { label: "Dashboard", route: "/admin", icon: "dashboard" },
    { label: "Services", route: "/admin/services", icon: "services" },
    { label: "AI Providers", route: "/admin/ai-providers", icon: "ai" },
    { label: "Guardrails", route: "/admin/guardrails", icon: "shield" },
    { label: "Knowledge & Skills", route: "/admin/knowledge", icon: "prd" },
    { label: "Audit Logs", route: "/admin/audit-logs", icon: "logs" },
    { label: "Users", route: "/admin/users", icon: "users" },
    { label: "System", route: "/admin/system", icon: "system" },
    { label: "Domain", route: "/admin/domain", icon: "domain" },
    { label: "Auth & SSO", route: "/admin/auth", icon: "shield" },
    { label: "Domains", route: "/admin/domains", icon: "route" },
    { label: "Publishing", route: "/admin/publishing", icon: "publish" }
  ],
  creator: [
    { label: "Projects", route: "/creator/", icon: "projects" },
    { label: "PRD Review", route: "/creator/projects/leave-management/prd", icon: "prd" },
    { label: "Creator Workspace", route: "/creator/projects/leave-management", icon: "workspace" },
    { label: "Database", route: "/creator/projects/leave-management/database", icon: "grid" },
    { label: "Versions", route: "/creator/projects/leave-management/versions", icon: "logs" },
    { label: "Users & Roles", route: "/creator/projects/leave-management/users", icon: "users" },
    {
      label: "Publish & Registry",
      route: "/creator/projects/leave-management/publish",
      icon: "publish"
    },
    {
      label: "Deployments",
      route: "/creator/projects/leave-management/deployments",
      icon: "services"
    },
    {
      label: "Tickets & Changes",
      route: "/creator/projects/leave-management/tickets",
      icon: "tickets"
    }
  ],
  store: [
    { label: "My Apps", route: "/store/", icon: "apps" },
    { label: "Available Apps", route: "/store/available", icon: "grid" },
    { label: "Search", route: "/store/search", icon: "apps" },
    { label: "Favorites", route: "/store/favorites", icon: "apps" },
    { label: "Recent", route: "/store/recent", icon: "logs" },
    { label: "Access Requests", route: "/store/access-requests", icon: "shield" },
    { label: "Tickets", route: "/store/tickets", icon: "tickets" },
    { label: "Profile", route: "/store/profile", icon: "profile" }
  ]
};
