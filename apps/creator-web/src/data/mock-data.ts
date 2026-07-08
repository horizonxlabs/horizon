import type {
  PreviewVersionDto,
  SimulatedSsoLoginInput,
  WorkspaceTaskStepDto
} from "@evcp/api-client";
import type { CreateProjectFormState, CreatorBootstrapState, CreatorProjectView } from "../types";

export const fallbackSelectedProject: CreatorProjectView = {
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

export const initialCreatorBootstrap: CreatorBootstrapState = {
  userName: "Creator User",
  selectedProject: fallbackSelectedProject,
  projects: [fallbackSelectedProject],
  source: "local fallback"
};

export const initialCreateProjectForm: CreateProjectFormState = {
  name: "Expense Approval",
  slug: "expense-approval",
  appType: "Workflow App",
  businessProblem: "ลดเวลาการอนุมัติค่าใช้จ่ายและทำให้ผู้จัดการเห็นรายการค้างอนุมัติในที่เดียว",
  targetDepartment: "Finance",
  intendedUsers: "Employee, Manager, Finance Admin",
  dataSensitivity: "internal"
};

export const creatorSessionBridgeProfile: SimulatedSsoLoginInput = {
  subject: "keycloak-creator-ui-bridge",
  email: "creator@company.com",
  name: "Creator User",
  groups: ["evcp-creators"],
  appRoles: { "leave-management": ["HR Admin"] }
};

export const wizardSteps = [
  {
    title: "1. App Basics",
    detail: "ชื่อแอป, business problem, app type, target department",
    status: "complete"
  },
  {
    title: "2. Users and Access",
    detail: "Employee, Manager, HR Admin และ default roles",
    status: "complete"
  },
  {
    title: "3. Data and Risk",
    detail: "internal data sensitivity พร้อม governance warning",
    status: "ready"
  }
];

export const prdSections = [
  [
    "overview",
    "Overview",
    "Leave Management เป็น Workflow App สำหรับ HR Department เพื่อจัดการคำขอลางานตั้งแต่สร้างคำขอจนถึงอนุมัติ"
  ],
  [
    "business_objective",
    "Business Objective",
    "ลดงาน manual ของ HR และทำให้ manager เห็นคำขอที่ต้องอนุมัติในที่เดียว"
  ],
  [
    "users_roles",
    "Users and Roles",
    "Employee สร้างคำขอ, Manager อนุมัติ, HR Admin ดูภาพรวมและตั้งค่านโยบาย"
  ],
  [
    "core_flows",
    "Core Flows",
    "Create leave request, manager approval, status tracking, audit event"
  ],
  [
    "data_model",
    "Data Model",
    "Employee, Leave Request, Approval Step, Attachment, Notification, Audit Event"
  ],
  [
    "permissions",
    "Permissions",
    "ผู้ใช้เห็นเฉพาะข้อมูลของตนเอง manager เห็นทีม HR เห็นข้อมูลทั้งระบบ"
  ],
  [
    "nfr",
    "Non-Functional Requirements",
    "Authenticated access, audit log, token quota guard และ guardrail ก่อน generate"
  ],
  [
    "acceptance_criteria",
    "Acceptance Criteria",
    "Creator review PRD แล้วกด Confirm Baseline v1.0 ก่อนเข้าสู่ app generation"
  ]
].map(([key, title, body], index) => ({ key, title, body, order: String(index + 1) }));

export const versionRows = [
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

export const fallbackPreview: PreviewVersionDto = {
  id: "preview_local_0001",
  projectId: fallbackSelectedProject.id,
  version: "preview-0001",
  summary: "Updating Leave Management preview with WFH leave type and manager approval visibility.",
  device: "desktop",
  screenTitle: "Leave Management",
  highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"],
  createdAt: "2026-07-04T00:00:00.000Z"
};

export const fallbackTaskSteps: WorkspaceTaskStepDto[] = [
  "Understanding request",
  "Loading PRD baseline",
  "Guardrail pre-check",
  "Selecting skill",
  "Generating frontend",
  "Applying auth/role rules",
  "Building preview",
  "Running checks",
  "Ready"
].map((label, index) => ({
  id: `local_step_${index + 1}`,
  label,
  status: (index < 9 ? "done" : "pending") as WorkspaceTaskStepDto["status"],
  order: index + 1
}));

export const usageRows = [
  {
    prompt: "Add WFH leave type",
    scenario: "frontend_coding",
    tokens: "120",
    result: "preview-0001"
  }
];

export const databaseTables = [
  { table: "employees", type: "generated", columns: "3 columns", records: "2 sample rows" },
  { table: "leave_requests", type: "generated", columns: "4 columns", records: "2 sample rows" },
  { table: "approval_steps", type: "generated", columns: "4 columns", records: "1 sample row" }
];

export const sampleRecords = [
  { id: "lr_1001", leaveType: "WFH", status: "pending", owner: "Somchai P." },
  { id: "lr_1002", leaveType: "annual", status: "approved", owner: "Nalida K." }
];

export const migrationRows = [
  {
    migration: "2026081001_leave_management_base",
    status: "applied",
    prd: "Baseline v1.0",
    checkpoint: "fe-0001"
  }
];

export const checkpointRows = [
  {
    version: "fe-0002",
    status: "current",
    summary: "Improve manager dashboard",
    preview: "preview-0002"
  },
  { version: "fe-0001", status: "previous", summary: "Add WFH leave type", preview: "preview-0001" }
];

export const appMembers = [
  {
    user: "Creator User",
    type: "internal",
    role: "HR Admin",
    status: "active",
    lastAccess: "2026-08-20"
  },
  {
    user: "End User",
    type: "internal",
    role: "Employee",
    status: "active",
    lastAccess: "2026-08-20"
  }
];

export const pendingInvites = [
  {
    email: "manager@company.com",
    role: "Manager",
    invitedBy: "Creator User",
    expires: "2026-09-01",
    status: "pending"
  },
  {
    email: "vendor@example.com",
    role: "Employee",
    invitedBy: "Creator User",
    expires: "2026-09-01",
    status: "approval_required"
  }
];

export const accessRequests = [
  {
    requester: "manager@company.com",
    role: "Manager",
    reason: "Needs approval queue access",
    submitted: "2026-08-17",
    status: "pending"
  }
];

export const appRoles = [
  {
    role: "Employee",
    permissions: "leave:request, leave:view-own",
    members: "1",
    status: "active"
  },
  { role: "Manager", permissions: "leave:approve, leave:view-team", members: "0", status: "ready" },
  { role: "HR Admin", permissions: "leave:admin, leave:report", members: "1", status: "active" }
];

export const publishChecklist = [
  { check: "PRD baseline", state: "pass", detail: "Baseline v1.0" },
  { check: "Active frontend checkpoint", state: "pass", detail: "fe-0001" },
  { check: "App roles", state: "pass", detail: "Employee, Manager, HR Admin" },
  { check: "At least one owner", state: "pass", detail: "Creator User" },
  { check: "No blocking guardrail event", state: "pass", detail: "clear" }
];

export const creatorTickets = [
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

export const prdChangeRows = [
  {
    change: "CR-0001",
    source: "TKT-0001",
    risk: "medium",
    status: "approved",
    requestedBy: "Creator User",
    updated: "2026-08-18"
  }
];

export const traceRows = [
  { link: "Ticket", value: "TKT-0001 · WFH leave type missing" },
  { link: "PRD Change", value: "CR-0001 · approved" },
  { link: "PRD Version", value: "1.1" },
  { link: "Frontend", value: "fe-0001" },
  { link: "Manifest", value: "manifest v1" },
  { link: "Deployment", value: "dep_leave_management_001" },
  { link: "Domain", value: "leave.company.example" }
];

export const mvpDemoSteps = [
  "Admin configures AI provider/key and guardrail",
  "Creator creates Leave Management and confirms PRD",
  "Creator prompts WFH leave change and publishes",
  "End User submits ticket",
  "Creator converts ticket to PRD change",
  "Approve PRD Change and review traceability",
  "Request and approve public domain",
  "Review MVP Monitoring and Audit Filters"
];
