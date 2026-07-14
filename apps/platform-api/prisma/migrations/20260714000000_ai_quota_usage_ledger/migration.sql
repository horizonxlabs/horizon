-- Keep quota policy separate from consumption. A policy such as `project`
-- applies independently to every project instead of sharing one process-wide
-- `used_today` counter.
CREATE TABLE "ai_quota_usage" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_id" TEXT NOT NULL,
  "used_today" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_quota_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_quota_usage_scope_scope_id_key" ON "ai_quota_usage"("scope", "scope_id");
