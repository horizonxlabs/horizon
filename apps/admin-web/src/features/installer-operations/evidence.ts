import { CheckCircle2, Database, LockKeyhole, ServerCog } from "lucide-react";
import type { ComponentType } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const operationsRecoveryKpis = [
  {
    label: "Preflight Report",
    value: "passed",
    detail: "9/9 private-server checks",
    icon: ServerCog,
    tone: "success"
  },
  {
    label: "Setup Wizard",
    value: "complete",
    detail: "secrets masked",
    icon: LockKeyhole,
    tone: "success"
  },
  {
    label: "Backup Schedule",
    value: "enabled",
    detail: "daily 02:00 / 30d retention",
    icon: Database,
    tone: "info"
  },
  {
    label: "Restore Drill",
    value: "passed",
    detail: "RPO 60m / RTO 120m",
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

export const composeReadinessRows = [
  { service: "platform-api", status: "healthy", signal: "health endpoint ready" },
  { service: "admin-web", status: "healthy", signal: "admin bundle ready" },
  { service: "creator-web", status: "healthy", signal: "creator bundle ready" },
  { service: "app-store-pwa", status: "healthy", signal: "PWA bundle ready" },
  {
    service: "PostgreSQL / Keycloak / MinIO / Redis / Caddy",
    status: "healthy",
    signal: "compose readiness contract"
  }
];

export const backupRunRows = [
  {
    run: "bckrun_nightly_postgres_001",
    status: "succeeded",
    artifact: "minio://evcp-backups/bckrun_nightly_postgres_001/evcp.dump.enc",
    checksum: "sha256:seed-backup-run-001",
    size: "2.4 GB"
  },
  {
    run: "bckrun_manual_s3_002",
    status: "succeeded",
    artifact: "s3://evcp-prod-backups/bckrun_manual_s3_002/evcp.dump.enc",
    checksum: "sha256:storage-neutral",
    size: "2.4 GB"
  }
];

export const restoreValidationRows = [
  { check: "checksum", status: "pass", evidence: "artifact checksum verified" },
  { check: "schema", status: "pass", evidence: "Prisma schema current" },
  { check: "seed-records", status: "pass", evidence: "demo records restored" },
  { check: "audit-events", status: "pass", evidence: "critical restore audit retained" }
];

export type InstallWizardStepId =
  | "prepare_server"
  | "configure_environment"
  | "preflight"
  | "setup"
  | "deploy_stack"
  | "migrate_seed"
  | "verify_health"
  | "first_admin_login";

export const installWizardSteps = [
  {
    id: "prepare_server",
    label: "1. Prepare Server",
    detail: "CPU, RAM, disk, Docker, ports, DNS/TLS, network"
  },
  {
    id: "configure_environment",
    label: "2. Configure Environment",
    detail: ".env, secrets, domain, Caddy and compose contract"
  },
  {
    id: "preflight",
    label: "3. Run Preflight",
    detail: "installer checks produce pass/fail report evidence"
  },
  {
    id: "setup",
    label: "4. Save Setup",
    detail: "domain, database, storage, auth, AI, backup, first admin"
  },
  {
    id: "deploy_stack",
    label: "5. Deploy Stack",
    detail: "Docker Compose starts platform and infrastructure services"
  },
  {
    id: "migrate_seed",
    label: "6. Migrate + Seed",
    detail: "Prisma migration and seed plan is ready"
  },
  {
    id: "verify_health",
    label: "7. Verify Health",
    detail: "Platform surfaces and dependencies report healthy"
  },
  {
    id: "first_admin_login",
    label: "8. First Admin Login",
    detail: "Platform Auth session proves Admin Console is usable"
  }
] satisfies Array<{ id: InstallWizardStepId; label: string; detail: string }>;
