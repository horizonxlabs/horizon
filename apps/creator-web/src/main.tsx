import { navigation } from "@evcp/config";
import { mockUsers, projects } from "@evcp/mock-data";
import { AppShell, DataTable, DecisionPanel, DefinitionGrid, PageHeader, SectionCard, ToneBadge, WorkflowRail } from "@evcp/ui";
import {
  CheckCircle2,
  FileText,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  Monitor,
  RefreshCw,
  Send,
  Sparkles,
  Tablet,
  WandSparkles
} from "lucide-react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

const selectedProject = projects[0];

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

function CreatorApp() {
  return (
    <AppShell title="Creator App" navItems={navigation.creator} userName={mockUsers.creator.name}>
      <PageHeader
        tone="surface"
        eyebrow="Creator Workspace"
        title="Workspace: Leave Management"
        description="Prompt, AI task progress, token remaining และ live preview อยู่ในหน้าทำงานเดียว"
        actions={
          <>
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
