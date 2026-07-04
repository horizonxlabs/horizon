import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000001_sprint2_ai_governance/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 2 Prisma schema defines AI governance and guardrail models", () => {
  for (const model of [
    "AiProvider",
    "AiApiKey",
    "AiScenarioRoute",
    "AiQuota",
    "GuardrailRule",
    "GuardrailEvent"
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /secretCiphertext/);
  assert.match(schema, /fingerprint/);
});

test("Sprint 2 migration creates provider key routing quota guardrail and event tables", () => {
  for (const table of [
    "ai_providers",
    "ai_api_keys",
    "ai_scenario_routes",
    "ai_quotas",
    "guardrail_rules",
    "guardrail_events"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.doesNotMatch(migration, /secret_plaintext/i);
});

test("Sprint 2 seed includes demo provider key route quota and guardrail data", () => {
  assert.match(seed, /OpenAI Production/);
  assert.match(seed, /secretCiphertext/);
  assert.match(seed, /prd_generation/);
  assert.match(seed, /Block payroll export/);
  assert.match(seed, /guardrailEvent/);
});
