import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChangePasswordScreen } from "./components/ChangePasswordScreen";
import { LoginScreen } from "./components/LoginScreen";
import { useCreatorApp } from "./hooks/use-creator-app";
import { DefaultPage } from "./pages/DefaultPage";
import { PrdPage } from "./pages/PrdPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PublishPage } from "./pages/PublishPage";
import { TicketsPage } from "./pages/TicketsPage";
import { UsersPage } from "./pages/UsersPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { clearLoginSession, hasValidSession } from "./lib/session";
import type { NativeLoginResult } from "./types";

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  await import("@evcp/ui/styles.css");
}

function CreatorAuthGate() {
  const [authStage, setAuthStage] = useState<"login" | "change-password" | "workspace">(
    hasValidSession() ? "workspace" : "login"
  );

  function handleLoggedIn(_result: NativeLoginResult) {
    // "Set a New Password" gate temporarily disabled — go straight to the workspace even when the
    // account is flagged mustChangePassword. Re-enable by restoring the needsPasswordChange(result)
    // check here (and its import from ./lib/session).
    setAuthStage("workspace");
  }

  function handleLogout() {
    clearLoginSession();
    setAuthStage("login");
  }

  if (authStage === "login") {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }
  if (authStage === "change-password") {
    return <ChangePasswordScreen onChanged={() => setAuthStage("workspace")} />;
  }
  return <CreatorApp onLogout={handleLogout} />;
}

function CreatorApp({ onLogout }: { onLogout?: () => void }) {
  const app = useCreatorApp({ onLogout });
  const { creatorPage } = app;

  if (creatorPage === "projects") {
    return <ProjectsPage app={app} />;
  }

  if (creatorPage === "workspace") {
    return <WorkspacePage app={app} />;
  }

  if (creatorPage === "prd") {
    return <PrdPage app={app} />;
  }

  if (creatorPage === "users") {
    return <UsersPage app={app} />;
  }

  if (creatorPage === "publish") {
    return <PublishPage app={app} />;
  }

  if (creatorPage === "tickets") {
    return <TicketsPage app={app} />;
  }

  return <DefaultPage app={app} />;
}

if (typeof document !== "undefined") {
  createRoot(document.getElementById("root")!).render(<CreatorAuthGate />);
}
