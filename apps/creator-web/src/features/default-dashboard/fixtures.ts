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
