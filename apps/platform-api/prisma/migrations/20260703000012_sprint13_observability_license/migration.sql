CREATE TABLE "service_health_snapshots" (
  "id" TEXT NOT NULL,
  "service_name" TEXT NOT NULL,
  "service_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "p95_latency_ms" INTEGER,
  "queue_depth" INTEGER,
  "error_rate" DOUBLE PRECISION,
  "audit_retention_days" INTEGER NOT NULL,
  "signal" JSONB NOT NULL DEFAULT '{}',
  "created_by_user_id" TEXT NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telemetry_export_configs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "signals" TEXT[] NOT NULL,
  "status" TEXT NOT NULL,
  "audit_retention_days" INTEGER NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telemetry_export_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "upgrade_compatibility_reports" (
  "id" TEXT NOT NULL,
  "source_version" TEXT NOT NULL,
  "target_version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "upgrade_blocked" BOOLEAN NOT NULL,
  "checks" JSONB NOT NULL,
  "blocking_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upgrade_compatibility_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rollback_reports" (
  "id" TEXT NOT NULL,
  "from_version" TEXT NOT NULL,
  "to_version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "rollback_window_ends_at" TIMESTAMP(3) NOT NULL,
  "report_path" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rollback_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_records" (
  "id" TEXT NOT NULL,
  "license_key_fingerprint" TEXT NOT NULL,
  "signed_payload_fingerprint" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "edition" TEXT NOT NULL,
  "seat_limit" INTEGER NOT NULL,
  "app_limit" INTEGER NOT NULL,
  "ai_usage_monthly_tokens" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "warning_starts_at" TIMESTAMP(3) NOT NULL,
  "grace_ends_at" TIMESTAMP(3) NOT NULL,
  "offline_valid_until" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "restricted_actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "license_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_validation_logs" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "offline_cache_used" BOOLEAN NOT NULL,
  "offline_valid_until" TIMESTAMP(3) NOT NULL,
  "checked_at" TIMESTAMP(3) NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  CONSTRAINT "license_validation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "license_enforcement_events" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL,
  "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "restricted_actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preserve_existing_data" BOOLEAN NOT NULL,
  "checked_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "license_enforcement_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_health_snapshots_service_type_status_captured_at_idx" ON "service_health_snapshots"("service_type", "status", "captured_at");
CREATE INDEX "telemetry_export_configs_status_protocol_idx" ON "telemetry_export_configs"("status", "protocol");
CREATE INDEX "upgrade_compatibility_reports_target_version_status_created_at_idx" ON "upgrade_compatibility_reports"("target_version", "status", "created_at");
CREATE INDEX "rollback_reports_status_created_at_idx" ON "rollback_reports"("status", "created_at");
CREATE INDEX "license_records_status_expires_at_idx" ON "license_records"("status", "expires_at");
CREATE INDEX "license_validation_logs_license_id_checked_at_idx" ON "license_validation_logs"("license_id", "checked_at");
CREATE INDEX "license_enforcement_events_action_allowed_checked_at_idx" ON "license_enforcement_events"("action", "allowed", "checked_at");

ALTER TABLE "service_health_snapshots" ADD CONSTRAINT "service_health_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry_export_configs" ADD CONSTRAINT "telemetry_export_configs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upgrade_compatibility_reports" ADD CONSTRAINT "upgrade_compatibility_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rollback_reports" ADD CONSTRAINT "rollback_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_records" ADD CONSTRAINT "license_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_validation_logs" ADD CONSTRAINT "license_validation_logs_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "license_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "license_validation_logs" ADD CONSTRAINT "license_validation_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "license_enforcement_events" ADD CONSTRAINT "license_enforcement_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "license_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "license_enforcement_events" ADD CONSTRAINT "license_enforcement_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
