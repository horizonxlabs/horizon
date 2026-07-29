import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard, ToneBadge } from "@evcp/ui";
import { storeAppActionKey, type StoreAppAction } from "../StoreProvider";
import { useStorefront } from "../StoreProvider";
import {
  StoreAppActionFeedback,
  StoreAppCapabilityRefreshStatus,
  StoreAppDetailErrorPage,
  StoreAppDetailLoadingPage,
  deriveStoreAppDetailJourney,
  storeAppDetailErrorMessage,
  storeAppDetailSupportsAction,
  type StoreAppCapabilityRefreshState,
  type StoreAppDetailState
} from "./StoreAppDetailStates";

type TicketType = "bug" | "feedback" | "feature_request";
type TicketPriority = "low" | "medium" | "high";

export function StoreAppDetailPage({ appSlug }: { appSlug: string }) {
  const {
    allApps,
    api,
    actionStates,
    homeRevision,
    reconcileInstallationEvidenceForSlug,
    recordRecent,
    rememberAccessReceipt,
    rememberTicket,
    runAppAction
  } = useStorefront();
  const sequence = useRef(0);
  const lastHomeRevision = useRef(homeRevision);
  const homeRevisionRef = useRef(homeRevision);
  const detailRevision = useRef(-1);
  homeRevisionRef.current = homeRevision;
  const [detail, setDetail] = useState<StoreAppDetailState>({ status: "loading" });
  const [capabilityRefresh, setCapabilityRefresh] = useState<StoreAppCapabilityRefreshState>({
    status: "idle"
  });
  const [requestedRoleKey, setRequestedRoleKey] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [accessDepartment, setAccessDepartment] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("bug");
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>("medium");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketDevice, setTicketDevice] = useState("");
  const [validationError, setValidationError] = useState<string>();

  const loadDetail = useCallback(
    async (options: { preserveReady?: boolean; reconcileEvidence?: boolean } = {}) => {
      const request = ++sequence.current;
      if (options.preserveReady) {
        setCapabilityRefresh({ status: "refreshing" });
      } else {
        setDetail({ status: "loading" });
        setCapabilityRefresh({ status: "idle" });
      }
      try {
        const app = await api.getStoreAppDetail(appSlug);
        if (request === sequence.current) {
          if (options.reconcileEvidence !== false) {
            reconcileInstallationEvidenceForSlug(app.slug);
          }
          detailRevision.current = homeRevisionRef.current;
          setDetail({ status: "ready", app });
          setCapabilityRefresh({ status: "idle" });
        }
      } catch (error) {
        if (request !== sequence.current) return;
        const message = storeAppDetailErrorMessage(error, "Unable to load this app.");
        if (options.preserveReady) {
          setCapabilityRefresh({ status: "error", error: message });
        } else {
          setDetail({ status: "error", error: message });
        }
      }
    },
    [api, appSlug, reconcileInstallationEvidenceForSlug]
  );

  useEffect(() => {
    void loadDetail();
    return () => {
      sequence.current += 1;
    };
  }, [loadDetail]);
  const currentHomeApp = allApps.find((candidate) => candidate.slug === appSlug);
  useEffect(() => {
    const previousRevision = lastHomeRevision.current;
    lastHomeRevision.current = homeRevision;
    const appliedRefreshCompleted = previousRevision !== homeRevision;
    if (!appliedRefreshCompleted || detail.status !== "ready") {
      return;
    }
    void loadDetail({ preserveReady: true, reconcileEvidence: false });
  }, [detail.status, homeRevision, loadDetail]);
  if (detail.status === "loading") {
    return <StoreAppDetailLoadingPage />;
  }
  if (detail.status === "error") {
    return <StoreAppDetailErrorPage error={detail.error} onRetry={() => void loadDetail()} />;
  }
  const { app } = detail;
  const actionState = (action: StoreAppAction) => actionStates[storeAppActionKey(app.slug, action)];
  const pending = (action: StoreAppAction) => actionState(action)?.pending ?? false;
  const installActionState = actionState("install");
  const uninstallActionState = actionState("uninstall");
  const detailCapabilitiesCurrent = detailRevision.current === homeRevision;
  const {
    journeyApp,
    capabilityAccessStatus,
    visibleInstallStatus,
    capabilityInstallStatus,
    installJourneyRows
  } = deriveStoreAppDetailJourney({
    app,
    currentHomeApp,
    detailCapabilitiesCurrent,
    installActionState,
    uninstallActionState
  });
  const supports = (action: Parameters<typeof storeAppDetailSupportsAction>[0]["action"]) =>
    storeAppDetailSupportsAction({
      action,
      actions: app.actions,
      accessStatus: capabilityAccessStatus,
      installStatus: capabilityInstallStatus,
      accessRequestConfirmed: Boolean(actionState("request-access")?.success),
      detailCapabilitiesCurrent,
      installationStatusConfirmed: Boolean(
        installActionState?.installationStatus || uninstallActionState?.installationStatus
      )
    });
  const showInstallJourney =
    supports("install") ||
    supports("uninstall") ||
    supports("request_access") ||
    journeyApp.installStatus === "installed" ||
    journeyApp.accessStatus !== "active";
  const feedback = (action: StoreAppAction) => (
    <StoreAppActionFeedback state={actionState(action)} />
  );
  function handleAction<T>(
    action: StoreAppAction,
    mutation: () => Promise<T>,
    successMessage: string,
    onConfirmed?: (result: T) => void
  ) {
    void runAppAction(app.slug, action, mutation, successMessage, onConfirmed).catch(
      () => undefined
    );
  }
  const submitAccess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const role = requestedRoleKey.trim();
    const reason = accessReason.trim();
    if (!role || !reason) {
      setValidationError("A requested role and reason are required.");
      return;
    }
    setValidationError(undefined);
    handleAction(
      "request-access",
      () =>
        api.requestStoreAccess(app.slug, {
          requestedRoleKey: role,
          reason,
          ...(accessDepartment.trim() ? { department: accessDepartment.trim() } : {})
        }),
      "Access request confirmed.",
      (receipt) => rememberAccessReceipt(receipt)
    );
  };
  const submitTicket = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = ticketTitle.trim();
    const description = ticketDescription.trim();
    const deviceInfo = ticketDevice.trim();
    if (!title || !description || !deviceInfo) {
      setValidationError("Ticket title, description, and device information are required.");
      return;
    }
    setValidationError(undefined);
    handleAction(
      "submit-ticket",
      () =>
        api.submitStoreTicket(app.slug, {
          type: ticketType,
          priority: ticketPriority,
          title,
          description,
          deviceInfo
        }),
      "Ticket submitted.",
      (ticket) => rememberTicket(ticket.id)
    );
  };
  return (
    <section className="store-page store-app-detail">
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">Platform API app detail</span>
          <h1>{app.name}</h1>
          <p>{app.description}</p>
        </div>
        <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
          {app.accessStatus}
        </ToneBadge>
      </div>
      <SectionCard eyebrow="Application" title="Current access">
        <p>
          {app.myRole ? `Role: ${app.myRole}` : "No assigned role"} ·{" "}
          {visibleInstallStatus === "installed" ? "Installed" : "Not installed"}
        </p>
        <p>
          Owned by {app.ownerName} · {app.department} · {app.accessMode}
        </p>
        {supports("open") ? (
          <button
            type="button"
            onClick={() => {
              recordRecent(app.slug);
              window.location.assign(app.route || `/apps/${app.slug}`);
            }}
          >
            Open app
          </button>
        ) : null}
      </SectionCard>
      <StoreAppCapabilityRefreshStatus
        state={capabilityRefresh}
        onRetry={() => void loadDetail({ preserveReady: true })}
      />
      <div className="store-action-feedback" aria-live="polite">
        {feedback("install")}
        {feedback("uninstall")}
        {feedback("request-access")}
        {feedback("submit-ticket")}
      </div>
      {showInstallJourney ? (
        <SectionCard eyebrow="Installation" title="App install journey">
          <ol aria-label="App install journey" className="store-install-stepper">
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
                        : "neutral"
                  }
                >
                  {step.status}
                </ToneBadge>
              </li>
            ))}
          </ol>
        </SectionCard>
      ) : null}
      {supports("install") ? (
        <SectionCard eyebrow="Installation" title="Install on this account">
          <button
            type="button"
            disabled={pending("install")}
            onClick={() =>
              handleAction("install", () => api.installStoreApp(app.slug), "Install confirmed.")
            }
          >
            {pending("install") ? "Installing…" : "Install"}
          </button>
        </SectionCard>
      ) : null}
      {supports("uninstall") ? (
        <SectionCard eyebrow="Installation" title="Remove this installation">
          <button
            type="button"
            disabled={pending("uninstall")}
            onClick={() =>
              handleAction("uninstall", () => api.uninstallStoreApp(app.slug), "Removal confirmed.")
            }
          >
            {pending("uninstall") ? "Removing…" : "Remove"}
          </button>
        </SectionCard>
      ) : null}
      {supports("request_access") ? (
        <SectionCard eyebrow="Access" title="Request access">
          <form data-store-action="request-access" onSubmit={submitAccess}>
            <label>
              Requested role
              <input
                name="requestedRoleKey"
                value={requestedRoleKey}
                onChange={(event) => setRequestedRoleKey(event.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                name="accessReason"
                value={accessReason}
                onChange={(event) => setAccessReason(event.target.value)}
              />
            </label>
            <label>
              Department (optional)
              <input
                name="accessDepartment"
                value={accessDepartment}
                onChange={(event) => setAccessDepartment(event.target.value)}
              />
            </label>
            <button type="submit" disabled={pending("request-access")}>
              {pending("request-access") ? "Requesting…" : "Request access"}
            </button>
          </form>
        </SectionCard>
      ) : null}
      {supports("submit_ticket") ? (
        <SectionCard eyebrow="Support" title="Submit a ticket">
          <form data-store-action="submit-ticket" onSubmit={submitTicket}>
            <label>
              Type
              <select
                name="ticketType"
                value={ticketType}
                onChange={(event) => setTicketType(event.target.value as TicketType)}
              >
                <option value="bug">Bug</option>
                <option value="feedback">Feedback</option>
                <option value="feature_request">Feature request</option>
              </select>
            </label>
            <label>
              Priority
              <select
                name="ticketPriority"
                value={ticketPriority}
                onChange={(event) => setTicketPriority(event.target.value as TicketPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Title
              <input
                name="ticketTitle"
                value={ticketTitle}
                onChange={(event) => setTicketTitle(event.target.value)}
              />
            </label>
            <label>
              Description
              <input
                name="ticketDescription"
                value={ticketDescription}
                onChange={(event) => setTicketDescription(event.target.value)}
              />
            </label>
            <label>
              Device information
              <input
                name="ticketDevice"
                value={ticketDevice}
                onChange={(event) => setTicketDevice(event.target.value)}
              />
            </label>
            <button type="submit" disabled={pending("submit-ticket")}>
              {pending("submit-ticket") ? "Submitting…" : "Submit ticket"}
            </button>
          </form>
        </SectionCard>
      ) : null}
      {validationError ? (
        <p role="alert" className="store-action-error">
          {validationError}
        </p>
      ) : null}
      <SectionCard eyebrow="Support" title="Release notes">
        <ul>
          {app.releaseNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p>Support: {app.supportContact}</p>
      </SectionCard>
    </section>
  );
}
