import { AlertTriangle, BrainCircuit, Database, Route } from "lucide-react";
import type { ComponentType } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const knowledgeSkillKpis = [
  {
    label: "Knowledge active",
    value: "12",
    detail: "indexed and approved",
    icon: Database,
    tone: "success"
  },
  {
    label: "Pending approvals",
    value: "3",
    detail: "knowledge + skills",
    icon: AlertTriangle,
    tone: "warning"
  },
  {
    label: "Retrieval pass",
    value: "18/20",
    detail: "permission filtered",
    icon: Route,
    tone: "info"
  },
  {
    label: "Active skills",
    value: "9",
    detail: "role/scenario scoped",
    icon: BrainCircuit,
    tone: "success"
  }
] satisfies Array<{
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  tone: BadgeTone;
}>;

export const knowledgeSourceRows = [
  {
    source: "HR Leave Policy Handbook",
    type: "Markdown",
    owner: "HR Owner",
    scope: "project:leave / dept:HR",
    index: "indexed",
    active: "v1"
  },
  {
    source: "Leave API Spec",
    type: "OpenAPI",
    owner: "App Owner",
    scope: "app:leave-management",
    index: "indexed",
    active: "v2"
  },
  {
    source: "Payroll Export Rules",
    type: "PDF",
    owner: "Finance",
    scope: "dept:Finance",
    index: "denied",
    active: "none"
  }
];

export const skillLibraryRows = [
  {
    skill: "Frontend Developer Leave Skill",
    role: "Frontend Developer",
    scenario: "frontend_coding",
    status: "active"
  },
  {
    skill: "PRD Analyst Enterprise",
    role: "Requirement Analyst",
    scenario: "requirement_analysis",
    status: "active"
  },
  { skill: "Payroll Exporter", role: "Any role", scenario: "frontend_coding", status: "disabled" }
];

export const skillAssignmentRows = [
  {
    role: "Frontend Developer",
    scenario: "Frontend Coding",
    scope: "project",
    selected: "Frontend Leave v1",
    knowledge: "HR Leave Policy v1"
  },
  {
    role: "Requirement Analyst",
    scenario: "Requirement Analysis",
    scope: "department",
    selected: "PRD Analyst v5",
    knowledge: "HR Handbook v3"
  }
];
