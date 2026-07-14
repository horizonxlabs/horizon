-- LiteLLM/OpenAI-compatible providers may return a response cost. Keep it alongside
-- sanitized execution evidence; 0 means the provider did not report a cost.
ALTER TABLE "ai_execution_evidence"
  ADD COLUMN "cost_usd" DECIMAL(18, 8) NOT NULL DEFAULT 0;
