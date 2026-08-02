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
  app: Pick<AppStoreItem, "accessStatus" | "installStatus">,
  installationStatus: StoreAppInstallationResponse["status"] | undefined,
  isInstallingApp: boolean,
  uninstallationStatus?: StoreAppInstallationResponse["status"],
  isUninstallingApp = false
): InstallJourneyStepStatus {
  const hasAccess = app.accessStatus === "active";
  const isInstalled = app.installStatus === "installed";
  const installRecordConfirmed = installationStatus === "active";
  const isRemoved = uninstallationStatus === "disabled";

  if (stepId === "access_check") return hasAccess ? "complete" : "blocked";
  if (!hasAccess) return "pending";
  if (isUninstallingApp)
    return stepId === "manifest_validation"
      ? "complete"
      : stepId === "install_record"
        ? "current"
        : "pending";
  if (isRemoved)
    return stepId === "manifest_validation" || stepId === "install_record"
      ? "current"
      : "pending";
  if (isInstallingApp)
    return stepId === "manifest_validation" || stepId === "install_record" ? "current" : "pending";
  if (isInstalled) return "complete";
  if (installRecordConfirmed)
    return stepId === "manifest_validation" || stepId === "install_record"
      ? "complete"
      : stepId === "my_apps_ready"
        ? "current"
        : "pending";
  if (stepId === "manifest_validation") return "current";
  return "pending";
}
