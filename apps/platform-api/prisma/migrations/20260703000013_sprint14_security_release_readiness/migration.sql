CREATE TABLE "security_readiness_reports" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "tls_enforced" BOOLEAN NOT NULL,
  "session_policy" JSONB NOT NULL,
  "secret_redaction_passed" BOOLEAN NOT NULL,
  "upload_policy" JSONB NOT NULL,
  "release_checklist" JSONB NOT NULL,
  "rtm_regression" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_readiness_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_readiness_checks" (
  "id" TEXT NOT NULL,
  "report_id" TEXT,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "required" TEXT NOT NULL,
  "observed" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_readiness_checks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "upload_scan_events" (
  "id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "source" TEXT NOT NULL,
  "scan_status" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "quarantine_reason" TEXT,
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_scan_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "release_checklist_reports" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "exposure" TEXT NOT NULL,
  "release_blocked" BOOLEAN NOT NULL,
  "required_checks" JSONB NOT NULL,
  "blocking_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "data_classification" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_checklist_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sensitive_redaction_evidence" (
  "id" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "redaction_rules_applied" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "redacted_payload" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensitive_redaction_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_readiness_reports_status_created_at_idx" ON "security_readiness_reports"("status", "created_at");
CREATE INDEX "security_readiness_checks_category_status_idx" ON "security_readiness_checks"("category", "status");
CREATE INDEX "upload_scan_events_decision_scan_status_created_at_idx" ON "upload_scan_events"("decision", "scan_status", "created_at");
CREATE INDEX "release_checklist_reports_exposure_release_blocked_created_at_idx" ON "release_checklist_reports"("exposure", "release_blocked", "created_at");
CREATE INDEX "sensitive_redaction_evidence_classification_surface_created_at_idx" ON "sensitive_redaction_evidence"("classification", "surface", "created_at");

ALTER TABLE "security_readiness_reports" ADD CONSTRAINT "security_readiness_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_readiness_checks" ADD CONSTRAINT "security_readiness_checks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "security_readiness_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "security_readiness_checks" ADD CONSTRAINT "security_readiness_checks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upload_scan_events" ADD CONSTRAINT "upload_scan_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_checklist_reports" ADD CONSTRAINT "release_checklist_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sensitive_redaction_evidence" ADD CONSTRAINT "sensitive_redaction_evidence_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
