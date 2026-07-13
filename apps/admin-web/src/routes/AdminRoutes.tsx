import type { ReactNode } from "react";
import { AdminLoginScreen } from "@/features/auth-sso";
import { SetupWizard } from "@/features/installer-operations";

type AdminRoutesProps = {
  setupStatus: "loading" | "incomplete" | "complete";
  sessionActive: boolean;
  onSetupComplete: () => void;
  onLoggedIn: () => void;
  children?: ReactNode;
};

// This preserves the current manual setup/session guard without introducing a router.
export function AdminRoutes({
  setupStatus,
  sessionActive,
  onSetupComplete,
  onLoggedIn,
  children
}: AdminRoutesProps) {
  if (setupStatus === "incomplete") return <SetupWizard onComplete={onSetupComplete} />;
  if (setupStatus === "complete" && !sessionActive) return <AdminLoginScreen onLoggedIn={onLoggedIn} />;
  return children;
}
