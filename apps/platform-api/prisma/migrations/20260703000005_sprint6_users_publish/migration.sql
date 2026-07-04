CREATE TABLE "app_invitations" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_type" TEXT NOT NULL,
    "role_key" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "policy_warning" TEXT,
    "expires_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_access_requests" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "requester_email" TEXT NOT NULL,
    "requested_role_key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_manifests" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "prd_version_id" TEXT NOT NULL,
    "prd_version" TEXT NOT NULL,
    "frontend_checkpoint_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "auth_mode" TEXT NOT NULL,
    "role_snapshot" JSONB NOT NULL,
    "database_snapshot" JSONB NOT NULL,
    "manifest" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_manifests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publish_requests" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "blocking_items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "publish_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deployment_records" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "publish_request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "prd_version" TEXT NOT NULL,
    "frontend_checkpoint_id" TEXT NOT NULL,
    "published_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_store_registry_entries" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "deployment_record_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "access_mode" TEXT NOT NULL,
    "role_keys" TEXT[],
    "owner_user_id" TEXT NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_store_registry_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_manifests_app_id_key" ON "app_manifests"("app_id");
CREATE UNIQUE INDEX "deployment_records_publish_request_id_key" ON "deployment_records"("publish_request_id");
CREATE UNIQUE INDEX "app_store_registry_entries_app_id_key" ON "app_store_registry_entries"("app_id");
CREATE UNIQUE INDEX "app_store_registry_entries_deployment_record_id_key" ON "app_store_registry_entries"("deployment_record_id");
CREATE UNIQUE INDEX "app_store_registry_entries_slug_key" ON "app_store_registry_entries"("slug");

CREATE INDEX "app_invitations_app_id_status_idx" ON "app_invitations"("app_id", "status");
CREATE INDEX "app_invitations_project_id_idx" ON "app_invitations"("project_id");
CREATE INDEX "app_access_requests_app_id_status_idx" ON "app_access_requests"("app_id", "status");
CREATE INDEX "app_access_requests_project_id_idx" ON "app_access_requests"("project_id");
CREATE INDEX "app_manifests_project_id_idx" ON "app_manifests"("project_id");
CREATE INDEX "publish_requests_app_id_status_idx" ON "publish_requests"("app_id", "status");
CREATE INDEX "publish_requests_project_id_idx" ON "publish_requests"("project_id");
CREATE INDEX "deployment_records_app_id_status_idx" ON "deployment_records"("app_id", "status");
CREATE INDEX "deployment_records_project_id_idx" ON "deployment_records"("project_id");
CREATE INDEX "app_store_registry_entries_status_idx" ON "app_store_registry_entries"("status");

ALTER TABLE "app_invitations" ADD CONSTRAINT "app_invitations_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_invitations" ADD CONSTRAINT "app_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_invitations" ADD CONSTRAINT "app_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_access_requests" ADD CONSTRAINT "app_access_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_access_requests" ADD CONSTRAINT "app_access_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_access_requests" ADD CONSTRAINT "app_access_requests_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_manifests" ADD CONSTRAINT "app_manifests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_manifests" ADD CONSTRAINT "app_manifests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publish_requests" ADD CONSTRAINT "publish_requests_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publish_requests" ADD CONSTRAINT "publish_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publish_requests" ADD CONSTRAINT "publish_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_publish_request_id_fkey" FOREIGN KEY ("publish_request_id") REFERENCES "publish_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_records" ADD CONSTRAINT "deployment_records_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app_store_registry_entries" ADD CONSTRAINT "app_store_registry_entries_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_store_registry_entries" ADD CONSTRAINT "app_store_registry_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_store_registry_entries" ADD CONSTRAINT "app_store_registry_entries_deployment_record_id_fkey" FOREIGN KEY ("deployment_record_id") REFERENCES "deployment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_store_registry_entries" ADD CONSTRAINT "app_store_registry_entries_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN "app_invitations"."status" IS 'pending, accepted, revoked, approval_required';
