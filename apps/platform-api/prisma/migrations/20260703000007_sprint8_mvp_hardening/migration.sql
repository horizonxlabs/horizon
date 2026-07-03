-- Sprint 8 MVP hardening: ticket-to-PRD change, domain governance, traceability and pilot evidence.

CREATE TABLE "prd_change_requests" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_ticket_id" TEXT,
  "title" TEXT NOT NULL,
  "proposed_requirement" TEXT NOT NULL,
  "affected_sections" TEXT[],
  "acceptance_criteria" TEXT[],
  "risk_level" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "approved_prd_version_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prd_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prd_change_decisions" (
  "id" TEXT NOT NULL,
  "change_request_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prd_change_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain_settings" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "internal_path" TEXT NOT NULL,
  "custom_domain" TEXT,
  "public_domain" TEXT,
  "mode" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "domain_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain_requests" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "intended_audience" TEXT NOT NULL,
  "data_classification" TEXT NOT NULL,
  "external_user_policy" TEXT NOT NULL,
  "checklist_accepted" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "decided_by_user_id" TEXT,
  "decision_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),

  CONSTRAINT "domain_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deployment_trace_records" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "prd_change_request_id" TEXT NOT NULL,
  "prd_version_id" TEXT NOT NULL,
  "frontend_checkpoint_id" TEXT NOT NULL,
  "app_manifest_id" TEXT NOT NULL,
  "deployment_record_id" TEXT NOT NULL,
  "domain_setting_id" TEXT NOT NULL,
  "audit_event_ids" TEXT[],
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deployment_trace_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prd_change_requests_source_ticket_id_key" ON "prd_change_requests"("source_ticket_id");
CREATE INDEX "prd_change_requests_project_id_status_idx" ON "prd_change_requests"("project_id", "status");
CREATE INDEX "prd_change_decisions_change_request_id_decided_at_idx" ON "prd_change_decisions"("change_request_id", "decided_at");
CREATE UNIQUE INDEX "domain_settings_project_id_key" ON "domain_settings"("project_id");
CREATE INDEX "domain_requests_project_id_status_idx" ON "domain_requests"("project_id", "status");
CREATE INDEX "deployment_trace_records_project_id_idx" ON "deployment_trace_records"("project_id");

ALTER TABLE "prd_change_requests"
  ADD CONSTRAINT "prd_change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prd_change_requests"
  ADD CONSTRAINT "prd_change_requests_source_ticket_id_fkey" FOREIGN KEY ("source_ticket_id") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prd_change_requests"
  ADD CONSTRAINT "prd_change_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prd_change_requests"
  ADD CONSTRAINT "prd_change_requests_approved_prd_version_id_fkey" FOREIGN KEY ("approved_prd_version_id") REFERENCES "prd_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prd_change_decisions"
  ADD CONSTRAINT "prd_change_decisions_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "prd_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prd_change_decisions"
  ADD CONSTRAINT "prd_change_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "domain_settings"
  ADD CONSTRAINT "domain_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domain_requests"
  ADD CONSTRAINT "domain_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domain_requests"
  ADD CONSTRAINT "domain_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "domain_requests"
  ADD CONSTRAINT "domain_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deployment_trace_records"
  ADD CONSTRAINT "deployment_trace_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deployment_trace_records"
  ADD CONSTRAINT "deployment_trace_records_domain_setting_id_fkey" FOREIGN KEY ("domain_setting_id") REFERENCES "domain_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
