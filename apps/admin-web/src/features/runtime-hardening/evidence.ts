import { CheckCircle2, Database, ServerCog, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const runtimeKpis = [
  {
    label: "Runtime Status",
    value: "running",
    detail: "separate generated app container",
    icon: ServerCog,
    tone: "success"
  },
  {
    label: "Schema Grant",
    value: "isolated",
    detail: "app_leave_management only",
    icon: Database,
    tone: "success"
  },
  {
    label: "Readiness",
    value: "5/5",
    detail: "auth, route, migration gates pass",
    icon: CheckCircle2,
    tone: "success"
  },
  {
    label: "Migration Dry Run",
    value: "passed",
    detail: "destructive changes require approval",
    icon: ShieldCheck,
    tone: "info"
  }
] satisfies Array<{
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  tone: BadgeTone;
}>;

export const runtimeContractRows = [
  {
    area: "Artifact Root",
    contract: "generated-apps/leave-management",
    evidence: "app.manifest.json + README.md"
  },
  {
    area: "Container",
    contract: "evcp-app-leave-management-dep_001",
    evidence: "image leave-management:1"
  },
  { area: "Route", contract: "/apps/leave-management", evidence: "Caddy route registered" }
];

export const runtimeEndpointRows = [
  { endpoint: "/apps/leave-management/health", signal: "healthy", owner: "Platform API" },
  { endpoint: "/apps/leave-management/ready", signal: "ready", owner: "Runtime gate" },
  { endpoint: "/apps/leave-management/metrics", signal: "p95 42ms", owner: "Metrics scraper" }
];

export const runtimeLogRows = [
  {
    request: "req_leave_management_001",
    severity: "info",
    message: "Platform Auth session accepted"
  },
  {
    request: "req_leave_management_002",
    severity: "info",
    message: "Schema grant enforced for leave request query"
  }
];

export const runtimeMetricRows = [
  { metric: "Requests", value: "128", window: "last 15m" },
  { metric: "Errors", value: "0", window: "last 15m" },
  { metric: "P95 Latency", value: "42ms", window: "last 15m" }
];
