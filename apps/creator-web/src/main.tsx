import { createPlatformApiClient, createPlatformSessionStore, type CurrentUserResponse, type PlatformProjectDto, type SimulatedSsoLoginInput } from "@evcp/api-client";
import { navigation } from "@evcp/config";
import { AppShell, DataTable, DecisionPanel, DefinitionGrid, PageHeader, SectionCard, ToneBadge, WorkflowRail } from "@evcp/ui";
import {
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GitCompareArrows,
  GitBranch,
  History,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Monitor,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldAlert,
  Store,
  Table2,
  Sparkles,
  Tablet,
  UserPlus,
  Users,
  WandSparkles
} from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

type CreatorProjectView = {
  id: string;
  slug: string;
  name: string;
  appType: string;
  status: string;
  owner: string;
  prdVersion: string;
  frontendVersion: string;
  tokenUsedThisMonth: number;
};

type CreatorBootstrapState = {
  userName: string;
  selectedProject: CreatorProjectView;
  source: "Platform API" | "local fallback";
};

const fallbackSelectedProject: CreatorProjectView = {
  id: "proj_leave_management",
  slug: "leave-management",
  name: "Leave Management",
  appType: "Workflow App",
  status: "draft",
  owner: "Creator User",
  prdVersion: "1.0",
  frontendVersion: "preview-0001",
  tokenUsedThisMonth: 120
};

const initialCreatorBootstrap: CreatorBootstrapState = {
  userName: "Creator User",
  selectedProject: fallbackSelectedProject,
  source: "local fallback"
};

const creatorSessionBridgeProfile: SimulatedSsoLoginInput = {
  subject: "keycloak-creator-ui-bridge",
  email: "creator@company.com",
  name: "Creator User",
  groups: ["evcp-creators"],
  appRoles: { "leave-management": ["HR Admin"] }
};

function apiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  if (!configured && import.meta.env.DEV) return undefined;
  return (configured || "/api").replace(/\/$/, "");
}

function platformSessionToken(): string | undefined {
  return createPlatformSessionStore(window.localStorage).getToken();
}

function projectToView(project: PlatformProjectDto, currentUser: CurrentUserResponse): CreatorProjectView {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    appType: project.appType,
    status: project.status,
    owner: currentUser.user.name,
    prdVersion: project.status === "published" ? "1.0" : "0.1",
    frontendVersion: project.activeFrontendCheckpointId ?? "preview-pending",
    tokenUsedThisMonth: 0
  };
}

async function loadCreatorBootstrap(): Promise<CreatorBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const client = createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
    legacyUserEmail: "creator@company.com"
  });
  const currentUser = await client.getCurrentUser();
  const projects = await client.listProjects();
  return {
    userName: currentUser.user.name,
    selectedProject: projects[0] ? projectToView(projects[0], currentUser) : fallbackSelectedProject,
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

async function signInCreatorSessionBridge(): Promise<CreatorBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const bridgeClient = createPlatformApiClient({
    baseUrl,
    legacyUserEmail: "admin@company.com"
  });
  const session = await bridgeClient.simulateSsoLogin(creatorSessionBridgeProfile);
  createPlatformSessionStore(window.localStorage).saveSession(session);
  return loadCreatorBootstrap();
}

function clearCreatorSessionBridge(): CreatorBootstrapState {
  createPlatformSessionStore(window.localStorage).clearSession();
  return initialCreatorBootstrap;
}

const wizardSteps = [
  { title: "1. App Basics", detail: "ชื่อแอป, business problem, app type, target department", status: "complete" },
  { title: "2. Users and Access", detail: "Employee, Manager, HR Admin และ default roles", status: "complete" },
  { title: "3. Data and Risk", detail: "internal data sensitivity พร้อม governance warning", status: "ready" }
];

const prdSections = [
  ["overview", "Overview", "Leave Management เป็น Workflow App สำหรับ HR Department เพื่อจัดการคำขอลางานตั้งแต่สร้างคำขอจนถึงอนุมัติ"],
  ["business_objective", "Business Objective", "ลดงาน manual ของ HR และทำให้ manager เห็นคำขอที่ต้องอนุมัติในที่เดียว"],
  ["users_roles", "Users and Roles", "Employee สร้างคำขอ, Manager อนุมัติ, HR Admin ดูภาพรวมและตั้งค่านโยบาย"],
  ["core_flows", "Core Flows", "Create leave request, manager approval, status tracking, audit event"],
  ["data_model", "Data Model", "Employee, Leave Request, Approval Step, Attachment, Notification, Audit Event"],
  ["permissions", "Permissions", "ผู้ใช้เห็นเฉพาะข้อมูลของตนเอง manager เห็นทีม HR เห็นข้อมูลทั้งระบบ"],
  ["nfr", "Non-Functional Requirements", "Authenticated access, audit log, token quota guard และ guardrail ก่อน generate"],
  ["acceptance_criteria", "Acceptance Criteria", "Creator review PRD แล้วกด Confirm Baseline v1.0 ก่อนเข้าสู่ app generation"]
].map(([key, title, body], index) => ({ key, title, body, order: String(index + 1) }));

const versionRows = [
  {
    version: "0.1",
    status: "draft",
    summary: "Initial PRD draft generated from wizard input",
    author: "Creator User"
  },
  {
    version: "1.0",
    status: "baseline",
    summary: "Baseline v1.0 confirmed and immutable",
    author: "Creator User"
  }
];

const taskSteps = [
  "Understanding request",
  "Loading PRD baseline",
  "Guardrail pre-check",
  "Selecting skill",
  "Generating frontend",
  "Applying auth/role rules",
  "Building preview",
  "Running checks",
  "Ready"
].map((label, index) => ({ label, status: index < 9 ? "done" : "pending", order: String(index + 1) }));

const usageRows = [
  {
    prompt: "Add WFH leave type",
    scenario: "frontend_coding",
    tokens: "120",
    result: "preview-0001"
  }
];

const databaseTables = [
  { table: "employees", type: "generated", columns: "3 columns", records: "2 sample rows" },
  { table: "leave_requests", type: "generated", columns: "4 columns", records: "2 sample rows" },
  { table: "approval_steps", type: "generated", columns: "4 columns", records: "1 sample row" }
];

const sampleRecords = [
  { id: "lr_1001", leaveType: "WFH", status: "pending", owner: "Somchai P." },
  { id: "lr_1002", leaveType: "annual", status: "approved", owner: "Nalida K." }
];

const migrationRows = [
  { migration: "2026081001_leave_management_base", status: "applied", prd: "Baseline v1.0", checkpoint: "fe-0001" }
];

const checkpointRows = [
  { version: "fe-0002", status: "current", summary: "Improve manager dashboard", preview: "preview-0002" },
  { version: "fe-0001", status: "previous", summary: "Add WFH leave type", preview: "preview-0001" }
];

const appMembers = [
  { user: "Creator User", type: "internal", role: "HR Admin", status: "active", lastAccess: "2026-08-20" },
  { user: "End User", type: "internal", role: "Employee", status: "active", lastAccess: "2026-08-20" }
];

const pendingInvites = [
  { email: "manager@company.com", role: "Manager", invitedBy: "Creator User", expires: "2026-09-01", status: "pending" },
  { email: "vendor@example.com", role: "Employee", invitedBy: "Creator User", expires: "2026-09-01", status: "approval_required" }
];

const accessRequests = [
  { requester: "manager@company.com", role: "Manager", reason: "Needs approval queue access", submitted: "2026-08-17", status: "pending" }
];

const appRoles = [
  { role: "Employee", permissions: "leave:request, leave:view-own", members: "1", status: "active" },
  { role: "Manager", permissions: "leave:approve, leave:view-team", members: "0", status: "ready" },
  { role: "HR Admin", permissions: "leave:admin, leave:report", members: "1", status: "active" }
];

const publishChecklist = [
  { check: "PRD baseline", state: "pass", detail: "Baseline v1.0" },
  { check: "Active frontend checkpoint", state: "pass", detail: "fe-0001" },
  { check: "App roles", state: "pass", detail: "Employee, Manager, HR Admin" },
  { check: "At least one owner", state: "pass", detail: "Creator User" },
  { check: "No blocking guardrail event", state: "pass", detail: "clear" }
];

const creatorTickets = [
  {
    ticket: "TKT-0001",
    type: "bug",
    submitter: "user@company.com",
    app: "Leave Management",
    summary: "WFH leave type missing on mobile",
    priority: "high",
    status: "submitted"
  }
];

const prdChangeRows = [
  {
    change: "CR-0001",
    source: "TKT-0001",
    risk: "medium",
    status: "approved",
    requestedBy: "Creator User",
    updated: "2026-08-18"
  }
];

const traceRows = [
  { link: "Ticket", value: "TKT-0001 · WFH leave type missing" },
  { link: "PRD Change", value: "CR-0001 · approved" },
  { link: "PRD Version", value: "1.1" },
  { link: "Frontend", value: "fe-0001" },
  { link: "Manifest", value: "manifest v1" },
  { link: "Deployment", value: "dep_leave_management_001" },
  { link: "Domain", value: "leave.company.example" }
];

const mvpDemoSteps = [
  "Admin configures AI provider/key and guardrail",
  "Creator creates Leave Management and confirms PRD",
  "Creator prompts WFH leave change and publishes",
  "End User submits ticket",
  "Creator converts ticket to PRD change",
  "Approve PRD Change and review traceability",
  "Request and approve public domain",
  "Review MVP Monitoring and Audit Filters"
];

function CreatorApp() {
  const [bootstrap, setBootstrap] = useState(initialCreatorBootstrap);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const selectedProject = bootstrap.selectedProject;

  useEffect(() => {
    loadCreatorBootstrap()
      .then(setBootstrap)
      .catch(() => setBootstrap(initialCreatorBootstrap));
  }, []);

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      setBootstrap(await signInCreatorSessionBridge());
    } catch {
      setBootstrap(initialCreatorBootstrap);
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleLogoutBridge() {
    setBootstrap(clearCreatorSessionBridge());
  }

  return (
    <AppShell title="Creator App" navItems={navigation.creator} userName={bootstrap.userName}>
      <PageHeader
        tone="surface"
        eyebrow="Creator Workspace"
        title="Workspace: Leave Management"
        description="Prompt, AI task progress, token remaining และ live preview อยู่ในหน้าทำงานเดียว"
        actions={
          <>
            <ToneBadge tone={bootstrap.source === "Platform API" ? "success" : "neutral"}>Bootstrap: {bootstrap.source}</ToneBadge>
            <button type="button" className="secondary-button" onClick={handleSignInBridge} disabled={isSigningIn}>
              <LockKeyhole size={16} />
              {isSigningIn ? "Signing in" : "Demo Sign in"}
            </button>
            <button type="button" className="secondary-button" onClick={handleLogoutBridge}>
              <RotateCcw size={16} />
              Logout
            </button>
            <button type="button" className="secondary-button">
              <GitBranch size={16} />
              Remix
            </button>
            <button type="button">
              <WandSparkles size={16} />
              Create Project Wizard
            </button>
          </>
        }
      />

      <section className="workspace-topbar">
        {[
          ["Project", selectedProject.name],
          ["PRD", "Baseline v1.0"],
          ["Frontend", "preview-0001"],
          ["Token Remaining", "880 today / 4,880 month"],
          ["Publish", "not ready"]
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className="workspace-shell">
        <div className="workspace-left-panel">
          <SectionCard eyebrow="Prompt Composer" title="Chat + AI Plan">
            <div className="prompt-thread">
              <div className="prompt-message user">
                <strong>Creator</strong>
                <p>Add WFH leave type</p>
              </div>
              <div className="prompt-message system">
                <strong>Guardrail pre-check</strong>
                <p>Decision: allow · event gre_0002</p>
              </div>
              <div className="prompt-message ai">
                <strong>AI Task</strong>
                <p>Updating Leave Management preview with WFH leave type and manager approval visibility.</p>
              </div>
            </div>
            <div className="prompt-composer">
              <label>
                Prompt จะถูกตรวจตาม Guardrail ก่อนส่ง AI
                <input defaultValue="Add WFH leave type" />
              </label>
              <button type="button">
                <Send size={16} />
                Send
              </button>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Task Progress" title="Deterministic AI Steps">
            <div className="workspace-progress-list">
              {taskSteps.map((step) => (
                <div key={step.label}>
                  <CheckCircle2 size={15} />
                  <span>{step.order}</span>
                  <strong>{step.label}</strong>
                  <ToneBadge tone="success">{step.status}</ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard
          eyebrow="Live Preview"
          title="Leave Management Preview"
          action={<button type="button" className="ghost-button"><RefreshCw size={15} /> Refresh</button>}
        >
          <div className="preview-toolbar">
            <button type="button"><Monitor size={15} /> Desktop</button>
            <button type="button" className="ghost-button"><Tablet size={15} /> Tablet</button>
            <button type="button" className="ghost-button">Mobile</button>
            <ToneBadge tone="info">preview-0001</ToneBadge>
          </div>
          <div className="live-preview-frame">
            <header>
              <div>
                <span>Leave Management</span>
                <strong>Manager approval workspace</strong>
              </div>
              <ToneBadge tone="success">Healthy</ToneBadge>
            </header>
            <section className="preview-status-strip" aria-label="Preview status">
              <div><span>Requests</span><strong>24</strong><small>+ WFH option</small></div>
              <div><span>Approval SLA</span><strong>1.8d</strong><small>manager queue</small></div>
              <div><span>Policy</span><strong>Ready</strong><small>shown before submit</small></div>
            </section>
            <section className="preview-board">
              <article>
                <span>New Type</span>
                <strong>Work from home leave</strong>
                <p>Employee can select WFH in the same request flow.</p>
              </article>
              <article>
                <span>Approval Queue</span>
                <strong>Manager review lane</strong>
                <p>Pending approvals are grouped by team and due date.</p>
              </article>
              <article>
                <span>Governance</span>
                <strong>HR policy note</strong>
                <p>Policy reminder appears before final submission.</p>
              </article>
            </section>
          </div>
        </SectionCard>

        <aside className="workspace-context-panel">
          <SectionCard eyebrow="Token Remaining" title="Quota">
            <DefinitionGrid
              items={[
                { label: "Today", value: "880 tokens" },
                { label: "Month", value: "4,880 tokens" },
                { label: "Estimate", value: "120 tokens" },
                { label: "Reset", value: "tomorrow" }
              ]}
            />
          </SectionCard>
          <SectionCard eyebrow="Usage Log" title="Logs">
            <DataTable
              columns={[
                { key: "prompt", label: "Prompt" },
                { key: "scenario", label: "Scenario" },
                { key: "tokens", label: "Tokens" },
                { key: "result", label: "Result" }
              ]}
              rows={usageRows}
            />
          </SectionCard>
          <DecisionPanel
            tone="success"
            badge="Allowed"
            title="Guardrail result recorded before generation"
            lines={["No provider secret visible", "Usage log persisted", "Preview refreshed from latest task"]}
          />
        </aside>
      </section>

      <section className="sprint5-shell" aria-label="Database and frontend versions">
        <div className="sprint5-main-panel">
          <SectionCard
            eyebrow="Database View"
            title="Read-only App Data Model"
            action={<ToneBadge tone="info">No raw SQL</ToneBadge>}
          >
            <div className="database-overview">
              <div className="database-rail">
                <div className="database-rail-header">
                  <Database size={18} />
                  <strong>Schema</strong>
                </div>
                {databaseTables.map((table) => (
                  <button type="button" className={table.table === "leave_requests" ? "" : "ghost-button"} key={table.table}>
                    <Table2 size={15} />
                    {table.table}
                  </button>
                ))}
              </div>
              <div className="database-detail">
                <div className="database-detail-header">
                  <div>
                    <span className="eyebrow">Selected Table</span>
                    <h3>leave_requests</h3>
                    <p>Business-friendly metadata for request type, status and employee ownership.</p>
                  </div>
                  <ToneBadge tone="success">read-only</ToneBadge>
                </div>
                <DataTable
                  columns={[
                    { key: "table", label: "Table" },
                    { key: "type", label: "Type" },
                    { key: "columns", label: "Columns" },
                    { key: "records", label: "Sample Records" }
                  ]}
                  rows={databaseTables}
                />
              </div>
            </div>
          </SectionCard>

          <section className="sprint5-subgrid">
            <SectionCard eyebrow="Sample Records" title="leave_requests Preview">
              <DataTable
                columns={[
                  { key: "id", label: "ID" },
                  { key: "leaveType", label: "Leave Type" },
                  { key: "status", label: "Status", tone: (value) => (value === "approved" ? "success" : "warning") },
                  { key: "owner", label: "Owner" }
                ]}
                rows={sampleRecords}
              />
            </SectionCard>

            <SectionCard eyebrow="Migration History" title="Applied App Migrations">
              <DataTable
                columns={[
                  { key: "migration", label: "Migration" },
                  { key: "status", label: "Status", tone: () => "success" },
                  { key: "prd", label: "PRD" },
                  { key: "checkpoint", label: "Frontend" }
                ]}
                rows={migrationRows}
              />
            </SectionCard>
          </section>
        </div>

        <aside className="sprint5-side-panel">
          <SectionCard eyebrow="Frontend Versions" title="Checkpoint Timeline">
            <div className="checkpoint-timeline">
              {checkpointRows.map((checkpoint) => (
                <div key={checkpoint.version}>
                  <History size={16} />
                  <div>
                    <strong>{checkpoint.version}</strong>
                    <span>{checkpoint.summary}</span>
                  </div>
                  <ToneBadge tone={checkpoint.status === "current" ? "success" : "neutral"}>{checkpoint.status}</ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Compare"
            title="fe-0001 -> fe-0002"
            action={<button type="button" className="ghost-button"><GitCompareArrows size={15} /> Compare</button>}
          >
            <div className="compare-summary">
              <p><strong>Changed:</strong> UI components, frontend routing, CSS styles.</p>
              <p><strong>Preview:</strong> old version remains available before restore.</p>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Restore Boundary"
            title="Restore Frontend Only"
            action={<button type="button"><RotateCcw size={15} /> Restore</button>}
          >
            <div className="restore-boundary">
              <div>
                <ShieldCheck size={18} />
                <strong>Will change</strong>
                <span>React pages, UI components, CSS styles and frontend routing.</span>
              </div>
              <div>
                <LockKeyhole size={18} />
                <strong>Will not change</strong>
                <span>backend, database, auth, app roles, membership, domain settings and PRD baseline.</span>
              </div>
            </div>
            <DecisionPanel
              tone="success"
              badge="Audited"
              title="Restore creates a new current checkpoint"
              lines={["Audit event: frontend.restore.completed", "Backend and data boundaries remain unchanged"]}
            />
          </SectionCard>
        </aside>
      </section>

      <section className="sprint6-shell" aria-label="App users roles and publish">
        <div className="sprint6-main-panel">
          <SectionCard
            eyebrow="App Users"
            title="App Users: Leave Management"
            action={<button type="button"><UserPlus size={15} /> เชิญผู้ใช้</button>}
          >
            <div className="sprint6-status-grid">
              <div>
                <Users size={18} />
                <span>Members</span>
                <strong>2 active</strong>
              </div>
              <div>
                <UserPlus size={18} />
                <span>Pending Invites</span>
                <strong>2 waiting</strong>
              </div>
              <div>
                <ShieldAlert size={18} />
                <span>Access Requests</span>
                <strong>1 pending</strong>
              </div>
              <div>
                <Store size={18} />
                <span>App Store registry</span>
                <strong>ready</strong>
              </div>
            </div>

            <div className="sprint6-tabs" aria-label="App user management tabs">
              {["Members", "Pending Invites", "Access Requests", "Roles"].map((tab) => (
                <button type="button" className={tab === "Members" ? "" : "ghost-button"} key={tab}>{tab}</button>
              ))}
            </div>

            <DataTable
              columns={[
                { key: "user", label: "User" },
                { key: "type", label: "Type" },
                { key: "role", label: "App Role" },
                { key: "status", label: "Status", tone: (value) => (value === "active" ? "success" : "warning") },
                { key: "lastAccess", label: "Last Access" }
              ]}
              rows={appMembers}
            />
          </SectionCard>

          <section className="sprint6-subgrid">
            <SectionCard eyebrow="Pending Invites" title="Invitation Queue">
              <DataTable
                columns={[
                  { key: "email", label: "Email/User" },
                  { key: "role", label: "Role" },
                  { key: "invitedBy", label: "Invited By" },
                  { key: "expires", label: "Expires" },
                  { key: "status", label: "Status", tone: (value) => (value === "approval_required" ? "warning" : "info") }
                ]}
                rows={pendingInvites}
              />
              <DecisionPanel
                tone="warning"
                badge="Policy"
                title="External invite requires approval"
                lines={["External users remain approval_required until policy review passes", "Invite and policy decision are audited"]}
              />
            </SectionCard>

            <SectionCard eyebrow="Access Requests" title="Request Review">
              <DataTable
                columns={[
                  { key: "requester", label: "Requester" },
                  { key: "role", label: "Requested Role" },
                  { key: "reason", label: "Reason" },
                  { key: "submitted", label: "Submitted" },
                  { key: "status", label: "Status", tone: () => "warning" }
                ]}
                rows={accessRequests}
              />
            </SectionCard>
          </section>

          <SectionCard eyebrow="App Roles" title="Role Permission Matrix">
            <DataTable
              columns={[
                { key: "role", label: "Role" },
                { key: "permissions", label: "Permissions" },
                { key: "members", label: "Members" },
                { key: "status", label: "Status", tone: (value) => (value === "active" ? "success" : "info") }
              ]}
              rows={appRoles}
            />
          </SectionCard>
        </div>

        <aside className="sprint6-side-panel">
          <SectionCard
            eyebrow="Publish Review"
            title="Manifest + Readiness checklist"
            action={<button type="button"><Store size={15} /> Publish to App Store</button>}
          >
            <DefinitionGrid
              items={[
                { label: "Manifest", value: "manifest v1" },
                { label: "Route", value: "/apps/leave-management" },
                { label: "Auth", value: "platform_auth_sdk" },
                { label: "Frontend", value: "fe-0001" },
                { label: "PRD", value: "Baseline v1.0" },
                { label: "Visibility", value: "restricted" }
              ]}
            />
            <div className="publish-checklist">
              {publishChecklist.map((item) => (
                <div key={item.check}>
                  <ClipboardCheck size={16} />
                  <strong>{item.check}</strong>
                  <span>{item.detail}</span>
                  <ToneBadge tone="success">{item.state}</ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Deployment Record" title="Published Output">
            <div className="deployment-record">
              <CheckCircle2 size={20} />
              <div>
                <strong>dep_leave_management_001</strong>
                <span>published · manifest v1 · App Store registry visible</span>
              </div>
            </div>
            <DecisionPanel
              tone="success"
              badge="Ready"
              title="Sprint 7 can consume registry and access state"
              lines={["Registry entry contains slug, route, roles and visibility", "Deployment links PRD and frontend checkpoint"]}
            />
          </SectionCard>
        </aside>
      </section>

      <section className="creator-ticket-inbox-shell" aria-label="Creator Ticket Inbox">
        <SectionCard
          eyebrow="Creator Ticket Inbox"
          title="Feedback routed from App Store"
          action={<ToneBadge tone="warning">1 submitted</ToneBadge>}
        >
          <div className="creator-ticket-list">
            {creatorTickets.map((ticket) => (
              <article key={ticket.ticket}>
                <div className="creator-ticket-icon"><MessageSquare size={20} /></div>
                <div>
                  <strong>{ticket.ticket} · {ticket.summary}</strong>
                  <span>{ticket.app} · {ticket.submitter} · priority {ticket.priority}</span>
                </div>
                <ToneBadge tone="warning">{ticket.status}</ToneBadge>
              </article>
            ))}
          </div>
          <div className="creator-ticket-actions" aria-label="Ticket actions">
            <button type="button">Convert to PRD Change</button>
            <button type="button" className="secondary-button">Convert to AI Prompt</button>
            <button type="button" className="ghost-button">Resolve</button>
          </div>
          <DecisionPanel
            tone="info"
            badge="Traceable"
            title="Ticket loop keeps PRD and prompt work connected"
            lines={["Ticket remains visible until resolved", "Converted PRD changes can be reviewed before becoming baseline work"]}
          />
        </SectionCard>
      </section>

      <section className="sprint8-shell" aria-label="Ticket-to-PRD Domain Traceability">
        <div className="sprint8-main-panel">
          <SectionCard
            eyebrow="Ticket-to-PRD Change"
            title="Convert ticket into requirement change"
            action={<ToneBadge tone="success">TKT-0001 linked</ToneBadge>}
          >
            <div className="sprint8-conversion-grid">
              <article>
                <span className="eyebrow">Original Ticket</span>
                <strong>TKT-0001 · WFH leave type missing</strong>
                <p>End User reports that WFH is not visible on mobile after publish.</p>
              </article>
              <article>
                <span className="eyebrow">AI Impact</span>
                <strong>Affected sections</strong>
                <p>core_flows and acceptance_criteria need an explicit mobile WFH visibility requirement.</p>
              </article>
              <article>
                <span className="eyebrow">Risk</span>
                <strong>medium · internal data</strong>
                <p>No schema change. Approval flow remains unchanged.</p>
              </article>
            </div>
            <div className="creator-ticket-actions">
              <button type="button">Approve PRD Change</button>
              <button type="button" className="secondary-button">Reject PRD Change</button>
              <button type="button" className="ghost-button">Submit for Approval</button>
            </div>
          </SectionCard>

          <section className="sprint8-subgrid">
            <SectionCard eyebrow="PRD Change Requests" title="Approval queue">
              <DataTable
                columns={[
                  { key: "change", label: "Change" },
                  { key: "source", label: "Source" },
                  { key: "risk", label: "Risk", tone: () => "warning" },
                  { key: "status", label: "Status", tone: () => "success" },
                  { key: "requestedBy", label: "Requested By" },
                  { key: "updated", label: "Updated" }
                ]}
                rows={prdChangeRows}
              />
              <DecisionPanel
                tone="success"
                badge="Approved"
                title="PRD version 1.1 created from ticket feedback"
                lines={["Decision history retained", "Ticket remains linked for deployment traceability"]}
              />
            </SectionCard>

            <SectionCard eyebrow="Domain Settings" title="Internal / Custom / Public" className="domain-settings-card">
              <DefinitionGrid
                items={[
                  { label: "Internal Path", value: "/apps/leave-management" },
                  { label: "Custom Domain", value: "not set" },
                  { label: "Public Domain Request", value: "leave.company.example" },
                  { label: "Approval", value: <ToneBadge tone="success">approved</ToneBadge> }
                ]}
              />
              <DecisionPanel
                tone="warning"
                badge="Policy"
                title="Public Domain Request requires approval"
                lines={["Data classification: internal", "External user policy: approved_users"]}
              />
            </SectionCard>
          </section>

          <SectionCard eyebrow="Deployment Traceability" title="Ticket -> PRD -> Deployment">
            <DataTable
              columns={[
                { key: "link", label: "Link" },
                { key: "value", label: "Evidence" }
              ]}
              rows={traceRows}
            />
          </SectionCard>
        </div>

        <aside className="sprint8-side-panel">
          <SectionCard eyebrow="MVP Demo Checklist" title="Pilot readiness">
            <div className="creator-step-list">
              {mvpDemoSteps.map((step) => (
                <div key={step}>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>{step}</strong>
                    <span>ready for demo evidence</span>
                  </div>
                  <ToneBadge tone="success">done</ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        </aside>
      </section>

      <section className="creator-summary-grid">
        <SectionCard eyebrow="Project Picker · โปรเจกต์ของฉัน" title={selectedProject.name}>
          <div className="creator-project-card">
            <div className="ds-summary-icon"><LayoutDashboard size={22} /></div>
            <div>
              <strong>{selectedProject.name}</strong>
              <span>{selectedProject.appType} · owner {selectedProject.owner}</span>
            </div>
            <ToneBadge tone="warning">{selectedProject.status}</ToneBadge>
          </div>
          <DefinitionGrid
            items={[
              { label: "PRD", value: "v1.0 Draft" },
              { label: "Frontend", value: selectedProject.frontendVersion },
              { label: "Access", value: "Owner" },
              { label: "Health", value: <ToneBadge tone="success">healthy</ToneBadge> }
            ]}
          />
          <div className="creator-card-actions">
            <button type="button">Open</button>
            <button type="button" className="ghost-button">View PRD</button>
            <button type="button" className="ghost-button">Archive</button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Create Project Wizard" title="Generate PRD">
          <div className="creator-step-list">
            {wizardSteps.map((step) => (
              <div key={step.title}>
                <CheckCircle2 size={16} />
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>
                <ToneBadge tone={step.status === "complete" ? "success" : "info"}>{step.status}</ToneBadge>
              </div>
            ))}
          </div>
          <DecisionPanel
            tone="warning"
            badge="Guarded"
            title="PRD generation uses Sprint 2 route, quota and guardrail checks"
            lines={["Required fields complete", "Token quota available", "Guardrail decision: allow"]}
          />
        </SectionCard>
      </section>

      <section className="ds-workbench creator-prd-workbench">
        <WorkflowRail
          eyebrow="PRD Flow"
          title="Review Path"
          steps={[
            { label: "project input captured", icon: <CheckCircle2 size={16} /> },
            { label: "governed AI route resolved", icon: <CheckCircle2 size={16} /> },
            { label: "PRD draft generated", icon: <CheckCircle2 size={16} /> },
            { label: "Confirm Baseline v1.0", icon: <LockKeyhole size={16} /> }
          ]}
          alert={{
            icon: <FileText size={18} />,
            title: "Baseline immutability",
            description: "หลัง confirm แล้ว version 1.0 จะเป็น read-only baseline สำหรับ Sprint 4 workspace",
            tone: "warning"
          }}
        />

        <div className="ds-main-stack">
          <SectionCard eyebrow="PRD Viewer" title="Structured PRD Sections" action={<button type="button">Confirm Baseline</button>}>
            <div className="creator-prd-layout">
              <nav className="creator-prd-nav" aria-label="PRD sections">
                {prdSections.map((section) => (
                  <a href={`#${section.key}`} key={section.key}>{section.title}</a>
                ))}
              </nav>
              <div className="creator-prd-sections">
                {prdSections.map((section) => (
                  <article id={section.key} key={section.key}>
                    <span>{section.order}</span>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{section.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <aside className="creator-prd-meta">
                <ToneBadge tone="warning">draft</ToneBadge>
                <DefinitionGrid
                  items={[
                    { label: "Version", value: "0.1" },
                    { label: "Generated", value: "ล่าสุด" },
                    { label: "Route", value: "prd_generation" },
                    { label: "Model", value: "gpt-4.1" }
                  ]}
                />
              </aside>
            </div>
          </SectionCard>

          <section className="ds-grid-2">
            <SectionCard eyebrow="Version History" title="PRD Version History">
              <DataTable
                columns={[
                  { key: "version", label: "Version" },
                  { key: "status", label: "Status", tone: (value) => (value === "baseline" ? "success" : "warning") },
                  { key: "summary", label: "Summary" },
                  { key: "author", label: "Author" }
                ]}
                rows={versionRows}
              />
            </SectionCard>

            <SectionCard eyebrow="Confirm Baseline" title="Baseline v1.0">
              <div className="creator-baseline-card">
                <Sparkles size={20} />
                <div>
                  <strong>Ready to lock PRD baseline</strong>
                  <span>การ confirm จะสร้าง immutable version 1.0 และเปิด context ให้ Sprint 4 workspace</span>
                </div>
              </div>
              <DecisionPanel
                tone="success"
                badge="Ready"
                title="Confirm Baseline action is available"
                lines={["All required PRD sections exist", "Version history will keep draft and baseline", "Audit event: prd.baseline.confirmed"]}
              />
            </SectionCard>
          </section>
        </div>
      </section>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<CreatorApp />);
