-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agent_mode" TEXT,
    "content" TEXT NOT NULL,
    "artifact_action_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actions" JSONB,
    "commit_sha" TEXT,
    "token_usage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_summaries" (
    "project_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_summaries_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "chat_messages_project_id_created_at_idx" ON "chat_messages"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
