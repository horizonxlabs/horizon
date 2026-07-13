import type {
  CreateProjectFormState,
  CreatorBootstrapState,
  CreatorProjectView
} from "@/shared/types";

export const fallbackSelectedProject: CreatorProjectView = {
  id: "proj_placeholder",
  name: "New project",
  appType: "Workflow App",
  status: "draft",
  owner: "Creator User",
  prdVersion: "1.0",
  frontendVersion: "preview-0001",
  tokenUsedThisMonth: 0
};

export const initialCreatorBootstrap: CreatorBootstrapState = {
  userName: "Creator User",
  selectedProject: fallbackSelectedProject,
  projects: [],
  source: "local fallback"
};

export const initialCreateProjectForm: CreateProjectFormState = {
  name: "",
  appType: "Workflow App",
  businessProblem: "",
  targetDepartment: "",
  intendedUsers: "",
  dataSensitivity: "internal"
};
