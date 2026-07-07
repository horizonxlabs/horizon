import {
  createPlatformApiClient,
  createPlatformSessionStore,
  type CurrentUserResponse,
  type SimulatedSsoLoginInput,
  type StoreAppInstallationResponse,
  type StoreAccessRequestResponse,
  type StorefrontAppCardDto,
  type StorefrontHomeResponse,
  type StoreTicketResponse
} from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { AppCard, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { ArrowLeft, Bell, Bug, CalendarCheck2, CheckCircle2, Clock3, Download, MessageSquare, Plus, Search, Send, ShieldCheck, Store, Trash2, UserCheck, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

type StoreBootstrapState = {
  userName: string;
  email: string;
  myApps: AppStoreItem[];
  availableApps: AppStoreItem[];
  source: "Platform API" | "local fallback";
};

const fallbackStoreApps: AppStoreItem[] = [
  {
    id: "app_leave_management",
    slug: "leave-management",
    name: "Leave Management",
    description: "Submit, approve and track leave requests inside the private enterprise app store.",
    owner: "Creator User",
    route: "/apps/leave-management",
    myRole: "Employee",
    accessStatus: "active",
    health: "healthy"
  },
  {
    id: "app_procurement",
    slug: "procurement-request",
    name: "Procurement Request",
    description: "Request purchasing approval with governed access.",
    owner: "Finance Ops",
    route: "/apps/procurement-request",
    accessStatus: "available",
    health: "healthy"
  }
];

const initialStoreBootstrap: StoreBootstrapState = {
  userName: "End User",
  email: "user@company.com",
  myApps: fallbackStoreApps.filter((app) => app.accessStatus === "active"),
  availableApps: fallbackStoreApps.filter((app) => app.accessStatus !== "active"),
  source: "local fallback"
};

const storeSessionBridgeProfile: SimulatedSsoLoginInput = {
  subject: "keycloak-store-ui-bridge",
  email: "user@company.com",
  name: "End User",
  groups: ["evcp-users"],
  appRoles: { "leave-management": ["Employee"] }
};

function apiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  if (!configured && import.meta.env.DEV) return undefined;
  return (configured || "/api").replace(/\/$/, "");
}

function platformSessionToken(): string | undefined {
  return createPlatformSessionStore(window.localStorage).getToken();
}

function createStorePlatformClient() {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  return createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
    legacyUserEmail: "user@company.com"
  });
}

function appCardToStoreItem(app: StorefrontAppCardDto): AppStoreItem {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    owner: app.ownerName,
    route: app.route,
    myRole: app.myRole,
    accessStatus: app.accessStatus,
    installStatus: app.installStatus,
    primaryAction: app.primaryAction as AppStoreItem["primaryAction"],
    health: app.health as AppStoreItem["health"]
  };
}

async function loadStoreBootstrap(): Promise<StoreBootstrapState> {
  const client = createStorePlatformClient();
  const [currentUser, storeHome]: [CurrentUserResponse, StorefrontHomeResponse] = await Promise.all([client.getCurrentUser(), client.listStoreApps()]);
  return {
    userName: storeHome.profile.userName || currentUser.user.name,
    email: storeHome.profile.email || currentUser.user.email,
    myApps: storeHome.myApps.map(appCardToStoreItem),
    availableApps: storeHome.availableApps.map(appCardToStoreItem),
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

async function signInStoreSessionBridge(): Promise<StoreBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const bridgeClient = createPlatformApiClient({
    baseUrl,
    legacyUserEmail: "admin@company.com"
  });
  const session = await bridgeClient.simulateSsoLogin(storeSessionBridgeProfile);
  createPlatformSessionStore(window.localStorage).saveSession(session);
  return loadStoreBootstrap();
}

function clearStoreSessionBridge(): StoreBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return initialStoreBootstrap;
}

function fallbackAccessRequest(appSlug: string, requestedRoleKey: string, reason: string): StoreAccessRequestResponse {
  return {
    id: "local_access_request_001",
    appSlug,
    requestedRoleKey,
    requesterEmail: "user@company.com",
    status: "pending",
    reason,
    department: "HR",
    createdAt: new Date().toISOString()
  };
}

function fallbackInstallation(appSlug: string, status: "active" | "disabled"): StoreAppInstallationResponse {
  return {
    id: "local_install_001",
    appSlug,
    status,
    installedAt: new Date().toISOString(),
    disabledAt: status === "disabled" ? new Date().toISOString() : undefined
  };
}

function fallbackTicket(appSlug: string, title: string, description: string, deviceInfo: string): StoreTicketResponse {
  return {
    id: "local_ticket_0001",
    ticketNumber: "TKT-LOCAL",
    appSlug,
    appName: "Local fallback app",
    type: "bug",
    priority: "high",
    title,
    description,
    deviceInfo,
    status: "submitted",
    timeline: [{ id: "local_tl_001", status: "submitted", label: "Ticket submitted" }]
  };
}

type LeaveRequest = {
  id: string;
  employee: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved";
};

const seededLeaveRequests: LeaveRequest[] = [
  {
    id: "LR-1001",
    employee: "Somchai P.",
    leaveType: "WFH",
    startDate: "2026-07-06",
    endDate: "2026-07-06",
    reason: "Work from home for focused planning",
    status: "pending"
  },
  {
    id: "LR-1002",
    employee: "Nalida K.",
    leaveType: "Annual Leave",
    startDate: "2026-07-08",
    endDate: "2026-07-09",
    reason: "Family trip",
    status: "approved"
  }
];

function GeneratedLeaveManagementApp() {
  const [requests, setRequests] = useState<LeaveRequest[]>(seededLeaveRequests);
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [startDate, setStartDate] = useState("2026-07-10");
  const [endDate, setEndDate] = useState("2026-07-10");
  const [reason, setReason] = useState("Personal leave request");
  const [lastSubmitted, setLastSubmitted] = useState<LeaveRequest | undefined>(undefined);
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;

  function handleSubmitLeaveRequest() {
    const nextRequest: LeaveRequest = {
      id: `LR-${1000 + requests.length + 1}`,
      employee: "End User",
      leaveType,
      startDate,
      endDate,
      reason,
      status: "pending"
    };
    setRequests((current) => [nextRequest, ...current]);
    setLastSubmitted(nextRequest);
  }

  function approveRequest(requestId: string) {
    setRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: "approved" } : request));
  }

  return (
    <main className="generated-app-shell">
      <header className="generated-app-header">
        <a className="button-link secondary-link" href="/store">
          <ArrowLeft size={15} />
          App Store
        </a>
        <div>
          <span className="eyebrow">Generated App Runtime</span>
          <h1>Leave Management</h1>
          <p>Submit, track and approve employee leave requests with Platform Auth role context.</p>
        </div>
        <ToneBadge tone="success">published</ToneBadge>
      </header>

      <section className="generated-app-kpis" aria-label="Leave summary">
        <div>
          <CalendarCheck2 size={18} />
          <span>Total requests</span>
          <strong>{requests.length}</strong>
        </div>
        <div>
          <Clock3 size={18} />
          <span>Pending approval</span>
          <strong>{pendingCount}</strong>
        </div>
        <div>
          <UserCheck size={18} />
          <span>Approved</span>
          <strong>{approvedCount}</strong>
        </div>
      </section>

      <section className="generated-app-grid">
        <SectionCard eyebrow="Employee Flow" title="New leave request">
          <div className="generated-request-form">
            <label>
              Leave type
              <select value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
                <option>Annual Leave</option>
                <option>Sick Leave</option>
                <option>WFH</option>
                <option>Business Trip</option>
              </select>
            </label>
            <label>
              Start date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="button" onClick={handleSubmitLeaveRequest} disabled={!reason.trim() || !startDate || !endDate}>
              <Plus size={15} />
              Submit request
            </button>
          </div>
          {lastSubmitted ? (
            <div className="generated-app-evidence" aria-label="Last submitted request">
              <CheckCircle2 size={18} />
              <div>
                <strong>{lastSubmitted.id} submitted</strong>
                <span>{lastSubmitted.leaveType} · {lastSubmitted.startDate} to {lastSubmitted.endDate}</span>
              </div>
              <ToneBadge tone="warning">pending</ToneBadge>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Manager Flow" title="Approval queue">
          <div className="generated-request-list">
            {requests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.id} · {request.employee}</strong>
                  <span>{request.leaveType} · {request.startDate} to {request.endDate}</span>
                  <small>{request.reason}</small>
                </div>
                <ToneBadge tone={request.status === "approved" ? "success" : "warning"}>{request.status}</ToneBadge>
                <button type="button" className="secondary-button" onClick={() => approveRequest(request.id)} disabled={request.status === "approved"}>
                  Approve
                </button>
              </article>
            ))}
          </div>
        </SectionCard>
      </section>
    </main>
  );
}

type InstallJourneyStepStatus = "complete" | "current" | "pending" | "blocked";

const appInstallJourneySteps = [
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

function installJourneyStatus(
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
  if (isInstallingApp) return stepId === "manifest_validation" || stepId === "install_record" ? "current" : "pending";
  if (stepId === "manifest_validation") return "current";
  return "pending";
}

function StoreApp() {
  const [bootstrap, setBootstrap] = useState(initialStoreBootstrap);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [requestedRole, setRequestedRole] = useState("manager");
  const [requestReason, setRequestReason] = useState("Need approval queue access");
  const [ticketType, setTicketType] = useState<"bug" | "feedback" | "feature_request">("bug");
  const [ticketDescription, setTicketDescription] = useState("WFH leave type not visible on mobile");
  const [ticketDevice, setTicketDevice] = useState("iPhone Safari");
  const [accessRequestResult, setAccessRequestResult] = useState<StoreAccessRequestResponse | undefined>(undefined);
  const [installResult, setInstallResult] = useState<StoreAppInstallationResponse | undefined>(undefined);
  const [ticketResult, setTicketResult] = useState<StoreTicketResponse | undefined>(undefined);
  const [ticketStatus, setTicketStatus] = useState<StoreTicketResponse | undefined>(undefined);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [isInstallingApp, setIsInstallingApp] = useState(false);
  const [isUninstallingApp, setIsUninstallingApp] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const myApps = bootstrap.myApps;
  const availableApps = bootstrap.availableApps;
  const selectedApp = myApps[0] ?? availableApps[0] ?? fallbackStoreApps[0];
  const visibleTicket = ticketStatus ?? ticketResult;
  const visibleTimeline = visibleTicket?.timeline ?? [];
  const installJourneyRows = appInstallJourneySteps.map((step) => ({
    ...step,
    status: installJourneyStatus(step.id, selectedApp, installResult, isInstallingApp)
  }));

  useEffect(() => {
    loadStoreBootstrap()
      .then(setBootstrap)
      .catch(() => setBootstrap(initialStoreBootstrap));
  }, []);

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      setBootstrap(await signInStoreSessionBridge());
    } catch {
      setBootstrap(initialStoreBootstrap);
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleLogoutBridge() {
    setBootstrap(clearStoreSessionBridge());
    setAccessRequestResult(undefined);
    setInstallResult(undefined);
    setTicketResult(undefined);
    setTicketStatus(undefined);
  }

  async function handleRequestAccess() {
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
    } catch {
      setAccessRequestResult(fallbackAccessRequest(selectedApp.slug, requestedRole, requestReason));
    } finally {
      setIsRequestingAccess(false);
    }
  }

  async function handleInstallApp() {
    setIsInstallingApp(true);
    try {
      const client = createStorePlatformClient();
      const result = await client.installStoreApp(selectedApp.slug);
      setInstallResult(result);
      setBootstrap(await loadStoreBootstrap());
    } catch {
      setInstallResult(fallbackInstallation(selectedApp.slug, "active"));
    } finally {
      setIsInstallingApp(false);
    }
  }

  async function handleUninstallApp() {
    setIsUninstallingApp(true);
    try {
      const client = createStorePlatformClient();
      const result = await client.uninstallStoreApp(selectedApp.slug);
      setInstallResult(result);
      setBootstrap(await loadStoreBootstrap());
    } catch {
      setInstallResult(fallbackInstallation(selectedApp.slug, "disabled"));
    } finally {
      setIsUninstallingApp(false);
    }
  }

  async function handleSubmitTicket() {
    setIsSubmittingTicket(true);
    const title = ticketDescription.split(".")[0] || "App Store feedback";
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
    } catch {
      const localTicket = fallbackTicket(selectedApp.slug, title, ticketDescription, ticketDevice);
      setTicketResult(localTicket);
      setTicketStatus(localTicket);
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  function handleOpenSelectedApp() {
    if (selectedApp.accessStatus !== "active") return;
    window.location.assign(selectedApp.route ?? `/apps/${selectedApp.slug}`);
  }

  return (
    <main className="store-shell">
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <h1>App Store</h1>
          <p>{bootstrap.userName} · {bootstrap.email}</p>
        </div>
        <div className="store-header-actions">
          <ToneBadge tone={bootstrap.source === "Platform API" ? "success" : "neutral"}>{bootstrap.source}</ToneBadge>
          <button type="button" className="secondary-button" onClick={handleSignInBridge} disabled={isSigningIn}>
            <ShieldCheck size={15} />
            {isSigningIn ? "Signing in" : "Demo Sign in"}
          </button>
          <button type="button" className="secondary-button" onClick={handleLogoutBridge}>
            Logout
          </button>
          <button type="button" className="store-icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <section className="store-search-panel" aria-label="Search apps">
        <Search size={18} />
        <input aria-label="Search apps" placeholder="Search apps, teams or role..." />
      </section>

      <section className="store-status-strip" aria-label="Store summary">
        <div>
          <Store size={17} />
          <span>My Apps</span>
          <strong>{myApps.length}</strong>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Access</span>
          <strong>SSO</strong>
        </div>
        <div>
          <WifiOff size={17} />
          <span>Offline</span>
          <strong>Ready</strong>
        </div>
      </section>

      <section className="store-section">
        <div className="store-section-title">
          <h2>My Apps</h2>
          <ToneBadge tone="success">active</ToneBadge>
        </div>
        {myApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>

      <section className="store-section">
        <div className="store-section-title">
          <h2>Available Apps</h2>
          <ToneBadge tone="warning">request required</ToneBadge>
        </div>
        {availableApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>

      <section className="store-detail-grid" aria-label="App Detail and support">
        <SectionCard eyebrow="App Detail" title={selectedApp.name}>
          <DefinitionGrid
            items={[
              { label: "Owner", value: selectedApp.owner },
              { label: "Role", value: selectedApp.myRole ?? "Access required" },
              { label: "Install", value: <ToneBadge tone={selectedApp.installStatus === "installed" ? "success" : "neutral"}>{selectedApp.installStatus ?? "not_installed"}</ToneBadge> },
              { label: "Health", value: <ToneBadge tone="success">{selectedApp.health}</ToneBadge> },
              { label: "Route", value: `/apps/${selectedApp.slug}` }
            ]}
          />
          <div className="store-action-row">
            <button type="button" onClick={handleOpenSelectedApp} disabled={selectedApp.accessStatus !== "active"}>Open</button>
            <button type="button" className="secondary-button" onClick={handleInstallApp} disabled={isInstallingApp || selectedApp.installStatus === "installed" || selectedApp.accessStatus !== "active"}>
              <Download size={15} />
              {isInstallingApp ? "Installing" : "Install"}
            </button>
            <button type="button" className="secondary-button" onClick={handleUninstallApp} disabled={isUninstallingApp || selectedApp.installStatus !== "installed"}>
              <Trash2 size={15} />
              {isUninstallingApp ? "Removing" : "Remove"}
            </button>
            <button type="button" className="secondary-button" onClick={handleSubmitTicket} disabled={isSubmittingTicket}>
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
                <ToneBadge tone={step.status === "complete" ? "success" : step.status === "blocked" ? "danger" : step.status === "current" ? "info" : "neutral"}>{step.status}</ToneBadge>
              </li>
            ))}
          </ol>
          {installResult ? (
            <div className="store-action-evidence" aria-label="Install result">
              <strong>{installResult.status === "active" ? "App installed" : "App removed"}</strong>
              <span>{installResult.appSlug} · {installResult.installedAt}</span>
              <ToneBadge tone={installResult.status === "active" ? "success" : "neutral"}>{installResult.status}</ToneBadge>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Request Access" title="Manager role request">
          <div className="store-form">
            <label>
              Requested role
              <input value={requestedRole} onChange={(event) => setRequestedRole(event.target.value)} />
            </label>
            <label>
              Reason
              <input value={requestReason} onChange={(event) => setRequestReason(event.target.value)} />
            </label>
            <button type="button" onClick={handleRequestAccess} disabled={isRequestingAccess}>
              <Send size={15} />
              {isRequestingAccess ? "Requesting" : "Request Access"}
            </button>
            {accessRequestResult ? (
              <div className="store-action-evidence" aria-label="Access request result">
                <strong>Access request pending</strong>
                <span>{accessRequestResult.requestedRoleKey} · {accessRequestResult.requesterEmail}</span>
                <ToneBadge tone="warning">{accessRequestResult.status}</ToneBadge>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Submit Ticket" title="Bug / Feedback">
          <div className="store-form">
            <label>
              Type
              <select value={ticketType} onChange={(event) => setTicketType(event.target.value as "bug" | "feedback" | "feature_request")}>
                <option value="bug">Bug</option>
                <option value="feedback">Feedback</option>
                <option value="feature_request">Feature request</option>
              </select>
            </label>
            <label>
              Description
              <input value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} />
            </label>
            <label>
              Device
              <input value={ticketDevice} onChange={(event) => setTicketDevice(event.target.value)} />
            </label>
            <button type="button" onClick={handleSubmitTicket} disabled={isSubmittingTicket}>
              <Bug size={15} />
              {isSubmittingTicket ? "Submitting" : "Submit Ticket"}
            </button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Ticket Status" title={visibleTicket?.ticketNumber ?? "No ticket yet"}>
          <div className="ticket-timeline">
            {visibleTimeline.length ? visibleTimeline.map((item) => (
              <div key={item.id ?? item.label}>
                <MessageSquare size={16} />
                <span>{item.label}</span>
                <ToneBadge tone={item.status === "submitted" ? "success" : item.status === "planned" ? "info" : "warning"}>{item.status}</ToneBadge>
              </div>
            )) : (
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

const currentPath = window.location.pathname;
createRoot(document.getElementById("root")!).render(currentPath.startsWith("/apps/leave-management") ? <GeneratedLeaveManagementApp /> : <StoreApp />);
