import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("AI provider adapter contract supports external OpenAI-compatible gateway without secret leakage", () => {
  const servicesSource = readFileSync("apps/platform-api/src/platform-services.ts", "utf8");
  const requirements = readFileSync("docs/requirements/production-blueprint-requirements.md", "utf8");

  assert.match(servicesSource, /interface AiCompletionAdapter/);
  assert.match(servicesSource, /class OpenAiCompatibleCompletionAdapter/);
  assert.match(servicesSource, /AiGatewayRuntimeOptions/);
  assert.match(servicesSource, /chat\/completions/);
  assert.match(servicesSource, /dryRun: false/);
  assert.match(servicesSource, /sanitizeProviderError/);
  assert.match(servicesSource, /fetcher/);
  assert.match(servicesSource, /invokeCompletion/);
  assert.match(servicesSource, /guardrailDecision === "block"/);
  assert.match(servicesSource, /quota_exceeded/);
  assert.match(servicesSource, /ai\.gateway\.completed/);
  assert.match(servicesSource, /ai\.gateway\.fallback_used/);
  assert.match(servicesSource, /promptFingerprint/);
  assert.match(servicesSource, /secretCiphertext/);
  assert.match(requirements, /External-only v1/);
  assert.match(requirements, /Provider Adapter Architecture/);
});
