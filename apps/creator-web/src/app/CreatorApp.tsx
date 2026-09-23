import { useState } from "react";
import { ChangePasswordScreen, LoginScreen } from "@/features/authentication";
import { CreatorRoutes } from "@/routes/CreatorRoutes";
import { canEnterWorkspace, clearLoginSession } from "@/shared/session";
import type { NativeLoginResult } from "@/shared/types";
import { useCreatorApp } from "@/app/use-creator-app";
import { consumeCreatorSessionHandoff } from "@/app/creator-app-helpers";

function CreatorWorkspaceApp({ onLogout }: { onLogout: () => void }) {
  const app = useCreatorApp({ onLogout });
  return <CreatorRoutes app={app} />;
}

export function CreatorApp() {
  consumeCreatorSessionHandoff();
  const [authStage, setAuthStage] = useState<"login" | "change-password" | "workspace">(
    canEnterWorkspace() ? "workspace" : "login"
  );

  function handleLoggedIn(_result: NativeLoginResult) {
    setAuthStage("workspace");
  }

  function handleLogout() {
    clearLoginSession();
    setAuthStage("login");
  }

  if (authStage === "login") return <LoginScreen onLoggedIn={handleLoggedIn} />;
  if (authStage === "change-password") {
    return <ChangePasswordScreen onChanged={() => setAuthStage("workspace")} />;
  }
  return <CreatorWorkspaceApp onLogout={handleLogout} />;
}
