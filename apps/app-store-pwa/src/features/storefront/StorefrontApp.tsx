import {
  type StoreAppInstallationResponse,
  type StoreAccessRequestResponse,
  type StoreTicketResponse
} from "@evcp/api-client";
import { DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { Bug, Download, MessageSquare, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  appInstallJourneySteps,
  installJourneyStatus
} from "@/features/installations";
import { StorefrontSummary } from "./StorefrontSummary";
import {
  clearStoreSessionBridge,
  beginStoreKeycloakLogout,
  initialStoreBootstrap,
  loadStoreBootstrap,
  signInStoreSessionBridge
} from "./bootstrap";
import { createStorePlatformClient } from "./platform-client";

export function StorefrontApp() {
  const [bootstrap, setBootstrap] = useState(initialStoreBootstrap);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [requestedRole, setRequestedRole] = useState("manager");
  const [requestReason, setRequestReason] = useState("Need approval queue access");
  const [ticketType, setTicketType] = useState<"bug" | "feedback" | "feature_request">("bug");
  const [ticketDescription, setTicketDescription] = useState(
    "WFH leave type not visible on mobile"
  );
  const [ticketDevice, setTicketDevice] = useState("iPhone Safari");
  const [accessRequestResult, setAccessRequestResult] = useState<
    StoreAccessRequestResponse | undefined
  >(undefined);
  const [installResult, setInstallResult] = useState<StoreAppInstallationResponse | undefined>(
    undefined
  );
  const [ticketResult, setTicketResult] = useState<StoreTicketResponse | undefined>(undefined);
  const [ticketStatus, setTicketStatus] = useState<StoreTicketResponse | undefined>(undefined);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [isInstallingApp, setIsInstallingApp] = useState(false);
  const [isUninstallingApp, setIsUninstallingApp] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [sessionError, setSessionError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const myApps = bootstrap.myApps;
  const availableApps = bootstrap.availableApps;
  const selectedApp = myApps[0] ?? availableApps[0];
  const visibleTicket = ticketStatus ?? ticketResult;
  const visibleTimeline = visibleTicket?.timeline ?? [];

  useEffect(() => {
    loadStoreBootstrap()
      .then((next) => { setBootstrap(next); setSessionError(undefined); })
      .catch((error) => setSessionError(error instanceof Error ? error.message : "Unable to verify your session."));
  }, []);

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      signInStoreSessionBridge();
      return;
    } catch {
      setSessionError("Unable to start secure sign-in. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleLogoutBridge() {
    await createStorePlatformClient().request("/auth/logout", { method: "POST" }).catch(() => undefined);
    setBootstrap(clearStoreSessionBridge());
    setAccessRequestResult(undefined);
    setInstallResult(undefined);
    setTicketResult(undefined);
    setTicketStatus(undefined);
    beginStoreKeycloakLogout();
  }

  async function handleRequestAccess() {
    if (!selectedApp) return;
    setIsRequestingAccess(true);
    try {
      const client = createStorePlatformClient();
      await client.getStoreAppDetail(selectedApp.slug);
      const result = await client.requestStoreAccess(selectedApp.slug, {
        requestedRoleKey: requestedRole,
        reason: requestReason,
        department: "HR"
      });
      setAccessRequestResult(result);
      setBootstrap(await loadStoreBootstrap());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Access request could not be submitted.");
    } finally {
      setIsRequestingAccess(false);
    }
  }

  async function handleInstallApp() {
    if (!selectedApp) return;
    setIsInstallingApp(true);
    try {
      const client = createStorePlatformClient();
      const result = await client.installStoreApp(selectedApp.slug);
      setInstallResult(result);
      setBootstrap(await loadStoreBootstrap());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "App installation could not be completed.");
    } finally {
      setIsInstallingApp(false);
    }
  }

  async function handleUninstallApp() {
    if (!selectedApp) return;
    setIsUninstallingApp(true);
    try {
      const client = createStorePlatformClient();
      const result = await client.uninstallStoreApp(selectedApp.slug);
      setInstallResult(result);
      setBootstrap(await loadStoreBootstrap());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "App removal could not be completed.");
    } finally {
      setIsUninstallingApp(false);
    }
  }

  async function handleSubmitTicket() {
    if (!selectedApp) return;
    setIsSubmittingTicket(true);
    const title = ticketDescription.split(".")[0] || "Horizon Store feedback";
    try {
      const client = createStorePlatformClient();
      const submitted = await client.submitStoreTicket(selectedApp.slug, {
        type: ticketType,
        priority: "high",
        title,
        description: ticketDescription,
        deviceInfo: ticketDevice
      });
      setTicketResult(submitted);
      setTicketStatus(await client.getStoreTicket(submitted.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Support ticket could not be submitted.");
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  function handleOpenSelectedApp() {
    if (!selectedApp) return;
    if (selectedApp.accessStatus !== "active") return;
    window.location.assign(selectedApp.route ?? `/apps/${selectedApp.slug}`);
  }

  if (sessionError || bootstrap.status === "error") return <main className="store-shell"><SectionCard eyebrow="Secure session" title="Sign-in required"><p>{sessionError ?? bootstrap.error}</p><button type="button" onClick={() => void handleSignInBridge()} disabled={isSigningIn}>{isSigningIn ? "Opening sign-in…" : "Sign in with Keycloak"}</button></SectionCard></main>;
  if (bootstrap.status === "loading") return <main className="store-shell"><SectionCard eyebrow="App Store" title="Loading your apps"><p>Loading current access and installed applications from Platform API.</p></SectionCard></main>;
  if (!selectedApp) return <main className="store-shell"><StorefrontSummary userName={bootstrap.userName} email={bootstrap.email} source={bootstrap.source} myApps={myApps} availableApps={availableApps} isSigningIn={isSigningIn} onSignIn={handleSignInBridge} onLogout={handleLogoutBridge} /><SectionCard eyebrow="App Store" title="No apps available"><p>No applications are currently assigned to your account. Request access from a workspace owner.</p></SectionCard></main>;

  const installJourneyRows = appInstallJourneySteps.map((step) => ({
    ...step,
    status: installJourneyStatus(step.id, selectedApp, installResult, isInstallingApp)
  }));

  return (
    <main className="store-shell">
      <StorefrontSummary
        userName={bootstrap.userName}
        email={bootstrap.email}
        source={bootstrap.source}
        myApps={myApps}
        availableApps={availableApps}
        isSigningIn={isSigningIn}
        onSignIn={handleSignInBridge}
        onLogout={handleLogoutBridge}
      />
      {actionError ? <section role="alert" className="store-action-error"><strong>Action not completed.</strong> {actionError}</section> : null}

      <section className="store-detail-grid" aria-label="App Detail and support">
        <SectionCard eyebrow="App Detail" title={selectedApp.name}>
          <DefinitionGrid
            items={[
              { label: "Owner", value: selectedApp.owner },
              { label: "Role", value: selectedApp.myRole ?? "Access required" },
              {
                label: "Install",
                value: (
                  <ToneBadge
                    tone={selectedApp.installStatus === "installed" ? "success" : "neutral"}
                  >
                    {selectedApp.installStatus ?? "not_installed"}
                  </ToneBadge>
                )
              },
              {
                label: "Health",
                value: <ToneBadge tone="success">{selectedApp.health}</ToneBadge>
              },
              { label: "Route", value: `/apps/${selectedApp.slug}` }
            ]}
          />
          <div className="store-action-row">
            <button
              type="button"
              onClick={handleOpenSelectedApp}
              disabled={selectedApp.accessStatus !== "active"}
            >
              Open
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleInstallApp}
              disabled={
                isInstallingApp ||
                selectedApp.installStatus === "installed" ||
                selectedApp.accessStatus !== "active"
              }
            >
              <Download size={15} />
              {isInstallingApp ? "Installing" : "Install"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleUninstallApp}
              disabled={isUninstallingApp || selectedApp.installStatus !== "installed"}
            >
              <Trash2 size={15} />
              {isUninstallingApp ? "Removing" : "Remove"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleSubmitTicket}
              disabled={isSubmittingTicket}
            >
              <Bug size={15} />
              {isSubmittingTicket ? "Submitting" : "Submit Ticket"}
            </button>
          </div>
          <ol className="store-install-stepper" aria-label="App install journey">
            {installJourneyRows.map((step, index) => (
              <li key={step.id} className={`store-install-step status-${step.status}`}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
                <ToneBadge
                  tone={
                    step.status === "complete"
                      ? "success"
                      : step.status === "blocked"
                        ? "danger"
                        : step.status === "current"
                          ? "info"
                          : "neutral"
                  }
                >
                  {step.status}
                </ToneBadge>
              </li>
            ))}
          </ol>
          {installResult ? (
            <div className="store-action-evidence" aria-label="Install result">
              <strong>{installResult.status === "active" ? "App installed" : "App removed"}</strong>
              <span>
                {installResult.appSlug} · {installResult.installedAt}
              </span>
              <ToneBadge tone={installResult.status === "active" ? "success" : "neutral"}>
                {installResult.status}
              </ToneBadge>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Request Access" title="Manager role request">
          <div className="store-form">
            <label>
              Requested role
              <input
                value={requestedRole}
                onChange={(event) => setRequestedRole(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
              />
            </label>
            <button type="button" onClick={handleRequestAccess} disabled={isRequestingAccess}>
              <Send size={15} />
              {isRequestingAccess ? "Requesting" : "Request Access"}
            </button>
            {accessRequestResult ? (
              <div className="store-action-evidence" aria-label="Access request result">
                <strong>Access request pending</strong>
                <span>
                  {accessRequestResult.requestedRoleKey} · {accessRequestResult.requesterEmail}
                </span>
                <ToneBadge tone="warning">{accessRequestResult.status}</ToneBadge>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Submit Ticket" title="Bug / Feedback">
          <div className="store-form">
            <label>
              Type
              <select
                value={ticketType}
                onChange={(event) =>
                  setTicketType(event.target.value as "bug" | "feedback" | "feature_request")
                }
              >
                <option value="bug">Bug</option>
                <option value="feedback">Feedback</option>
                <option value="feature_request">Feature request</option>
              </select>
            </label>
            <label>
              Description
              <input
                value={ticketDescription}
                onChange={(event) => setTicketDescription(event.target.value)}
              />
            </label>
            <label>
              Device
              <input
                value={ticketDevice}
                onChange={(event) => setTicketDevice(event.target.value)}
              />
            </label>
            <button type="button" onClick={handleSubmitTicket} disabled={isSubmittingTicket}>
              <Bug size={15} />
              {isSubmittingTicket ? "Submitting" : "Submit Ticket"}
            </button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Ticket Status" title={visibleTicket?.ticketNumber ?? "No ticket yet"}>
          <div className="ticket-timeline">
            {visibleTimeline.length ? (
              visibleTimeline.map((item) => (
                <div key={item.id ?? item.label}>
                  <MessageSquare size={16} />
                  <span>{item.label}</span>
                  <ToneBadge
                    tone={
                      item.status === "submitted"
                        ? "success"
                        : item.status === "planned"
                          ? "info"
                          : "warning"
                    }
                  >
                    {item.status}
                  </ToneBadge>
                </div>
              ))
            ) : (
              <div>
                <MessageSquare size={16} />
                <span>Submit a ticket to start the support timeline.</span>
                <ToneBadge tone="neutral">waiting</ToneBadge>
              </div>
            )}
          </div>
        </SectionCard>
      </section>
    </main>
  );
}
