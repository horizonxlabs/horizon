import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StorefrontAppDetailResponse } from "@evcp/api-client";
import { SectionCard, ToneBadge } from "@evcp/ui";
import { appInstallJourneySteps, installJourneyStatus } from "@/features/installations";
import { storeAppActionKey, type StoreAppAction } from "../StoreProvider";
import { useStorefront } from "../StoreProvider";

type DetailState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; app: StorefrontAppDetailResponse };

type TicketType = "bug" | "feedback" | "feature_request";
type TicketPriority = "low" | "medium" | "high";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function StoreAppDetailPage({ appSlug }: { appSlug: string }) {
  const { allApps, api, actionStates, recordRecent, rememberAccessReceipt, rememberTicket, runAppAction } = useStorefront();
  const sequence = useRef(0);
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [requestedRoleKey, setRequestedRoleKey] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [accessDepartment, setAccessDepartment] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("bug");
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>("medium");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketDevice, setTicketDevice] = useState("");
  const [validationError, setValidationError] = useState<string>();

  const loadDetail = useCallback(async () => {
    const request = ++sequence.current;
    setDetail({ status: "loading" });
    try {
      const app = await api.getStoreAppDetail(appSlug);
      if (request === sequence.current) setDetail({ status: "ready", app });
    } catch (error) {
      if (request === sequence.current) setDetail({ status: "error", error: errorMessage(error, "Unable to load this app.") });
    }
  }, [api, appSlug]);

  useEffect(() => {
    void loadDetail();
    return () => { sequence.current += 1; };
  }, [loadDetail]);

  if (detail.status === "loading") {
    return <section className="store-page"><SectionCard eyebrow="Platform API" title="Loading app"><p>Loading app details and supported actions.</p></SectionCard></section>;
  }
  if (detail.status === "error") {
    return <section className="store-page"><SectionCard eyebrow="Platform API" title="App details unavailable"><p>{detail.error}</p><button type="button" onClick={() => void loadDetail()}>Retry app details</button></SectionCard></section>;
  }

  const { app } = detail;
  const supports = (action: StorefrontAppDetailResponse["actions"][number]) => app.actions.includes(action);
  const actionState = (action: StoreAppAction) => actionStates[storeAppActionKey(app.slug, action)];
  const pending = (action: StoreAppAction) => actionState(action)?.pending ?? false;
  const installActionState = actionState("install");
  const uninstallActionState = actionState("uninstall");
  const installIsLatest = (installActionState?.sequence ?? -1) >= (uninstallActionState?.sequence ?? -1);
  const currentHomeApp = allApps.find((candidate) => candidate.slug === app.slug);
  const journeyApp = {
    accessStatus: currentHomeApp?.accessStatus ?? app.accessStatus,
    installStatus: currentHomeApp?.installStatus ?? app.installStatus
  };
  const visibleInstallStatus = !installIsLatest && uninstallActionState?.installationStatus === "disabled"
    ? "not_installed"
    : journeyApp.installStatus;
  const installJourneyRows = appInstallJourneySteps.map((step) => ({
    ...step,
    status: installJourneyStatus(
      step.id,
      journeyApp,
      installIsLatest ? installActionState?.installationStatus : undefined,
      installIsLatest && (installActionState?.pending ?? false),
      installIsLatest ? undefined : uninstallActionState?.installationStatus,
      !installIsLatest && (uninstallActionState?.pending ?? false)
    )
  }));
  const showInstallJourney = supports("install")
    || supports("uninstall")
    || supports("request_access")
    || journeyApp.installStatus === "installed"
    || journeyApp.accessStatus !== "active";
  const feedback = (action: StoreAppAction) => {
    const state = actionState(action);
    return state?.error ? <p role="alert" className="store-action-error">{state.error}</p>
      : state?.success ? <p role="status" className="store-action-success">{state.success}</p> : null;
  };
  function handleAction<T>(action: StoreAppAction, mutation: () => Promise<T>, successMessage: string, onConfirmed?: (result: T) => void) {
    void runAppAction(app.slug, action, mutation, successMessage, onConfirmed).catch(() => undefined);
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
      () => api.requestStoreAccess(app.slug, { requestedRoleKey: role, reason, ...(accessDepartment.trim() ? { department: accessDepartment.trim() } : {}) }),
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
      () => api.submitStoreTicket(app.slug, { type: ticketType, priority: ticketPriority, title, description, deviceInfo }),
      "Ticket submitted.",
      (ticket) => rememberTicket(ticket.id)
    );
  };

  return (
    <section className="store-page store-app-detail">
      <div className="store-page-heading">
        <div><span className="eyebrow">Platform API app detail</span><h1>{app.name}</h1><p>{app.description}</p></div>
        <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>{app.accessStatus}</ToneBadge>
      </div>
      <SectionCard eyebrow="Application" title="Current access">
        <p>{app.myRole ? `Role: ${app.myRole}` : "No assigned role"} · {visibleInstallStatus === "installed" ? "Installed" : "Not installed"}</p>
        <p>Owned by {app.ownerName} · {app.department} · {app.accessMode}</p>
        {supports("open") ? <button type="button" onClick={() => { recordRecent(app.slug); window.location.assign(app.route || `/apps/${app.slug}`); }}>Open app</button> : null}
      </SectionCard>
      {showInstallJourney ? (
        <SectionCard eyebrow="Installation" title="App install journey">
          <ol aria-label="App install journey" className="store-install-stepper">
            {installJourneyRows.map((step, index) => (
              <li key={step.id} className={`store-install-step status-${step.status}`}>
                <span>{index + 1}</span>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                <ToneBadge tone={step.status === "complete" ? "success" : step.status === "blocked" ? "danger" : "neutral"}>
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
            onClick={() => handleAction(
              "install",
              () => api.installStoreApp(app.slug),
              "Install confirmed."
            )}
          >
            {pending("install") ? "Installing…" : "Install"}
          </button>
          {feedback("install")}
        </SectionCard>
      ) : null}
      {supports("uninstall") ? <SectionCard eyebrow="Installation" title="Remove this installation"><button type="button" disabled={pending("uninstall")} onClick={() => handleAction("uninstall", () => api.uninstallStoreApp(app.slug), "Removal confirmed.")}>{pending("uninstall") ? "Removing…" : "Remove"}</button>{feedback("uninstall")}</SectionCard> : null}
      {supports("request_access") ? <SectionCard eyebrow="Access" title="Request access"><form data-store-action="request-access" onSubmit={submitAccess}><label>Requested role<input name="requestedRoleKey" value={requestedRoleKey} onChange={(event) => setRequestedRoleKey(event.target.value)} /></label><label>Reason<input name="accessReason" value={accessReason} onChange={(event) => setAccessReason(event.target.value)} /></label><label>Department (optional)<input name="accessDepartment" value={accessDepartment} onChange={(event) => setAccessDepartment(event.target.value)} /></label><button type="submit" disabled={pending("request-access")}>{pending("request-access") ? "Requesting…" : "Request access"}</button></form>{feedback("request-access")}</SectionCard> : null}
      {supports("submit_ticket") ? <SectionCard eyebrow="Support" title="Submit a ticket"><form data-store-action="submit-ticket" onSubmit={submitTicket}><label>Type<select name="ticketType" value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}><option value="bug">Bug</option><option value="feedback">Feedback</option><option value="feature_request">Feature request</option></select></label><label>Priority<select name="ticketPriority" value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value as TicketPriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Title<input name="ticketTitle" value={ticketTitle} onChange={(event) => setTicketTitle(event.target.value)} /></label><label>Description<input name="ticketDescription" value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} /></label><label>Device information<input name="ticketDevice" value={ticketDevice} onChange={(event) => setTicketDevice(event.target.value)} /></label><button type="submit" disabled={pending("submit-ticket")}>{pending("submit-ticket") ? "Submitting…" : "Submit ticket"}</button></form>{feedback("submit-ticket")}</SectionCard> : null}
      {validationError ? <p role="alert" className="store-action-error">{validationError}</p> : null}
      <SectionCard eyebrow="Support" title="Release notes"><ul>{app.releaseNotes.map((note) => <li key={note}>{note}</li>)}</ul><p>Support: {app.supportContact}</p></SectionCard>
    </section>
  );
}
