import type { CreateProjectInput } from "@evcp/api-client";

export type CreatorProjectView = {
  id: string;
  name: string;
  appType: string;
  status: string;
  owner: string;
  prdVersion: string;
  frontendVersion: string;
  tokenUsedThisMonth: number;
  createdAt: string;
};

export type CreatorBootstrapState = {
  status: "loading" | "ready" | "empty" | "error";
  message?: string;
  userName: string;
  selectedProject: CreatorProjectView;
  projects: CreatorProjectView[];
  source: "Platform API";
};

export type CreateProjectFormState = {
  name: string;
  appType: string;
  businessProblem: string;
  targetDepartment: string;
  intendedUsers: string;
  dataSensitivity: CreateProjectInput["dataSensitivity"];
};

// --- Native login + change-password gate ---
export type NativeLoginResult = { token: string; expiresAt: string; mustChangePassword: boolean };
