import { Activity, Fingerprint, Route, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const observabilityLicenseKpis = [
  {
    label: "Service Health",
    value: "8/8",
    detail: "core services reporting",
    icon: Activity,
    tone: "success"
  },
  {
    label: "Telemetry Export",
    value: "OTLP",
    detail: "metrics/logs/traces/alerts",
    icon: Route,
    tone: "info"
  },
  {
    label: "License Validation",
    value: "active",
    detail: "offline cache until 2027-01-14",
    icon: Fingerprint,
    tone: "success"
  },
  {
    label: "License Enforcement",
    value: "guarded",
    detail: "privileged actions blocked after grace",
    icon: ShieldCheck,
    tone: "warning"
  }
] satisfies Array<{
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  tone: BadgeTone;
}>;

export const productionServiceRows = [
  {
    service: "Platform API",
    type: "core",
    status: "healthy",
    signal: "p95 42ms",
    retention: "365d audit"
  },
  {
    service: "PostgreSQL",
    type: "database",
    status: "healthy",
    signal: "migration current",
    retention: "365d audit"
  },
  {
    service: "Keycloak",
    type: "auth",
    status: "healthy",
    signal: "realm evcp active",
    retention: "90d logs"
  },
  {
    service: "Redis + BullMQ",
    type: "queue",
    status: "healthy",
    signal: "0 delayed jobs",
    retention: "90d logs"
  }
];

export const generatedAppHealthRows = [
  {
    app: "Leave Management",
    route: "/apps/leave-management",
    status: "healthy",
    readiness: "5/5 checks"
  },
  {
    app: "PRD Workspace Preview",
    route: "/preview/leave-management",
    status: "healthy",
    readiness: "schema isolated"
  }
];

export const queueBackpressureRows = [
  { queue: "ai-tasks", depth: "0", oldest: "-", status: "healthy" },
  { queue: "builds", depth: "1", oldest: "00:01:12", status: "healthy" },
  { queue: "deployments", depth: "0", oldest: "-", status: "healthy" },
  { queue: "indexing", depth: "3", oldest: "00:02:05", status: "warning" }
];

export const telemetryExportRows = [
  { signal: "metrics", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "logs", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "traces", endpoint: "otlp://observability.company.test:4317", status: "configured" },
  { signal: "alerts", endpoint: "otlp://observability.company.test:4317", status: "configured" }
];

export const upgradeCompatibilityRows = [
  { check: "Disk space", observed: "20GB", required: ">=100GB", status: "blocked" },
  { check: "Last backup", observed: "failed", required: "succeeded", status: "blocked" },
  { check: "Service health", observed: "degraded", required: "healthy", status: "blocked" },
  { check: "License status", observed: "expired", required: "active / warning", status: "blocked" }
];

export const licenseEnforcementRows = [
  { action: "publish", decision: "blocked", reason: "expired beyond grace", data: "preserved" },
  {
    action: "ai_generation",
    decision: "blocked",
    reason: "entitlement exceeded",
    data: "preserved"
  },
  {
    action: "new_external_invite",
    decision: "blocked",
    reason: "seat limit exceeded",
    data: "preserved"
  },
  {
    action: "run_existing_app",
    decision: "allowed",
    reason: "existing app continuity",
    data: "preserved"
  }
];
