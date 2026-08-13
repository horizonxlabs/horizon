import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { StorePageHeader } from "../StorePageHeader";
import { storeAppActionKey, type StoreAppAction } from "../StoreProvider";
import { useStorefront } from "../StoreProvider";
import {
  StoreAppActionFeedback,
  StoreAppCapabilityRefreshStatus,
  StoreAppDetailErrorPage,
  StoreAppDetailLoadingPage,
  storeAppDetailErrorMessage,
  storeAppDetailSupportsAction,
  type StoreAppCapabilityRefreshState,
  type StoreAppDetailState
} from "./StoreAppDetailStates";
import { selectedStoreRole, StoreAccessRoleField } from "./StoreAccessRoleField";

type TicketType = "bug" | "feedback" | "feature_request";
type TicketPriority = "low" | "medium" | "high";

export function StoreAppDetailPage({ appSlug }: { appSlug: string }) {
  const {
    api,
    actionStates,
    homeRevision,
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
    async (options: { preserveReady?: boolean } = {}) => {
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
    [api, appSlug]
  );

  useEffect(() => {
    void loadDetail();
    return () => {
      sequence.current += 1;
    };
  }, [loadDetail]);
  useEffect(() => {
    const previousRevision = lastHomeRevision.current;
    lastHomeRevision.current = homeRevision;
    const appliedRefreshCompleted = previousRevision !== homeRevision;
    if (!appliedRefreshCompleted || detail.status !== "ready") {
      return;
    }
    void loadDetail({ preserveReady: true });
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
  const detailCapabilitiesCurrent = detailRevision.current === homeRevision;
  const supports = (action: Parameters<typeof storeAppDetailSupportsAction>[0]["action"]) =>
    storeAppDetailSupportsAction({
      action,
      actions: app.actions,
      accessStatus: app.accessStatus,
      health: app.health,
      route: app.route,
      accessRequestConfirmed: Boolean(actionState("request-access")?.success),
      detailCapabilitiesCurrent
    });
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
    const role = selectedStoreRole(app.availableRoles, requestedRoleKey).trim();
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
      <StorePageHeader
        eyebrow="Application"
        title={app.name}
        description={app.description}
        action={
          <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
            {app.accessStatus}
          </ToneBadge>
        }
      />
      <div className="store-app-detail-layout">
        <div className="store-app-detail-main">
          <section className="store-detail-panel">
            <h2>About this application</h2>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{app.ownerName}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{app.department}</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>{app.health}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{app.myRole ?? "No assigned role"}</dd>
              </div>
            </dl>
          </section>
          <section className="store-detail-panel">
            <h2>Release notes</h2>
            <ul>
              {app.releaseNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p>Support: {app.supportContact}</p>
          </section>
          {supports("submit_ticket") || actionState("submit-ticket") ? (
            <section className="store-detail-panel">
              <h2>Submit a ticket</h2>
              {supports("submit_ticket") ? (
                <form
                  data-store-action="submit-ticket"
                  onSubmit={submitTicket}
                  className="store-form"
                >
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
                    <textarea
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
                  {feedback("submit-ticket")}
                </form>
              ) : (
                feedback("submit-ticket")
              )}
            </section>
          ) : null}
        </div>
        <aside className="store-app-action-rail" aria-label="Application actions">
          <section className="store-detail-panel">
            <h2>Current access</h2>
            <p>{app.myRole ? `Role: ${app.myRole}` : "No assigned role"}</p>
            {supports("open") ? (
              <button
                type="button"
                onClick={() => {
                  recordRecent(app.slug);
                  window.location.assign(app.route);
                }}
              >
                Open app
              </button>
            ) : null}
            {supports("view_status") ? (
              <button type="button" onClick={() => navigateBrowserPath("/store/access-requests")}>
                View status
              </button>
            ) : null}
          </section>
          <StoreAppCapabilityRefreshStatus
            state={capabilityRefresh}
            onRetry={() => void loadDetail({ preserveReady: true })}
          />
          {supports("request_access") || actionState("request-access") ? (
            <section className="store-detail-panel">
              <h2>Request access</h2>
              {supports("request_access") ? (
                <form
                  data-store-action="request-access"
                  onSubmit={submitAccess}
                  className="store-form"
                >
                  <label>
                    Requested role
                    <StoreAccessRoleField
                      availableRoles={app.availableRoles}
                      value={requestedRoleKey}
                      onChange={setRequestedRoleKey}
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
                  {feedback("request-access")}
                </form>
              ) : (
                feedback("request-access")
              )}
            </section>
          ) : null}
          {validationError ? (
            <p role="alert" className="store-action-error">
              {validationError}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
