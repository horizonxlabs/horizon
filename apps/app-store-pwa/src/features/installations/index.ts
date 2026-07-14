import type { StoreAppInstallationResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";

type InstallJourneyStepStatus = "complete" | "current" | "pending" | "blocked";

export const appInstallJourneySteps = [
  {
    id: "access_check",
    label: "Access Check",
    detail: "Confirm SSO user has an active app role before install."
  },
  {
    id: "manifest_validation",
    label: "Manifest Validation",
    detail: "Use the published manifest and route metadata from the private registry."
  },
  {
    id: "install_record",
    label: "Install Record",
    detail: "Persist the installation record and audit evidence."
  },
  {
    id: "my_apps_ready",
    label: "My Apps Ready",
    detail: "Move the app into My Apps so the user can open it."
  }
] as const;

export function installJourneyStatus(
  stepId: (typeof appInstallJourneySteps)[number]["id"],
  app: AppStoreItem,
  installResult: StoreAppInstallationResponse | undefined,
  isInstallingApp: boolean
): InstallJourneyStepStatus {
  const hasAccess = app.accessStatus === "active";
  const isInstalled = app.installStatus === "installed" || installResult?.status === "active";
  const isRemoved = installResult?.status === "disabled";

  if (stepId === "access_check") return hasAccess ? "complete" : "blocked";
  if (!hasAccess) return "pending";
  if (isInstalled) return "complete";
  if (isRemoved) return stepId === "install_record" ? "current" : "pending";
  if (isInstallingApp)
    return stepId === "manifest_validation" || stepId === "install_record" ? "current" : "pending";
  if (stepId === "manifest_validation") return "current";
  return "pending";
}
