import test from "node:test";
import assert from "node:assert/strict";
import { createGovernedContextResolver } from "../../apps/platform-api/src/generation-loop/governed-context.ts";

const baselineVersion = {
  id: "v1", projectId: "p1", version: "1.0.0", status: "baseline", isBaseline: true,
  sourcePrompt: "", changeSummary: "", generatedBy: { scenario: "prd_generation", providerId: "x", model: "y" },
  sections: [{ id: "s1", key: "overview", title: "Overview", body: "An expense tracker.", order: 1 }],
  createdByUserId: "u1", createdAt: "2026-07-21T00:00:00.000Z"
};

const services = (over = {}) => ({
  skills: { resolve() { throw new Error("no skill"); } },
  knowledge: { retrieve() { return { sources: [] }; } },
  prds: { listVersions: () => [baselineVersion], getCurrent: () => baselineVersion },
  ...over
});

const input = { actor: { id: "u1", role: "creator" }, projectId: "p1", scenario: "frontend_coding" };

test("includes the confirmed baseline spec as productSpec", async () => {
  const resolve = createGovernedContextResolver(services());
  const ctx = await resolve(input);
  assert.match(ctx.productSpec, /## Overview\nAn expense tracker\./);
});

test("leaves productSpec undefined when there is no baseline", async () => {
  const resolve = createGovernedContextResolver(services({ prds: { listVersions: () => [] } }));
  const ctx = await resolve(input);
  assert.equal(ctx.productSpec, undefined);
});

test("leaves productSpec undefined (no throw) when the PRD read fails", async () => {
  const resolve = createGovernedContextResolver(services({ prds: { listVersions() { throw new Error("no prd"); } } }));
  const ctx = await resolve(input);
  assert.equal(ctx.productSpec, undefined);
});
