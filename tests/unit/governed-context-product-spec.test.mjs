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

// Context lean-down (2026-08): the PRD is deliberately OUT of the generation loop — chat
// history carries the project's memory instead. Even a confirmed baseline must not inject.
test("never injects productSpec, even with a confirmed baseline", async () => {
  const resolve = createGovernedContextResolver(services());
  const ctx = await resolve(input);
  assert.equal(ctx.productSpec, undefined);
});

test("stays quiet when there is no baseline or the PRD read fails", async () => {
  const noBaseline = createGovernedContextResolver(services({ prds: { listVersions: () => [] } }));
  assert.equal((await noBaseline(input)).productSpec, undefined);
  const failing = createGovernedContextResolver(
    services({ prds: { listVersions() { throw new Error("no prd"); } } })
  );
  assert.equal((await failing(input)).productSpec, undefined);
});
