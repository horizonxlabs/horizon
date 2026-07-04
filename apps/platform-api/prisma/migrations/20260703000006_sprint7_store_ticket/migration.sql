-- Sprint 7 App Store PWA support ticket loop.
-- Creator inbox actions include reply, convert_to_prd_change, convert_to_ai_prompt and resolve.

CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "ticket_number" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "app_slug" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "submitted_by_user_id" TEXT NOT NULL,
  "submitted_by_email" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "device_info" TEXT NOT NULL,
  "screenshot_url" TEXT,
  "status" TEXT NOT NULL,
  "assigned_to_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_timeline_entries" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_ticket_timeline_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");
CREATE INDEX "support_tickets_project_id_status_idx" ON "support_tickets"("project_id", "status");
CREATE INDEX "support_tickets_submitted_by_user_id_created_at_idx" ON "support_tickets"("submitted_by_user_id", "created_at");
CREATE INDEX "support_ticket_timeline_entries_ticket_id_occurred_at_idx" ON "support_ticket_timeline_entries"("ticket_id", "occurred_at");
CREATE INDEX "in_app_notifications_user_id_read_idx" ON "in_app_notifications"("user_id", "read");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_ticket_timeline_entries"
  ADD CONSTRAINT "support_ticket_timeline_entries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_timeline_entries"
  ADD CONSTRAINT "support_ticket_timeline_entries_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "in_app_notifications"
  ADD CONSTRAINT "in_app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "in_app_notifications"
  ADD CONSTRAINT "in_app_notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
