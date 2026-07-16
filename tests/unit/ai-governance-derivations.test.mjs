import test from "node:test";
import assert from "node:assert/strict";

const load = () => import("../../apps/admin-web/src/features/ai-governance/lib/derivations.ts");

test("routing matrix has a row per scenario with provider names resolved", async () => {
  const { routingMatrixRows, SCENARIOS } = await load();
  const providers = [{ id: "aip_openai", name: "OpenAI", adapter: "openai", baseUrl: "", models: ["gpt-4.1"], status: "active" }];
  const routes = [{ scenario: "frontend_coding", primary: { providerId: "aip_openai", model: "gpt-4.1" } }];
  const rows = routingMatrixRows(routes, providers);
  assert.equal(rows.length, SCENARIOS.length);
  const fe = rows.find((r) => r.scenario === "frontend_coding");
  assert.equal(fe.primary.name, "OpenAI");
  assert.equal(fe.primary.model, "gpt-4.1");
  const review = rows.find((r) => r.scenario === "review");
  assert.equal(review.primary, undefined);
});

test("summaryCounts counts active credentials and routed scenarios", async () => {
  const { summaryCounts } = await load();
  const counts = summaryCounts(
    [{ id: "aip_openai" }],
    [{ status: "active" }, { status: "disabled" }],
    [{ scenario: "frontend_coding", primary: { providerId: "aip_openai", model: "gpt-4.1" } }]
  );
  assert.deepEqual(counts, { providers: 1, activeCredentials: 1, routed: 1 });
});

test("quotaRows yields one row per scope, filling known quotas", async () => {
  const { quotaRows, QUOTA_SCOPES } = await load();
  const rows = quotaRows([{ scope: "organization", dailyLimit: 100, monthlyLimit: 1000, warningThreshold: 80, hardStop: true, usedToday: 0 }]);
  assert.equal(rows.length, QUOTA_SCOPES.length);
  assert.equal(rows.find((r) => r.scope === "organization").quota.dailyLimit, 100);
  assert.equal(rows.find((r) => r.scope === "app").quota, undefined);
});
