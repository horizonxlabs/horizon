import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const securityReleaseKpis = [
  {
    label: "TLS Enforcement",
    value: "enforced",
    detail: "production HTTP blocked",
    icon: LockKeyhole,
    tone: "success"
  },
  {
    label: "Session Policy",
    value: "30m / 480m",
    detail: "no remember-me sessions",
    icon: ShieldCheck,
    tone: "success"
  },
  {
    label: "Secret Redaction",
    value: "passed",
    detail: "API, UI, log, audit, export",
    icon: KeyRound,
    tone: "success"
  },
  {
    label: "RTM Regression",
    value: "42/42",
    detail: "P0 requirements covered",
    icon: CheckCircle2,
    tone: "success"
  }
] satisfies Array<{
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  tone: BadgeTone;
}>;

export const tlsSessionRows = [
  {
    policy: "TLS Enforcement",
    required: "HTTPS in production",
    observed: "Caddy TLS route required",
    status: "pass"
  },
  {
    policy: "Local Setup HTTP",
    required: "allowed only for setup",
    observed: "localhost exception",
    status: "pass"
  },
  { policy: "Idle Timeout", required: "<= 30 minutes", observed: "30 minutes", status: "pass" },
  {
    policy: "Absolute Timeout",
    required: "<= 480 minutes",
    observed: "480 minutes",
    status: "pass"
  }
];

export const secretRedactionRows = [
  {
    surface: "API",
    rule: "secret_key",
    evidence: "fingerprint or masked value only",
    status: "pass"
  },
  {
    surface: "UI",
    rule: "masked_value",
    evidence: "admin console never renders raw key",
    status: "pass"
  },
  {
    surface: "Log",
    rule: "structured_log_redaction",
    evidence: "prompt/ticket/request payload redacted",
    status: "pass"
  },
  {
    surface: "Audit",
    rule: "classification_filter",
    evidence: "rule names retained without secret values",
    status: "pass"
  }
];

export const uploadValidationRows = [
  { file: "policy.pdf", mime: "application/pdf", scan: "clean", decision: "allowed" },
  { file: "payload.exe", mime: "application/x-msdownload", scan: "clean", decision: "blocked" },
  {
    file: "pending.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    scan: "pending",
    decision: "quarantined"
  },
  { file: "huge.pdf", mime: "application/pdf", scan: "clean", decision: "blocked" }
];

export const releaseChecklistRows = [
  { check: "auth", public: "pass", external: "pass", blocker: "-" },
  { check: "permissions", public: "pass", external: "pass", blocker: "-" },
  { check: "domain", public: "pass", external: "pass", blocker: "-" },
  {
    check: "tls",
    public: "blocked",
    external: "pass",
    blocker: "TLS required before public exposure"
  },
  {
    check: "data_classification",
    public: "blocked",
    external: "pass",
    blocker: "Confidential data cannot be public"
  },
  { check: "audit", public: "pass", external: "pass", blocker: "-" }
];

export const rtmRegressionRows = [
  {
    suite: "unit",
    scope: "security release service",
    result: "pass",
    evidence: "Sprint 14 service tests"
  },
  {
    suite: "integration",
    scope: "Prisma schema and seed contract",
    result: "pass",
    evidence: "security readiness tables"
  },
  {
    suite: "e2e",
    scope: "admin API + UI smoke",
    result: "pass",
    evidence: "admin readiness dashboard"
  }
];
