import type {
  CreateProjectFormState,
  CreatorBootstrapState,
  CreatorProjectView
} from "@/shared/types";

export const unselectedProject: CreatorProjectView = {
  id: "",
  name: "",
  appType: "",
  status: "",
  owner: "",
  prdVersion: "",
  frontendVersion: "",
  tokenUsedThisMonth: 0
};

export const initialCreatorBootstrap: CreatorBootstrapState = {
  status: "loading",
  userName: "",
  selectedProject: unselectedProject,
  projects: [],
  source: "Platform API"
};

export const initialCreateProjectForm: CreateProjectFormState = {
  name: "",
  appType: "Workflow App",
  businessProblem: "",
  targetDepartment: "",
  intendedUsers: "",
  dataSensitivity: "internal"
};
