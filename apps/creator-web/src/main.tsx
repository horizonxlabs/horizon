import { navigation } from "@evcp/config";
import { mockUsers, projects } from "@evcp/mock-data";
import { AppShell, DataTable, DecisionPanel, DefinitionGrid, PageHeader, SectionCard, ToneBadge, WorkflowRail } from "@evcp/ui";
import { CheckCircle2, FileText, GitBranch, LayoutDashboard, LockKeyhole, Sparkles, WandSparkles } from "lucide-react";
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

function CreatorApp() {
  return (
    <AppShell title="Creator App" navItems={navigation.creator} userName={mockUsers.creator.name}>
      <PageHeader
        tone="surface"
        eyebrow="Creator Workflow"
        title="โปรเจกต์ของฉัน"
        description="เลือกหรือสร้าง project แล้วทำ PRD ให้เป็น baseline ก่อนเริ่ม generate app"
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

      <section className="creator-summary-grid">
        <SectionCard eyebrow="Project Picker" title={selectedProject.name}>
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
