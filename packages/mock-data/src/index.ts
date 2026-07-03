import type { AppStoreItem, MockUser, ProjectSummary, ServiceStatus } from "@evcp/types";

export const mockUsers: Record<string, MockUser> = {
  admin: {
    id: "usr_admin",
    name: "Admin User",
    email: "admin@company.com",
    role: "admin"
  },
  creator: {
    id: "usr_creator",
    name: "Creator User",
    email: "creator@company.com",
    role: "creator"
  },
  endUser: {
    id: "usr_end_user",
    name: "End User",
    email: "user@company.com",
    role: "end_user"
  }
};

export const serviceStatuses: ServiceStatus[] = [
  { name: "PostgreSQL", status: "healthy", detail: "Connected" },
  { name: "Keycloak", status: "healthy", detail: "Mock broker ready" },
  { name: "AI Gateway", status: "warning", detail: "Mock provider only" },
  { name: "Caddy", status: "healthy", detail: "Routes mocked" }
];

export const projects: ProjectSummary[] = [
  {
    id: "prj_leave_management",
    slug: "leave-management",
    name: "Leave Management",
    appType: "Workflow App",
    status: "draft",
    owner: "HR Department",
    prdVersion: "v1.0 Draft",
    frontendVersion: "v1",
    tokenUsedThisMonth: 12450
  }
];

export const appStoreItems: AppStoreItem[] = [
  {
    id: "app_leave_management",
    slug: "leave-management",
    name: "Leave Management",
    description: "Submit, approve and track employee leave requests.",
    owner: "HR Department",
    myRole: "Employee",
    accessStatus: "active",
    health: "healthy"
  },
  {
    id: "app_asset_request",
    slug: "asset-request",
    name: "Asset Request",
    description: "Request equipment and track approval status.",
    owner: "Operations",
    accessStatus: "available",
    health: "healthy"
  }
];

