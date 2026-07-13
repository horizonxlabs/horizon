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
