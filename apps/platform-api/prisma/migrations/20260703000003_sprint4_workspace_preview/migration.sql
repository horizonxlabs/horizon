-- Sprint 4: Creator workspace prompt tasks, preview versions and AI usage logs
CREATE TABLE "workspace_tasks" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "guardrail_decision" TEXT NOT NULL,
  "guardrail_event_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_task_steps" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "order" INTEGER NOT NULL,

  CONSTRAINT "workspace_task_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "preview_versions" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "screen_title" TEXT NOT NULL,
  "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "preview_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_usage_logs" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "tokens_used" INTEGER NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_tasks_project_id_created_at_idx" ON "workspace_tasks"("project_id", "created_at");
CREATE UNIQUE INDEX "workspace_task_steps_task_id_order_key" ON "workspace_task_steps"("task_id", "order");
CREATE UNIQUE INDEX "preview_versions_project_id_version_key" ON "preview_versions"("project_id", "version");
CREATE INDEX "ai_usage_logs_project_id_occurred_at_idx" ON "ai_usage_logs"("project_id", "occurred_at");
CREATE INDEX "ai_usage_logs_actor_user_id_occurred_at_idx" ON "ai_usage_logs"("actor_user_id", "occurred_at");

ALTER TABLE "workspace_tasks"
  ADD CONSTRAINT "workspace_tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_task_steps"
  ADD CONSTRAINT "workspace_task_steps_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "workspace_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "preview_versions"
  ADD CONSTRAINT "preview_versions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_logs"
  ADD CONSTRAINT "ai_usage_logs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage_logs"
  ADD CONSTRAINT "ai_usage_logs_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "workspace_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
