export type Surface = "admin" | "creator" | "store";

export type PlatformRole = "admin" | "creator" | "end_user";

export type Status = "healthy" | "warning" | "degraded" | "down" | "draft" | "published" | "pending";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  appType: string;
  status: Status;
  owner: string;
  prdVersion: string;
  frontendVersion: string;
  tokenUsedThisMonth: number;
}

export interface AppStoreItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner: string;
  myRole?: string;
  accessStatus: "active" | "available" | "pending";
  health: Status;
}

export interface ServiceStatus {
  name: string;
  status: Status;
  detail: string;
}

export interface NavItem {
  label: string;
  route: string;
}
